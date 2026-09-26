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

/** The file at `path`; with `create`, missing folders on the way are created too. */
export async function fileAt(root: Dir, path: VaultPath, create = false): Promise<FileSystemFileHandle> {
  return (await dirAt(root, parentOf(path), create)).getFileHandle(nameOf(path), { create });
}

export const fileOrNull = (root: Dir, path: VaultPath) => fileAt(root, path).catch(() => null);

/** `path`, or `name (2).md`, `name (3).md`… in the same folder: the first that does not exist yet. */
export async function freePath(root: Dir, path: VaultPath): Promise<VaultPath> {
  const dir = parentOf(path);
  const name = nameOf(path);
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let i = 1; ; i++) {
    const candidate = joinPath(dir, i === 1 ? name : `${stem} (${i})${ext}`);
    if (!(await fileOrNull(root, candidate))) return candidate;
  }
}

/** Only this much of each note is read to find its frontmatter, so scanning a large vault stays cheap. */
export const HEAD_BYTES = 2048;

export async function headOf(file: FileSystemFileHandle): Promise<string> {
  return (await file.getFile()).slice(0, HEAD_BYTES).text();
}

/** Every Markdown file under `root` (ignored folders skipped) with the first bytes of its text. */
export async function markdownHeads(root: Dir, prefix: VaultPath = ''): Promise<{ path: VaultPath; head: string }[]> {
  const out: { path: VaultPath; head: string }[] = [];
  const work: Promise<unknown>[] = [];
  for await (const [name, h] of (root as Iterable).entries()) {
    if (isIgnored(name)) continue;
    const path = joinPath(prefix, name);
    if (h.kind === 'directory') work.push(markdownHeads(h as Dir, path).then((r) => out.push(...r)));
    else if (/\.md$/i.test(name)) work.push(headOf(h as FileSystemFileHandle).then((head) => out.push({ path, head }), () => undefined));
  }
  await Promise.all(work);
  return out;
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
