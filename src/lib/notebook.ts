import { Marked } from 'marked';
import { chipText, formatPageLink, pageLinkAtStart, parsePageLinks } from './pagelink';

/** Drag payload for quoting an annotation or a PDF selection into the notebook. */
export const QUOTE_MIME = 'application/x-estudio-quote';
export interface QuoteDrag { text: string; page: number }

export function setQuoteDrag(dt: DataTransfer, q: QuoteDrag) {
  dt.setData(QUOTE_MIME, JSON.stringify(q));
  dt.setData('text/plain', quoteBlock(q.text, q.page));
  dt.effectAllowed = 'copy';
}

/** A blockquote of `text` that ends with a back-link to its page. */
export function quoteBlock(text: string, page: number): string {
  const lines = text.trim().split(/\r?\n/).map((l) => `> ${l}`);
  return `${lines.join('\n')} ${formatPageLink(page)}\n`;
}

/** Appends a block, keeping exactly one blank line between blocks. */
export function appendBlock(markdown: string, block: string): string {
  const body = markdown.replace(/\s+$/, '');
  return body ? `${body}\n\n${block}` : block;
}

export function pageLinks(markdown: string): number[] {
  return parsePageLinks(markdown).map((l) => l.page);
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
        const l = pageLinkAtStart(src);
        return l ? { type: 'pageLink', raw: src.slice(0, l.to), page: l.page, label: l.label } : undefined;
      },
      renderer: (token) =>
        `<a href="#p${token.page}" class="plink" data-page="${token.page}" title="Page ${token.page}">${escapeHtml(chipText({ page: token.page, label: token.label })).replace(/ /g, '&nbsp;')}</a>`,
    },
  ],
});

export function renderMarkdown(markdown: string): string {
  const html = md.parse(markdown, { async: false });
  // Links written by the user must not run script.
  return html.replace(/href="\s*javascript:[^"]*"/gi, 'href="#"');
}
