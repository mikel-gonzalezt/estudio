/**
 * A change to a keyed record, as one window made it: the keys it set and the keys it removed.
 * Windows write patches instead of whole records so one window's stale copy never undoes
 * another window's change to a different key.
 */
export interface Patch<T> { put: Partial<T>; del: (keyof T & string)[] }

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The keys whose values differ between `before` and `after`. */
export function diff<T extends object>(before: T, after: T): Patch<T> {
  const put: Partial<T> = {};
  const del: (keyof T & string)[] = [];
  for (const k of Object.keys(after) as (keyof T & string)[]) if (!same(before[k], after[k])) put[k] = after[k];
  for (const k of Object.keys(before) as (keyof T & string)[]) if (!(k in after)) del.push(k);
  return { put, del };
}

export const isEmpty = <T>(p: Patch<T>) => Object.keys(p.put).length === 0 && p.del.length === 0;

/** `stored` with the patch applied; keys the patch does not name keep their stored values. */
export function apply<T extends object>(stored: T, p: Patch<T>): T {
  const out = { ...stored, ...p.put };
  for (const k of p.del) delete out[k];
  return out;
}
