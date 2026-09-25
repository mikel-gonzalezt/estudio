/**
 * Notebook text is shared between the reader window and a pop-out window with last-edit-wins:
 * every local edit bumps a revision, and a window adopts incoming text only when its revision is
 * newer. The window that authored the newest revision is the only one that writes it to disk.
 */
export interface Rev { n: number; by: string }

/** What a window holds before it has read anything. */
export const NO_REV: Rev = { n: -1, by: '' };
/** Text read from disk: older than any edit made in either window. */
export const DISK_REV: Rev = { n: 0, by: '' };

/** Ties on `n` (two windows editing at once) are settled by window id so both pick the same winner. */
export function newer(a: Rev, b: Rev): boolean {
  return a.n > b.n || (a.n === b.n && a.by > b.by);
}

export const nextRev = (r: Rev, by: string): Rev => ({ n: r.n + 1, by });

export interface Section { title: string; page: number; depth: number }
export interface AnnRef { id: string; page: number; text: string }

/** What the notebook needs from the reader: the page on screen, and link targets for autocomplete. */
export interface NotebookContext { title: string; page: number; sections: Section[]; annotations: AnnRef[] }

export type NotebookMsg =
  | { t: 'text'; markdown: string; rev: Rev }
  /** Pop-out started: the reader replies with its text and context. */
  | { t: 'hello' }
  /** Reader started: an open pop-out replies with `open`. */
  | { t: 'ping' }
  | { t: 'open' }
  | { t: 'bye' }
  /** Reader asks the pop-out to close. */
  | { t: 'close' }
  | { t: 'context'; ctx: NotebookContext }
  | { t: 'jump'; page: number }
  | { t: 'autoLinks'; on: boolean };

export const channelName = (docId: string) => `estudio-notebook:${docId}`;

export const POPOUT_ROUTE = /^#\/notebook\/(.+)$/;
export const popoutHash = (docId: string) => `#/notebook/${encodeURIComponent(docId)}`;
