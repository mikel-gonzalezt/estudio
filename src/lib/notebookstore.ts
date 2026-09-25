import { getNotebook, putNotebook } from './db';
import type { DocId } from './types';

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
