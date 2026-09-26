import { getNotebookIndex, putNotebookIndex } from './db';
import type { NotebookHome } from './notebookstore';
import { notebookIdIn } from './frontmatter';
import type { DocId, NotebookLoc, Vault, VaultFolder, VaultId } from './types';
import { dirAt, fileOrNull, freePath, headOf, markdownHeads } from './vault';
import { joinPath, parentOf, stemOf, type VaultPath } from './vaulttree';

/** Where `path` ends up when `from` (a file or a folder) is moved to `to`; null when it is not inside `from`. */
export function remapPath(path: VaultPath, from: VaultPath, to: VaultPath): VaultPath | null {
  if (path === from) return to;
  return path.startsWith(`${from}/`) ? to + path.slice(from.length) : null;
}

/** The notebooks named in a vault's Markdown heads. A document named twice keeps its shortest path. */
export function notebooksIn(heads: readonly { path: VaultPath; head: string }[]): Map<DocId, VaultPath> {
  const out = new Map<DocId, VaultPath>();
  const sorted = [...heads].sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path));
  for (const { path, head } of sorted) {
    const id = notebookIdIn(head);
    if (id && !out.has(id)) out.set(id, path);
  }
  return out;
}

/** The part of the index a notebook store talks to while it saves. */
export interface NotebookTracker {
  /** Where the notebook is now, after moves made in Estudio. */
  where(docId: DocId): NotebookLoc | undefined;
  /** The file was not where it was expected: look through the vaults again. */
  find(docId: DocId): Promise<NotebookLoc | undefined>;
  saved(docId: DocId, loc: NotebookLoc): void;
}

/**
 * DocId → the vault file whose frontmatter names it, across every vault Estudio can read. Built by
 * scanning each vault's Markdown heads when the vault opens, kept current by Estudio's own saves,
 * moves and deletes, and persisted so a notebook in a vault whose access lapsed is still known.
 */
export class NotebookIndex implements NotebookTracker {
  /** What the last scan (and Estudio's own changes since) found in each vault Estudio can read. */
  readonly #found = new Map<VaultId, Map<DocId, VaultPath>>();
  /** What earlier sessions knew; used for vaults that have not been scanned in this one. */
  readonly #remembered = new Map<DocId, NotebookLoc>();
  readonly #roots = new Map<VaultId, FileSystemDirectoryHandle>();
  /** Folders granted for notebooks beside PDFs outside vaults. They may be as big as Downloads, so they are never walked whole. */
  readonly #shallow = new Set<VaultId>();
  #pending: Promise<unknown> = Promise.resolve();
  #persistTimer: ReturnType<typeof setTimeout> | undefined;
  readonly #persist: (entries: Record<DocId, NotebookLoc>) => Promise<void>;

  constructor(persist: (entries: Record<DocId, NotebookLoc>) => Promise<void> = async () => {}) {
    this.#persist = persist;
  }

  restore(entries: Record<DocId, NotebookLoc>) {
    for (const [id, loc] of Object.entries(entries) as [DocId, NotebookLoc][]) this.#remembered.set(id, loc);
  }

  root(vault: VaultId): FileSystemDirectoryHandle | undefined {
    return this.#roots.get(vault);
  }

  readable(vault: VaultId): boolean {
    return this.#roots.has(vault);
  }

  get(docId: DocId): NotebookLoc | undefined {
    for (const [vault, found] of this.#found) {
      const path = found.get(docId);
      if (path !== undefined) return { vault, path };
    }
    const old = this.#remembered.get(docId);
    return old && !this.#found.has(old.vault) ? old : undefined;
  }

  where(docId: DocId) {
    return this.get(docId);
  }

  saved(docId: DocId, loc: NotebookLoc) {
    const cur = this.get(docId);
    if (cur?.vault === loc.vault && cur.path === loc.path) return;
    for (const found of this.#found.values()) found.delete(docId);
    this.#remembered.set(docId, { ...loc });
    this.#found.get(loc.vault)?.set(docId, loc.path);
    this.#changed();
  }

  /** `from` (a file or folder) in `vault` was moved or renamed to `to`. */
  moved(vault: VaultId, from: VaultPath, to: VaultPath) {
    const found = this.#found.get(vault);
    if (!found) return;
    for (const [id, path] of found) {
      const next = remapPath(path, from, to);
      if (next !== null) found.set(id, next);
    }
    this.#changed();
  }

  /** `path` (a file or folder) in `vault` was deleted. */
  removed(vault: VaultId, path: VaultPath) {
    const found = this.#found.get(vault);
    if (!found) return;
    for (const [id, p] of found) if (remapPath(p, path, path) !== null) found.delete(id);
    this.#changed();
  }

  /** The vault was removed from Estudio. */
  forget(vault: VaultId) {
    this.#roots.delete(vault);
    this.#shallow.delete(vault);
    this.#found.delete(vault);
    for (const [id, loc] of this.#remembered) if (loc.vault === vault) this.#remembered.delete(id);
    this.#changed();
  }

  /** Reads the frontmatter of every note in `vault` and replaces what the index held for it. */
  scan(vault: Pick<Vault, 'id' | 'handle'>): Promise<void> {
    this.#roots.set(vault.id, vault.handle);
    this.#shallow.delete(vault.id);
    const run = markdownHeads(vault.handle).then((heads) => {
      this.#found.set(vault.id, notebooksIn(heads));
      this.#changed();
    }, () => undefined);
    this.#pending = Promise.all([this.#pending, run]);
    return run;
  }

  /** Makes a PDF folder readable without scanning it; its notes are looked for one folder at a time, as its PDFs open. */
  attach(folder: Pick<Vault, 'id' | 'handle'>) {
    this.#roots.set(folder.id, folder.handle);
    this.#shallow.add(folder.id);
    if (this.#found.has(folder.id)) return;
    const known = [...this.#remembered].filter(([, loc]) => loc.vault === folder.id);
    this.#found.set(folder.id, new Map(known.map(([id, loc]) => [id, loc.path])));
  }

  /** Reads the notes directly in `dir` of a PDF folder and replaces what the index held for that folder alone. */
  async #scanDir(vault: VaultId, dir: VaultPath): Promise<void> {
    const found = this.#found.get(vault);
    const root = this.#roots.get(vault);
    if (!found || !root) return;
    const heads = await dirAt(root, dir).then((d) => markdownHeads(d, dir, false), () => []);
    for (const [id, path] of found) if (parentOf(path) === dir) found.delete(id);
    for (const [id, path] of notebooksIn(heads)) if (!found.has(id)) found.set(id, path);
    this.#changed();
  }

  async rescan(): Promise<void> {
    await Promise.all([...this.#roots].filter(([id]) => !this.#shallow.has(id)).map(([id, handle]) => this.scan({ id, handle })));
  }

  /** Waits for scans in progress. */
  async ready(): Promise<void> {
    let seen: Promise<unknown>;
    do {
      seen = this.#pending;
      await seen;
    } while (seen !== this.#pending);
  }

  async find(docId: DocId): Promise<NotebookLoc | undefined> {
    await this.rescan();
    const hit = this.get(docId);
    if (!hit || !this.#shallow.has(hit.vault) || (await this.#idAt(hit)) === docId) return hit;
    this.#found.get(hit.vault)?.delete(docId);
    this.#changed();
    return this.get(docId);
  }

  /** Every document's notebook as currently known. */
  entries(): Record<DocId, NotebookLoc> {
    const ids = new Set<DocId>([...this.#remembered.keys(), ...[...this.#found.values()].flatMap((f) => [...f.keys()])]);
    const out: Record<DocId, NotebookLoc> = {};
    for (const id of ids) {
      const loc = this.get(id);
      if (loc) out[id] = loc;
    }
    return out;
  }

  /**
   * Where a document's notebook is: the file whose frontmatter names it (checked again, and the
   * vaults rescanned if it moved behind Estudio's back; in a PDF folder only the PDF's own folder is
   * read); else a `<name>.md` beside the PDF, in a vault or a PDF folder, that names no other
   * document, adopted as is; else a new file where new notebooks go; else the database.
   * A notebook known to be in a vault Estudio cannot read right now is returned as is: asking for
   * access beats starting a second notebook.
   */
  async locate(docId: DocId, pdfName: string, pdf: NotebookLoc | undefined, target: VaultFolder | null): Promise<NotebookHome> {
    await this.ready();
    if (pdf && this.#shallow.has(pdf.vault)) await this.#scanDir(pdf.vault, parentOf(pdf.path));
    const home = (loc: NotebookLoc): NotebookHome => ({ kind: 'vault', docId, vault: loc.vault, path: loc.path, pdfName });
    let hit = this.get(docId);
    if (hit && this.readable(hit.vault) && (await this.#idAt(hit)) !== docId) hit = await this.find(docId);
    if (hit) return home(hit);
    const md = `${stemOf(pdfName)}.md`;
    if (pdf && this.readable(pdf.vault)) {
      const side = { vault: pdf.vault, path: joinPath(parentOf(pdf.path), md) };
      const id = await this.#idAt(side);
      if (id === null || id === docId) return home(side);
    }
    const to = target && this.readable(target.vault) ? target : pdf && this.readable(pdf.vault) ? { vault: pdf.vault, dir: parentOf(pdf.path) } : null;
    if (!to) return { kind: 'db', docId };
    return home({ vault: to.vault, path: await freePath(this.#roots.get(to.vault)!, joinPath(to.dir, md)) });
  }

  /** The id a vault file's frontmatter names: undefined when there is no such file, null when it names none. */
  async #idAt(loc: NotebookLoc): Promise<DocId | null | undefined> {
    const root = this.#roots.get(loc.vault);
    const file = root ? await fileOrNull(root, loc.path) : null;
    return file ? notebookIdIn(await headOf(file)) : undefined;
  }

  #changed() {
    clearTimeout(this.#persistTimer);
    this.#persistTimer = setTimeout(() => void this.#persist(this.entries()), 300);
  }
}

export const notebookIndex = new NotebookIndex(putNotebookIndex);

export async function restoreNotebookIndex() {
  notebookIndex.restore(await getNotebookIndex());
}
