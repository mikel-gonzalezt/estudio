import { getAttachment, putAttachment } from './db';
import { formatPageLink } from './pagelink';
import { dirAt, fileOrNull, freePath, walk, writeFile } from './vault';
import { joinPath, nameOf, parentOf, type VaultPath } from './vaulttree';

/** An image a note references, as every consumer (editor, preview, exporters) receives it. */
export type ResolvedImage = { bytes: Uint8Array; mime: string; width: number; height: number };
/** `src` is exactly what is inside the parentheses of `![alt](src)`, or the target of `![[name.png]]`. */
export type ImageResolver = (src: string) => Promise<ResolvedImage | null>;

export const ATTACHMENT_SCHEME = 'estudio-attachment:';
export const ATTACHMENTS_DIR = 'attachments';

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Obsidian's name for a pasted image: `Pasted image 20260926143012.png`. */
export function pastedImageName(at: Date, ext = 'png'): string {
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  return `Pasted image ${stamp}.${ext}`;
}

export const extOf = (mime: string) => ({ 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' })[mime] ?? 'png';

/** A vault path relative to the note as it is written in Markdown: spaces and other unsafe characters encoded. */
export const encodeRef = (rel: string) => rel.split('/').map((s) => encodeURIComponent(s).replace(/%28/g, '(').replace(/%29/g, ')')).join('/');

export const imageMarkdown = (src: string, alt = '') => `![${alt}](${src})`;

/** A figure clipped from the PDF: the image, then a link to its page on the same line. */
export const figureMarkdown = (src: string, page: number, pdfName?: string) =>
  `${imageMarkdown(src, 'Figure')} ${formatPageLink(page, undefined, pdfName)}`;

export const attachmentId = (src: string) => (src.startsWith(ATTACHMENT_SCHEME) ? src.slice(ATTACHMENT_SCHEME.length) : null);

export interface ImageRef { from: number; to: number; src: string; embed: boolean }

const IMAGE = /!\[(?:\\.|[^\]\\\n])*\]\(\s*(<[^>\n]*>|(?:\\.|[^\s()\\]|\((?:[^\s()\\])*\))+)(?:\s+"[^"\n]*")?\s*\)|!\[\[([^\]|\n]+?)(?:\|[^\]\n]*)?\]\]/g;

/** Every image reference in `markdown`, `![alt](src "title")` and Obsidian's `![[name.png]]`. */
export function imageRefs(markdown: string): ImageRef[] {
  return [...markdown.matchAll(IMAGE)].map((m) => {
    const raw = m[1] ?? m[2]!;
    return { from: m.index, to: m.index + m[0].length, src: raw.replace(/^<|>$/g, ''), embed: m[2] !== undefined };
  });
}

/** Replaces `estudio-attachment:<id>` sources for which `to(id)` gives a new source; nothing else changes. */
export function rewriteAttachmentRefs(markdown: string, to: (id: string) => string | undefined): string {
  let out = '';
  let at = 0;
  for (const r of imageRefs(markdown)) {
    const id = attachmentId(r.src);
    const next = id === null ? undefined : to(id);
    if (next === undefined) continue;
    const s = markdown.indexOf(r.src, r.from);
    out += markdown.slice(at, s) + next;
    at = s + r.src.length;
  }
  return out + markdown.slice(at);
}

/** Resolves `.` and `..` segments; null when the path climbs above the vault root. */
export function normalisePath(p: string): VaultPath | null {
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (!out.length) return null;
      out.pop();
    } else out.push(seg);
  }
  return out.join('/');
}

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** Vault paths to try for `src`, in order: relative to the note's folder, then to the vault root. */
export function candidatePaths(src: string, noteDir: VaultPath): VaultPath[] {
  const rel = decode(src.split(/[?#]/)[0]!);
  const out = [normalisePath(joinPath(noteDir, rel)), normalisePath(rel)].filter((p): p is VaultPath => p !== null && p !== '');
  return [...new Set(out)];
}

/** Where a note keeps images it gains, and how it finds the ones it references. */
export interface NoteFiles {
  /** Stores `blob` and returns the source to write in `![](…)`. */
  save(blob: Blob): Promise<string>;
  blob(src: string): Promise<Blob | null>;
  resolve: ImageResolver;
}

const isRemote = (src: string) => /^(https?:|data:|blob:)/i.test(src);

async function remote(src: string): Promise<Blob | null> {
  try {
    const r = await fetch(src);
    return r.ok ? await r.blob() : null;
  } catch {
    return null;
  }
}

async function resolved(blob: Blob | null): Promise<ResolvedImage | null> {
  if (!blob) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let width = 0;
  let height = 0;
  try {
    const bmp = await createImageBitmap(blob);
    ({ width, height } = bmp);
    bmp.close();
  } catch {
    // SVG and undecodable images keep 0 × 0; consumers fall back to their own size.
  }
  return { bytes, mime: blob.type || 'image/png', width, height };
}

function withResolve(save: NoteFiles['save'], local: (src: string) => Promise<Blob | null>): NoteFiles {
  const blob = (src: string) => (isRemote(src) ? remote(src) : local(src));
  return { save, blob, resolve: async (src) => resolved(await blob(src)) };
}

/** A notebook kept in IndexedDB keeps its images there too. */
export function dbFiles(): NoteFiles {
  return withResolve(
    async (blob) => {
      const id = crypto.randomUUID();
      const createdAt = Date.now();
      await putAttachment({ id, blob, createdAt, name: pastedImageName(new Date(createdAt), extOf(blob.type)) });
      return ATTACHMENT_SCHEME + id;
    },
    async (src) => {
      const id = attachmentId(src);
      return id ? ((await getAttachment(id))?.blob ?? null) : null;
    },
  );
}

type Dir = FileSystemDirectoryHandle;

async function fileBlob(root: Dir, path: VaultPath): Promise<Blob | null> {
  const h = await fileOrNull(root, path);
  return h ? h.getFile() : null;
}

/** Writes `blob` into the `attachments` folder beside `notePath` under a free name; returns its vault path. */
export async function writeAttachment(root: Dir, notePath: VaultPath, blob: Blob, name: string): Promise<VaultPath> {
  const dir = joinPath(parentOf(notePath), ATTACHMENTS_DIR);
  await dirAt(root, dir, true);
  const path = await freePath(root, joinPath(dir, name));
  const h = await (await dirAt(root, dir)).getFileHandle(nameOf(path), { create: true });
  await writeFile(h, blob);
  return path;
}

/** The source a note at `notePath` writes for the vault file at `path`, which lies in or below the note's folder. */
export const refFrom = (notePath: VaultPath, path: VaultPath) => {
  const dir = parentOf(notePath);
  return encodeRef(dir ? path.slice(dir.length + 1) : path);
};

/**
 * A note in a vault: images go into `attachments/` beside it, and a reference resolves against the
 * note's folder, then the vault root, then any file in the vault with that name. `where` is read
 * on each use, as a note can move.
 */
export function vaultFiles(where: () => { root: Dir; notePath: VaultPath } | null): NoteFiles {
  return withResolve(
    async (blob) => {
      const w = where();
      if (!w) throw new Error('Estudio cannot open the vault that holds this note.');
      const path = await writeAttachment(w.root, w.notePath, blob, pastedImageName(new Date(), extOf(blob.type)));
      return refFrom(w.notePath, path);
    },
    async (src) => {
      const w = where();
      if (!w) return null;
      if (attachmentId(src)) return dbFiles().blob(src);
      for (const p of candidatePaths(src, parentOf(w.notePath))) {
        const b = await fileBlob(w.root, p);
        if (b) return b;
      }
      const name = nameOf(decode(src));
      const hit = (await walk(w.root)).find((e) => e.kind === 'file' && nameOf(e.path) === name);
      return hit ? fileBlob(w.root, hit.path) : null;
    },
  );
}

const urls = new WeakMap<NoteFiles, Map<string, Promise<string | null>>>();

/** An object URL for showing `src`, cached per note. */
export function imageUrl(files: NoteFiles, src: string): Promise<string | null> {
  if (isRemote(src)) return Promise.resolve(src);
  let m = urls.get(files);
  if (!m) urls.set(files, (m = new Map()));
  let p = m.get(src);
  if (!p) {
    p = files.blob(src).then((b) => (b ? URL.createObjectURL(b) : null), () => null);
    m.set(src, p);
    void p.then((u) => {
      if (!u) m.delete(src);
    });
  }
  return p;
}
