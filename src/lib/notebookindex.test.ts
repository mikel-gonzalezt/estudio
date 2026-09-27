import { describe, expect, it, vi } from 'vitest';
import { NotebookIndex, notebooksIn, remapPath } from './notebookindex';
import type { DocId, VaultId } from './types';
import { freePath, placeIn } from './vault';

type Tree = { [name: string]: string | Tree };

/** Just enough of the File System Access API for the index: folders, files, reading. `listed` records every folder read. */
function fakeDir(tree: Tree, listed: string[] = [], at = ''): FileSystemDirectoryHandle {
  const notFound = () => Promise.reject(Object.assign(new Error('not found'), { name: 'NotFoundError' }));
  const sub = (name: string) => fakeDir(tree[name] as Tree, listed, at ? `${at}/${name}` : name);
  const dir = {
    kind: 'directory',
    async *entries() {
      listed.push(at);
      for (const [name, v] of Object.entries(tree)) yield [name, typeof v === 'string' ? file(tree, name) : sub(name)];
    },
    getDirectoryHandle: (name: string) => (typeof tree[name] === 'object' ? Promise.resolve(sub(name)) : notFound()),
    getFileHandle: (name: string) => (typeof tree[name] === 'string' ? Promise.resolve(file(tree, name)) : notFound()),
    resolve: async (h: unknown) => pathTo(tree, h),
  };
  return dir as unknown as FileSystemDirectoryHandle;
}

const files = new WeakMap<Tree, Map<string, object>>();

/** One handle per file, so `isSameEntry` can compare identities. */
function file(tree: Tree, name: string): object {
  const known = files.get(tree) ?? new Map<string, object>();
  files.set(tree, known);
  const h: object = known.get(name) ?? {
    kind: 'file', name,
    getFile: async () => new File([tree[name] as string], name),
    isSameEntry: async (other: unknown) => other === h,
  };
  known.set(name, h);
  return h;
}

function pathTo(tree: Tree, h: unknown): string[] | null {
  for (const [name, v] of Object.entries(tree)) {
    if (typeof v === 'string' && files.get(tree)?.get(name) === h) return [name];
    const below = typeof v === 'object' ? pathTo(v, h) : null;
    if (below) return [name, ...below];
  }
  return null;
}

const A = 'vault-a' as VaultId;
const B = 'vault-b' as VaultId;
const doc = (s: string) => s as DocId;
const note = (id: string, body = '# Notes\n') => `---\nestudio-doc: ${id}\npdf: "[[x.pdf]]"\n---\n${body}`;

describe('remapPath', () => {
  it('follows a moved file or folder', () => {
    expect(remapPath('a/b.md', 'a/b.md', 'c/b.md')).toBe('c/b.md');
    expect(remapPath('a/b/c.md', 'a/b', 'z')).toBe('z/c.md');
    expect(remapPath('a/bc.md', 'a/b', 'z')).toBeNull();
  });
});

describe('notebooksIn', () => {
  it('maps ids to paths, preferring the shortest path for a duplicate', () => {
    const found = notebooksIn([
      { path: 'deep/x/n.md', head: note('d1') },
      { path: 'n.md', head: note('d1') },
      { path: 'plain.md', head: '# no frontmatter' },
    ]);
    expect([...found]).toEqual([['d1', 'n.md']]);
  });
});

describe('NotebookIndex', () => {
  it('finds a notebook in any scanned vault and follows Estudio moves and deletes', async () => {
    const index = new NotebookIndex();
    await index.scan({ id: A, handle: fakeDir({ 'p.pdf': '', 'notes': { 'p.md': note('d1') } }) });
    await index.scan({ id: B, handle: fakeDir({ 'Estudio': { 'q.md': note('d2') } }) });
    expect(index.get(doc('d1'))).toEqual({ vault: A, path: 'notes/p.md' });
    expect(index.get(doc('d2'))).toEqual({ vault: B, path: 'Estudio/q.md' });
    index.moved(A, 'notes', 'archive/notes');
    expect(index.get(doc('d1'))).toEqual({ vault: A, path: 'archive/notes/p.md' });
    index.removed(A, 'archive');
    expect(index.get(doc('d1'))).toBeUndefined();
  });

  it('keeps what an earlier session knew about a vault it cannot read yet', async () => {
    const index = new NotebookIndex();
    index.restore({ [doc('d1')]: { vault: B, path: 'n.md' }, [doc('d2')]: { vault: A, path: 'old.md' } });
    await index.scan({ id: A, handle: fakeDir({}) });
    expect(index.get(doc('d1'))).toEqual({ vault: B, path: 'n.md' });
    expect(index.get(doc('d2'))).toBeUndefined();
    expect(index.entries()).toEqual({ d1: { vault: B, path: 'n.md' } });
  });

  it('persists only its own changes, so entries another window wrote survive', async () => {
    vi.useFakeTimers();
    try {
      const persist = vi.fn(async () => {});
      const index = new NotebookIndex(persist);
      index.restore({ [doc('d1')]: { vault: B, path: 'n.md' }, [doc('d2')]: { vault: B, path: 'm.md' } });
      index.saved(doc('d3'), { vault: B, path: 'o.md' });
      index.saved(doc('d2'), { vault: B, path: 'moved.md' });
      await vi.advanceTimersByTimeAsync(400);
      expect(persist).toHaveBeenCalledTimes(1);
      expect(persist).toHaveBeenCalledWith({ put: { d3: { vault: B, path: 'o.md' }, d2: { vault: B, path: 'moved.md' } }, del: [] });
    } finally {
      vi.useRealTimers();
    }
  });

  describe('locate', () => {
    const tree = (): Tree => ({
      'papers': { 'p.pdf': '', 'p.md': '# old notes, no frontmatter\n', 'q.pdf': '', 'q.md': note('other') },
      'notes': { 'r.md': note('d3') },
    });

    it('prefers the file whose frontmatter names the document', async () => {
      const index = new NotebookIndex();
      await index.scan({ id: A, handle: fakeDir(tree()) });
      expect(await index.locate(doc('d3'), 'r.pdf', { vault: A, path: 'papers/r.pdf' }, null))
        .toEqual({ kind: 'vault', docId: 'd3', vault: A, path: 'notes/r.md', pdfName: 'r.pdf' });
    });

    it('rescans when the indexed file moved behind its back', async () => {
      const t = tree();
      const index = new NotebookIndex();
      await index.scan({ id: A, handle: fakeDir(t) });
      (t.papers as Tree)['moved.md'] = note('d3');
      delete (t.notes as Tree)['r.md'];
      expect(await index.locate(doc('d3'), 'r.pdf', undefined, null)).toMatchObject({ vault: A, path: 'papers/moved.md' });
    });

    it('adopts a same-named note beside the PDF unless it names another document', async () => {
      const index = new NotebookIndex();
      await index.scan({ id: A, handle: fakeDir(tree()) });
      expect(await index.locate(doc('d1'), 'p.pdf', { vault: A, path: 'papers/p.pdf' }, null)).toMatchObject({ vault: A, path: 'papers/p.md' });
      expect(await index.locate(doc('d2'), 'q.pdf', { vault: A, path: 'papers/q.pdf' }, null)).toMatchObject({ vault: A, path: 'papers/q (2).md' });
    });

    it('puts a new notebook in the chosen folder, or the database when there is no vault', async () => {
      const index = new NotebookIndex();
      await index.scan({ id: A, handle: fakeDir(tree()) });
      await index.scan({ id: B, handle: fakeDir({}) });
      expect(await index.locate(doc('d9'), 'new.pdf', { vault: A, path: 'papers/new.pdf' }, { vault: B, dir: 'Estudio notes' }))
        .toMatchObject({ vault: B, path: 'Estudio notes/new.md' });
      expect(await index.locate(doc('d9'), 'new.pdf', { vault: A, path: 'papers/new.pdf' }, null)).toMatchObject({ vault: A, path: 'papers/new.md' });
      expect(await index.locate(doc('d9'), 'new.pdf', undefined, null)).toEqual({ kind: 'db', docId: 'd9' });
      expect(await index.locate(doc('d9'), 'new.pdf', undefined, { vault: 'gone' as VaultId, dir: '' })).toEqual({ kind: 'db', docId: 'd9' });
    });

    it("in a PDF folder, reads only the PDF's own folder and puts a new notebook beside the PDF", async () => {
      const listed: string[] = [];
      const t: Tree = {
        'a.pdf': '', 'renamed.md': note('d1'), 'b.pdf': '', 'b.md': note('other'),
        'huge': { 'deep': { 'c.md': note('d3') } }, 'papers': { 'c.pdf': '' },
      };
      const index = new NotebookIndex();
      index.attach({ id: A, handle: fakeDir(t, listed) });
      expect(await index.locate(doc('d1'), 'a.pdf', { vault: A, path: 'a.pdf' }, null)).toMatchObject({ vault: A, path: 'renamed.md' });
      expect(await index.locate(doc('d2'), 'b.pdf', { vault: A, path: 'b.pdf' }, null)).toMatchObject({ vault: A, path: 'b (2).md' });
      expect(await index.locate(doc('d3'), 'c.pdf', { vault: A, path: 'papers/c.pdf' }, null)).toMatchObject({ vault: A, path: 'papers/c.md' });
      expect(await index.find(doc('d3'))).toBeUndefined();
      expect(listed.filter((p) => p.startsWith('huge'))).toEqual([]);
    });

    it('in a PDF folder, keeps notes known from earlier sessions and drops one that no longer names the document', async () => {
      const t: Tree = { 'sub': { 'x.pdf': '', 'x.md': note('d1') }, 'y.md': note('d2') };
      const index = new NotebookIndex();
      index.restore({ [doc('d1')]: { vault: A, path: 'sub/x.md' }, [doc('d2')]: { vault: A, path: 'y.md' } });
      index.attach({ id: A, handle: fakeDir(t) });
      expect(index.get(doc('d1'))).toEqual({ vault: A, path: 'sub/x.md' });
      t['y.md'] = note('d9');
      expect(await index.find(doc('d2'))).toBeUndefined();
    });

    it('returns a notebook in a vault it cannot read, so the reader can ask for access', async () => {
      const index = new NotebookIndex();
      index.restore({ [doc('d1')]: { vault: B, path: 'n.md' } });
      expect(await index.locate(doc('d1'), 'p.pdf', undefined, null)).toMatchObject({ vault: B, path: 'n.md' });
    });
  });
});

describe('placeIn', () => {
  const root = fakeDir({ 'a.pdf': '', 'sub': { 'b.pdf': '' } });

  it("finds a PDF among the folder's entries or below it, and nothing elsewhere", async () => {
    const sub = await root.getDirectoryHandle('sub');
    expect(await placeIn(root, await root.getFileHandle('a.pdf'))).toBe('a.pdf');
    expect(await placeIn(root, await sub.getFileHandle('b.pdf'))).toBe('sub/b.pdf');
    expect(await placeIn(sub, await root.getFileHandle('a.pdf'))).toBeNull();
  });
});

describe('freePath', () => {
  it('never takes the name of an existing note', async () => {
    const root = fakeDir({ 'p.md': note('other'), 'p (2).md': '', 'q.pdf': '' });
    expect(await freePath(root, 'p.md')).toBe('p (3).md');
    expect(await freePath(root, 'q.md')).toBe('q.md');
  });
});

describe('vaultFiles image lookup', () => {
  const tree = (): Tree => ({ 'paper.md': note('d1'), deep: { nested: { 'fig.png': 'png' } } });

  it('finds an image anywhere in a vault by name', async () => {
    const { vaultFiles } = await import('./attachments');
    const files = vaultFiles(() => ({ root: fakeDir(tree()), notePath: 'paper.md' }));
    expect(await files.blob('fig.png')).not.toBeNull();
  });

  it('never walks a granted PDF folder for a missing image', async () => {
    const { vaultFiles } = await import('./attachments');
    const listed: string[] = [];
    const files = vaultFiles(() => ({ root: fakeDir(tree(), listed), notePath: 'paper.md', shallow: true }));
    expect(await files.blob('fig.png')).toBeNull();
    expect(listed).not.toContain('deep/nested');
  });
});
