import { cardsFor, countDue, deleteCard, putCard } from '../lib/db';
import { newSrs } from '../lib/fsrs';
import { appendBlock, quoteBlock } from '../lib/notebook';
import { idbNotebook, type NotebookStore } from '../lib/notebookstore';
import { newId, type AnnId, type Card, type CardId, type DocId } from '../lib/types';

export type RightTab = 'notebook' | 'cards';
export type ReviewScope = 'doc' | 'all';

/** What the notebook editor needs: a notebook, and somewhere for page links to go. */
export interface NotebookHost { study: Study; jump(t: { page: number; y: number }): void }

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
  readonly #store: NotebookStore;
  /** The PDF's file name when the notebook lives in a vault, so page links name the file Obsidian-style. */
  readonly pdfName: string | undefined;

  constructor(docId: DocId, store: NotebookStore = idbNotebook(docId), pdfName?: string) {
    this.docId = docId;
    this.#store = store;
    this.pdfName = pdfName;
  }

  async load() {
    const [markdown, cards] = await Promise.all([this.#store.load(), cardsFor(this.docId)]);
    this.markdown = markdown;
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
    await this.#store.save(this.markdown);
  }

  /** Appends a quote with a back-link, followed by the reader's own comment when there is one. */
  quote(text: string, page: number, comment = '') {
    const block = quoteBlock(text, page, this.pdfName) + (comment ? `\n${comment}\n` : '');
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
