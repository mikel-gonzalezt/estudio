import { getNotebook, listVaults, putNotebook } from './db';
import { hasPermission } from './fsaccess';
import type { DocId, Vault, VaultId } from './types';
import { dirAt } from './vault';
import { nameOf, parentOf, stemOf, type VaultPath } from './vaulttree';

/**
 * Where a document's notebook lives: Estudio's database, or `<name>.md` beside `<name>.pdf` in a
 * vault. It is all a second window needs to find the same notebook.
 */
export type NotebookHome =
  | { kind: 'db'; docId: DocId }
  | { kind: 'vault'; docId: DocId; vault: VaultId; pdfPath: VaultPath };

/** The PDF file name that page links name, for notebooks that Obsidian can read too. */
export const linkedPdfName = (h: NotebookHome) => (h.kind === 'vault' ? nameOf(h.pdfPath) : undefined);

/** Where a notebook's Markdown lives. */
export interface NotebookStore {
  load(): Promise<string>;
  save(markdown: string): Promise<void>;
}

export function idbNotebook(docId: DocId): NotebookStore {
  return {
    load: async () => (await getNotebook(docId))?.markdown ?? '',
    save: (markdown) => putNotebook({ docId, markdown, updatedAt: Date.now() }),
  };
}

/**
 * A Markdown file in a vault. The file is created on the first edit; until then an older
 * notebook kept in IndexedDB for `docId` is shown, so notes written before the vault existed carry over.
 */
export function fileNotebook(dir: FileSystemDirectoryHandle, name: string, docId?: DocId): NotebookStore {
  const existing = () => dir.getFileHandle(name).catch(() => null);
  return {
    async load() {
      const h = await existing();
      if (h) return (await h.getFile()).text();
      return docId ? (await getNotebook(docId))?.markdown ?? '' : '';
    },
    async save(markdown) {
      const h = (await existing()) ?? (markdown ? await dir.getFileHandle(name, { create: true }) : null);
      if (!h) return;
      const w = await h.createWritable();
      await w.write(markdown);
      await w.close();
    },
  };
}

export const sidecarNotebook = (dir: FileSystemDirectoryHandle, pdfName: string, docId: DocId) =>
  fileNotebook(dir, `${stemOf(pdfName)}.md`, docId);

export type Resolved =
  | { kind: 'ready'; store: NotebookStore }
  /** The vault's access grant lapsed; asking again needs a click. */
  | { kind: 'locked'; vault: Vault }
  | { kind: 'missing'; reason: string };

/** Finds the store for `home` from scratch, as a window that did not open the document must. */
export async function resolveHome(home: NotebookHome): Promise<Resolved> {
  if (home.kind === 'db') return { kind: 'ready', store: idbNotebook(home.docId) };
  const vault = (await listVaults()).find((v) => v.id === home.vault);
  if (!vault) return { kind: 'missing', reason: 'The vault that holds this notebook is no longer in Estudio.' };
  if (!(await hasPermission(vault.handle, 'readwrite'))) return { kind: 'locked', vault };
  try {
    const dir = await dirAt(vault.handle, parentOf(home.pdfPath));
    return { kind: 'ready', store: sidecarNotebook(dir, nameOf(home.pdfPath), home.docId) };
  } catch {
    return { kind: 'missing', reason: `The folder of ${home.pdfPath} is no longer in the vault "${vault.name}".` };
  }
}
