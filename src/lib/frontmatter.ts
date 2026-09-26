import type { DocId } from './types';

/**
 * A notebook `.md` names its document in YAML frontmatter, so the pairing survives moving the
 * file anywhere, even into another vault:
 *
 *   ---
 *   estudio-doc: 3f1c...        (the pdf.js fingerprint, `DocId`)
 *   pdf: "[[paper.pdf]]"        (shown by Obsidian as a property that links the PDF)
 *   ---
 */
export const DOC_KEY = 'estudio-doc';
export const PDF_KEY = 'pdf';

const FRONT = /^---[ \t]*\r?\n((?:.*\r?\n)*?)---[ \t]*(?:\r?\n|$)/;

/** `front` is the text between the `---` lines (null when there is no frontmatter); `body` is the rest. */
export function splitFrontmatter(text: string): { front: string | null; body: string } {
  const m = FRONT.exec(text);
  return m ? { front: m[1]!, body: text.slice(m[0].length) } : { front: null, body: text };
}

const unquote = (v: string) => {
  const s = v.replace(/\s+#.*$/, '').trim();
  return /^(["']).*\1$/.test(s) ? s.slice(1, -1) : s;
};

/**
 * The `DocId` a notebook's frontmatter names. Works on the first bytes of a file only: the
 * frontmatter need not be closed within them, as long as the key is.
 */
export function notebookIdIn(head: string): DocId | null {
  const lines = head.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  for (const line of lines.slice(1, -1)) {
    if (line.trim() === '---') return null;
    const m = /^estudio-doc:(.*)$/.exec(line);
    if (m) return (unquote(m[1]!) || null) as DocId | null;
  }
  return null;
}

const isKey = (line: string, key: string) => line.startsWith(`${key}:`);
const continues = (line: string) => /^[\s-]/.test(line) && line.trim() !== '';

/** The frontmatter lines without `keys` and their indented or list continuation lines. */
function without(front: string, keys: readonly string[]): string[] {
  const out: string[] = [];
  let dropping = false;
  for (const line of front.split(/\r?\n/)) {
    if (keys.some((k) => isKey(line, k))) dropping = true;
    else if (!(dropping && continues(line))) {
      dropping = false;
      out.push(line);
    }
  }
  while (out.length && out.at(-1) === '') out.pop();
  return out;
}

/**
 * The whole `---` block for a notebook: Estudio's two keys first, then every other key the file
 * already had, untouched. Writing it again gives the same text.
 */
export function notebookFrontmatter(front: string | null, docId: DocId, pdfName: string): string {
  const rest = front === null ? [] : without(front, [DOC_KEY, PDF_KEY]);
  return ['---', `${DOC_KEY}: ${docId}`, `${PDF_KEY}: ${JSON.stringify(`[[${pdfName}]]`)}`, ...rest, '---', ''].join('\n');
}
