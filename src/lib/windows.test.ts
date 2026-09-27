import { describe, expect, it } from 'vitest';
import type { Handoff } from './db';
import type { DocId } from './types';
import { HANDOFF_TTL_MS, claimHandoff, heldDocs, lockName, routeLaunch, whereHeld, type HandoffStore } from './windows';

function fakeStore(entries: Handoff[]): HandoffStore & { entries: Map<string, Handoff> } {
  const map = new Map(entries.map((h) => [h.token, h]));
  return {
    entries: map,
    async take(token) {
      const h = map.get(token);
      map.delete(token);
      return h;
    },
    async sweep(before) {
      for (const [t, h] of map) if (h.createdAt < before) map.delete(t);
    },
  };
}

const handoff = (token: string, createdAt: number): Handoff =>
  ({ token, createdAt, from: 'w', handle: { name: `${token}.pdf` } as unknown as FileSystemFileHandle });

describe('handoff tokens', () => {
  it('can be claimed once', async () => {
    const store = fakeStore([handoff('a', 1000)]);
    expect((await claimHandoff(store, 'a', 2000))?.token).toBe('a');
    expect(await claimHandoff(store, 'a', 2000)).toBeNull();
  });

  it('expire, and a claim sweeps every stale entry', async () => {
    const now = 10 * HANDOFF_TTL_MS;
    const store = fakeStore([handoff('old', now - HANDOFF_TTL_MS - 1), handoff('other-old', 0), handoff('fresh', now - 5)]);
    expect(await claimHandoff(store, 'old', now)).toBeNull();
    expect([...store.entries.keys()]).toEqual(['fresh']);
  });

  it('an unknown token claims nothing', async () => {
    expect(await claimHandoff(fakeStore([]), 'nope', 0)).toBeNull();
  });
});

describe('document locks', () => {
  const X = 'x' as DocId;
  const Y = 'y' as DocId;

  it('reads held document locks and ignores other names', () => {
    const snap = { held: [{ name: lockName(X), mode: 'exclusive' as const }, { name: 'something-else', mode: 'exclusive' as const }], pending: [] };
    expect([...heldDocs(snap)]).toEqual([X]);
    expect(heldDocs({}).size).toBe(0);
  });

  it('tells this window, another window and nobody apart', () => {
    expect(whereHeld(X, new Set([X]), new Set([X]))).toEqual({ kind: 'here' });
    expect(whereHeld(X, new Set([X, Y]), new Set([Y]))).toEqual({ kind: 'elsewhere', doc: X });
    expect(whereHeld(X, new Set([Y]), new Set())).toEqual({ kind: 'free' });
  });
});

describe('routing files the OS launched', () => {
  it('opens the first here when the library shows, and the rest in new windows', () => {
    expect(routeLaunch(['a', 'b', 'c'], true)).toEqual({ here: 'a', windows: ['b', 'c'] });
  });

  it('never replaces an open document', () => {
    expect(routeLaunch(['a', 'b'], false)).toEqual({ here: null, windows: ['a', 'b'] });
  });

  it('does nothing without files', () => {
    expect(routeLaunch([], true)).toEqual({ here: null, windows: [] });
  });
});
