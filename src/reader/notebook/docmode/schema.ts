import { InputRule, mergeAttributes, Node, type AnyExtension, type JSONContent } from '@tiptap/core';
import HardBreak from '@tiptap/extension-hard-break';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Table, TableCell, TableHeader, TableKit } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';
import type { NoteFiles } from '../../../lib/attachments';
import { imageUrl } from '../../../lib/attachments';
import { renderMath } from '../../../lib/katex';
import { formatTable } from '../../../lib/mdtable';
import { blockMathAt, formatBlockMath, formatInlineMath, inlineMathAt } from '../../../lib/mathsyntax';
import { chipText, formatPageLink, pageLinkAtStart, type LinkTarget } from '../../../lib/pagelink';
import { safeHref } from '../../../lib/safeurl';

/** What the node views reach outside the editor for. Absent when only parsing and serialising. */
export interface DocViews {
  files: () => NoteFiles;
  follow: (target: LinkTarget) => void;
  editMath: (pos: number) => void;
}

const attr = (el: HTMLElement, name: string) => el.getAttribute(name);

/** `[[p12]]`, `[[p12|label]]`, `[[paper.pdf#page=12|label]]` as one uneditable chip. */
export const PageLink = Node.create<{ views: DocViews | null }>({
  name: 'pageLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addOptions: () => ({ views: null }),
  addAttributes: () => ({
    page: { default: 1, parseHTML: (el) => Number(attr(el, 'data-page')) },
    file: { default: null, parseHTML: (el) => attr(el, 'data-file') },
    label: { default: null, parseHTML: (el) => attr(el, 'data-label') },
  }),
  parseHTML: () => [{ tag: 'span[data-page-link]' }],
  renderHTML: ({ node }) => ['span', {
    'data-page-link': '', 'data-page': node.attrs.page, 'data-file': node.attrs.file, 'data-label': node.attrs.label,
  }, chipText(node.attrs as { page: number; label: string | null })],
  renderText: ({ node }) => pageLinkMarkdown(node.attrs),
  markdownTokenizer: {
    name: 'pageLink',
    level: 'inline',
    start: (src: string) => src.indexOf('[['),
    tokenize: (src: string) => {
      const l = pageLinkAtStart(src);
      return l ? { type: 'pageLink', raw: src.slice(0, l.to), page: l.page, file: l.file, label: l.label } : undefined;
    },
  },
  parseMarkdown: (token) => ({ type: 'pageLink', attrs: { page: token.page, file: token.file, label: token.label } }),
  renderMarkdown: (node: JSONContent) => pageLinkMarkdown(node.attrs ?? {}),
  addInputRules() {
    return [new InputRule({
      find: /\[\[(?:p\d+|[^[\]|\n]*?\.pdf#page=\d+)(?:\|[^[\]\n]*)?\]\]$/i,
      handler: ({ state, range, match }) => {
        const l = pageLinkAtStart(match[0]);
        if (!l) return null;
        state.tr.replaceWith(range.from, range.to, this.type.create({ page: l.page, file: l.file, label: l.label }));
      },
    })];
  },
  addNodeView() {
    return ({ node }) => {
      const el = document.createElement('span');
      el.className = 'doc-plink';
      el.contentEditable = 'false';
      el.textContent = chipText(node.attrs as { page: number; label: string | null });
      el.title = `${node.attrs.file ? `${node.attrs.file}, page` : 'Page'} ${node.attrs.page}: click to open`;
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.options.views?.follow({ page: node.attrs.page, file: node.attrs.file });
      });
      return { dom: el };
    };
  },
});

function pageLinkMarkdown(a: Record<string, unknown>): string {
  const page = Number(a.page);
  const label = (a.label as string | null) ?? '';
  const file = a.file as string | null;
  if (file) return `[[${file}#page=${page}${label ? `|${label}` : ''}]]`;
  return label ? `[[p${page}|${label}]]` : formatPageLink(page);
}

function mathView(views: () => DocViews | null, display: boolean) {
  return ({ node, getPos }: { node: { attrs: Record<string, unknown> }; getPos: () => number | undefined }) => {
    const el = document.createElement(display ? 'div' : 'span');
    el.className = display ? 'math math-display doc-math' : 'math doc-math';
    el.contentEditable = 'false';
    el.title = 'Click to edit the formula';
    void renderMath(el, String(node.attrs.latex), display);
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const pos = getPos();
      if (pos !== undefined) views()?.editMath(pos);
    });
    return { dom: el };
  };
}

export const InlineMath = Node.create<{ views: DocViews | null }>({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,
  addOptions: () => ({ views: null }),
  addAttributes: () => ({ latex: { default: '', parseHTML: (el) => attr(el, 'data-latex') } }),
  parseHTML: () => [{ tag: 'span[data-inline-math]' }],
  renderHTML: ({ node }) => ['span', { 'data-inline-math': '', 'data-latex': node.attrs.latex }, node.attrs.latex],
  renderText: ({ node }) => formatInlineMath(node.attrs.latex),
  markdownTokenizer: {
    name: 'inlineMath',
    level: 'inline',
    start: (src: string) => src.indexOf('$'),
    tokenize: (src: string) => {
      const m = inlineMathAt(src);
      return m ? { type: 'inlineMath', raw: m.raw, latex: m.latex } : undefined;
    },
  },
  parseMarkdown: (token) => ({ type: 'inlineMath', attrs: { latex: token.latex } }),
  renderMarkdown: (node: JSONContent) => formatInlineMath(String(node.attrs?.latex ?? '')),
  addInputRules() {
    return [new InputRule({
      find: /(?<![\\$])\$([^\s$](?:[^$\n]*?[^\s\\$])?)\$$/,
      handler: ({ state, range, match }) => {
        state.tr.replaceWith(range.from, range.to, this.type.create({ latex: match[1] }));
      },
    })];
  },
  addNodeView() {
    return mathView(() => this.options.views, false);
  },
});

export const BlockMath = Node.create<{ views: DocViews | null }>({
  name: 'blockMath',
  group: 'block',
  atom: true,
  addOptions: () => ({ views: null }),
  addAttributes: () => ({ latex: { default: '', parseHTML: (el) => attr(el, 'data-latex') } }),
  parseHTML: () => [{ tag: 'div[data-block-math]' }],
  renderHTML: ({ node }) => ['div', { 'data-block-math': '', 'data-latex': node.attrs.latex }, node.attrs.latex],
  markdownTokenizer: {
    name: 'blockMath',
    level: 'block',
    start: (src: string) => src.match(/^\$\$/m)?.index ?? -1,
    tokenize: (src: string) => {
      const m = blockMathAt(src);
      return m ? { type: 'blockMath', raw: m.raw, latex: m.latex } : undefined;
    },
  },
  parseMarkdown: (token) => ({ type: 'blockMath', attrs: { latex: token.latex } }),
  renderMarkdown: (node: JSONContent) => formatBlockMath(String(node.attrs?.latex ?? '')),
  addNodeView() {
    return mathView(() => this.options.views, true);
  },
});

/** An image node's view: the picture once its bytes are found, or a note saying which file is missing. */
function imageView(views: () => DocViews | null, src: string, alt: string) {
  const box = document.createElement('span');
  box.className = 'doc-img-box';
  const img = document.createElement('img');
  img.alt = alt;
  img.className = 'doc-img';
  box.append(img);
  const v = views();
  if (v) {
    void imageUrl(v.files(), src).then((url) => {
      if (url) img.src = url;
      else {
        box.classList.add('missing');
        box.textContent = `Image not found: ${src}`;
      }
    });
  }
  return box;
}

/** `![alt](src "title")`, inline so a figure and its page link share a line. */
export const NoteImage = Image.extend<{ views: DocViews | null }>({
  inline: true,
  group: 'inline',
  draggable: true,
  addOptions() {
    return { ...this.parent!(), inline: true, views: null };
  },
  addNodeView() {
    return ({ node }) => {
      const box = imageView(() => this.options.views, String(node.attrs.src ?? ''), String(node.attrs.alt ?? ''));
      if (node.attrs.title) box.title = node.attrs.title;
      return { dom: box };
    };
  },
});

/** Obsidian's `![[name.png]]`: shown, and written back exactly as it was. */
export const Embed = Node.create<{ views: DocViews | null }>({
  name: 'embed',
  group: 'inline',
  inline: true,
  atom: true,
  addOptions: () => ({ views: null }),
  addAttributes: () => ({ target: { default: '' }, raw: { default: '' } }),
  parseHTML: () => [{ tag: 'img[data-embed]' }],
  renderHTML: ({ node }) => ['img', mergeAttributes({ 'data-embed': node.attrs.target, alt: node.attrs.target })],
  renderText: ({ node }) => node.attrs.raw,
  markdownTokenizer: {
    name: 'embed',
    level: 'inline',
    start: (src: string) => src.indexOf('![['),
    tokenize: (src: string) => {
      const m = /^!\[\[([^\]|\n]+?)(?:\|[^\]\n]*)?\]\]/.exec(src);
      return m ? { type: 'embed', raw: m[0], target: m[1]!.trim() } : undefined;
    },
  },
  parseMarkdown: (token) => ({ type: 'embed', attrs: { target: token.target, raw: token.raw } }),
  renderMarkdown: (node: JSONContent) => String(node.attrs?.raw ?? ''),
  addNodeView() {
    return ({ node }) => ({ dom: imageView(() => this.options.views, String(node.attrs.target), '') });
  },
});

/** Table cells hold one line of inline content, as GFM tables can. */
const cell = { content: 'paragraph' };

const DELIM: Record<string, string> = { left: ':--', center: ':-:', right: '--:' };

/** A GFM table with its pipes lined up, as the Markdown-mode "Format table" command writes it. */
const NoteTable = Table.extend({
  renderMarkdown: (node: JSONContent, h) => {
    const rows = (node.content ?? []).map((row) => (row.content ?? []).map((c) => ({
      text: h.renderChildren(c.content ?? []).replace(/\s*\n\s*/g, ' ').replace(/(?<!\\)\|/g, '\\|').trim(),
      align: (c.attrs?.align as string | null) ?? null,
    })));
    if (!rows.length) return '';
    const head = rows[0]!;
    const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
    return formatTable([line(head.map((c) => c.text)), line(head.map((c) => (c.align && DELIM[c.align]) || '---')), ...rows.slice(1).map((r) => line(r.map((c) => c.text)))]).join('\n');
  },
});

/** A line break inside a paragraph is a plain newline, as the preview reads it. */
const LineBreak = HardBreak.extend({ renderMarkdown: () => '\n' });

/** Every node and mark Document mode knows, in the notes format of docs/NOTES-FORMAT.md. */
export function docExtensions(views: DocViews | null = null): AnyExtension[] {
  return [
    StarterKit.configure({
      underline: false,
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: true,
        isAllowedUri: (url) => safeHref(url) !== null,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      },
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      trailingNode: false,
      hardBreak: false,
    }),
    Highlight,
    LineBreak,
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: false, tableCell: false, tableHeader: false }),
    NoteTable.configure({ resizable: false }),
    TableCell.extend(cell),
    TableHeader.extend(cell),
    NoteImage.configure({ views }),
    Embed.configure({ views }),
    PageLink.configure({ views }),
    InlineMath.configure({ views }),
    BlockMath.configure({ views }),
  ];
}
