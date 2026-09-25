/** A horizontal run of text in normalised page space: x right, y down, `y` is the top of the glyph box. */
export interface TextRun { str: string; x: number; y: number; w: number; h: number }

interface Line { x: number; y: number; h: number; text: string }

const MARKER = /^\s*(\[[^\]]{1,24}\]|\d{1,3}\.)\s/;
const MAX_LINES = 12;

function lines(runs: readonly TextRun[]): Line[] {
  const out: Line[] = [];
  for (const r of runs) {
    const blank = !r.str.trim() || r.h <= 0;
    const last = out.at(-1);
    if (last && Math.abs(r.y - last.y) < Math.max(last.h, r.h, 1e-6) * 0.5) {
      last.text += r.str;
      if (!blank) last.x = Math.min(last.x, r.x);
    } else if (!blank) {
      out.push({ x: r.x, y: r.y, h: r.h, text: r.str });
    } else if (last) {
      last.text += r.str;
    }
  }
  return out;
}

function join(a: string, b: string): string {
  const left = a.trimEnd();
  const right = b.trimStart();
  if (/[a-z]-$/i.test(left) && /^[a-z]/.test(right)) return left.slice(0, -1) + right;
  if (/\/$/.test(left)) return left + right;
  return `${left} ${right}`;
}

/**
 * Reads the bibliography entry that starts at a link destination: the first line at or below `at`
 * (and not left of it, which skips a neighbouring column), down to the next entry marker, a paragraph
 * gap, a return to the hanging-indent margin, or a jump to another column.
 */
export function entryText(runs: readonly TextRun[], at: { x: number | null; y: number }): string {
  const all = lines(runs);
  const start = all.findIndex((l) => l.y >= at.y - l.h * 0.6 && (at.x === null || l.x >= at.x - 0.02));
  if (start < 0) return '';
  const first = all[start]!;
  const tol = first.h * 0.5;
  let text = first.text;
  let prev = first;
  let indented = false;
  for (const l of all.slice(start + 1, start + MAX_LINES)) {
    const gap = l.y - prev.y;
    if (gap <= 0 || gap > prev.h * 1.6 || MARKER.test(l.text)) break;
    if (l.x < first.x - tol) break;
    if (l.x > first.x + tol) indented = true;
    else if (indented) break;
    text = join(text, l.text);
    prev = l;
  }
  return text.replace(/\s+/g, ' ').trim();
}

/** A reference is a destination named like hyperref's `cite.*`, or text that opens with `[n]` / `n.` and carries a year. */
export function looksLikeReference(text: string, destName: string | null): boolean {
  if (!text) return false;
  if (destName && /^cite\./i.test(destName)) return true;
  return MARKER.test(text) && /\b(1[89]|20)\d{2}\b/.test(text);
}

export type PaperLink =
  | { kind: 'doi'; id: string; href: string }
  | { kind: 'arxiv'; id: string; href: string }
  | { kind: 'url'; href: string };

const trimTail = (s: string) => s.replace(/[.,;:)\]}>'"]+$/, '');

const ARXIV = [
  /arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/i,
  /arXiv:\s*(\d{4}\.\d{4,5}(?:v\d+)?)/i,
  /arXiv:\s*([a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)/i,
  /\bCoRR\b[^0-9]{0,12}abs\/(\d{4}\.\d{4,5}(?:v\d+)?)/i,
];

/** Picks the best link to the cited work: a DOI, then an arXiv id, then any URL. */
export function paperLink(text: string): PaperLink | null {
  const doi = /\b(10\.\d{4,9}\/[^\s"<>]+)/.exec(text);
  if (doi) {
    const id = trimTail(doi[1]!);
    return { kind: 'doi', id, href: `https://doi.org/${id}` };
  }
  for (const re of ARXIV) {
    const m = re.exec(text);
    if (m) return { kind: 'arxiv', id: m[1]!, href: `https://arxiv.org/abs/${m[1]}` };
  }
  const url = /\bhttps?:\/\/[^\s"<>]+/i.exec(text);
  if (url) return { kind: 'url', href: trimTail(url[0]) };
  return null;
}

/**
 * The likely title: references usually read "Authors. Title. Venue", so this takes the second
 * sentence, splitting after a question or exclamation mark, or on a full stop that does not end an initial.
 */
export function titleGuess(text: string): string {
  const body = text.replace(MARKER, '').trim();
  const parts = body.split(/(?<=[?!])\s+|(?<!\b[A-Z])\.\s+/).map((s) => s.trim()).filter(Boolean);
  const title = parts.length >= 2 && parts[1]!.length >= 10 ? parts[1]! : body;
  return title.slice(0, 200);
}

export const scholarUrl = (text: string) => `https://scholar.google.com/scholar?q=${encodeURIComponent(titleGuess(text))}`;
