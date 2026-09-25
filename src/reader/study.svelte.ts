import { cardsFor, countDue, deleteCard, getNotebook, putCard, putNotebook } from '../lib/db';
import { newSrs } from '../lib/fsrs';
import { appendBlock, quoteBlock } from '../lib/notebook';
import { newId, type AnnId, type Card, type CardId, type DocId } from '../lib/types';

export type RightTab = 'notebook' | 'cards';
export type ReviewScope = 'doc' | 'all';

export interface CardDraft { page: number; text: string; annId?: AnnId; cloze: boolean }

export class Study {
  readonly docId: DocId;
  markdown = $state('');
  cards = $state.raw<Card[]>([]);
  dueAll = $state(0);
  rightOpen = $state(false);
  rightTab = $state<RightTab>('notebook');
  draft = $state.raw<CardDraft | null>(null);
  review = $state<ReviewScope | null>(null);
  #saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(docId: DocId) {
    this.docId = docId;
  }

  async load() {
    const [nb, cards] = await Promise.all([getNotebook(this.docId), cardsFor(this.docId)]);
    this.markdown = nb?.markdown ?? '';
    this.cards = cards;
    await this.refreshDue();
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

  setMarkdown(md: string) {
    this.markdown = md;
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => void this.saveNotebook(), 500);
  }

  async saveNotebook() {
    clearTimeout(this.#saveTimer);
    await putNotebook({ docId: this.docId, markdown: this.markdown, updatedAt: Date.now() });
  }

  /** Appends a quote with a back-link, followed by the reader's own comment when there is one. */
  quote(text: string, page: number, comment = '') {
    const block = quoteBlock(text, page) + (comment ? `\n${comment}\n` : '');
    this.setMarkdown(appendBlock(this.markdown, block));
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
