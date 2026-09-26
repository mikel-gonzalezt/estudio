import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  ImportedXmlComponent,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ILevelsOptions,
  type IParagraphOptions,
  type IRunOptions,
  type IStylesOptions,
  type ParagraphChild,
} from 'docx';
import type { BlockContent, DefinitionContent, List, ListItem, PhrasingContent, Root, RootContent, Table as MdTable, Text } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { mathFromMarkdown } from 'mdast-util-math';
import { gfm } from 'micromark-extension-gfm';
import { math } from 'micromark-extension-math';
import { splitFrontmatter } from '../frontmatter';
import { chipText, pageLinkPattern } from '../pagelink';
import { renderFormulaPng } from './formulapng';
import { latexToOmml, type XmlNode } from './omml';

/** The image contract of `docs/NOTES-FORMAT.md`; `src/lib/attachments.ts` owns it once it exists. */
export type ResolvedImage = { bytes: Uint8Array; mime: string; width: number; height: number };
export type ImageResolver = (src: string) => Promise<ResolvedImage | null>;

/** A picture of a formula Word cannot hold as an equation; width and height are its display size in px. */
export type FormulaRenderer = (latex: string, display: boolean) => Promise<ResolvedImage | null>;

export interface DocxOptions {
  title: string;
  resolveImage: ImageResolver;
  renderFormula?: FormulaRenderer;
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface Highlight { type: 'highlight'; children: PhrasingContent[] }
interface PageLinkNode { type: 'pageLink'; page: number; label: string | null }

declare module 'mdast' {
  interface PhrasingContentMap {
    highlight: Highlight;
    pageLink: PageLinkNode;
  }
}

const IMAGE_FILE = /\.(png|jpe?g|gif|bmp|svg|webp)$/i;
const EMBED = /!\[\[([^\[\]|\n]+?)(?:\|[^\[\]\n]*)?\]\]/g;

/** Page links and Obsidian image embeds inside a text node, as their own nodes. */
function splitText(node: Text): PhrasingContent[] {
  const found: { index: number; length: number; node: PhrasingContent }[] = [];
  for (const m of node.value.matchAll(EMBED)) {
    if (IMAGE_FILE.test(m[1]!)) found.push({ index: m.index, length: m[0].length, node: { type: 'image', url: m[1]!.trim(), alt: '' } });
  }
  for (const m of node.value.matchAll(pageLinkPattern())) {
    const page = Number(m[1] ?? m[3]);
    if (page >= 1) found.push({ index: m.index, length: m[0].length, node: { type: 'pageLink', page, label: m[4]?.trim() || null } });
  }
  if (!found.length) return [node];
  found.sort((a, b) => a.index - b.index);
  const out: PhrasingContent[] = [];
  let at = 0;
  for (const f of found) {
    if (f.index < at) continue;
    if (f.index > at) out.push({ type: 'text', value: node.value.slice(at, f.index) });
    out.push(f.node);
    at = f.index + f.length;
  }
  if (at < node.value.length) out.push({ type: 'text', value: node.value.slice(at) });
  return out;
}

const MARK = Symbol('==');
type Item = PhrasingContent | typeof MARK;

function mergeText(nodes: PhrasingContent[]): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  for (const n of nodes) {
    const last = out.at(-1);
    if (n.type === 'text' && last?.type === 'text') out[out.length - 1] = { type: 'text', value: last.value + n.value };
    else if (n.type !== 'text' || n.value) out.push(n);
  }
  return out;
}

/** `==text==` around any run of siblings, bold or links included, as the preview reads it. */
function wrapHighlights(nodes: PhrasingContent[]): PhrasingContent[] {
  const items: Item[] = [];
  for (const n of nodes) {
    if (n.type !== 'text' || !n.value.includes('==')) {
      items.push(n);
      continue;
    }
    n.value.split('==').forEach((part, i) => {
      if (i) items.push(MARK);
      if (part) items.push({ type: 'text', value: part });
    });
  }
  const asText = (it: Item): PhrasingContent => (it === MARK ? { type: 'text', value: '==' } : it);
  const touches = (it: Item | undefined, edge: RegExp) => it !== undefined && it !== MARK && (it.type !== 'text' || edge.test(it.value));
  const out: PhrasingContent[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (it !== MARK) {
      out.push(it);
      continue;
    }
    let close = -1;
    if (touches(items[i + 1], /^\S/)) {
      for (let j = i + 2; j < items.length && close < 0; j++) if (items[j] === MARK && touches(items[j - 1], /\S$/)) close = j;
    }
    if (close < 0) {
      out.push(asText(it));
      continue;
    }
    out.push({ type: 'highlight', children: mergeText(items.slice(i + 1, close).map(asText)) });
    i = close;
  }
  return mergeText(out);
}

type Parent = { children: unknown[] };
const PHRASING_PARENTS = new Set(['paragraph', 'heading', 'tableCell', 'emphasis', 'strong', 'delete', 'link', 'linkReference']);

function transform(node: { type: string; children?: unknown[] }) {
  if (!node.children) return;
  for (const c of node.children) transform(c as { type: string; children?: unknown[] });
  if (PHRASING_PARENTS.has(node.type)) {
    const kids = (node.children as PhrasingContent[]).flatMap((c) => (c.type === 'text' ? splitText(c) : [c]));
    (node as Parent).children = wrapHighlights(kids);
  }
}

export function parseNotes(markdown: string): Root {
  const tree = fromMarkdown(splitFrontmatter(markdown).body, {
    extensions: [gfm(), math()],
    mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()],
  });
  transform(tree);
  return tree;
}

/** Usable width of an A4 page with 1-inch margins, in px at 96 dpi. */
const PAGE_WIDTH_PX = 600;
const CODE_FONT = 'Consolas';
const CODE_SHADING = { type: ShadingType.CLEAR, color: 'auto', fill: 'F2F2F2' } as const;
const QUOTE_INDENT = 360;
const LIST_INDENT = 720;
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
const IMAGE_TYPES: Record<string, 'png' | 'jpg' | 'gif' | 'bmp'> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp' };
const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT } as const;
const CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '999999' } as const;

type Numbering = 'bullet' | 'ordered' | 'task-open' | 'task-done';

function levels(format: (typeof LevelFormat)[keyof typeof LevelFormat] | ((i: number) => (typeof LevelFormat)[keyof typeof LevelFormat]), text: (i: number) => string, font?: string): ILevelsOptions[] {
  return Array.from({ length: 9 }, (_, i) => ({
    level: i,
    format: typeof format === 'function' ? format(i) : format,
    text: text(i),
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: LIST_INDENT * (i + 1), hanging: 360 } }, ...(font ? { run: { font } } : {}) },
  }));
}

const NUMBERING: { reference: Numbering; levels: ILevelsOptions[] }[] = [
  { reference: 'bullet', levels: levels(LevelFormat.BULLET, (i) => ['•', '◦', '▪'][i % 3]!) },
  { reference: 'ordered', levels: levels((i) => [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][i % 3]!, (i) => `%${i + 1}.`) },
  { reference: 'task-open', levels: levels(LevelFormat.BULLET, () => '☐', 'Segoe UI Symbol') },
  { reference: 'task-done', levels: levels(LevelFormat.BULLET, () => '☑', 'Segoe UI Symbol') },
];

/** Heading styles carry their outline level, so Word's navigation pane lists them. */
const heading = (level: number) => ({ paragraph: { spacing: { before: level < 2 ? 320 : 240, after: 80 }, keepNext: true, outlineLevel: level } });
const STYLES: IStylesOptions = {
  default: {
    document: { run: { font: 'Calibri', size: 22 }, paragraph: { spacing: { after: 120 } } },
    heading1: heading(0),
    heading2: heading(1),
    heading3: heading(2),
    heading4: heading(3),
    heading5: heading(4),
    heading6: heading(5),
  },
};
const TIGHT = { spacing: { after: 40 } };

interface Ctx { quote: number; indent: number; width: number }
interface RunStyle { bold?: boolean; italics?: boolean; strike?: boolean; highlight?: boolean; link?: boolean }
type Block = Paragraph | Table;

function raw(n: XmlNode): ParagraphChild {
  const c = new ImportedXmlComponent(n.name, Object.keys(n.attrs).length ? n.attrs : undefined);
  for (const k of n.children) c.push(typeof k === 'string' ? k : (raw(k) as unknown as ImportedXmlComponent));
  return c as unknown as ParagraphChild;
}

const isExternal = (url: string) => /^(https?:|mailto:)/i.test(url);

class Writer {
  #ordered = 0;
  readonly #defs = new Map<string, string>();

  constructor(
    private readonly resolveImage: ImageResolver,
    private readonly renderFormula: FormulaRenderer,
  ) {}

  define(nodes: RootContent[]) {
    for (const n of nodes) {
      if (n.type === 'definition') this.#defs.set(n.identifier, n.url);
      if ('children' in n) this.define(n.children as RootContent[]);
    }
  }

  #para(ctx: Ctx, opts: IParagraphOptions): Paragraph {
    const quote = ctx.quote
      ? { border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'A0A0A0', space: 8 } } }
      : {};
    const left = ctx.indent + ctx.quote * QUOTE_INDENT;
    return new Paragraph({ ...quote, ...(left && !opts.numbering ? { indent: { left } } : {}), ...opts });
  }

  #text(value: string, s: RunStyle, extra: IRunOptions = {}): TextRun[] {
    const base: IRunOptions = {
      bold: s.bold,
      italics: s.italics,
      strike: s.strike,
      ...(s.highlight ? { highlight: 'yellow' } : {}),
      ...(s.link ? { style: 'Hyperlink' } : {}),
      ...extra,
    };
    return value.split('\n').map((line, i) => new TextRun({ ...base, text: line, ...(i ? { break: 1 } : {}) }));
  }

  async #image(src: string, alt: string, ctx: Ctx): Promise<ParagraphChild[]> {
    const img = await this.resolveImage(src).catch(() => null);
    if (!img) return this.#text(`[image not found: ${src}]`, { italics: true });
    const type = IMAGE_TYPES[img.mime];
    if (!type) return this.#text(`[image format not supported: ${src}]`, { italics: true });
    return [this.#picture(img, type, ctx.width, alt || src)];
  }

  #picture(img: ResolvedImage, type: 'png' | 'jpg' | 'gif' | 'bmp', maxWidth: number, description: string): ImageRun {
    const scale = Math.min(1, maxWidth / img.width);
    return new ImageRun({
      type,
      data: img.bytes,
      transformation: { width: Math.max(1, Math.round(img.width * scale)), height: Math.max(1, Math.round(img.height * scale)) },
      altText: { name: description, description, title: description },
    });
  }

  /** A native equation when the formula maps to OMML, else a picture of it, else its LaTeX. */
  async formula(latex: string, display: boolean, ctx: Ctx): Promise<ParagraphChild[]> {
    try {
      const omath = latexToOmml(latex, display);
      return [raw(display ? { name: 'm:oMathPara', attrs: {}, children: [omath] } : omath)];
    } catch {
      const img = await this.renderFormula(latex, display).catch(() => null);
      if (img && IMAGE_TYPES[img.mime]) return [this.#picture(img, IMAGE_TYPES[img.mime]!, ctx.width, latex)];
      return this.#text(display ? latex : `$${latex}$`, {}, { font: CODE_FONT });
    }
  }

  async #link(url: string, children: PhrasingContent[], s: RunStyle, ctx: Ctx): Promise<ParagraphChild[]> {
    if (!isExternal(url)) return this.inline(children, s, ctx);
    return [new ExternalHyperlink({ link: url, children: await this.inline(children, { ...s, link: true }, ctx) })];
  }

  async inline(nodes: PhrasingContent[], s: RunStyle, ctx: Ctx): Promise<ParagraphChild[]> {
    const out: ParagraphChild[] = [];
    for (const n of nodes) out.push(...(await this.#inline(n, s, ctx)));
    return out;
  }

  async #inline(n: PhrasingContent, s: RunStyle, ctx: Ctx): Promise<ParagraphChild[]> {
    switch (n.type) {
      case 'text':
        return this.#text(n.value, s);
      case 'strong':
        return this.inline(n.children, { ...s, bold: true }, ctx);
      case 'emphasis':
        return this.inline(n.children, { ...s, italics: true }, ctx);
      case 'delete':
        return this.inline(n.children, { ...s, strike: true }, ctx);
      case 'highlight':
        return this.inline(n.children, { ...s, highlight: true }, ctx);
      case 'inlineCode':
        return this.#text(n.value, s, { font: CODE_FONT, shading: CODE_SHADING });
      case 'break':
        return [new TextRun({ break: 1 })];
      case 'pageLink':
        return this.#text(chipText(n), s);
      case 'link':
        return this.#link(n.url, n.children, s, ctx);
      case 'linkReference': {
        const url = this.#defs.get(n.identifier);
        return url ? this.#link(url, n.children, s, ctx) : this.inline(n.children, s, ctx);
      }
      case 'image':
        return this.#image(n.url, n.alt ?? '', ctx);
      case 'imageReference': {
        const url = this.#defs.get(n.identifier);
        return url ? this.#image(url, n.alt ?? '', ctx) : this.#text(`![${n.alt ?? ''}]`, s);
      }
      case 'inlineMath':
        return /^\s|\s$/.test(n.value) ? this.#text(`$${n.value}$`, s) : this.formula(n.value, false, ctx);
      case 'footnoteReference':
        return this.#text(`[^${n.label ?? n.identifier}]`, s);
      case 'html':
        return this.#text(n.value, s);
    }
  }

  async blocks(nodes: (RootContent | BlockContent | DefinitionContent)[], ctx: Ctx): Promise<Block[]> {
    const out: Block[] = [];
    for (const n of nodes) out.push(...(await this.#block(n as RootContent, ctx)));
    return out;
  }

  async #block(n: RootContent, ctx: Ctx): Promise<Block[]> {
    switch (n.type) {
      case 'paragraph':
        return [this.#para(ctx, { children: await this.inline(n.children, {}, ctx) })];
      case 'heading':
        return [this.#para(ctx, { heading: HEADINGS[n.depth - 1], children: await this.inline(n.children, {}, ctx) })];
      case 'thematicBreak':
        return [this.#para(ctx, { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'A0A0A0', space: 1 } }, children: [] })];
      case 'blockquote':
        return this.blocks(n.children, { ...ctx, quote: ctx.quote + 1 });
      case 'list':
        return this.#list(n, 0, ctx);
      case 'code':
        return [this.#para(ctx, { shading: CODE_SHADING, children: this.#text(n.value, {}, { font: CODE_FONT, size: 20 }) })];
      case 'math':
        return [this.#para(ctx, { alignment: AlignmentType.CENTER, children: await this.formula(n.value, true, ctx) })];
      case 'table':
        return [await this.#table(n, ctx)];
      case 'html':
        return [this.#para(ctx, { children: this.#text(n.value, {}) })];
      case 'footnoteDefinition':
        return this.blocks(n.children, ctx);
      default:
        return [];
    }
  }

  async #list(list: List, level: number, ctx: Ctx): Promise<Block[]> {
    const instance = list.ordered ? ++this.#ordered : 0;
    const out: Block[] = [];
    for (const item of list.children) out.push(...(await this.#item(item, list, level, instance, ctx)));
    return out;
  }

  async #item(item: ListItem, list: List, level: number, instance: number, ctx: Ctx): Promise<Block[]> {
    const reference: Numbering = item.checked === true ? 'task-done' : item.checked === false ? 'task-open' : list.ordered ? 'ordered' : 'bullet';
    const inner: Ctx = { ...ctx, indent: ctx.indent + LIST_INDENT * (level + 1), width: Math.max(100, ctx.width - (LIST_INDENT * (level + 1)) / 15) };
    const out: Block[] = [];
    let numbered = false;
    for (const c of item.children) {
      if (c.type === 'list') {
        out.push(...(await this.#list(c, level + 1, ctx)));
      } else if (c.type === 'paragraph' && !numbered) {
        numbered = true;
        out.push(this.#para(ctx, { ...TIGHT, numbering: { reference, level, instance }, children: await this.inline(c.children, {}, inner) }));
      } else {
        out.push(...(await this.#block(c, inner)));
      }
    }
    if (!numbered) out.unshift(this.#para(ctx, { ...TIGHT, numbering: { reference, level, instance }, children: [] }));
    return out;
  }

  async #table(t: MdTable, ctx: Ctx): Promise<Table> {
    const cols = Math.max(...t.children.map((r) => r.children.length));
    const cellCtx: Ctx = { quote: 0, indent: 0, width: Math.floor(ctx.width / cols) - 10 };
    const rows = await Promise.all(
      t.children.map(async (r, ri) => {
        const cells = await Promise.all(
          Array.from({ length: cols }, async (_, ci) => {
            const cell = r.children[ci];
            const align = t.align?.[ci];
            const children = cell ? await this.inline(cell.children, { bold: ri === 0 }, cellCtx) : [];
            return new TableCell({
              width: { size: Math.floor(100 / cols), type: WidthType.PERCENTAGE },
              children: [new Paragraph({ spacing: { before: 40, after: 40 }, ...(align ? { alignment: ALIGN[align] } : {}), children })],
            });
          }),
        );
        return new TableRow({ tableHeader: ri === 0, children: cells });
      }),
    );
    const border = { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER, insideHorizontal: CELL_BORDER, insideVertical: CELL_BORDER };
    return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: border, ...(ctx.quote || ctx.indent ? { indent: { size: ctx.indent + ctx.quote * QUOTE_INDENT, type: WidthType.DXA } } : {}) });
  }
}

/**
 * The notebook as a Word document: headings in Word's heading styles, page links as their text,
 * maths as Word equations where the formula maps to OMML (a picture otherwise), images embedded.
 */
export async function notesToDocx(markdown: string, opts: DocxOptions): Promise<Blob> {
  const tree = parseNotes(markdown);
  const w = new Writer(opts.resolveImage, opts.renderFormula ?? renderFormulaPng);
  w.define(tree.children);
  const children = await w.blocks(tree.children, { quote: 0, indent: 0, width: PAGE_WIDTH_PX });
  if (!children.length || children.at(-1) instanceof Table) children.push(new Paragraph({}));
  const doc = new Document({
    title: opts.title,
    styles: STYLES,
    numbering: { config: NUMBERING },
    sections: [{ children }],
  });
  return new Blob([await Packer.toArrayBuffer(doc)], { type: DOCX_MIME });
}
