/** A page link found in notebook text; `from`/`to` are offsets of the whole `[[...]]`. */
export interface PageLink { from: number; to: number; page: number; label: string | null }

/**
 * Reads `[[p12]]`, `[[p12|label]]`, and Obsidian's PDF form `[[paper.pdf#page=12]]` /
 * `[[paper.pdf#page=12|label]]`. Only the page part is a target; the file part is ignored.
 */
const SOURCE = String.raw`\[\[(?:p(\d+)|[^\[\]|\n]*?\.pdf#page=(\d+))(?:\|([^\[\]\n]*))?\]\]`;

export const pageLinkPattern = () => new RegExp(SOURCE, 'gi');

function toLink(m: RegExpExecArray, offset = 0): PageLink | null {
  const page = Number(m[1] ?? m[2]);
  if (!Number.isInteger(page) || page < 1) return null;
  const label = m[3]?.trim();
  return { from: offset + m.index, to: offset + m.index + m[0].length, page, label: label || null };
}

export function parsePageLinks(text: string, offset = 0): PageLink[] {
  const out: PageLink[] = [];
  for (const m of text.matchAll(pageLinkPattern())) {
    const l = toLink(m as RegExpExecArray, offset);
    if (l) out.push(l);
  }
  return out;
}

/** The link starting exactly at the beginning of `src`, for tokenizers. */
export function pageLinkAtStart(src: string): PageLink | null {
  const m = new RegExp(`^${SOURCE}`, 'i').exec(src);
  return m ? toLink(m) : null;
}

const cleanLabel = (s: string) => s.replace(/[\[\]|]/g, '').replace(/\s+/g, ' ').trim();

/** The only place new links are written, so the link format can change in one spot. */
export function formatPageLink(page: number, label?: string): string {
  const l = label ? cleanLabel(label) : '';
  return l ? `[[p${page}|${l}]]` : `[[p${page}]]`;
}

export const chipText = (l: Pick<PageLink, 'page' | 'label'>) => l.label ?? `p. ${l.page}`;

/** Page of the last link that ends at or before `pos`, or null when none precedes it. */
export function pageAbove(text: string, pos: number): number | null {
  let page: number | null = null;
  for (const l of parsePageLinks(text.slice(0, pos))) page = l.page;
  return page;
}

/**
 * What to insert at `pos`, the start of a new paragraph, so it carries a link to the page being read.
 * Nothing when the nearest link above already points at that page.
 */
export function autoLinkInsert(text: string, pos: number, currentPage: number): string | null {
  return pageAbove(text, pos) === currentPage ? null : `${formatPageLink(currentPage)} `;
}

/** A paragraph is being started: Enter at the end of a line that has content. */
export function startsParagraph(lineBefore: string, cursorAtLineEnd: boolean): boolean {
  return cursorAtLineEnd && lineBefore.trim() !== '';
}

/** Only typed text counts as a first keystroke; paste, drop, undo and redo never auto-link. */
export function isFirstKeystroke(docLengthBefore: number, userEvent: string | undefined): boolean {
  return docLengthBefore === 0 && userEvent === 'input.type';
}

/** Where and what to insert so `block` lands on its own lines at `pos`. */
export function blockInsertion(text: string, pos: number, block: string): { from: number; insert: string } {
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  const lineEnd = text.indexOf('\n', pos) === -1 ? text.length : text.indexOf('\n', pos);
  const at = pos === lineStart ? lineStart : lineEnd;
  const before = text.slice(0, at);
  const after = text.slice(at);
  const lead = before === '' ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const body = block.replace(/\n+$/, '');
  const trail = after === '' ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  return { from: at, insert: `${lead}${body}${trail}` };
}
