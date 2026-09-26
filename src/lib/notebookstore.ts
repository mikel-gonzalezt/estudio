import { dbFiles, vaultFiles, type NoteFiles } from './attachments';
import { getNotebook, listVaults, putNotebook } from './db';
import { hasPermission } from './fsaccess';
import { notebookFrontmatter, notebookIdIn, splitFrontmatter } from './frontmatter';
import type { NotebookTracker } from './notebookindex';
import type { DocId, NotebookLoc, Vault, VaultId } from './types';
import { fileAt, fileOrNull, freePath, writeFile } from './vault';
import type { VaultPath } from './vaulttree';

/**
 * Where a document's notebook lives: Estudio's database, or a `.md` file in a vault whose
 * frontmatter names the document (see `frontmatter.ts`). `pdfName` is the PDF's file name, which
 * page links and the `pdf:` property name. It is all a second window needs to find the notebook.
 */
export type NotebookHome =
  | { kind: 'db'; docId: DocId }
  | { kind: 'vault'; docId: DocId; vault: VaultId; path: VaultPath; pdfName: string };

export type VaultHome = Extract<NotebookHome, { kind: 'vault' }>;

/** The PDF file name that page links name, for notebooks that Obsidian can read too. */
export const linkedPdfName = (h: NotebookHome) => (h.kind === 'vault' ? h.pdfName : undefined);

/** Where a notebook's Markdown lives. `always` writes even an empty notebook, creating its file. */
export interface NotebookStore {
  load(): Promise<string>;
  save(markdown: string, always?: boolean): Promise<void>;
}

export function idbNotebook(docId: DocId): NotebookStore {
  return {
    load: async () => (await getNotebook(docId))?.markdown ?? '',
    save: (markdown) => putNotebook({ docId, markdown, updatedAt: Date.now() }),
  };
}

/** A standalone Markdown note, read and written whole. */
export function fileNotebook(dir: FileSystemDirectoryHandle, name: string): NotebookStore {
  const existing = () => dir.getFileHandle(name).catch(() => null);
  return {
    async load() {
      const h = await existing();
      return h ? (await h.getFile()).text() : '';
    },
    async save(markdown) {
      const h = (await existing()) ?? (markdown ? await dir.getFileHandle(name, { create: true }) : null);
      if (h) await writeFile(h, markdown);
    },
  };
}

/**
 * A document's notebook file. The editor sees the body; every save re-reads the file's
 * frontmatter, keeps the keys the user added, and writes Estudio's two keys first. The file is
 * created on the first edit; until then an older notebook kept in IndexedDB for the document is
 * shown, so notes written before the vault existed carry over. A file at the planned path that
 * names another document is never overwritten: the notebook takes a free name beside it.
 *
 * With a `tracker` (the reader window's index), a save goes wherever Estudio moved the file
 * meanwhile, looks for it again if it vanished, and reports where it wrote.
 */
export function vaultNotebook(
  home: VaultHome,
  root: (vault: VaultId) => FileSystemDirectoryHandle | undefined,
  tracker?: NotebookTracker,
): NotebookStore {
  const { docId, pdfName } = home;
  let loc: NotebookLoc = { vault: home.vault, path: home.path };
  let seen = false;
  const fileOf = async (l: NotebookLoc) => {
    const r = root(l.vault);
    return r ? fileOrNull(r, l.path) : null;
  };
  return {
    async load() {
      const h = await fileOf(loc);
      if (!h) return (await getNotebook(docId))?.markdown ?? '';
      seen = true;
      return splitFrontmatter(await (await h.getFile()).text()).body;
    },
    async save(body, always = false) {
      loc = tracker?.where(docId) ?? loc;
      let h = await fileOf(loc);
      if (!h && seen && tracker) {
        const found = await tracker.find(docId);
        if (found) {
          loc = found;
          h = await fileOf(loc);
        }
      }
      const r = root(loc.vault);
      if (!r) throw new Error('Estudio cannot open the vault that holds this notebook.');
      let front: string | null = null;
      if (h) {
        const text = await (await h.getFile()).text();
        const id = notebookIdIn(text);
        if (id && id !== docId) {
          h = null;
          loc = { ...loc, path: await freePath(r, loc.path) };
        } else front = splitFrontmatter(text).front;
      }
      if (!h && !body && !always) return;
      h ??= await fileAt(r, loc.path, true);
      await writeFile(h, notebookFrontmatter(front, docId, pdfName) + body);
      seen = true;
      tracker?.saved(docId, loc);
    },
  };
}

/** Where the images of the notebook at `home` go, following the file when Estudio moves it. */
export function notebookFiles(
  home: NotebookHome,
  root: (vault: VaultId) => FileSystemDirectoryHandle | undefined,
  tracker?: NotebookTracker,
  shallow: (vault: VaultId) => boolean = () => false,
): NoteFiles {
  if (home.kind === 'db') return dbFiles();
  return vaultFiles(() => {
    const loc = tracker?.where(home.docId) ?? { vault: home.vault, path: home.path };
    const r = root(loc.vault);
    return r ? { root: r, notePath: loc.path, shallow: shallow(loc.vault) } : null;
  });
}

export type Resolved =
  | { kind: 'ready'; store: NotebookStore; files: NoteFiles }
  /** The vault's access grant lapsed; asking again needs a click. */
  | { kind: 'locked'; vault: Vault }
  | { kind: 'missing'; reason: string };

/** Finds the store for `home` from scratch, as a window that did not open the document must. */
export async function resolveHome(home: NotebookHome): Promise<Resolved> {
  if (home.kind === 'db') return { kind: 'ready', store: idbNotebook(home.docId), files: dbFiles() };
  const vault = (await listVaults()).find((v) => v.id === home.vault);
  if (!vault) return { kind: 'missing', reason: 'The vault that holds this notebook is no longer in Estudio.' };
  if (!(await hasPermission(vault.handle, 'readwrite'))) return { kind: 'locked', vault };
  const root = (id: VaultId) => (id === vault.id ? vault.handle : undefined);
  return { kind: 'ready', store: vaultNotebook(home, root), files: notebookFiles(home, root, undefined, () => !!vault.pdfFolder) };
}
