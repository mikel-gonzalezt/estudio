import { cardsFor, countDue, deleteCard, getAttachment, putCard } from '../lib/db';
import { newSrs } from '../lib/fsrs';
import { attachmentId, figureMarkdown, imageRefs, refFrom, rewriteAttachmentRefs, writeAttachment } from '../lib/attachments';
import { appendBlock, quoteBlock } from '../lib/notebook';
import { app } from '../lib/app.svelte';
import { notebookIndex } from '../lib/notebookindex';
import { idbNotebook, linkedPdfName, notebookFiles, vaultNotebook, type NotebookHome, type NotebookStore, type VaultHome } from '../lib/notebookstore';
import { popoutHash } from '../lib/notebooksync';
import { namePageLinks } from '../lib/pagelink';
import { freePath, removeEntry } from '../lib/vault';
import { vaults } from '../lib/vaults.svelte';
import { joinPath, parentOf, stemOf, type VaultPath } from '../lib/vaulttree';
import { NotebookChannel, NotebookDoc } from './notebook/doc.svelte';
import { newId, type AnnId, type Card, type CardId, type DocId, type NotebookLoc, type Vault, type VaultFolder, type VaultId } from '../lib/types';

export type RightTab = 'notebook' | 'cards';
export type ReviewScope = 'doc' | 'all';

export interface CardDraft { page: number; text: string; annId?: AnnId; cloze: boolean }

/** Saves nothing: the notebook's vault cannot be read until access is granted again. */
const UNREACHABLE: NotebookStore = { load: async () => '', save: async () => {} };

const filesFor = (home: NotebookHome) => notebookFiles(home, (id) => notebookIndex.root(id), notebookIndex);

function storeFor(home: NotebookHome): NotebookStore | null {
  if (home.kind === 'db') return idbNotebook(home.docId);
  return notebookIndex.readable(home.vault) ? vaultNotebook(home, (id) => notebookIndex.root(id), notebookIndex) : null;
}

/**
 * Finds a document's notebook as the reader window opens it (see `NotebookIndex.locate`). `pdf` is
 * where the PDF is in a vault or a granted PDF folder.
 */
export async function findNotebook(docId: DocId, pdfName: string, pdf: NotebookLoc | undefined): Promise<NotebookHome> {
  const home = await notebookIndex.locate(docId, pdfName, pdf, app.settings.notebookFolder);
  return home.kind === 'vault' && !vaults.byId(home.vault) ? { kind: 'db', docId } : home;
}

export class Study {
  readonly docId: DocId;
  home = $state.raw<NotebookHome>()!;
  readonly notebook: NotebookDoc;
  /** The notebook is a file in this vault, whose access grant lapsed. */
  blocked = $state.raw<Vault | null>(null);
  /** The notebook location menu is open. */
  placeOpen = $state(false);
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

  constructor(home: NotebookHome) {
    const { docId } = home;
    this.docId = docId;
    this.home = home;
    const store = storeFor(home);
    if (!store && home.kind === 'vault') this.blocked = vaults.byId(home.vault) ?? null;
    const channel = new NotebookChannel(docId);
    this.notebook = new NotebookDoc(docId, channel, store ?? UNREACHABLE, filesFor(home), linkedPdfName(home));
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
    const url = `${location.pathname}${location.search}${popoutHash(this.home)}`;
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

  /** Stops watching the pop-out and writes any unsaved notebook edit. */
  async dispose() {
    clearInterval(this.#poll);
    try {
      await this.notebook.flush();
    } finally {
      this.notebook.channel.close();
    }
  }

  /** Asks for access to the notebook's vault again and loads the notebook from it; call from a click. */
  async unblock(): Promise<boolean> {
    const v = this.blocked;
    if (!v || !(await vaults.unlock(v))) return false;
    const store = storeFor(this.home);
    if (!store) return false;
    this.notebook.rehome(store, filesFor(this.home), linkedPdfName(this.home));
    await this.notebook.reload();
    this.blocked = null;
    return true;
  }

  /** Moves a database notebook into `folder` of a vault as `<pdf name>.md` (see `#moveInto`). */
  async moveToVault(folder: VaultFolder, pdfName: string): Promise<void> {
    await this.#moveInto(folder.vault, joinPath(folder.dir, `${stemOf(pdfName)}.md`), pdfName);
  }

  /**
   * Moves a database notebook next to its PDF, as `<pdf name>.md`, asking for the PDF's folder the
   * first time; call from a click. Says why when nothing was moved: the user cancelled, or picked a
   * folder that does not hold the PDF.
   */
  async moveBesidePdf(pdf: FileSystemFileHandle, pdfName: string): Promise<'moved' | 'cancelled' | 'elsewhere'> {
    const at = await vaults.grantFolderOf(pdf);
    if (at === null || at === 'elsewhere') return at ?? 'cancelled';
    await this.#moveInto(at.vault, joinPath(parentOf(at.path), `${stemOf(pdfName)}.md`), pdfName);
    return 'moved';
  }

  /**
   * Writes a database notebook to `planned` in `vault`, or a free name beside it, with its
   * frontmatter, its page links naming the PDF for Obsidian and its images written to
   * `attachments/` beside it, and keeps editing it there. The database copy is left as it was, and
   * a failure on the way removes the files written so far, so the notebook stays where it was.
   */
  async #moveInto(vault: VaultId, planned: VaultPath, pdfName: string): Promise<void> {
    const root = notebookIndex.root(vault);
    if (!root) throw new Error('Estudio cannot open that folder.');
    await this.notebook.flush();
    const home: VaultHome = { kind: 'vault', docId: this.docId, vault, pdfName, path: await freePath(root, planned) };
    const store = storeFor(home)!;
    const moved = new Map<string, string>();
    const written: VaultPath[] = [];
    let text: string;
    try {
      for (const r of imageRefs(this.notebook.markdown)) {
        const id = attachmentId(r.src);
        const att = id && !moved.has(id) ? await getAttachment(id) : undefined;
        if (!att) continue;
        const path = await writeAttachment(root, home.path, att.blob, att.name);
        written.push(path);
        moved.set(att.id, refFrom(home.path, path));
      }
      text = rewriteAttachmentRefs(namePageLinks(this.notebook.markdown, pdfName), (id) => moved.get(id));
      written.push(home.path);
      await store.save(text, true);
    } catch (e) {
      await Promise.all(written.map((p) => removeEntry(root, p).catch(() => undefined)));
      throw e;
    }
    this.notebook.rehome(store, filesFor(home), pdfName);
    this.home = home;
    this.notebook.edit(text);
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
    const block = quoteBlock(text, page, this.notebook.pdfName) + (comment ? `\n${comment}\n` : '');
    this.notebook.edit(appendBlock(this.notebook.markdown, block));
    this.showRight('notebook');
  }

  /** Appends a figure (a PNG of a clipped region) with a link to its page, stored as the notebook's images are. */
  async figure(png: Blob, page: number) {
    const src = await this.notebook.files.save(png);
    this.notebook.edit(appendBlock(this.notebook.markdown, `${figureMarkdown(src, page, this.notebook.pdfName)}\n`));
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
