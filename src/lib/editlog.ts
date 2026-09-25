import type { AnnId, StoredAnnotation } from './types';

export type Edit =
  | { op: 'add'; ann: StoredAnnotation }
  | { op: 'delete'; ann: StoredAnnotation }
  | { op: 'update'; before: StoredAnnotation; after: StoredAnnotation }
  | { op: 'batch'; edits: Edit[] };

export type AnnMap = ReadonlyMap<AnnId, StoredAnnotation>;

export function invert(e: Edit): Edit {
  switch (e.op) {
    case 'add': return { op: 'delete', ann: e.ann };
    case 'delete': return { op: 'add', ann: e.ann };
    case 'update': return { op: 'update', before: e.after, after: e.before };
    case 'batch': return { op: 'batch', edits: e.edits.map(invert).reverse() };
  }
}

export function apply(state: AnnMap, e: Edit): AnnMap {
  const next = new Map(state);
  const step = (x: Edit) => {
    switch (x.op) {
      case 'add': next.set(x.ann.id, x.ann); break;
      case 'delete': next.delete(x.ann.id); break;
      case 'update': next.set(x.after.id, x.after); break;
      case 'batch': x.edits.forEach(step); break;
    }
  };
  step(e);
  return next;
}

/** Net storage writes for an edit: the last write to each id wins. */
export function writes(e: Edit): { put: StoredAnnotation[]; del: AnnId[] } {
  const last = new Map<AnnId, StoredAnnotation | null>();
  const step = (x: Edit) => {
    switch (x.op) {
      case 'add': last.set(x.ann.id, x.ann); break;
      case 'delete': last.set(x.ann.id, null); break;
      case 'update': last.set(x.after.id, x.after); break;
      case 'batch': x.edits.forEach(step); break;
    }
  };
  step(e);
  const put: StoredAnnotation[] = [];
  const del: AnnId[] = [];
  for (const [id, a] of last) {
    if (a) put.push(a);
    else del.push(id);
  }
  return { put, del };
}

/**
 * Undo/redo history of annotation edits. Every change, including undo and redo, flows
 * through `sink`, which is the single place that updates in-memory state and storage.
 */
export class EditLog {
  #past: Edit[] = [];
  #future: Edit[] = [];
  readonly #sink: (e: Edit) => void;
  readonly #limit: number;
  onChange: () => void = () => {};

  constructor(sink: (e: Edit) => void, limit = 500) {
    this.#sink = sink;
    this.#limit = limit;
  }

  do(e: Edit) {
    if (e.op === 'batch' && e.edits.length === 0) return;
    this.#sink(e);
    this.#past.push(e);
    if (this.#past.length > this.#limit) this.#past.shift();
    this.#future = [];
    this.onChange();
  }

  undo(): boolean {
    const e = this.#past.pop();
    if (!e) return false;
    this.#sink(invert(e));
    this.#future.push(e);
    this.onChange();
    return true;
  }

  redo(): boolean {
    const e = this.#future.pop();
    if (!e) return false;
    this.#sink(e);
    this.#past.push(e);
    this.onChange();
    return true;
  }

  get canUndo() {
    return this.#past.length > 0;
  }

  get canRedo() {
    return this.#future.length > 0;
  }
}
