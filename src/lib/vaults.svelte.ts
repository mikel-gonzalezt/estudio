import { deleteVault, listVaults, putVault } from './db';
import { askPermission, hasPermission } from './fsaccess';
import type { Vault, VaultId } from './types';
import { dirAt, fileAt, moveEntry, pathIn, removeEntry, walk, writeFile } from './vault';
import {
  EMPTY_TREE, ROOT, buildTree, canMove, checkName, companionsOf, joinPath, nameOf, parentOf, resolvePdfLink, stemOf, uniqueName,
  type NameProblem, type Tree, type VaultPath,
} from './vaulttree';

type DirPickerWindow = Window & {
  showDirectoryPicker?: (o: object) => Promise<FileSystemDirectoryHandle>;
  showOpenFilePicker?: (o: object) => Promise<FileSystemFileHandle[]>;
};

const PROBLEM: Record<NameProblem, string> = {
  empty: 'A name is required.',
  invalid: 'Names cannot start with a dot or contain \\ / : * ? " < > |.',
  taken: 'Something with that name is already there.',
};

class Vaults {
  list = $state.raw<Vault[]>([]);
  current = $state.raw<Vault | null>(null);
  tree = $state.raw<Tree>(EMPTY_TREE);
  /** Folders shown open in the tree. */
  expanded = $state.raw<ReadonlySet<VaultPath>>(new Set());
  /** Where "New note", "New folder" and "Import" put things. */
  folder = $state<VaultPath>(ROOT);
  /** Vaults whose access grant lapsed after a restart; one click re-grants it. */
  locked = $state.raw<ReadonlySet<VaultId>>(new Set());
  error = $state('');

  get supported() {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  async init() {
    this.list = await listVaults();
    const locked = new Set<VaultId>();
    for (const v of this.list) if (!(await hasPermission(v.handle, 'readwrite'))) locked.add(v.id);
    this.locked = locked;
    const last = this.list[0];
    if (last && !locked.has(last.id)) await this.#activate(last);
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
    const now = Date.now();
    const v: Vault = { id: crypto.randomUUID() as VaultId, name: handle.name, handle, addedAt: now, openedAt: now };
    await putVault(v);
    this.list = [v, ...this.list];
    await this.#activate(v);
  }

  /** Opens a vault, asking for access again if the grant lapsed; call from a click. */
  async open(v: Vault) {
    if (!(await askPermission(v.handle, 'readwrite'))) {
      this.error = `Estudio needs access to "${v.name}" to open it.`;
      return;
    }
    const locked = new Set(this.locked);
    locked.delete(v.id);
    this.locked = locked;
    await this.#activate(v);
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
    this.list = this.list.filter((x) => x.id !== v.id);
    if (this.current?.id === v.id) this.close();
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
    try {
      return await f();
    } catch (e) {
      this.error = `${what} failed: ${e instanceof Error ? e.message : String(e)}`;
      return undefined;
    } finally {
      await this.refresh();
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
      await moveEntry(this.#root(), path, parentOf(path), next);
      for (const c of companions) await moveEntry(this.#root(), c, parentOf(c), `${stemOf(next)}.md`);
    });
  }

  /** Moves an entry into another folder; a PDF's notebook moves with it. */
  async move(path: VaultPath, toDir: VaultPath) {
    if (!canMove(this.tree, path, toDir)) return;
    await this.#run('Move', async () => {
      const companions = companionsOf(this.tree, path).filter((c) => checkName(this.tree, toDir, nameOf(c)) === null);
      await moveEntry(this.#root(), path, toDir, nameOf(path));
      for (const c of companions) await moveEntry(this.#root(), c, toDir, nameOf(c));
      this.reveal(joinPath(toDir, nameOf(path)));
      if (toDir !== ROOT && !this.expanded.has(toDir)) this.toggle(toDir);
    });
  }

  async remove(path: VaultPath) {
    await this.#run('Delete', () => removeEntry(this.#root(), path));
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
