import { describe, expect, it } from 'vitest';
import { apply, EditLog, invert, writes, type AnnMap, type Edit } from './editlog';
import type { AnnId, DocId, StoredAnnotation } from './types';

const mk = (id: string, note = ''): StoredAnnotation => ({
  id: id as AnnId, docId: 'd' as DocId, tags: [], createdAt: 0, updatedAt: 0,
  kind: 'note', page: 1, at: { x: 0.5, y: 0.5 }, note, color: 'yellow',
});

describe('edits', () => {
  const a = mk('a');
  const b = mk('b');
  const a2 = mk('a', 'edited');
  const edits: Edit[] = [
    { op: 'add', ann: a },
    { op: 'delete', ann: a },
    { op: 'update', before: a, after: a2 },
    { op: 'batch', edits: [{ op: 'add', ann: b }, { op: 'update', before: a, after: a2 }] },
  ];

  it.each(edits)('invert is an involution for $op', (e) => {
    expect(invert(invert(e))).toEqual(e);
  });

  it.each(edits)('applying $op then its inverse restores the state', (e) => {
    const s0: AnnMap = e.op === 'add' ? new Map() : new Map([[a.id, a]]);
    expect(apply(apply(s0, e), invert(e))).toEqual(s0);
  });

  it('inverts batches in reverse order', () => {
    const e: Edit = { op: 'batch', edits: [{ op: 'add', ann: a }, { op: 'update', before: a, after: a2 }] };
    expect(apply(new Map(), e).get(a.id)).toEqual(a2);
    expect(apply(apply(new Map(), e), invert(e)).size).toBe(0);
  });

  it('collapses a batch to net writes', () => {
    const e: Edit = { op: 'batch', edits: [{ op: 'add', ann: a }, { op: 'update', before: a, after: a2 }, { op: 'delete', ann: b }] };
    expect(writes(e)).toEqual({ put: [a2], del: [b.id] });
  });
});

describe('EditLog', () => {
  function harness() {
    let state: AnnMap = new Map();
    const sunk: Edit[] = [];
    const log = new EditLog((e) => {
      sunk.push(e);
      state = apply(state, e);
    });
    return { log, sunk, get: () => state };
  }

  it('undo and redo replay through the sink', () => {
    const h = harness();
    h.log.do({ op: 'add', ann: mk('a') });
    h.log.do({ op: 'add', ann: mk('b') });
    expect(h.get().size).toBe(2);
    h.log.undo();
    expect([...h.get().keys()]).toEqual(['a']);
    h.log.redo();
    expect(h.get().size).toBe(2);
    expect(h.sunk).toHaveLength(4);
  });

  it('a new edit clears the redo stack', () => {
    const h = harness();
    h.log.do({ op: 'add', ann: mk('a') });
    h.log.undo();
    expect(h.log.canRedo).toBe(true);
    h.log.do({ op: 'add', ann: mk('c') });
    expect(h.log.canRedo).toBe(false);
    expect(h.log.redo()).toBe(false);
  });

  it('undo on an empty log is a no-op', () => {
    const h = harness();
    expect(h.log.undo()).toBe(false);
    expect(h.sunk).toHaveLength(0);
  });

  it('ignores empty batches', () => {
    const h = harness();
    h.log.do({ op: 'batch', edits: [] });
    expect(h.log.canUndo).toBe(false);
  });
});
