/** A pdf.js text item, as `getTextContent()` returns it. */
export interface RawItem { str: string; hasEOL?: boolean; transform?: number[] }

/**
 * A sentence to speak. `start` and `end` index the page string built by `pageText` (items joined,
 * a space per line end), which is also how the text layer lays the page out, so they locate the
 * sentence on screen.
 */
export interface Sentence { text: string; start: number; end: number }

/** Text with the page offset each character came from. */
interface Mapped { text: string; src: number[] }

export interface Line extends Mapped { eol: number }

const isHorizontal = (t: number[] | undefined) => !t || (t[1] === 0 && t[2] === 0);

/** Horizontal lines of a page in content order; rotated items such as the arXiv margin stamp are left out. */
export function pageLines(items: readonly RawItem[]): Line[] {
  const lines: Line[] = [];
  let cur: Mapped = { text: '', src: [] };
  let pos = 0;
  const close = (eol: number) => {
    if (cur.text.trim()) lines.push({ ...cur, eol });
    cur = { text: '', src: [] };
  };
  for (const it of items) {
    if (isHorizontal(it.transform)) {
      for (let i = 0; i < it.str.length; i++) {
        cur.text += it.str[i];
        cur.src.push(pos + i);
      }
    }
    pos += it.str.length;
    if (it.hasEOL) {
      close(pos);
      pos += 1;
    }
  }
  close(pos);
  return lines;
}

/** Page furniture compares equal across pages once page numbers are masked. */
export const edgeKey = (line: string) => line.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();

const PAGE_NUMBER = /^\s*(?:page\s+|p\.\s*|pág\.?\s*)?(?:\d+|(?=[ivxlc])m*(?:c[md]|d?c{0,3})(?:x[cl]|l?x{0,3})(?:i[xv]|v?i{0,3}))(?:\s*(?:of|de|\/)\s*\d+)?\s*$/i;

/** Keys of the first and last line of a page, to spot running headers and footers on its neighbours. */
export function edgeKeys(lines: readonly Line[]): string[] {
  const first = lines[0];
  const last = lines.at(-1);
  return [first, last].filter((l): l is Line => !!l).map((l) => edgeKey(l.text));
}

/** Drops a first or last line that is a bare page number or repeats on a neighbouring page. */
export function dropFurniture(lines: readonly Line[], neighbourEdges: ReadonlySet<string>): Line[] {
  const isFurniture = (l: Line) => PAGE_NUMBER.test(l.text) || neighbourEdges.has(edgeKey(l.text));
  let from = 0;
  let to = lines.length;
  if (to > 0 && isFurniture(lines[0]!)) from++;
  if (to > from && isFurniture(lines[to - 1]!)) to--;
  return lines.slice(from, to);
}

const HEADING_MAX_WORDS = 6;

/** A short line without closing punctuation before a capitalised one: a heading, an author line. It ends a sentence. */
function endsHeading(text: string, next: string): boolean {
  const t = text.trim();
  return t.split(/\s+/).length <= HEADING_MAX_WORDS && !/[.,;:!?\-–(]$/.test(t) && /^[\p{Lu}\d]/u.test(next);
}

const HYPHEN_TAIL = /[a-zà-ÿ]-$/;
const SUFFIX_MAX = 5;

/**
 * Joins lines into running text. A line-end hyphen is dropped when the next line starts with a
 * short lowercase fragment ("transduc-" + "tion"), and kept for compounds ("sequence-" + "aligned").
 */
export function joinLines(lines: readonly Line[]): Mapped {
  const out: Mapped = { text: '', src: [] };
  lines.forEach((line, i) => {
    const prev = lines[i - 1];
    if (prev) {
      const next = /^[a-zà-ÿ]+/.exec(line.text)?.[0];
      if (HYPHEN_TAIL.test(out.text) && next && next.length <= SUFFIX_MAX && line.text[next.length] !== '-') {
        out.text = out.text.slice(0, -1);
        out.src.pop();
      } else if (!HYPHEN_TAIL.test(out.text)) {
        out.text += endsHeading(prev.text, line.text) ? '\n' : ' ';
        out.src.push(prev.eol);
      }
    }
    out.text += line.text;
    out.src.push(...line.src);
  });
  return out;
}

function removeAll(m: Mapped, re: RegExp): Mapped {
  const out: Mapped = { text: '', src: [] };
  let last = 0;
  for (const hit of m.text.matchAll(re)) {
    out.text += m.text.slice(last, hit.index);
    out.src.push(...m.src.slice(last, hit.index));
    last = hit.index + hit[0].length;
  }
  out.text += m.text.slice(last);
  out.src.push(...m.src.slice(last));
  return out;
}

/** Bracketed numeric citations such as [13], [5, 6] or [3–7], with the space before them. */
const CITATION = /[ \t]*\[\d+(?:\s*[,–-]\s*\d+)*\]/g;

const ABBREVIATIONS = new Set([
  'e.g', 'i.e', 'cf', 'vs', 'al', 'fig', 'figs', 'eq', 'eqs', 'sec', 'secs', 'tab', 'ref', 'refs', 'no', 'nos',
  'vol', 'p', 'pp', 'ch', 'approx', 'resp', 'dr', 'dra', 'mr', 'mrs', 'ms', 'prof', 'st', 'sr', 'sra', 'srta',
  'd', 'dña', 'ud', 'uds', 'vd', 'vds', 'pág', 'págs', 'núm', 'cap', 'art', 'ed', 'eds', 'ej', 'aprox',
]);

const MAX_SENTENCE = 280;

function isAbbreviation(word: string): boolean {
  const w = word.replace(/^[("'“‘[]+/, '');
  return ABBREVIATIONS.has(w.toLowerCase()) || /^[A-ZÁÉÍÓÚÑ]$/.test(w);
}

/** Where sentences end in `text`, as offsets just past each sentence. */
export function sentenceEnds(text: string): number[] {
  const ends: number[] = [];
  const re = /[.!?…]+["'”’)\]]*(?=\s|$)|\n/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].length;
    if (m[0] === '\n') {
      ends.push(m.index);
      continue;
    }
    const after = /\S/.exec(text.slice(end));
    if (after && /[a-zà-ÿ,;:]/.test(after[0])) continue;
    const word = text.slice(text.lastIndexOf(' ', m.index) + 1, m.index);
    if (m[0] === '.' && after && isAbbreviation(word)) continue;
    ends.push(end);
  }
  if (!ends.length || ends.at(-1)! < text.trimEnd().length) ends.push(text.length);
  return ends;
}

/** Cuts a run-on stretch at a clause break (or else a space) so no utterance runs long enough for the engine to drop it. */
function capLength(start: number, end: number, text: string): [number, number][] {
  const out: [number, number][] = [];
  while (end - start > MAX_SENTENCE) {
    const window = text.slice(start, start + MAX_SENTENCE);
    const clause = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '), window.lastIndexOf(': '));
    const cut = clause > MAX_SENTENCE / 3 ? clause + 1 : Math.max(window.lastIndexOf(' '), 1);
    out.push([start, start + cut]);
    start += cut;
  }
  out.push([start, end]);
  return out;
}

/** Splits running text into sentences, each with the page offsets it spans. */
function split(m: Mapped): Sentence[] {
  const out: Sentence[] = [];
  let start = 0;
  for (const end of sentenceEnds(m.text)) {
    for (const [a, b] of capLength(start, end, m.text)) {
      const raw = m.text.slice(a, b);
      const lead = raw.length - raw.trimStart().length;
      const text = raw.replace(/\s+/g, ' ').trim();
      if (/\p{L}/u.test(text)) out.push({ text, start: m.src[a + lead]!, end: m.src[a + lead + raw.trim().length - 1]! + 1 });
    }
    start = end;
  }
  return out;
}

/** Sentences of one page, in content order, without page furniture or numeric citations. */
export function pageSentences(items: readonly RawItem[], neighbourEdges: ReadonlySet<string> = new Set()): Sentence[] {
  const lines = dropFurniture(pageLines(items), neighbourEdges);
  return split(removeAll(joinLines(lines), CITATION));
}

/** Plain sentence splitting, for tests and callers without page offsets. */
export function splitSentences(text: string): string[] {
  return split({ text, src: [...text].map((_, i) => i) }).map((s) => s.text);
}

const STOPWORDS = {
  en: new Set(['the', 'and', 'of', 'to', 'is', 'in', 'that', 'with', 'for', 'are', 'this', 'we', 'on', 'as', 'be', 'by', 'it', 'which', 'from', 'an']),
  es: new Set(['el', 'la', 'los', 'las', 'de', 'que', 'y', 'en', 'un', 'una', 'es', 'por', 'con', 'para', 'del', 'se', 'al', 'como', 'su', 'lo']),
};

export type Lang = keyof typeof STOPWORDS;

const MIN_HITS = 8;

/** English or Spanish by stopword counts; null when the text is too short or neither dominates. */
export function detectLanguage(text: string): Lang | null {
  let en = 0;
  let es = 0;
  for (const w of text.toLowerCase().match(/\p{L}+/gu) ?? []) {
    if (STOPWORDS.en.has(w)) en++;
    if (STOPWORDS.es.has(w)) es++;
  }
  if (Math.max(en, es) < MIN_HITS || en === es) return null;
  return en > es ? 'en' : 'es';
}

/** The primary subtag of a BCP 47 tag such as `es-ES`, or null when absent. */
export function primaryLang(tag: unknown): string | null {
  if (typeof tag !== 'string') return null;
  const m = /^\s*([a-z]{2,3})\b/i.exec(tag);
  return m ? m[1]!.toLowerCase() : null;
}
