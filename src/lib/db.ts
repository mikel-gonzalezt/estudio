import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AnnId, Card, CardId, DocId, DocRecord, Notebook, Settings, StoredAnnotation } from './types';
import { DEFAULT_SETTINGS } from './types';
import type { Backup } from './backup';

type PersistedDoc = Omit<DocRecord, 'handle'>;

interface Schema extends DBSchema {
  docs: { key: DocId; value: PersistedDoc };
  annotations: { key: AnnId; value: StoredAnnotation; indexes: { docId: DocId } };
  notebooks: { key: DocId; value: Notebook };
  cards: { key: CardId; value: Card; indexes: { docId: DocId; due: number } };
  settings: { key: string; value: unknown };
  handles: { key: DocId; value: FileSystemFileHandle };
}

// Svelte state proxies are not structured-cloneable, so everything is copied to plain data on write.
function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

let dbp: Promise<IDBPDatabase<Schema>> | undefined;

function db(): Promise<IDBPDatabase<Schema>> {
  dbp ??= openDB<Schema>('estudio', 1, {
    upgrade(d) {
      d.createObjectStore('docs', { keyPath: 'id' });
      d.createObjectStore('annotations', { keyPath: 'id' }).createIndex('docId', 'docId');
      d.createObjectStore('notebooks', { keyPath: 'docId' });
      const cards = d.createObjectStore('cards', { keyPath: 'id' });
      cards.createIndex('docId', 'docId');
      cards.createIndex('due', 'srs.due');
      d.createObjectStore('settings');
      d.createObjectStore('handles');
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

export async function getSettings(): Promise<Settings> {
  const stored = (await (await db()).get('settings', 'app')) as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored, meanings: { ...DEFAULT_SETTINGS.meanings, ...stored?.meanings } };
}

export async function putSettings(s: Settings): Promise<void> {
  await (await db()).put('settings', plain(s), 'app');
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

