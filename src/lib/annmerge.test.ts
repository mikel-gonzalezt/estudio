import { describe, expect, it } from 'vitest';
import { baseOf, mergeAnnotations } from './annmerge';
import type { AnnId } from './types';

const a = (id: string, updatedAt: number, v = '') => ({ id: id as AnnId, updatedAt, v });
const ids = (xs: { id: AnnId }[]) => xs.map((x) => x.id).sort();

describe('mergeAnnotations', () => {
  it('is a no-op when both sides equal the base', () => {
    const xs = [a('x', 1), a('y', 2)];
    const m = mergeAnnotations(baseOf(xs), xs, xs);
    expect(ids(m.result)).toEqual(['x', 'y']);
    expect(m.toLocal).toEqual({ put: [], del: [] });
    expect(m.toRemote).toBe(false);
  });

  it('writes local additions, edits and deletions to the file', () => {
    const base = baseOf([a('x', 1), a('y', 1)]);
    const m = mergeAnnotations(base, [a('x', 5, 'edited'), a('new', 3)], [a('x', 1), a('y', 1)]);
    expect(ids(m.result)).toEqual(['new', 'x']);
    expect(m.result.find((r) => r.id === 'x')!.v).toBe('edited');
    expect(m.toRemote).toBe(true);
    expect(m.toLocal).toEqual({ put: [], del: [] });
  });

  it('pulls changes made to the file by another app', () => {
    const base = baseOf([a('x', 1), a('y', 1)]);
    const m = mergeAnnotations(base, [a('x', 1), a('y', 1)], [a('x', 9, 'acrobat'), a('z', 4)]);
    expect(ids(m.result)).toEqual(['x', 'z']);
    expect(ids(m.toLocal.put)).toEqual(['x', 'z']);
    expect(m.toLocal.del).toEqual(['y']);
    expect(m.toRemote).toBe(false);
  });

  it('merges both sides and lets an edit beat a deletion', () => {
    const base = baseOf([a('x', 1), a('y', 1), a('z', 1)]);
    const local = [a('x', 1), a('y', 6, 'local edit'), a('l', 2)];
    const remote = [a('y', 1), a('z', 7, 'remote edit'), a('r', 3)];
    const m = mergeAnnotations(base, local, remote);
    expect(ids(m.result)).toEqual(['l', 'r', 'y', 'z']);
    expect(ids(m.toLocal.put)).toEqual(['r', 'z']);
    expect(m.toLocal.del).toEqual(['x']);
    expect(m.toRemote).toBe(true);
  });

  it('keeps everything from both sides when there is no shared history', () => {
    const m = mergeAnnotations({}, [a('x', 1)], [a('y', 1)]);
    expect(ids(m.result)).toEqual(['x', 'y']);
    expect(m.toRemote).toBe(true);
  });
});
