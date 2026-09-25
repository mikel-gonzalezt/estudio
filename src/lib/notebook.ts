import { Marked } from 'marked';

/** `[[p12]]`, or Obsidian's `[[paper.pdf#page=12|p. 12]]`. */
const PAGE_LINK = /\[\[(?:p(\d+)|([^\]|#]+\.pdf)#page=(\d+)(?:\|([^\]]*))?)\]\]/gi;

/** A link to `page`. In a vault notebook it names the PDF so Obsidian can follow it too. */
export function formatPageLink(page: number, label?: string, pdfName?: string): string {
  return pdfName ? `[[${pdfName}#page=${page}|${label ?? `p. ${page}`}]]` : `[[p${page}]]`;
}

/** A blockquote of `text` that ends with a back-link to its page. */
export function quoteBlock(text: string, page: number, pdfName?: string): string {
  const lines = text.trim().split(/\r?\n/).map((l) => `> ${l}`);
  return `${lines.join('\n')} ${formatPageLink(page, undefined, pdfName)}\n`;
}

/** Appends a block, keeping exactly one blank line between blocks. */
export function appendBlock(markdown: string, block: string): string {
  const body = markdown.replace(/\s+$/, '');
  return body ? `${body}\n\n${block}` : block;
}

export function pageLinks(markdown: string): number[] {
  return [...markdown.matchAll(PAGE_LINK)].map((m) => Number(m[1] ?? m[3]));
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const md = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    // Raw HTML in notes is shown as text: notebooks can come from imported backups.
    html: ({ text }) => escapeHtml(text),
  },
  extensions: [
    {
      name: 'pageLink',
      level: 'inline',
      start: (src: string) => src.indexOf('[['),
      tokenizer(src: string) {
        const m = new RegExp(`^${PAGE_LINK.source}`, 'i').exec(src);
        if (!m) return undefined;
        const page = Number(m[1] ?? m[3]);
        return { type: 'pageLink', raw: m[0], page, label: m[4] || `p. ${page}` };
      },
      renderer: (token) => `<a href="#p${token.page}" class="plink" data-page="${token.page}">${escapeHtml(String(token.label)).replace(/ /g, '&nbsp;')}</a>`,
    },
  ],
});

export function renderMarkdown(markdown: string): string {
  const html = md.parse(markdown, { async: false });
  // Links written by the user must not run script.
  return html.replace(/href="\s*javascript:[^"]*"/gi, 'href="#"');
}
