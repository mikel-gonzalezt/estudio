import { cardsFor, countDue, deleteCard, getAttachment, putCard } from '../lib/db';
import { newSrs } from '../lib/fsrs';
import { ATTACHMENTS_DIR, attachmentId, figureMarkdown, findImage, imageRefs, imageSource } from '../lib/attachments';
import { notebookFrontmatter, splitFrontmatter } from '../lib/frontmatter';
import { appendBlock, quoteBlock } from '../lib/notebook';
import { app } from '../lib/app.svelte';
import { notebookIndex } from '../lib/notebookindex';
import { leftBehind, planMove, type ImageOrigin, type MovePlan } from '../lib/notebookmove';
import { idbNotebook, linkedPdfName, notebookFiles, vaultNotebook, type NotebookHome, type NotebookStore, type VaultHome } from '../lib/notebookstore';
import { popoutHash } from '../lib/notebooksync';
import { fileAt, fileOrNull, filesIn, removeEntry, writeFile } from '../lib/vault';
import { vaults } from '../lib/vaults.svelte';
import { joinPath, parentOf, stemOf, type VaultPath } from '../lib/vaulttree';
import { NotebookChannel, NotebookDoc } from './notebook/doc.svelte';
import { newId, type AnnId, type Card, type CardId, type DocId, type NotebookLoc, type Vault, type VaultFolder, type VaultId } from '../lib/types';

export type RightTab = 'notebook' | 'cards';
export type ReviewScope = 'doc' | 'all';

export interface CardDraft { page: number; text: string; annId?: AnnId; cloze: boolean }

/** Saves nothing: the notebook's vault cannot be read until access is granted again. */
const UNREACHABLE: NotebookStore = { load: async () => '', save: async () => {} };

type Source = { root: FileSystemDirectoryHandle; path: VaultPath; shallow: boolean };

/** Where each local image `body` references is kept: the database, or a file of the vault the note is in now. */
async function imageOrigins(body: string, source: Source | null): Promise<Map<string, ImageOrigin>> {
  const out = new Map<string, ImageOrigin>();
  for (const { src } of imageRefs(body)) {
    if (out.has(src) || imageSource(src).kind !== 'local') continue;
    const id = attachmentId(src);
    if (id) {
      const att = await getAttachment(id);
      if (att) out.set(src, { kind: 'db', id, name: att.name });
    } else if (source) {
      const path = await findImage(source.root, source.path, src, source.shallow);
      if (path) out.set(src, { kind: 'file', path });
    }
  }
  return out;
}

/** Deletes a moved notebook's old file, then the images it took along that no other note beside it mentions. */
async function removeOld(source: Source, copies: MovePlan['copies']): Promise<string | undefined> {
  try {
    await removeEntry(source.root, source.path);
  } catch (e) {
    return `The notebook was copied, but its old file "${source.path}" could not be deleted (${e instanceof Error ? e.message : String(e)}). Delete it by hand.`;
  }
  const images = copies.flatMap((c) => (c.origin.kind === 'file' ? [c.origin.path] : []));
  const notes = (await filesIn(source.root, parentOf(source.path))).filter((f) => /\.md$/i.test(f.path));
  const others = await Promise.all(notes.map(async (f) => ({ text: await (await f.handle.getFile()).text() })));
  await Promise.all(leftBehind(source.path, images, others).map((p) => removeEntry(source.root, p).catch(() => undefined)));
  return undefined;
}

const filesFor = (home: NotebookHome) => notebookFiles(home, (id) => notebookIndex.root(id), notebookIndex, (id) => notebookIndex.isShallow(id));

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

  /** Where the notebook's file is now, after moves made in Estudio; null for a notebook kept in the database. */
  location(): NotebookLoc | null {
    return this.home.kind === 'vault' ? notebookIndex.where(this.docId) ?? { vault: this.home.vault, path: this.home.path } : null;
  }

  /** Moves the notebook, wherever it is kept now, into `folder` of a vault as `<pdf name>.md` (see `#moveTo`). */
  moveToVault(folder: VaultFolder, pdfName: string): Promise<string | undefined> {
    return this.#moveTo(folder.vault, joinPath(folder.dir, `${stemOf(pdfName)}.md`), pdfName);
  }

  /**
   * Moves the notebook next to its PDF, as `<pdf name>.md`, asking for the PDF's folder the first
   * time; call from a click. Says why when nothing was moved: the user cancelled, or picked a
   * folder that does not hold the PDF.
   */
  async moveBesidePdf(pdf: FileSystemFileHandle, pdfName: string): Promise<'moved' | 'cancelled' | 'elsewhere'> {
    const at = await vaults.grantFolderOf(pdf);
    if (at === null || at === 'elsewhere') return at ?? 'cancelled';
    await this.#moveTo(at.vault, joinPath(parentOf(at.path), `${stemOf(pdfName)}.md`), pdfName);
    return 'moved';
  }

  /**
   * Writes the notebook to `planned` in `vault`, or a free name beside it, and keeps editing it
   * there: its frontmatter (Estudio's keys and the user's), its page links naming the PDF for
   * Obsidian, and its images copied to `attachments/` beside it with the references rewritten.
   * Only once all of that is written is the old file deleted, with the images beside it that no
   * other note there mentions. A failure on the way removes what was written, and the notebook
   * stays where it was. A notebook kept in the database keeps its database copy. A pop-out window
   * holds its edits while the notebook moves, then follows it. Returns a warning when the old file
   * could not be deleted.
   */
  async #moveTo(vault: VaultId, planned: VaultPath, pdfName: string): Promise<string | undefined> {
    const root = notebookIndex.root(vault);
    if (!root) throw new Error('Estudio cannot open that folder.');
    const from = this.location();
    const fromRoot = from ? notebookIndex.root(from.vault) : undefined;
    if (from && !fromRoot) throw new Error('Estudio cannot open the vault that holds this notebook.');
    if (from && from.vault === vault && parentOf(from.path) === parentOf(planned)) throw new Error('The notebook is already in that folder.');
    let moved: VaultHome | null = null;
    await this.#holdPopout();
    try {
      await this.notebook.flush();
      const body = this.notebook.markdown;
      const old = from && fromRoot ? await fileOrNull(fromRoot, from.path) : null;
      const source = from && fromRoot && old ? { root: fromRoot, path: from.path, shallow: notebookIndex.isShallow(from.vault) } : null;
      const front = old ? splitFrontmatter(await (await old.getFile()).text()).front : null;
      const dir = parentOf(planned);
      const taken = new Set([...(await filesIn(root, dir)), ...(await filesIn(root, joinPath(dir, ATTACHMENTS_DIR)))].map((f) => f.path));
      const plan = planMove({ body, pdfName, planned, origins: await imageOrigins(body, source), taken: (p) => taken.has(p) });
      const written: VaultPath[] = [];
      try {
        for (const c of plan.copies) {
          const blob = c.origin.kind === 'db' ? (await getAttachment(c.origin.id))?.blob : await (await fileAt(source!.root, c.origin.path)).getFile();
          if (!blob) throw new Error(`An image of the notebook could not be read (${c.to}).`);
          if (await fileOrNull(root, c.to)) throw new Error(`"${c.to}" already exists.`);
          written.push(c.to);
          await writeFile(await fileAt(root, c.to, true), blob);
        }
        if (await fileOrNull(root, plan.notePath)) throw new Error(`"${plan.notePath}" already exists.`);
        written.push(plan.notePath);
        await writeFile(await fileAt(root, plan.notePath, true), notebookFrontmatter(front, this.docId, pdfName) + plan.body);
      } catch (e) {
        await Promise.all(written.map((p) => removeEntry(root, p).catch(() => undefined)));
        throw e;
      }
      const home: VaultHome = { kind: 'vault', docId: this.docId, vault, pdfName, path: plan.notePath };
      notebookIndex.saved(this.docId, { vault, path: plan.notePath });
      this.notebook.rehome(storeFor(home)!, filesFor(home), pdfName);
      this.home = home;
      moved = home;
      this.notebook.edit(plan.body);
      const warning = source ? await removeOld(source, plan.copies) : undefined;
      vaults.changed([vault, ...(from ? [from.vault] : [])]);
      return warning;
    } finally {
      this.notebook.channel.post({ t: 'moved', home: moved });
    }
  }

  /** Asks an open pop-out to save its edits and hold new ones until the notebook has moved. */
  async #holdPopout(): Promise<void> {
    if (!this.poppedOut) return;
    const { channel } = this.notebook;
    await new Promise<void>((resolve) => {
      const done = () => {
        off();
        clearTimeout(timer);
        resolve();
      };
      const off = channel.on((m) => {
        if (m.t === 'held') done();
      });
      const timer = setTimeout(done, 3000);
      channel.post({ t: 'moving' });
    });
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
