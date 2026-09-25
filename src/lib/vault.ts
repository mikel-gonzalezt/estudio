import { isIgnored, joinPath, nameOf, parentOf, type Entry, type VaultPath } from './vaulttree';

type Dir = FileSystemDirectoryHandle;
type Iterable = Dir & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> };
type Movable = FileSystemHandle & { move?: (dir: Dir, name: string) => Promise<void> };

/** Lists every folder and file under `root`, skipping ignored folders without descending into them. */
export async function walk(root: Dir, prefix: VaultPath = ''): Promise<Entry[]> {
  const out: Entry[] = [];
  const subdirs: Promise<Entry[]>[] = [];
  for await (const [name, h] of (root as Iterable).entries()) {
    if (isIgnored(name)) continue;
    const path = joinPath(prefix, name);
    out.push({ path, kind: h.kind });
    if (h.kind === 'directory') subdirs.push(walk(h as Dir, path));
  }
  return out.concat(...(await Promise.all(subdirs)));
}

export async function dirAt(root: Dir, path: VaultPath, create = false): Promise<Dir> {
  let d = root;
  for (const part of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(part, { create });
  return d;
}

export async function fileAt(root: Dir, path: VaultPath, create = false): Promise<FileSystemFileHandle> {
  return (await dirAt(root, parentOf(path))).getFileHandle(nameOf(path), { create });
}

export async function writeFile(file: FileSystemFileHandle, data: Blob | BufferSource | string): Promise<void> {
  const w = await file.createWritable();
  await w.write(data);
  await w.close();
}

/** The path of `handle` inside `root`, or null when it lies elsewhere. */
export async function pathIn(root: Dir, handle: FileSystemHandle): Promise<VaultPath | null> {
  const parts = await root.resolve(handle).catch(() => null);
  return parts ? parts.join('/') : null;
}

async function copyInto(h: FileSystemHandle, dest: Dir, name: string): Promise<void> {
  if (h.kind === 'file') {
    await writeFile(await dest.getFileHandle(name, { create: true }), await (h as FileSystemFileHandle).getFile());
    return;
  }
  const target = await dest.getDirectoryHandle(name, { create: true });
  for await (const [child, ch] of (h as Iterable).entries()) await copyInto(ch, target, child);
}

/**
 * Moves or renames an entry. Uses the native `move()` when the browser supports it for this
 * entry, otherwise copies and then deletes the original.
 */
export async function moveEntry(root: Dir, from: VaultPath, toDir: VaultPath, toName: string): Promise<void> {
  const parent = await dirAt(root, parentOf(from));
  const name = nameOf(from);
  const h: Movable = await parent.getFileHandle(name).catch(() => parent.getDirectoryHandle(name));
  const dest = await dirAt(root, toDir);
  if (h.move) {
    try {
      await h.move(dest, toName);
      return;
    } catch (e) {
      if ((e as DOMException).name === 'NoModificationAllowedError') throw e;
    }
  }
  await copyInto(h, dest, toName);
  await parent.removeEntry(name, { recursive: true });
}

export async function removeEntry(root: Dir, path: VaultPath): Promise<void> {
  await (await dirAt(root, parentOf(path))).removeEntry(nameOf(path), { recursive: true });
}
