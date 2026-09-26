import { describe, expect, it } from 'vitest';
import { NotebookIndex, notebooksIn, remapPath } from './notebookindex';
import type { DocId, VaultId } from './types';

type Tree = { [name: string]: string | Tree };

/** Just enough of the File System Access API for the index: folders, files, reading. */
function fakeDir(tree: Tree): FileSystemDirectoryHandle {
  const notFound = () => Promise.reject(Object.assign(new Error('not found'), { name: 'NotFoundError' }));
  const dir = {
    kind: 'directory',
    async *entries() {
      for (const [name, v] of Object.entries(tree)) yield [name, typeof v === 'string' ? file(name, () => tree[name] as string) : fakeDir(v)];
    },
    getDirectoryHandle: (name: string) => (typeof tree[name] === 'object' ? Promise.resolve(fakeDir(tree[name] as Tree)) : notFound()),
    getFileHandle: (name: string) => (typeof tree[name] === 'string' ? Promise.resolve(file(name, () => tree[name] as string)) : notFound()),
  };
  return dir as unknown as FileSystemDirectoryHandle;
}

function file(name: string, text: () => string) {
  return { kind: 'file', name, getFile: async () => new File([text()], name) };
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

    it('returns a notebook in a vault it cannot read, so the reader can ask for access', async () => {
      const index = new NotebookIndex();
      index.restore({ [doc('d1')]: { vault: B, path: 'n.md' } });
      expect(await index.locate(doc('d1'), 'p.pdf', undefined, null)).toMatchObject({ vault: B, path: 'n.md' });
    });
  });
});
