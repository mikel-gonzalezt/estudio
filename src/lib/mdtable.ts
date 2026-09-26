/** Cells of one pipe-table row, split on pipes that are not escaped or inside inline code. */
export function tableCells(line: string): string[] {
  const s = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  const cells: string[] = [];
  let cur = '';
  let code = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '\\' && i + 1 < s.length) {
      cur += c + s[++i];
      continue;
    }
    if (c === '`') code = !code;
    if (c === '|' && !code) {
      cells.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

const DELIM = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

export const isTableRow = (line: string) => line.includes('|');
export const isDelimiterRow = (line: string) => DELIM.test(line) && line.includes('-');

type Align = 'left' | 'right' | 'center' | null;

const alignOf = (cell: string): Align => {
  const l = cell.startsWith(':');
  const r = cell.endsWith(':');
  return l && r ? 'center' : r ? 'right' : l ? 'left' : null;
};

const width = (s: string) => [...s].length;

/**
 * The lines of a GFM table with the pipes lined up: every row gets as many cells as the widest
 * row, each column is padded to its widest cell, and alignment colons are kept.
 */
export function formatTable(lines: readonly string[]): string[] {
  const rows = lines.map(tableCells);
  const cols = Math.max(...rows.map((r) => r.length));
  const aligns = (rows[1] ?? []).map(alignOf);
  const body = rows.filter((_, i) => i !== 1).map((r) => Array.from({ length: cols }, (_, c) => r[c] ?? ''));
  const w = Array.from({ length: cols }, (_, c) => Math.max(3, ...body.map((r) => width(r[c]!))));
  const pad = (s: string, c: number) => {
    const n = w[c]! - width(s);
    if (aligns[c] === 'right') return ' '.repeat(n) + s;
    if (aligns[c] === 'center') return ' '.repeat(Math.floor(n / 2)) + s + ' '.repeat(Math.ceil(n / 2));
    return s + ' '.repeat(n);
  };
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  const delim = w.map((n, c) => {
    const a = aligns[c] ?? null;
    const dashes = '-'.repeat(n - (a === 'center' ? 2 : a ? 1 : 0));
    return a === 'center' ? `:${dashes}:` : a === 'left' ? `:${dashes}` : a === 'right' ? `${dashes}:` : dashes;
  });
  const [head, ...rest] = body;
  return [line(head!.map(pad)), line(delim), ...rest.map((r) => line(r.map(pad)))];
}

/** The line range `[first, last]` (0-based) of the table around line `at`, or null when `at` is not in one. */
export function tableAround(lines: readonly string[], at: number): [number, number] | null {
  if (!isTableRow(lines[at] ?? '')) return null;
  let a = at;
  while (a > 0 && isTableRow(lines[a - 1]!) && lines[a - 1]!.trim()) a--;
  let b = at;
  while (b + 1 < lines.length && isTableRow(lines[b + 1]!) && lines[b + 1]!.trim()) b++;
  return b > a && isDelimiterRow(lines[a + 1]!) ? [a, b] : null;
}
