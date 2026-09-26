/**
 * A page link found in notebook text; `from`/`to` are offsets of the whole `[[...]]`. `file` is the
 * PDF an Obsidian-form link names, as written (a name or a vault path), and null for `[[p12]]`.
 */
export interface PageLink { from: number; to: number; page: number; file: string | null; label: string | null }

/** Where a link goes: a page, in the named PDF or else in the document the notebook belongs to. */
export type LinkTarget = Pick<PageLink, 'page' | 'file'>;

/** Reads `[[p12]]`, `[[p12|label]]`, and Obsidian's PDF form `[[paper.pdf#page=12]]` / `[[paper.pdf#page=12|label]]`. */
const SOURCE = String.raw`\[\[(?:p(\d+)|([^\[\]|\n]*?\.pdf)#page=(\d+))(?:\|([^\[\]\n]*))?\]\]`;

export const pageLinkPattern = () => new RegExp(SOURCE, 'gi');

function toLink(m: RegExpExecArray, offset = 0): PageLink | null {
  const page = Number(m[1] ?? m[3]);
  if (!Number.isInteger(page) || page < 1) return null;
  const label = m[4]?.trim();
  return { from: offset + m.index, to: offset + m.index + m[0].length, page, file: m[2]?.trim() || null, label: label || null };
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

/**
 * The only place new links are written. A notebook that lives beside its PDF in a vault names
 * the file, `[[paper.pdf#page=3|p. 3]]`, so Obsidian can follow the link too.
 */
export function formatPageLink(page: number, label?: string, pdfName?: string): string {
  const l = label ? cleanLabel(label) : '';
  if (pdfName) return `[[${pdfName}#page=${page}|${l || `p. ${page}`}]]`;
  return l ? `[[p${page}|${l}]]` : `[[p${page}]]`;
}

/** Rewrites `[[p12]]` links to name `pdfName`, as a notebook moving into a vault needs for Obsidian. */
export function namePageLinks(markdown: string, pdfName: string): string {
  let out = '';
  let at = 0;
  for (const l of parsePageLinks(markdown)) {
    if (l.file) continue;
    out += markdown.slice(at, l.from) + formatPageLink(l.page, l.label ?? undefined, pdfName);
    at = l.to;
  }
  return out + markdown.slice(at);
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
export function autoLinkInsert(text: string, pos: number, currentPage: number, pdfName?: string): string | null {
  return pageAbove(text, pos) === currentPage ? null : `${formatPageLink(currentPage, undefined, pdfName)} `;
}

/**
 * A paragraph is being started: Enter at the end of a line that has content. Enter inside a
 * blockquote continues the quote, which is not a new paragraph of the reader's own.
 */
export function startsParagraph(lineBefore: string, cursorAtLineEnd: boolean): boolean {
  const t = lineBefore.trim();
  return cursorAtLineEnd && t !== '' && !t.startsWith('>');
}

/**
 * Only typed text counts as a first keystroke; paste, drop, undo and redo never auto-link, and
 * neither does a character that starts Markdown markup (`#`, `-`, `>`, `1.`…), which would stop
 * working behind a link.
 */
export function isFirstKeystroke(docLengthBefore: number, userEvent: string | undefined, typed = ''): boolean {
  return docLengthBefore === 0 && (userEvent === 'input.type' || !!userEvent?.startsWith('input.type.')) && !/^[#>*+\-\d[`|$]/.test(typed);
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
