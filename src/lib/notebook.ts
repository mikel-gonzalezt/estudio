import { Marked } from 'marked';
import { blockMathAt, inlineMathAt } from './mathsyntax';
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
  return parsePageLinks(markdown).map((l) => l.page);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
const isRemote = (src: string) => /^(https?:|data:)/i.test(src);

/** Local sources are resolved by the caller (see `hydrate.ts`); only remote ones load directly. */
const imgTag = (src: string, alt: string, title?: string | null) =>
  `<img class="md-img" ${isRemote(src) ? `src="${escapeHtml(src)}"` : `data-src="${escapeHtml(src)}"`} alt="${escapeHtml(alt)}"${title ? ` title="${escapeHtml(title)}"` : ''}>`;

const mathTag = (latex: string, display: boolean) =>
  display ? `<div class="math math-display" data-latex="${escapeHtml(latex)}">${escapeHtml(latex)}</div>` : `<span class="math" data-latex="${escapeHtml(latex)}">${escapeHtml(latex)}</span>`;

/** `plainLinks` writes page links as text, "p. 12" or "Intro (p. 12)", for printing. */
function makeMarked(plainLinks: boolean) {
  return new Marked({
    gfm: true,
    breaks: true,
    renderer: {
      // Raw HTML in notes is shown as text: notebooks can come from imported backups.
      html: ({ text }) => escapeHtml(text),
      image: ({ href, text, title }) => imgTag(href, text, title),
    },
    extensions: [
      {
        name: 'blockMath',
        level: 'block',
        start: (src: string) => src.match(/^\$\$/m)?.index,
        tokenizer(src: string) {
          const m = blockMathAt(src);
          return m ? { type: 'blockMath', raw: m.raw, latex: m.latex } : undefined;
        },
        renderer: (token) => mathTag(token.latex as string, true),
      },
      {
        name: 'inlineMath',
        level: 'inline',
        start: (src: string) => src.indexOf('$'),
        tokenizer(src: string) {
          const m = inlineMathAt(src);
          return m ? { type: 'inlineMath', raw: m.raw, latex: m.latex } : undefined;
        },
        renderer: (token) => mathTag(token.latex as string, false),
      },
      {
        name: 'embed',
        level: 'inline',
        start: (src: string) => src.indexOf('![['),
        tokenizer(src: string) {
          const m = /^!\[\[([^\]|\n]+?)(?:\|[^\]\n]*)?\]\]/.exec(src);
          return m && IMAGE_EXT.test(m[1]!) ? { type: 'embed', raw: m[0], src: m[1]!.trim() } : undefined;
        },
        renderer: (token) => imgTag(token.src as string, ''),
      },
      {
        name: 'highlight',
        level: 'inline',
        start: (src: string) => src.indexOf('=='),
        tokenizer(src: string) {
          const m = /^==(?=[^=\s])([^=\n]*?[^=\s])==/.exec(src);
          return m ? { type: 'highlight', raw: m[0], tokens: this.lexer.inlineTokens(m[1]!) } : undefined;
        },
        renderer(token) {
          return `<mark>${this.parser.parseInline(token.tokens ?? [])}</mark>`;
        },
      },
      {
        name: 'pageLink',
        level: 'inline',
        start: (src: string) => src.indexOf('[['),
        tokenizer(src: string) {
          const l = pageLinkAtStart(src);
          return l ? { type: 'pageLink', raw: src.slice(0, l.to), page: l.page, file: l.file, label: l.label } : undefined;
        },
        renderer: (token) => plainLinks
          ? `<span class="plink-text">${escapeHtml(token.label && token.label !== `p. ${token.page}` ? `${token.label} (p. ${token.page})` : `p. ${token.page}`)}</span>`
          : `<a href="#p${token.page}" class="plink" data-page="${token.page}"${token.file ? ` data-file="${escapeHtml(token.file)}"` : ''} title="${token.file ? `${escapeHtml(token.file)}, page` : 'Page'} ${token.page}">${escapeHtml(chipText({ page: token.page, label: token.label })).replace(/ /g, '&nbsp;')}</a>`,
      },
    ],
  });
}

const md = makeMarked(false);
let printMd: Marked | undefined;

export function renderMarkdown(markdown: string, opts: { plainLinks?: boolean } = {}): string {
  const html = (opts.plainLinks ? (printMd ??= makeMarked(true)) : md).parse(markdown, { async: false });
  // Links written by the user must not run script.
  return html.replace(/href="\s*javascript:[^"]*"/gi, 'href="#"');
}
