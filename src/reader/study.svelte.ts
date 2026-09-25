import { cardsFor, countDue, deleteCard, putCard } from '../lib/db';
import { newSrs } from '../lib/fsrs';
import { appendBlock, quoteBlock } from '../lib/notebook';
import { popoutHash } from '../lib/notebooksync';
import { NotebookChannel, NotebookDoc } from './notebook/doc.svelte';
import { newId, type AnnId, type Card, type CardId, type DocId } from '../lib/types';

export type RightTab = 'notebook' | 'cards';
export type ReviewScope = 'doc' | 'all';

export interface CardDraft { page: number; text: string; annId?: AnnId; cloze: boolean }

export class Study {
  readonly docId: DocId;
  readonly notebook: NotebookDoc;
  /** The notebook is being edited in its own window; the pane shows a placeholder meanwhile. */
  poppedOut = $state(false);
  #popout: Window | null = null;
  #poll: ReturnType<typeof setInterval> | undefined;
  cards = $state.raw<Card[]>([]);
  dueAll = $state(0);
  rightOpen = $state(false);
  rightTab = $state<RightTab>('notebook');
  draft = $state.raw<CardDraft | null>(null);
  review = $state<ReviewScope | null>(null);

  constructor(docId: DocId) {
    this.docId = docId;
    const channel = new NotebookChannel(docId);
    this.notebook = new NotebookDoc(docId, channel);
    channel.on((m) => {
      if (m.t === 'hello') this.notebook.announce();
      if (m.t === 'hello' || m.t === 'open') this.poppedOut = true;
      if (m.t === 'bye') this.#returned();
    });
  }

  async load() {
    const [, cards] = await Promise.all([this.notebook.load(), cardsFor(this.docId)]);
    this.cards = cards;
    await this.refreshDue();
    this.notebook.channel.post({ t: 'ping' });
  }

  /** Opens the notebook in its own window, or brings that window to the front. */
  popOut(): boolean {
    const url = `${location.pathname}${location.search}${popoutHash(this.docId)}`;
    const w = window.open(url, `estudio-notebook-${this.docId}`, 'popup,width=720,height=900');
    if (!w) return false;
    this.#popout = w;
    this.poppedOut = true;
    w.focus();
    clearInterval(this.#poll);
    this.#poll = setInterval(() => {
      if (this.#popout?.closed) this.#returned();
    }, 1000);
    return true;
  }

  /** Closes the pop-out, including one this window did not open (the reader was reloaded meanwhile). */
  bringBack() {
    this.notebook.channel.post({ t: 'close' });
    this.#popout?.close();
    this.#returned();
  }

  #returned() {
    clearInterval(this.#poll);
    this.#popout = null;
    this.poppedOut = false;
  }

  dispose() {
    clearInterval(this.#poll);
    void this.notebook.flush();
    this.notebook.channel.close();
  }

  dueHere = $derived.by(() => {
    const now = Date.now();
    return this.cards.filter((c) => c.srs.due <= now).length;
  });

  async refreshDue() {
    this.dueAll = await countDue(Date.now());
    this.cards = await cardsFor(this.docId);
  }

  showRight(tab: RightTab) {
    this.rightOpen = true;
    this.rightTab = tab;
  }

  /** Appends a quote with a back-link, followed by the reader's own comment when there is one. */
  quote(text: string, page: number, comment = '') {
    const block = quoteBlock(text, page) + (comment ? `\n${comment}\n` : '');
    this.notebook.edit(appendBlock(this.notebook.markdown, block));
    this.showRight('notebook');
  }

  async saveCard(front: string, back: string, d: CardDraft) {
    const card: Card = {
      id: newId<CardId>(), docId: this.docId, page: d.page, front: front.trim(), back: back.trim(),
      srs: newSrs(Date.now()), ...(d.annId ? { annId: d.annId } : {}),
    };
    await putCard(card);
    this.draft = null;
    await this.refreshDue();
    this.showRight('cards');
  }

  async removeCard(id: CardId) {
    await deleteCard(id);
    await this.refreshDue();
  }
}
