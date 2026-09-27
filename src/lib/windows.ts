import { getDoc, hasHandoff, putHandoff, sweepHandoffs, takeHandoff, type Handoff } from './db';
import type { DocId, Settings, VaultId } from './types';

/**
 * Several Estudio windows can be open at once, one document each. They share IndexedDB, so this
 * module is where they meet: a Web Lock per open document, a BroadcastChannel for changes the
 * other windows must adopt, and one-time handoff tokens for opening a file handle in a new window.
 */

export type WindowId = string & { __brand: 'WindowId' };

export type WindowMsg =
  /** Whoever holds `doc` brings its window forward. */
  | { t: 'focus'; doc: DocId }
  | { t: 'notice'; to: WindowId; text: string }
  /** Settings another window changed and saved. */
  | { t: 'settings'; put: Partial<Settings> }
  /** The vault list or grants changed; with `vault`, files in that vault changed too. */
  | { t: 'vaults'; vault?: VaultId }
  /** The recent-documents list changed. */
  | { t: 'docs' }
  /** Another window started reading aloud. */
  | { t: 'speaking' };

export const ALREADY_OPEN = 'Already open in another window';

export const HANDOFF_TTL_MS = 2 * 60_000;
/**
 * How long a new window has to claim its handoff before the opener offers to open it from a
 * click. Without user activation (a launch from Explorer) the pop-up blocker has most likely
 * stopped it, so the offer comes sooner.
 */
export const CLAIM_WAIT_MS = 4000;
export const CLAIM_WAIT_BLOCKED_MS = 1500;
const CLAIM_POLL_MS = 400;

const LOCK_PREFIX = 'estudio-doc:';
export const lockName = (id: DocId) => `${LOCK_PREFIX}${id}`;

/** The documents whose locks are held, by any window of this origin. */
export function heldDocs(snapshot: LockManagerSnapshot): Set<DocId> {
  const out = new Set<DocId>();
  for (const l of snapshot.held ?? []) if (l.name?.startsWith(LOCK_PREFIX)) out.add(l.name.slice(LOCK_PREFIX.length) as DocId);
  return out;
}

export type Where = { kind: 'free' } | { kind: 'here' } | { kind: 'elsewhere'; doc: DocId };

export function whereHeld(id: DocId, held: ReadonlySet<DocId>, mine: ReadonlySet<DocId>): Where {
  if (mine.has(id)) return { kind: 'here' };
  return held.has(id) ? { kind: 'elsewhere', doc: id } : { kind: 'free' };
}

/** Files the OS launched: the first opens here when this window shows the library, the rest get a window each. */
export function routeLaunch<T>(files: readonly T[], libraryShowing: boolean): { here: T | null; windows: T[] } {
  const [first, ...rest] = files;
  if (first === undefined) return { here: null, windows: [] };
  return libraryShowing ? { here: first, windows: rest } : { here: null, windows: [...files] };
}

export interface HandoffStore {
  take(token: string): Promise<Handoff | undefined>;
  sweep(before: number): Promise<void>;
}

/** The handoff for `token`, deleted as it is read; a stale one is dropped. Any handoff past its time is swept. */
export async function claimHandoff(store: HandoffStore, token: string, now: number): Promise<Handoff | null> {
  const h = await store.take(token);
  await store.sweep(now - HANDOFF_TTL_MS);
  return h && now - h.createdAt <= HANDOFF_TTL_MS ? h : null;
}

const HANDOFF_PARAM = 'open';

type Locks = LockManager | undefined;

class Windows {
  readonly id = crypto.randomUUID() as WindowId;
  readonly #channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('estudio-windows');
  readonly #listeners = new Set<(m: WindowMsg) => void>();
  /** Documents this window holds, counted because reopening the same document queues a second hold behind the first. */
  readonly #mine = new Map<DocId, number>();

  constructor() {
    if (this.#channel) this.#channel.onmessage = (e: MessageEvent<WindowMsg>) => this.#receive(e.data);
  }

  get #locks(): Locks {
    return typeof navigator === 'undefined' ? undefined : navigator.locks;
  }

  post(m: WindowMsg) {
    this.#channel?.postMessage(m);
  }

  on(f: (m: WindowMsg) => void): () => void {
    this.#listeners.add(f);
    return () => this.#listeners.delete(f);
  }

  #receive(m: WindowMsg) {
    if (m.t === 'focus' && this.#mine.has(m.doc)) window.focus();
    if (m.t === 'notice' && m.to !== this.id) return;
    for (const f of this.#listeners) f(m);
  }

  /**
   * Takes the document's lock for as long as this window shows it. Null when another window holds
   * it. A document this window is still releasing (saves in flight) waits for that release.
   */
  async hold(id: DocId): Promise<(() => void) | null> {
    const locks = this.#locks;
    if (!locks) return () => {};
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const granted = await new Promise<boolean>((resolve) => {
      void locks.request(lockName(id), { ifAvailable: !this.#mine.has(id) }, (lock) => {
        resolve(!!lock);
        if (!lock) return undefined;
        this.#mine.set(id, (this.#mine.get(id) ?? 0) + 1);
        return held.finally(() => {
          const n = (this.#mine.get(id) ?? 1) - 1;
          if (n) this.#mine.set(id, n);
          else this.#mine.delete(id);
        });
      });
    });
    return granted ? release : null;
  }

  async #held(): Promise<Set<DocId>> {
    const locks = this.#locks;
    return locks ? heldDocs(await locks.query()) : new Set();
  }

  /** Whether any window shows a document. */
  async anyDocOpen(): Promise<boolean> {
    return (await this.#held()).size > 0;
  }

  async where(id: DocId): Promise<Where> {
    return whereHeld(id, await this.#held(), new Set(this.#mine.keys()));
  }

  /** Which window, if any, shows the document stored for this file handle. Never loads the PDF. */
  async whereFile(handle: FileSystemFileHandle): Promise<Where> {
    const mine = new Set(this.#mine.keys());
    for (const id of await this.#held()) {
      const h = (await getDoc(id))?.handle;
      if (h && (await h.isSameEntry(handle).catch(() => false))) return whereHeld(id, new Set([id]), mine);
    }
    return { kind: 'free' };
  }

  /** Asks the window holding `doc` to come forward. */
  focus(doc: DocId) {
    this.post({ t: 'focus', doc });
  }

  /**
   * Opens a new Estudio window on `handle`. Same-origin, so an installed app opens an app window;
   * `noopener` gives it its own process, so one window rendering pages never stalls the other.
   * When the window has not claimed the file in time (a blocked pop-up), `stalled` gets a retry
   * to run from a click; the function it returns runs once the file is claimed or the handoff expires.
   */
  async openWindow(handle: FileSystemFileHandle, page: number | undefined, stalled: (retry: () => void) => () => void) {
    const activated = navigator.userActivation?.isActive ?? true;
    const token = crypto.randomUUID();
    const t0 = Date.now();
    await putHandoff({ token, handle, from: this.id, createdAt: t0, ...(page ? { page } : {}) });
    const retry = () => void window.open(handoffUrl(token), '_blank', 'noopener');
    retry();
    const wait = activated ? CLAIM_WAIT_MS : CLAIM_WAIT_BLOCKED_MS;
    let settle: (() => void) | null = null;
    while (Date.now() - t0 < HANDOFF_TTL_MS) {
      await new Promise((r) => setTimeout(r, CLAIM_POLL_MS));
      if (!(await hasHandoff(token))) break;
      if (!settle && Date.now() - t0 >= wait) settle = stalled(retry);
    }
    settle?.();
  }

  /** The handoff this window was opened for, taken once; the token leaves the address so a reload does not ask again. */
  async claim(): Promise<Handoff | null> {
    const url = new URL(location.href);
    const token = url.searchParams.get(HANDOFF_PARAM);
    if (!token) return null;
    url.searchParams.delete(HANDOFF_PARAM);
    history.replaceState(history.state, '', url);
    return claimHandoff({ take: takeHandoff, sweep: sweepHandoffs }, token, Date.now());
  }
}

function handoffUrl(token: string): string {
  return `${import.meta.env.BASE_URL}?${HANDOFF_PARAM}=${encodeURIComponent(token)}`;
}

export const windows = new Windows();
