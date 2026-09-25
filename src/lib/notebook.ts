import { Marked } from 'marked';

const PAGE_LINK = /\[\[p(\d+)\]\]/g;

export function pageLink(page: number): string {
  return `[[p${page}]]`;
}

/** A blockquote of `text` that ends with a back-link to its page. */
export function quoteBlock(text: string, page: number): string {
  const lines = text.trim().split(/\r?\n/).map((l) => `> ${l}`);
  return `${lines.join('\n')} ${pageLink(page)}\n`;
}

/** Appends a block, keeping exactly one blank line between blocks. */
export function appendBlock(markdown: string, block: string): string {
  const body = markdown.replace(/\s+$/, '');
  return body ? `${body}\n\n${block}` : block;
}

export function pageLinks(markdown: string): number[] {
  return [...markdown.matchAll(PAGE_LINK)].map((m) => Number(m[1]));
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
      start: (src: string) => src.indexOf('[[p'),
      tokenizer(src: string) {
        const m = /^\[\[p(\d+)\]\]/.exec(src);
        return m ? { type: 'pageLink', raw: m[0], page: Number(m[1]) } : undefined;
      },
      renderer: (token) => `<a href="#p${token.page}" class="plink" data-page="${token.page}">p.&nbsp;${token.page}</a>`,
    },
  ],
});

export function renderMarkdown(markdown: string): string {
  const html = md.parse(markdown, { async: false });
  // Links written by the user must not run script.
  return html.replace(/href="\s*javascript:[^"]*"/gi, 'href="#"');
}
