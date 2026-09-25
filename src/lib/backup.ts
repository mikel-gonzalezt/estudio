import type { Card, DocRecord, Notebook, Settings, StoredAnnotation } from './types';
import { COLOR_IDS } from './types';

export const BACKUP_FORMAT = 'estudio-backup/1';

export interface Backup {
  format: typeof BACKUP_FORMAT;
  exportedAt: number;
  docs: Omit<DocRecord, 'handle'>[];
  annotations: StoredAnnotation[];
  notebooks: Notebook[];
  cards: Card[];
  settings?: Settings;
}

export class BackupError extends Error {}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function list<T>(root: Obj, key: string, valid: (v: Obj) => boolean): T[] {
  const v = root[key];
  if (!Array.isArray(v)) throw new BackupError(`"${key}" must be an array`);
  v.forEach((item, i) => {
    if (!isObj(item) || !valid(item)) throw new BackupError(`${key}[${i}] is malformed`);
  });
  return v as T[];
}

const ANN_KINDS = new Set(['highlight', 'underline', 'strike', 'ink', 'note', 'area']);

export function parseBackup(text: string): Backup {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    throw new BackupError('Not a JSON file');
  }
  if (!isObj(root) || root.format !== BACKUP_FORMAT) throw new BackupError('Not an Estudio backup');
  const settings = root.settings;
  if (settings !== undefined && !(isObj(settings) && isObj(settings.meanings))) throw new BackupError('settings is malformed');
  return {
    format: BACKUP_FORMAT,
    exportedAt: isNum(root.exportedAt) ? root.exportedAt : 0,
    docs: list(root, 'docs', (d) => isStr(d.id) && isStr(d.title) && isNum(d.pageCount)),
    annotations: list(root, 'annotations', (a) =>
      isStr(a.id) && isStr(a.docId) && isNum(a.page) && ANN_KINDS.has(a.kind as string) &&
      (a.kind === 'ink' || COLOR_IDS.includes(a.color as never))),
    notebooks: list(root, 'notebooks', (n) => isStr(n.docId) && isStr(n.markdown)),
    cards: list(root, 'cards', (c) => isStr(c.id) && isStr(c.docId) && isStr(c.front) && isObj(c.srs) && isNum((c.srs as Obj).due)),
    ...(settings ? { settings: settings as unknown as Settings } : {}),
  };
}

export function makeBackup(data: Omit<Backup, 'format' | 'exportedAt'>, now: number): Backup {
  return { format: BACKUP_FORMAT, exportedAt: now, ...data };
}
