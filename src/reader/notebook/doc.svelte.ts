import { channelName, DISK_REV, newer, nextRev, NO_REV, type NotebookMsg, type Rev } from '../../lib/notebooksync';
import type { NotebookStore } from '../../lib/notebookstore';
import type { DocId } from '../../lib/types';

type Listener = (m: NotebookMsg) => void;

/** One BroadcastChannel per window and document; every part of the window listens through it. */
export class NotebookChannel {
  readonly #bc: BroadcastChannel;
  readonly #listeners = new Set<Listener>();

  constructor(docId: DocId) {
    this.#bc = new BroadcastChannel(channelName(docId));
    this.#bc.onmessage = (e: MessageEvent<NotebookMsg>) => {
      for (const l of this.#listeners) l(e.data);
    };
  }

  post(m: NotebookMsg) {
    this.#bc.postMessage(m);
  }

  on(l: Listener): () => void {
    this.#listeners.add(l);
    return () => this.#listeners.delete(l);
  }

  close() {
    this.#listeners.clear();
    this.#bc.close();
  }
}

const SAVE_DELAY_MS = 500;

/** A document's notebook text as seen by one window; see `notebooksync.ts` for the sync rule. */
export class NotebookDoc {
  readonly docId: DocId;
  readonly channel: NotebookChannel;
  /** The PDF's file name when the notebook is a `.md` beside it in a vault; page links then name it. */
  readonly pdfName: string | undefined;
  readonly #store: NotebookStore;
  markdown = $state('');
  readonly #self = crypto.randomUUID();
  #rev: Rev = NO_REV;
  #dirty = false;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(docId: DocId, channel: NotebookChannel, store: NotebookStore, pdfName?: string) {
    this.docId = docId;
    this.channel = channel;
    this.#store = store;
    this.pdfName = pdfName;
    channel.on((m) => {
      if (m.t === 'text') this.#receive(m.markdown, m.rev);
    });
  }

  async load() {
    this.#receive(await this.#store.load(), DISK_REV);
  }

  /** A change made in this window. */
  edit(markdown: string) {
    if (markdown === this.markdown) return;
    this.markdown = markdown;
    this.#rev = nextRev(this.#rev, this.#self);
    this.#dirty = true;
    this.announce();
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }

  announce() {
    this.channel.post({ t: 'text', markdown: this.markdown, rev: this.#rev });
  }

  /** Writes this window's own unsaved edit; text adopted from another window is that window's to save. */
  async flush() {
    clearTimeout(this.#timer);
    if (!this.#dirty) return;
    this.#dirty = false;
    await this.#store.save(this.markdown);
  }

  #receive(markdown: string, rev: Rev) {
    if (!newer(rev, this.#rev)) return;
    clearTimeout(this.#timer);
    this.#dirty = false;
    this.#rev = rev;
    this.markdown = markdown;
  }
}
