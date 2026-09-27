import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AnnId, Card, CardId, DocId, DocRecord, Notebook, NotebookLoc, Settings, StoredAnnotation, Vault, VaultId } from './types';
import { DEFAULT_SETTINGS } from './types';
import type { Backup } from './backup';
import { apply, type Patch } from './patch';

type PersistedDoc = Omit<DocRecord, 'handle'>;

interface Schema extends DBSchema {
  docs: { key: DocId; value: PersistedDoc };
  annotations: { key: AnnId; value: StoredAnnotation; indexes: { docId: DocId } };
  notebooks: { key: DocId; value: Notebook };
  cards: { key: CardId; value: Card; indexes: { docId: DocId; due: number } };
  settings: { key: string; value: unknown };
  handles: { key: DocId; value: FileSystemFileHandle };
  vaults: { key: VaultId; value: Vault };
  attachments: { key: string; value: Attachment };
  handoffs: { key: string; value: Handoff };
}

/** An image kept for a notebook that lives in IndexedDB; notes reference it as `estudio-attachment:<id>`. */
export interface Attachment { id: string; blob: Blob; name: string; createdAt: number }

/** A PDF one window asks a new window to open; file handles cannot travel in a URL, so the URL carries `token`. */
export interface Handoff { token: string; handle: FileSystemFileHandle; page?: number; from: string; createdAt: number }

// Svelte state proxies are not structured-cloneable, so everything is copied to plain data on write.
function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

let dbp: Promise<IDBPDatabase<Schema>> | undefined;

function db(): Promise<IDBPDatabase<Schema>> {
  dbp ??= openDB<Schema>('estudio', 4, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore('docs', { keyPath: 'id' });
        d.createObjectStore('annotations', { keyPath: 'id' }).createIndex('docId', 'docId');
        d.createObjectStore('notebooks', { keyPath: 'docId' });
        const cards = d.createObjectStore('cards', { keyPath: 'id' });
        cards.createIndex('docId', 'docId');
        cards.createIndex('due', 'srs.due');
        d.createObjectStore('settings');
        d.createObjectStore('handles');
      }
      if (oldVersion < 2) d.createObjectStore('vaults', { keyPath: 'id' });
      if (oldVersion < 3) d.createObjectStore('attachments', { keyPath: 'id' });
      if (oldVersion < 4) d.createObjectStore('handoffs', { keyPath: 'token' });
    },
  });
  return dbp;
}

function stripHandle(doc: DocRecord): PersistedDoc {
  const { handle: _handle, ...rest } = doc;
  return rest;
}

export async function getDoc(id: DocId): Promise<DocRecord | undefined> {
  const d = await db();
  const [doc, handle] = await Promise.all([d.get('docs', id), d.get('handles', id)]);
  return doc && { ...doc, ...(handle ? { handle } : {}) };
}

export async function listDocs(): Promise<DocRecord[]> {
  const d = await db();
  const tx = d.transaction(['docs', 'handles']);
  const docs = await tx.objectStore('docs').getAll();
  const handles = tx.objectStore('handles');
  const out = await Promise.all(docs.map(async (doc) => {
    const handle = await handles.get(doc.id);
    return handle ? { ...doc, handle } : doc;
  }));
  return out.sort((a, b) => b.openedAt - a.openedAt);
}

export async function putDoc(doc: DocRecord): Promise<void> {
  const d = await db();
  const tx = d.transaction(['docs', 'handles'], 'readwrite');
  await tx.objectStore('docs').put(plain(stripHandle(doc)));
  if (doc.handle) await tx.objectStore('handles').put(doc.handle, doc.id);
  await tx.done;
}

export async function deleteDoc(id: DocId): Promise<void> {
  const d = await db();
  const tx = d.transaction(['docs', 'handles', 'annotations', 'notebooks', 'cards'], 'readwrite');
  await tx.objectStore('docs').delete(id);
  await tx.objectStore('handles').delete(id);
  await tx.objectStore('notebooks').delete(id);
  for (const k of await tx.objectStore('annotations').index('docId').getAllKeys(id)) await tx.objectStore('annotations').delete(k);
  for (const k of await tx.objectStore('cards').index('docId').getAllKeys(id)) await tx.objectStore('cards').delete(k);
  await tx.done;
}

export async function annotationsFor(docId: DocId): Promise<StoredAnnotation[]> {
  return (await db()).getAllFromIndex('annotations', 'docId', docId);
}

/** Applies one edit-log step atomically so a crash never leaves half a batch on disk. */
export async function writeAnnotations(put: StoredAnnotation[], del: AnnId[]): Promise<void> {
  const d = await db();
  const tx = d.transaction('annotations', 'readwrite');
  for (const id of del) await tx.store.delete(id);
  for (const a of put) await tx.store.put(plain(a));
  await tx.done;
}

export async function getNotebook(docId: DocId): Promise<Notebook | undefined> {
  return (await db()).get('notebooks', docId);
}

export async function putNotebook(nb: Notebook): Promise<void> {
  await (await db()).put('notebooks', plain(nb));
}

export async function cardsFor(docId: DocId): Promise<Card[]> {
  return (await db()).getAllFromIndex('cards', 'docId', docId);
}

export async function dueCards(now: number, docId?: DocId): Promise<Card[]> {
  const due = await (await db()).getAllFromIndex('cards', 'due', IDBKeyRange.upperBound(now));
  return docId ? due.filter((c) => c.docId === docId) : due;
}

export async function countDue(now: number): Promise<number> {
  return (await db()).countFromIndex('cards', 'due', IDBKeyRange.upperBound(now));
}

export async function putCard(card: Card): Promise<void> {
  await (await db()).put('cards', plain(card));
}

export async function deleteCard(id: CardId): Promise<void> {
  await (await db()).delete('cards', id);
}

export async function listVaults(): Promise<Vault[]> {
  return (await (await db()).getAll('vaults')).sort((a, b) => b.openedAt - a.openedAt);
}

/** Handles are structured-cloneable, so the record is stored as is rather than through `plain`. */
export async function putVault(v: Vault): Promise<void> {
  await (await db()).put('vaults', { ...v });
}

export async function deleteVault(id: VaultId): Promise<void> {
  await (await db()).delete('vaults', id);
}

/** Where each document's notebook `.md` was last seen, so a notebook in a locked vault is still known. */
export async function getNotebookIndex(): Promise<Record<DocId, NotebookLoc>> {
  return ((await (await db()).get('settings', 'notebookIndex')) as Record<DocId, NotebookLoc> | undefined) ?? {};
}

/** Applies one window's changes to the index, keeping entries other windows wrote meanwhile. */
export async function patchNotebookIndex(p: Patch<Record<DocId, NotebookLoc>>): Promise<void> {
  const tx = (await db()).transaction('settings', 'readwrite');
  const stored = ((await tx.store.get('notebookIndex')) as Record<DocId, NotebookLoc> | undefined) ?? {};
  await tx.store.put(plain(apply(stored, p)), 'notebookIndex');
  await tx.done;
}

/** Blobs are structured-cloneable, so the record is stored as is. */
export async function putAttachment(a: Attachment): Promise<void> {
  await (await db()).put('attachments', a);
}

export async function getAttachment(id: string): Promise<Attachment | undefined> {
  return (await db()).get('attachments', id);
}

export async function getSettings(): Promise<Settings> {
  const stored = (await (await db()).get('settings', 'app')) as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored, meanings: { ...DEFAULT_SETTINGS.meanings, ...stored?.meanings } };
}

/** Writes only the settings a window changed, so another window's stale copy never undoes a change. */
export async function patchSettings(put: Partial<Settings>): Promise<void> {
  const tx = (await db()).transaction('settings', 'readwrite');
  const stored = ((await tx.store.get('app')) as Partial<Settings> | undefined) ?? {};
  await tx.store.put(plain(apply(stored, { put, del: [] })), 'app');
  await tx.done;
}

export async function putHandoff(h: Handoff): Promise<void> {
  await (await db()).put('handoffs', h);
}

/** Reads and deletes a handoff in one transaction, so exactly one window gets it. */
export async function takeHandoff(token: string): Promise<Handoff | undefined> {
  const tx = (await db()).transaction('handoffs', 'readwrite');
  const h = await tx.store.get(token);
  if (h) await tx.store.delete(token);
  await tx.done;
  return h;
}

export async function hasHandoff(token: string): Promise<boolean> {
  return (await (await db()).count('handoffs', token)) > 0;
}

export async function sweepHandoffs(before: number): Promise<void> {
  const tx = (await db()).transaction('handoffs', 'readwrite');
  for (const h of await tx.store.getAll()) if (h.createdAt < before) await tx.store.delete(h.token);
  await tx.done;
}


export async function exportAll(): Promise<Omit<Backup, 'format' | 'exportedAt'>> {
  const d = await db();
  const [docs, annotations, notebooks, cards] = await Promise.all([
    d.getAll('docs'), d.getAll('annotations'), d.getAll('notebooks'), d.getAll('cards'),
  ]);
  return { docs, annotations, notebooks, cards, settings: await getSettings() };
}

export async function importAll(b: Backup): Promise<void> {
  const d = await db();
  const tx = d.transaction(['docs', 'annotations', 'notebooks', 'cards', 'settings'], 'readwrite');
  for (const doc of b.docs) await tx.objectStore('docs').put(doc);
  for (const a of b.annotations) await tx.objectStore('annotations').put(a);
  for (const n of b.notebooks) await tx.objectStore('notebooks').put(n);
  for (const c of b.cards) await tx.objectStore('cards').put(c);
  if (b.settings) await tx.objectStore('settings').put(b.settings, 'app');
  await tx.done;
}

