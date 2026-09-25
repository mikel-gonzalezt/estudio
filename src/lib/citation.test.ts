import { describe, expect, it } from 'vitest';
import { entryText, looksLikeReference, paperLink, scholarUrl, titleGuess, type TextRun } from './citation';

const W = 612;
const H = 792;
const run = (str: string, x: number, baseline: number, w: number, h = 10): TextRun =>
  ({ str, x: x / W, y: 1 - (baseline + h) / H, w: w / W, h: h / H });
const blank = (x: number, baseline: number): TextRun => run(' ', x, baseline, 3.6, 0);
const destAt = (left: number, top: number) => ({ x: left / W, y: 1 - top / H });

const numbered: TextRun[] = [
  run('[5] Kyunghyun Cho, Bart van Merrienboer, Caglar Gulcehre, Fethi Bougares, Holger Schwenk,', 113, 710, 392),
  run('and Yoshua Bengio. Learning phrase representations using rnn encoder-decoder for statistical', 129.6, 699.1, 374),
  run('machine translation.', 129.6, 688.2, 80.8), blank(210.4, 688.2), run('CoRR', 214, 688.2, 23.8), run(', abs/1406.1078, 2014.', 237.8, 688.2, 90.8),
  run('[6] Francois Chollet.', 113, 668.4, 87.4), blank(200.4, 668.4),
  run('Xception: Deep learning with depthwise separable convolutions.', 206.7, 668.4, 268.4), blank(475.1, 668.4), run('arXiv', 481.4, 668.4, 22.6),
  run('preprint arXiv:1610.02357', 129.6, 657.5, 107.6), run(', 2016.', 237.1, 657.5, 27.4),
  run('[9] Jonas Gehring, Michael Auli, David Grangier, Denis Yarats, and Yann N. Dauphin. Convolu-', 113, 576.3, 392.7),
  run('tional sequence to sequence learning.', 129.6, 565.4, 148.6), blank(278.2, 565.4), run('arXiv preprint arXiv:1705.03122v2', 281.7, 565.4, 141.6),
];

describe('entryText', () => {
  it('reads one numbered entry from its destination down to the next marker', () => {
    expect(entryText(numbered, destAt(112.98, 720.946))).toBe(
      '[5] Kyunghyun Cho, Bart van Merrienboer, Caglar Gulcehre, Fethi Bougares, Holger Schwenk, and Yoshua Bengio. Learning phrase representations using rnn encoder-decoder for statistical machine translation. CoRR, abs/1406.1078, 2014.',
    );
  });

  it('joins a line that wraps inside an entry and stops at the end of the page', () => {
    expect(entryText(numbered, destAt(112.98, 678.4))).toBe(
      '[6] Francois Chollet. Xception: Deep learning with depthwise separable convolutions. arXiv preprint arXiv:1610.02357, 2016.',
    );
  });

  it('removes end-of-line hyphenation', () => {
    expect(entryText(numbered, destAt(113, 586.3))).toContain('Dauphin. Convolutional sequence');
  });

  it('stops at a hanging-indent return when entries have no markers', () => {
    const runs = [
      run('Bahdanau, D., Cho, K., and Bengio, Y. (2015). Neural machine translation by jointly', 72, 700, 300),
      run('learning to align and translate. In ICLR.', 84, 689, 200),
      run('Cho, K. (2014). On the properties of neural machine translation.', 72, 678, 300),
    ];
    expect(entryText(runs, destAt(72, 710))).toBe(
      'Bahdanau, D., Cho, K., and Bengio, Y. (2015). Neural machine translation by jointly learning to align and translate. In ICLR.',
    );
  });

  it('stops at a paragraph gap and at a jump to the next column', () => {
    const runs = [
      run('Smith, J. A study of things. 2019.', 72, 700, 200),
      run('Lee, K. Another study. 2020.', 72, 670, 200),
      run('Right column text.', 320, 740, 200),
    ];
    expect(entryText(runs, destAt(72, 710))).toBe('Smith, J. A study of things. 2019.');
  });

  it('starts in the destination column, skipping lines of the column to its left', () => {
    const runs = [
      run('Left column body text that happens to sit lower.', 72, 690, 200),
      run('[3] Right column entry. 2018.', 320, 700, 200),
    ];
    expect(entryText(runs, destAt(320, 710))).toBe('[3] Right column entry. 2018.');
  });

  it('returns nothing when no text lies below the destination', () => {
    expect(entryText(numbered, destAt(113, 100))).toBe('');
  });
});

describe('looksLikeReference', () => {
  it('trusts hyperref cite destinations', () => {
    expect(looksLikeReference('Smith and Lee, A study', 'cite.smith2019')).toBe(true);
  });

  it('otherwise needs an entry marker and a year', () => {
    expect(looksLikeReference('[12] A. Author. A title. 2017.', null)).toBe(true);
    expect(looksLikeReference('3 Model Architecture Most competitive models', 'section.3')).toBe(false);
    expect(looksLikeReference('[12] Figure caption without a year', null)).toBe(false);
    expect(looksLikeReference('', 'cite.x')).toBe(false);
  });
});

describe('paperLink', () => {
  it('finds a DOI and trims trailing punctuation', () => {
    expect(paperLink('Nature, 521:436, 2015. doi:10.1038/nature14539.')).toEqual({ kind: 'doi', id: '10.1038/nature14539', href: 'https://doi.org/10.1038/nature14539' });
    expect(paperLink('https://doi.org/10.1145/3065386)')).toMatchObject({ kind: 'doi', id: '10.1145/3065386' });
  });

  it('finds arXiv ids in their common spellings', () => {
    expect(paperLink('arXiv preprint arXiv:1610.02357, 2016.')).toEqual({ kind: 'arxiv', id: '1610.02357', href: 'https://arxiv.org/abs/1610.02357' });
    expect(paperLink('arXiv preprint arXiv:1705.03122v2, 2017.')).toMatchObject({ id: '1705.03122v2' });
    expect(paperLink('CoRR, abs/1406.1078, 2014.')).toMatchObject({ kind: 'arxiv', id: '1406.1078' });
    expect(paperLink('see https://arxiv.org/pdf/1706.03762.')).toMatchObject({ kind: 'arxiv', id: '1706.03762' });
    expect(paperLink('arXiv:hep-th/9901001')).toMatchObject({ kind: 'arxiv', id: 'hep-th/9901001' });
  });

  it('prefers a DOI over an arXiv id over a plain URL', () => {
    expect(paperLink('https://github.com/x/y arXiv:1610.02357 10.1000/abc')?.kind).toBe('doi');
    expect(paperLink('https://github.com/x/y arXiv:1610.02357')?.kind).toBe('arxiv');
  });

  it('falls back to any URL', () => {
    expect(paperLink('Software at https://example.org/tool.')).toEqual({ kind: 'url', href: 'https://example.org/tool' });
  });

  it('returns null when there is nothing to open', () => {
    expect(paperLink('[8] Chris Dyer. Recurrent neural network grammars. In Proc. of NAACL, 2016.')).toBeNull();
  });
});

describe('titleGuess', () => {
  it('takes the sentence after the authors, keeping initials intact', () => {
    expect(titleGuess('[8] Chris Dyer, and Noah A. Smith. Recurrent neural network grammars. In Proc. of NAACL, 2016.')).toBe('Recurrent neural network grammars');
    expect(titleGuess('Bahdanau, D., Cho, K. (2015). Neural machine translation by jointly learning to align. In ICLR.')).toBe('Neural machine translation by jointly learning to align');
  });

  it('keeps a question mark that ends the title', () => {
    expect(titleGuess('[16] Łukasz Kaiser and Samy Bengio. Can active memory replace attention? In Advances in NIPS, 2016.')).toBe('Can active memory replace attention?');
  });

  it('falls back to the whole entry', () => {
    expect(titleGuess('[1] Something short')).toBe('Something short');
  });

  it('builds a Scholar query URL', () => {
    expect(scholarUrl('[8] Chris Dyer. Recurrent neural network grammars. 2016.')).toBe('https://scholar.google.com/scholar?q=Recurrent%20neural%20network%20grammars');
  });
});
