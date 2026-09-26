import { describe, expect, it } from 'vitest';
import { detectLanguage, dropFurniture, edgeKeys, pageLines, pageSentences, primaryLang, splitSentences, type RawItem } from './text';

const H = [1, 0, 0, 1, 0, 0];
const ROTATED = [0, 1, -1, 0, 0, 0];
const line = (str: string): RawItem => ({ str, hasEOL: true, transform: H });
const page = (...lines: string[]): RawItem[] => lines.map(line);
const pageText = (items: RawItem[]) => items.map((i) => i.str + (i.hasEOL ? ' ' : '')).join('');

describe('splitSentences', () => {
  it('splits on terminal punctuation', () => {
    expect(splitSentences('One sentence here. Another one! A third? Yes.')).toEqual(['One sentence here.', 'Another one!', 'A third?', 'Yes.']);
  });

  it('keeps abbreviations, initials and decimals inside the sentence', () => {
    expect(splitSentences('See Fig. 2 and Eq. 3 for details. Vaswani et al. Showed it, e.g. Here. J. Smith scored 28.4 BLEU. Done.')).toEqual([
      'See Fig. 2 and Eq. 3 for details.',
      'Vaswani et al. Showed it, e.g. Here.',
      'J. Smith scored 28.4 BLEU.',
      'Done.',
    ]);
  });

  it('knows Spanish abbreviations', () => {
    expect(splitSentences('El Sr. García y la Sra. López llegaron. Véase la pág. 4 del texto.')).toEqual([
      'El Sr. García y la Sra. López llegaron.',
      'Véase la pág. 4 del texto.',
    ]);
  });

  it('does not split before a lowercase continuation', () => {
    expect(splitSentences('It costs approx. ten euros. Next.')).toEqual(['It costs approx. ten euros.', 'Next.']);
  });

  it('keeps closing quotes and brackets with their sentence', () => {
    expect(splitSentences('He said "stop." Then (it ended.) Later.')).toEqual(['He said "stop."', 'Then (it ended.)', 'Later.']);
  });

  it('keeps unterminated trailing text', () => {
    expect(splitSentences('First. and then the rest without an end')).toEqual(['First. and then the rest without an end']);
    expect(splitSentences('First. Second without an end')).toEqual(['First.', 'Second without an end']);
  });

  it('cuts run-on text at a clause break', () => {
    const long = `${'word '.repeat(40)}clause, ${'more '.repeat(40)}end.`;
    const parts = splitSentences(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0]!.endsWith('clause,')).toBe(true);
    expect(parts.every((p) => p.length <= 280)).toBe(true);
  });
});

describe('pageSentences', () => {
  it('maps each sentence to its offsets in the page text', () => {
    const items = page('The first sentence. The second', 'one ends here.');
    const text = pageText(items);
    const s = pageSentences(items);
    expect(s.map((x) => x.text)).toEqual(['The first sentence.', 'The second one ends here.']);
    expect(text.slice(s[0]!.start, s[0]!.end)).toBe('The first sentence.');
    expect(text.slice(s[1]!.start, s[1]!.end)).toBe('The second one ends here.');
  });

  it('skips bracketed numeric citations', () => {
    const s = pageSentences(page('Long short-term memory [13] and gated units [7, 35] work', 'well [3–5]. Next [12].'));
    expect(s.map((x) => x.text)).toEqual(['Long short-term memory and gated units work well.', 'Next.']);
  });

  it('rejoins words hyphenated across lines but keeps compounds', () => {
    const s = pageSentences(page('compelling models and transduc-', 'tion models without sequence-', 'aligned recurrence.'));
    expect(s.map((x) => x.text)).toEqual(['compelling models and transduction models without sequence-aligned recurrence.']);
  });

  it('keeps the hyphen when the next line continues a hyphenated word', () => {
    expect(pageSentences(page('the English-', 'to-German task.'))[0]!.text).toBe('the English-to-German task.');
  });

  it('ends a sentence at a heading line', () => {
    const s = pageSentences(page('1 Introduction', 'Recurrent networks are established.', 'Abstract', 'The dominant models are recurrent.'));
    expect(s.map((x) => x.text)).toEqual(['1 Introduction', 'Recurrent networks are established.', 'Abstract', 'The dominant models are recurrent.']);
  });

  it('leaves out rotated text such as the arXiv stamp', () => {
    const items: RawItem[] = [line('Body text here.'), { str: 'arXiv:1706.03762v7 [cs.CL] 2 Aug 2023', transform: ROTATED, hasEOL: false }];
    expect(pageSentences(items).map((x) => x.text)).toEqual(['Body text here.']);
  });

  it('drops a bare page number and headers repeated on a neighbouring page', () => {
    const neighbour = pageLines(page('Journal of Things 12 (2020)', 'Other body text.', '7'));
    const items = page('Journal of Things 13 (2020)', 'Body text.', '8');
    expect(pageSentences(items, new Set(edgeKeys(neighbour))).map((x) => x.text)).toEqual(['Body text.']);
  });

  it('keeps first and last lines that are not furniture', () => {
    const lines = pageLines(page('Civil', 'Body.', 'The end.'));
    expect(dropFurniture(lines, new Set()).map((l) => l.text)).toEqual(['Civil', 'Body.', 'The end.']);
    expect(dropFurniture(pageLines(page('xiv', 'Body.', 'Page 3 of 9')), new Set()).map((l) => l.text)).toEqual(['Body.']);
  });

  it('offsets survive removed items and empty line ends', () => {
    const items: RawItem[] = [
      { str: 'Stamp', transform: ROTATED, hasEOL: true },
      { str: '', hasEOL: true, transform: H },
      { str: 'Real ', transform: H },
      { str: 'text.', transform: H, hasEOL: true },
    ];
    const [s] = pageSentences(items);
    expect(pageText(items).slice(s!.start, s!.end)).toBe('Real text.');
  });
});

describe('detectLanguage', () => {
  it('tells English from Spanish', () => {
    expect(detectLanguage('The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and the decoder through an attention mechanism.')).toBe('en');
    expect(detectLanguage('Los modelos dominantes de transducción de secuencias se basan en redes neuronales recurrentes o convolucionales que incluyen un codificador y un decodificador, y los mejores conectan el codificador con el decodificador.')).toBe('es');
  });

  it('declines short or mixed text', () => {
    expect(detectLanguage('Attention Is All You Need')).toBeNull();
    expect(detectLanguage('')).toBeNull();
  });
});

describe('primaryLang', () => {
  it('reads the primary subtag', () => {
    expect(primaryLang('es-ES')).toBe('es');
    expect(primaryLang('EN')).toBe('en');
    expect(primaryLang(null)).toBeNull();
    expect(primaryLang('')).toBeNull();
  });
});
