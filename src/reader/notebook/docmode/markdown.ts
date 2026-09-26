import { getSchema, type AnyExtension, type JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import type { Node as PMNode, Schema } from '@tiptap/pm/model';
import { Marked } from 'marked';
import { splitFrontmatter } from '../../../lib/frontmatter';
import { escapeText } from '../../../lib/mdescape';

/** A run of the source and the top-level nodes it parsed into. */
interface Block { src: string; nodes: PMNode[] }

/** A note as Document mode holds it: frontmatter kept verbatim, and the body's blocks with their source. */
export interface Parsed { front: string; lead: string; blocks: Block[]; doc: PMNode }

/** The manager's hook for writing a text run; replaced so escapes appear only where needed. */
type TextEncoder = { encodeTextForMarkdown(text: string, node: JSONContent, parent?: JSONContent): string };

/**
 * Markdown in and out of Document mode. Parsing keeps each top-level block's source; serialising
 * writes that source back for every block that is still structurally the same, so only what the
 * user edited is written fresh. An untouched note comes back byte for byte.
 */
export class DocMarkdown {
  readonly schema: Schema;
  readonly #md: MarkdownManager;

  constructor(extensions: AnyExtension[], schema?: Schema) {
    this.schema = schema ?? getSchema(extensions);
    this.#md = new MarkdownManager({
      marked: new Marked() as never,
      markedOptions: { gfm: true, breaks: true },
      indentation: { style: 'space', size: 4 },
      extensions,
    });
    const codeTypes = new Set(['code', 'codeBlock']);
    (this.#md as unknown as TextEncoder).encodeTextForMarkdown = (text, node, parent) => {
      if ((parent?.type && codeTypes.has(parent.type)) || (node.marks ?? []).some((m) => codeTypes.has(m.type))) return text;
      const first = parent?.type === 'paragraph' && parent.content?.[0] === node;
      return escapeText(text, first);
    };
  }

  parse(markdown: string): Parsed {
    const { body } = splitFrontmatter(markdown);
    const front = markdown.slice(0, markdown.length - body.length);
    const { lead, runs } = this.#split(body.replace(/\r\n?/g, '\n'));
    const blocks = runs.map((src) => ({ src, nodes: this.#nodes(src) }));
    for (let i = blocks.length - 1; i > 0; i--) {
      if (blocks[i]!.nodes.length === 0) {
        blocks[i - 1]!.src += blocks[i]!.src;
        blocks.splice(i, 1);
      }
    }
    const content = blocks.flatMap((b) => b.nodes);
    const doc = this.schema.topNodeType.create(null, content.length ? content : [this.schema.nodes.paragraph!.create()]);
    return { front, lead, blocks, doc };
  }

  /** The note for `doc`: frontmatter and unchanged blocks as they were, changed blocks written fresh. */
  serialize(doc: PMNode, from: Parsed): string {
    const kids: PMNode[] = [];
    doc.forEach((n) => kids.push(n));
    let out = from.lead;
    let fresh = false;
    let j = 0;
    const sep = () => {
      if (out && !out.endsWith('\n\n')) out += out.endsWith('\n') ? '\n' : '\n\n';
    };
    for (let i = 0; i < kids.length;) {
      const k = findBlock(from.blocks, j, kids, i);
      if (k !== -1) {
        if (fresh) sep();
        const b = from.blocks[k]!;
        out += b.src;
        i += b.nodes.length;
        j = k + 1;
        fresh = false;
        continue;
      }
      const node = kids[i++]!;
      if (isBlank(node)) continue;
      sep();
      out += this.#md.serialize({ type: 'doc', content: [node.toJSON() as JSONContent] }).replace(/\s+$/, '');
      fresh = true;
    }
    if (fresh) out += '\n';
    return from.front + out;
  }

  /** Nodes to insert for a piece of Markdown, such as a dropped quote. */
  fragment(markdown: string): PMNode[] {
    return this.#nodes(markdown);
  }

  #nodes(src: string): PMNode[] {
    const json = this.#md.parse(src);
    return (json.content ?? []).filter((n: JSONContent) => !(n.type === 'paragraph' && !n.content?.length)).map((n: JSONContent) => this.schema.nodeFromJSON(n));
  }

  /** Top-level runs of source, each a block and the blank lines after it; `lead` is blank lines before the first. */
  #split(body: string): { lead: string; runs: string[] } {
    const tokens = this.#md.instance.lexer(body);
    const runs: string[] = [];
    let lead = '';
    for (const t of tokens) {
      if (t.type === 'space') {
        if (runs.length) runs[runs.length - 1] += t.raw;
        else lead += t.raw;
      } else runs.push(t.raw);
    }
    const joined = lead + runs.join('');
    if (joined !== body) return { lead: '', runs: body ? [body] : [] };
    return { lead, runs };
  }
}

const isBlank = (n: PMNode) => n.type.name === 'paragraph' && n.childCount === 0;

/** Index of the first block at or after `j` whose nodes are the ones at `kids[i..]`, or -1. */
function findBlock(blocks: readonly Block[], j: number, kids: readonly PMNode[], i: number): number {
  for (let k = j; k < blocks.length; k++) {
    const b = blocks[k]!;
    if (b.nodes.length && b.nodes.every((n, x) => kids[i + x] === n || kids[i + x]?.eq(n))) return k;
  }
  return -1;
}
