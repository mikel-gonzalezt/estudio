import { deleteVault, listVaults, putVault } from './db';
import { askPermission, hasPermission } from './fsaccess';
import { notebookIndex, restoreNotebookIndex } from './notebookindex';
import type { NotebookLoc, Vault, VaultId } from './types';
import { windows } from './windows';
import { dirAt, fileAt, moveEntry, pathIn, placeIn, removeEntry, walk, writeFile } from './vault';
import {
  EMPTY_TREE, ROOT, buildTree, canMove, checkName, companionsOf, joinPath, nameOf, parentOf, resolvePdfLink, stemOf, uniqueName,
  type NameProblem, type Tree, type VaultPath,
} from './vaulttree';

type DirPickerWindow = Window & {
  showDirectoryPicker?: (o: { mode: 'readwrite'; id: string; startIn?: FileSystemHandle }) => Promise<FileSystemDirectoryHandle>;
  showOpenFilePicker?: (o: object) => Promise<FileSystemFileHandle[]>;
};

const PROBLEM: Record<NameProblem, string> = {
  empty: 'A name is required.',
  invalid: 'Names cannot start with a dot or contain \\ / : * ? " < > |.',
  taken: 'Something with that name is already there.',
};

class Vaults {
  list = $state.raw<Vault[]>([]);
  /** Folders of PDFs opened from outside any vault, granted so their notebooks sit beside them. Never shown as vaults. */
  grants = $state.raw<Vault[]>([]);
  current = $state.raw<Vault | null>(null);
  tree = $state.raw<Tree>(EMPTY_TREE);
  /** Folders shown open in the tree. */
  expanded = $state.raw<ReadonlySet<VaultPath>>(new Set());
  /** Where "New note", "New folder" and "Import" put things. */
  folder = $state<VaultPath>(ROOT);
  /** Vaults and PDF folders whose access grant lapsed after a restart; one click re-grants it. */
  locked = $state.raw<ReadonlySet<VaultId>>(new Set());
  error = $state('');

  get supported() {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  async init() {
    const [all] = await Promise.all([listVaults(), restoreNotebookIndex()]);
    this.list = all.filter((v) => !v.pdfFolder);
    this.grants = all.filter((v) => v.pdfFolder);
    const locked = new Set<VaultId>();
    for (const v of all) if (!(await hasPermission(v.handle, 'readwrite'))) locked.add(v.id);
    this.locked = locked;
    for (const v of this.list) if (!locked.has(v.id)) void notebookIndex.scan(v);
    for (const g of this.grants) if (!locked.has(g.id)) notebookIndex.attach(g);
    const last = this.list[0];
    if (last && !locked.has(last.id)) await this.#activate(last);
  }

  /**
   * Adopts what another window changed: the vault list, grants and access, and with `changed`,
   * files inside that vault. The open vault stays open unless it was forgotten.
   */
  async reload(changed?: VaultId) {
    const [all] = await Promise.all([listVaults(), restoreNotebookIndex()]);
    const known = new Set([...this.list, ...this.grants].map((v) => v.id));
    const ids = new Set(all.map((v) => v.id));
    for (const id of known) if (!ids.has(id)) notebookIndex.forget(id);
    const locked = new Set<VaultId>();
    for (const v of all) if (!(await hasPermission(v.handle, 'readwrite'))) locked.add(v.id);
    for (const v of all) {
      if (locked.has(v.id)) continue;
      if (v.pdfFolder) notebookIndex.attach(v);
      else if (!known.has(v.id) || this.locked.has(v.id) || v.id === changed) void notebookIndex.scan(v);
    }
    const order = new Map(this.list.map((v, i) => [v.id, i]));
    this.list = all.filter((v) => !v.pdfFolder).sort((a, b) => (order.get(a.id) ?? -1) - (order.get(b.id) ?? -1));
    this.grants = all.filter((v) => v.pdfFolder);
    this.locked = locked;
    const cur = this.current;
    if (cur && !ids.has(cur.id)) this.close();
    else if (cur && (changed === cur.id || !this.tree.size)) await this.refresh();
  }

  /** Files in these vaults changed outside the Files tree: redraws the tree and tells the other windows. */
  changed(ids: readonly VaultId[]) {
    if (this.current && ids.includes(this.current.id)) void this.refresh();
    for (const id of new Set(ids)) this.#announce(id);
  }

  #announce(vault?: VaultId) {
    windows.post({ t: 'vaults', ...(vault ? { vault } : {}) });
  }

  /** Picks a folder and opens it as a vault. A folder that is already a vault is reused. */
  async add() {
    const w = window as DirPickerWindow;
    if (!w.showDirectoryPicker) return;
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await w.showDirectoryPicker({ mode: 'readwrite', id: 'estudio-vault' });
    } catch {
      return;
    }
    for (const v of this.list) {
      if (await v.handle.isSameEntry(handle)) return this.open(v);
    }
    const grant = await this.#sameAs(this.grants, handle);
    const now = Date.now();
    const v: Vault = { id: grant?.id ?? (crypto.randomUUID() as VaultId), name: handle.name, handle, addedAt: now, openedAt: now };
    this.grants = this.grants.filter((g) => g.id !== v.id);
    await putVault(v);
    this.list = [v, ...this.list];
    void notebookIndex.scan(v);
    await this.#activate(v);
    this.#announce();
  }

  /** Opens a vault, asking for access again if the grant lapsed; call from a click. */
  async open(v: Vault) {
    if (!(await this.unlock(v))) {
      this.error = `Estudio needs access to "${v.name}" to open it.`;
      return;
    }
    await this.#activate(v);
  }

  /** Asks for access to a vault or PDF folder whose grant lapsed, without switching to it; call from a click. */
  async unlock(v: Vault): Promise<boolean> {
    if (!(await askPermission(v.handle, 'readwrite'))) return false;
    if (this.locked.has(v.id)) {
      const locked = new Set(this.locked);
      locked.delete(v.id);
      this.locked = locked;
      if (v.pdfFolder) notebookIndex.attach(v);
      else await notebookIndex.scan(v);
      this.#announce();
    }
    return true;
  }

  /** A vault or a PDF folder. */
  byId(id: VaultId): Vault | undefined {
    return this.list.find((v) => v.id === id) ?? this.grants.find((g) => g.id === id);
  }

  /** The granted PDF folder holding `pdf`, and the PDF's path in it. Never prompts. */
  async folderOf(pdf: FileSystemFileHandle): Promise<NotebookLoc | undefined> {
    for (const g of this.grants) {
      const path = await pathIn(g.handle, pdf);
      if (path) return { vault: g.id, path };
    }
    return undefined;
  }

  /**
   * The folder holding `pdf`, for writing its notebook beside it: a granted PDF folder (asked for
   * again if its grant lapsed), else a folder the user picks, which is kept as a PDF folder. A
   * picked folder that does not hold the PDF grants nothing. Null when the user cancels. Call from a click.
   */
  async grantFolderOf(pdf: FileSystemFileHandle): Promise<NotebookLoc | 'elsewhere' | null> {
    const known = await this.folderOf(pdf);
    if (known) return (await this.unlock(this.byId(known.vault)!)) ? known : null;
    const w = window as DirPickerWindow;
    if (!w.showDirectoryPicker) return null;
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await w.showDirectoryPicker({ mode: 'readwrite', startIn: pdf, id: 'pdf-folder' });
    } catch {
      return null;
    }
    const path = await placeIn(handle, pdf);
    if (path === null) return 'elsewhere';
    const same = await this.#sameAs([...this.list, ...this.grants], handle);
    if (same) return (await this.unlock(same)) ? { vault: same.id, path } : null;
    const now = Date.now();
    const g: Vault = { id: crypto.randomUUID() as VaultId, name: handle.name, handle, addedAt: now, openedAt: now, pdfFolder: true };
    await putVault(g);
    this.grants = [...this.grants, g];
    notebookIndex.attach(g);
    this.#announce();
    return { vault: g.id, path };
  }

  async #sameAs(among: readonly Vault[], handle: FileSystemDirectoryHandle): Promise<Vault | undefined> {
    for (const v of among) if (await v.handle.isSameEntry(handle)) return v;
    return undefined;
  }

  async #activate(v: Vault) {
    const opened = { ...v, openedAt: Date.now() };
    await putVault(opened);
    this.list = [opened, ...this.list.filter((x) => x.id !== v.id)];
    this.current = opened;
    this.folder = ROOT;
    this.expanded = new Set();
    this.error = '';
    await this.refresh();
  }

  close() {
    this.current = null;
    this.tree = EMPTY_TREE;
  }

  async forget(v: Vault) {
    await deleteVault(v.id);
    notebookIndex.forget(v.id);
    this.list = this.list.filter((x) => x.id !== v.id);
    if (this.current?.id === v.id) this.close();
    this.#announce();
  }

  async refresh() {
    const v = this.current;
    if (!v) return;
    try {
      this.tree = buildTree(await walk(v.handle));
      if (!this.tree.has(this.folder)) this.folder = ROOT;
    } catch (e) {
      this.error = `Could not read "${v.name}": ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  toggle(path: VaultPath) {
    const next = new Set(this.expanded);
    if (!next.delete(path)) next.add(path);
    this.expanded = next;
  }

  reveal(path: VaultPath) {
    const next = new Set(this.expanded);
    for (let p = parentOf(path); p !== ROOT; p = parentOf(p)) next.add(p);
    this.expanded = next;
  }

  /** The PDF an Obsidian-style link names, looked up from the folder `fromDir` of the open vault. */
  resolvePdf(file: string, fromDir: VaultPath): VaultPath | null {
    return this.current ? resolvePdfLink(this.tree, file, fromDir) : null;
  }

  /** The vault path of a file handle, when it lies inside the open vault. */
  async locate(handle: FileSystemFileHandle): Promise<{ vault: VaultId; dir: FileSystemDirectoryHandle; name: string; path: VaultPath } | null> {
    const v = this.current;
    if (!v) return null;
    const path = await pathIn(v.handle, handle);
    return path ? { vault: v.id, dir: await dirAt(v.handle, parentOf(path)), name: nameOf(path), path } : null;
  }

  async place(path: VaultPath) {
    const { id: vault, handle: root } = this.#open();
    return { vault, handle: await fileAt(root, path), dir: await dirAt(root, parentOf(path)), name: nameOf(path), path };
  }

  #open(): Vault {
    if (!this.current) throw new Error('No vault is open');
    return this.current;
  }

  #root(): FileSystemDirectoryHandle {
    return this.#open().handle;
  }

  async #run<T>(what: string, f: () => Promise<T>): Promise<T | undefined> {
    this.error = '';
    const vault = this.current?.id;
    try {
      return await f();
    } catch (e) {
      this.error = `${what} failed: ${e instanceof Error ? e.message : String(e)}`;
      return undefined;
    } finally {
      await this.refresh();
      this.#announce(vault);
    }
  }

  #problem(dir: VaultPath, name: string, self?: VaultPath): boolean {
    const p = checkName(this.tree, dir, name, self);
    if (p) this.error = PROBLEM[p];
    return !!p;
  }

  async newFolder(dir: VaultPath, name: string) {
    if (this.#problem(dir, name)) return;
    await this.#run('New folder', async () => {
      await (await dirAt(this.#root(), dir)).getDirectoryHandle(name.trim(), { create: true });
      this.reveal(joinPath(dir, name.trim()));
      this.toggle(joinPath(dir, name.trim()));
    });
  }

  /** Creates an empty note and returns its path. */
  async newNote(dir: VaultPath, name: string): Promise<VaultPath | undefined> {
    const file = /\.md$/i.test(name.trim()) ? name.trim() : `${name.trim()}.md`;
    if (this.#problem(dir, file)) return undefined;
    return this.#run('New note', async () => {
      await writeFile(await (await dirAt(this.#root(), dir)).getFileHandle(file, { create: true }), `# ${stemOf(file)}\n\n`);
      this.reveal(joinPath(dir, file));
      return joinPath(dir, file);
    });
  }

  /** Renames an entry; a PDF's notebook is renamed with it. */
  async rename(path: VaultPath, name: string) {
    const node = this.tree.get(path);
    if (!node) return;
    const next = node.kind === 'dir' || /\.[^.]+$/.test(name.trim()) ? name.trim() : `${name.trim()}${nameOf(path).slice(stemOf(nameOf(path)).length)}`;
    if (next === node.name || this.#problem(parentOf(path), next, path)) return;
    await this.#run('Rename', async () => {
      const companions = companionsOf(this.tree, path);
      await this.#move(path, parentOf(path), next);
      for (const c of companions) await this.#move(c, parentOf(c), `${stemOf(next)}.md`);
    });
  }

  /** Moves an entry into another folder; a PDF's notebook moves with it. */
  async move(path: VaultPath, toDir: VaultPath) {
    if (!canMove(this.tree, path, toDir)) return;
    await this.#run('Move', async () => {
      const companions = companionsOf(this.tree, path).filter((c) => checkName(this.tree, toDir, nameOf(c)) === null);
      await this.#move(path, toDir, nameOf(path));
      for (const c of companions) await this.#move(c, toDir, nameOf(c));
      this.reveal(joinPath(toDir, nameOf(path)));
      if (toDir !== ROOT && !this.expanded.has(toDir)) this.toggle(toDir);
    });
  }

  async remove(path: VaultPath) {
    await this.#run('Delete', async () => {
      await removeEntry(this.#root(), path);
      notebookIndex.removed(this.#open().id, path);
    });
  }

  /** Moves or renames an entry of the open vault, keeping the notebook index in step. */
  async #move(from: VaultPath, toDir: VaultPath, name: string) {
    await moveEntry(this.#root(), from, toDir, name);
    notebookIndex.moved(this.#open().id, from, joinPath(toDir, name));
  }

  /** Copies PDFs picked from anywhere into `dir`, never overwriting. */
  async importPdfs(dir: VaultPath) {
    const w = window as DirPickerWindow;
    if (!w.showOpenFilePicker) return;
    let picked: FileSystemFileHandle[];
    try {
      picked = await w.showOpenFilePicker({ multiple: true, types: [{ description: 'PDF documents', accept: { 'application/pdf': ['.pdf'] } }] });
    } catch {
      return;
    }
    await this.importFiles(dir, await Promise.all(picked.map((h) => h.getFile())));
  }

  async importFiles(dir: VaultPath, files: readonly File[]) {
    await this.#run('Import', async () => {
      const target = await dirAt(this.#root(), dir);
      const added: string[] = [];
      for (const f of files.filter((x) => /\.pdf$/i.test(x.name))) {
        const name = uniqueName(this.tree, dir, f.name, added);
        await writeFile(await target.getFileHandle(name, { create: true }), f);
        added.push(name);
      }
      if (dir !== ROOT && !this.expanded.has(dir)) this.toggle(dir);
    });
  }
}

export const vaults = new Vaults();
