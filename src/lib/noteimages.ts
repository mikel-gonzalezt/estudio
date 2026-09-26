import type { ImageResolver, ResolvedImage } from './export/docx';
import { fileOrNull, walk } from './vault';
import { joinPath, nameOf, type VaultPath } from './vaulttree';

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' };

/** `a/./b/../c` as `a/c`; null when the path climbs above the vault root. */
export function normalizePath(path: string): VaultPath | null {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (!out.length) return null;
      out.pop();
    } else out.push(part);
  }
  return out.join('/');
}

/** Where to look for an image a note in `noteDir` references: beside the note, then from the vault root. */
export function imageCandidates(noteDir: VaultPath, src: string): VaultPath[] {
  let path = src;
  try {
    path = decodeURIComponent(src);
  } catch {}
  const found = [normalizePath(joinPath(noteDir, path)), normalizePath(path)].filter((p): p is VaultPath => !!p);
  return [...new Set(found)];
}

async function toImage(blob: Blob, name: string): Promise<ResolvedImage | null> {
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (!bitmap) return null;
  const { width, height } = bitmap;
  bitmap.close();
  const mime = blob.type || MIME[name.split('.').pop()?.toLowerCase() ?? ''] || '';
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime, width, height };
}

async function findByName(root: FileSystemDirectoryHandle, name: string): Promise<FileSystemFileHandle | null> {
  const hit = (await walk(root)).find((e) => e.kind === 'file' && nameOf(e.path) === name);
  return hit ? fileOrNull(root, hit.path) : null;
}

/**
 * Resolves the images of a note as `docs/NOTES-FORMAT.md` describes: relative to the note's
 * folder, then the vault root, then any file in the vault with that name. `root` is undefined for a
 * notebook kept in Estudio's database, whose `estudio-attachment:` images are not stored on this
 * branch yet.
 */
export function noteImageResolver(root: FileSystemDirectoryHandle | undefined, noteDir: VaultPath): ImageResolver {
  return async (src) => {
    if (/^(data|https?|blob):/i.test(src)) {
      const res = await fetch(src).catch(() => null);
      return res?.ok ? toImage(await res.blob(), new URL(src).pathname) : null;
    }
    if (!root || src.startsWith('estudio-attachment:')) return null;
    for (const path of imageCandidates(noteDir, src)) {
      const file = await fileOrNull(root, path);
      if (file) return toImage(await file.getFile(), path);
    }
    const byName = await findByName(root, nameOf(imageCandidates('', src)[0] ?? src));
    return byName ? toImage(await byName.getFile(), byName.name) : null;
  };
}
