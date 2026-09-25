import { describe, expect, it } from 'vitest';
import type { DocId, VaultId } from './types';
import { DISK_REV, newer, nextRev, NO_REV, parsePopoutHash, popoutHash } from './notebooksync';

describe('notebook revisions', () => {
  it('orders edits by count', () => {
    expect(newer({ n: 3, by: 'a' }, { n: 2, by: 'z' })).toBe(true);
    expect(newer({ n: 2, by: 'z' }, { n: 3, by: 'a' })).toBe(false);
  });

  it('breaks ties the same way in both windows', () => {
    const a = { n: 4, by: 'aaa' };
    const b = { n: 4, by: 'bbb' };
    expect(newer(b, a)).toBe(true);
    expect(newer(a, b)).toBe(false);
    expect(newer(a, a)).toBe(false);
  });

  it('lets text read from disk replace nothing but an empty window', () => {
    expect(newer(DISK_REV, NO_REV)).toBe(true);
    expect(newer(DISK_REV, DISK_REV)).toBe(false);
    expect(newer(nextRev(DISK_REV, 'x'), DISK_REV)).toBe(true);
  });

  it('continues from the newest revision seen', () => {
    expect(nextRev({ n: 7, by: 'other' }, 'me')).toEqual({ n: 8, by: 'me' });
  });

  it('round-trips the pop-out route for database and vault notebooks', () => {
    const docId = 'abc/def 1?x=&' as DocId;
    for (const home of [
      { kind: 'db', docId },
      { kind: 'vault', docId, vault: 'v-1' as VaultId, pdfPath: 'Papers/a & b?.pdf' },
    ] as const) expect(parsePopoutHash(popoutHash(home))).toEqual(home);
    expect(parsePopoutHash('#/library')).toBeNull();
  });
});
