import { describe, expect, it } from 'vitest';
import { apply, diff, isEmpty } from './patch';
import { DEFAULT_SETTINGS, type Settings } from './types';

const base = (): Settings => structuredClone(DEFAULT_SETTINGS);

describe('settings patches', () => {
  it('names only the keys that changed, comparing nested values by content', () => {
    const after = { ...base(), theme: 'dark' as const, pinPanel: { ...DEFAULT_SETTINGS.pinPanel } };
    expect(diff(base(), after)).toEqual({ put: { theme: 'dark' }, del: [] });
    expect(isEmpty(diff(base(), base()))).toBe(true);
  });

  it('two windows changing different keys from the same stale copy both survive', () => {
    const a = base();
    const b = base();
    let stored = base();
    const aAfter = { ...a, theme: 'dark' as const };
    const bAfter = { ...b, speechRate: 1.5, leftPaneW: 300 };
    stored = apply(stored, diff(a, aAfter));
    stored = apply(stored, diff(b, bAfter));
    expect(stored.theme).toBe('dark');
    expect(stored.speechRate).toBe(1.5);
    expect(stored.leftPaneW).toBe(300);
    expect(stored.pageMode).toBe(DEFAULT_SETTINGS.pageMode);
  });

  it('the later write wins when both windows change the same key', () => {
    const stored = apply(apply(base(), { put: { pageMode: 'dark' }, del: [] }), { put: { pageMode: 'sepia' }, del: [] });
    expect(stored.pageMode).toBe('sepia');
  });

  it('removes deleted keys and keeps the rest of a record', () => {
    const a = { vault: 'v', path: 'a.md' };
    const before: Record<string, { vault: string; path: string }> = { a, b: { vault: 'v', path: 'b.md' } };
    const p = diff(before, { a });
    expect(p).toEqual({ put: {}, del: ['b'] });
    expect(apply({ ...before, c: { vault: 'w', path: 'c.md' } }, p)).toEqual({ a, c: { vault: 'w', path: 'c.md' } });
  });
});
