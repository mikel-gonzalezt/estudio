import { ATTACHMENTS_DIR, imageRefs, refFrom, type ImageRef } from './attachments';
import { namePageLinks } from './pagelink';
import { joinPath, nameOf, parentOf, type VaultPath } from './vaulttree';

/** Where an image a notebook references is kept before the notebook moves. */
export type ImageOrigin = { kind: 'db'; id: string; name: string } | { kind: 'file'; path: VaultPath };

export interface MoveInput {
  /** The notebook's text without its frontmatter. */
  body: string;
  pdfName: string;
  /** Where the notebook would go in the destination vault; a free name beside it is used when it is taken. */
  planned: VaultPath;
  /** Where each image the notebook references is now, keyed by its source as written. Sources not listed stay as written. */
  origins: ReadonlyMap<string, ImageOrigin>;
  /** Whether a path in the destination vault is taken. */
  taken: (path: VaultPath) => boolean;
}

export interface MovePlan {
  notePath: VaultPath;
  /** Each referenced image once, to a free name in `attachments/` beside the new note. */
  copies: { origin: ImageOrigin; to: VaultPath }[];
  /** The text to write: page links name the PDF for Obsidian, and image references point at the copies. */
  body: string;
}

/** `path`, or `name (2).ext`, `name (3).ext`… in the same folder: the first that `taken` refuses. */
export function freeName(path: VaultPath, taken: (path: VaultPath) => boolean): VaultPath {
  const dir = parentOf(path);
  const name = nameOf(path);
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let i = 1; ; i++) {
    const candidate = joinPath(dir, i === 1 ? name : `${stem} (${i})${ext}`);
    if (!taken(candidate)) return candidate;
  }
}

const originKey = (o: ImageOrigin) => (o.kind === 'db' ? `db:${o.id}` : `file:${o.path}`);

/** Where a notebook moving to another folder, possibly in another vault, is written, and what it takes along. */
export function planMove(m: MoveInput): MovePlan {
  const notePath = freeName(m.planned, m.taken);
  const dir = joinPath(parentOf(notePath), ATTACHMENTS_DIR);
  const claimed = new Set<VaultPath>();
  const copies: MovePlan['copies'] = [];
  const byOrigin = new Map<string, VaultPath>();
  const target = new Map<string, VaultPath>();
  for (const [src, origin] of m.origins) {
    let to = byOrigin.get(originKey(origin));
    if (to === undefined) {
      const name = origin.kind === 'file' ? nameOf(origin.path) : origin.name;
      to = freeName(joinPath(dir, name), (p) => claimed.has(p) || m.taken(p));
      claimed.add(to);
      byOrigin.set(originKey(origin), to);
      copies.push({ origin, to });
    }
    target.set(src, to);
  }
  const body = rewriteImageRefs(namePageLinks(m.body, m.pdfName), (r) => {
    const to = target.get(r.src);
    if (to === undefined) return undefined;
    if (!r.embed) return refFrom(notePath, to);
    return nameOf(to) === nameOf(r.src) ? r.src : to;
  });
  return { notePath, copies, body };
}

/** Replaces the source of each image reference for which `to` gives a new one; nothing else changes. */
export function rewriteImageRefs(markdown: string, to: (ref: ImageRef) => string | undefined): string {
  let out = '';
  let at = 0;
  for (const r of imageRefs(markdown)) {
    const next = to(r);
    if (next === undefined) continue;
    const s = markdown.indexOf(r.src, r.from);
    out += markdown.slice(at, s) + next;
    at = s + r.src.length;
  }
  return out + markdown.slice(at);
}

/**
 * The images a moved notebook took along that can be deleted from its old place: those in the
 * `attachments` folder beside the old note that no other note in the old note's folder mentions.
 */
export function leftBehind(oldNote: VaultPath, moved: readonly VaultPath[], others: readonly { text: string }[]): VaultPath[] {
  const dir = joinPath(parentOf(oldNote), ATTACHMENTS_DIR);
  return moved.filter((p) => parentOf(p) === dir && !others.some((o) => mentions(o.text, nameOf(p))));
}

const mentions = (text: string, name: string) => text.includes(name) || text.includes(encodeURIComponent(name)) || text.includes(name.replace(/ /g, '%20'));
