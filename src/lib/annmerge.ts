import type { AnnId } from './types';

/** Each annotation's `updatedAt` as of the last time Estudio and the file agreed. */
export type SyncBase = Record<AnnId, number>;

interface Versioned { id: AnnId; updatedAt: number }

export interface MergeResult<T extends Versioned> {
  result: T[];
  /** Changes that bring the local copy up to `result`. */
  toLocal: { put: T[]; del: AnnId[] };
  /** True when the file does not yet hold `result`. */
  toRemote: boolean;
}

export function baseOf(anns: readonly Versioned[]): SyncBase {
  return Object.fromEntries(anns.map((a) => [a.id, a.updatedAt])) as SyncBase;
}

/**
 * Three-way merge of the local annotations and the ones in the file, against the state both
 * last agreed on. The newer edit wins; an edit beats a deletion made on the other side.
 */
export function mergeAnnotations<T extends Versioned>(base: SyncBase, local: readonly T[], remote: readonly T[]): MergeResult<T> {
  const l = new Map(local.map((a) => [a.id, a]));
  const r = new Map(remote.map((a) => [a.id, a]));
  const result: T[] = [];
  const put: T[] = [];
  const del: AnnId[] = [];
  let toRemote = false;
  for (const id of new Set([...l.keys(), ...r.keys()])) {
    const la = l.get(id);
    const ra = r.get(id);
    const synced = base[id];
    if (la && ra) {
      if (ra.updatedAt > la.updatedAt) {
        result.push(ra);
        put.push(ra);
      } else {
        result.push(la);
        if (la.updatedAt !== ra.updatedAt) toRemote = true;
      }
    } else if (la) {
      if (synced !== undefined && la.updatedAt <= synced) del.push(id);
      else {
        result.push(la);
        toRemote = true;
      }
    } else if (ra) {
      if (synced !== undefined && ra.updatedAt <= synced) toRemote = true;
      else {
        result.push(ra);
        put.push(ra);
      }
    }
  }
  return { result, toLocal: { put, del }, toRemote };
}
