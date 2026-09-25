export interface TextItemLike { str: string; hasEOL?: boolean }

/**
 * Joins pdf.js text items the same way the text layer lays them out in the DOM:
 * each item's string, plus one space where the item ends a line (a <br> in the layer).
 */
export function pageText(items: readonly TextItemLike[]): string {
  let out = '';
  for (const it of items) out += it.str + (it.hasEOL ? ' ' : '');
  return out;
}

const fold = (s: string) => s.toLowerCase();

/** Non-overlapping, case-insensitive matches as [start, end) offsets. */
export function findMatches(text: string, query: string): [number, number][] {
  const q = fold(query.trim());
  if (!q) return [];
  const t = fold(text);
  const out: [number, number][] = [];
  for (let i = t.indexOf(q); i >= 0; i = t.indexOf(q, i + q.length)) out.push([i, i + q.length]);
  return out;
}

export interface Hit { page: number; index: number; start: number; end: number }

export function searchPages(texts: readonly string[], query: string): Hit[] {
  const hits: Hit[] = [];
  texts.forEach((text, i) => {
    findMatches(text, query).forEach(([start, end], index) => hits.push({ page: i + 1, index, start, end }));
  });
  return hits;
}

export function snippet(text: string, start: number, end: number, radius = 40): string {
  const a = Math.max(0, start - radius);
  const b = Math.min(text.length, end + radius);
  return `${a > 0 ? '…' : ''}${text.slice(a, b).replace(/\s+/g, ' ')}${b < text.length ? '…' : ''}`;
}
