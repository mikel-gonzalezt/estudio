import { getSettings, listDocs, putSettings } from './db';
import { askPermission } from './fsaccess';
import { DEFAULT_SETTINGS, type DocRecord, type Settings, type VaultId } from './types';
import { vaults } from './vaults.svelte';
import type { VaultPath } from './vaulttree';

/** Where a file sits inside the open vault: the vault, its folder handle, its name and its vault path. */
export interface VaultPlace { vault: VaultId; dir: FileSystemDirectoryHandle; name: string; path: string }

/** `page` opens the document there instead of where reading last stopped. */
export interface PdfRequest { kind: 'pdf'; file: File; handle?: FileSystemFileHandle; place?: VaultPlace; page?: number }
export interface NoteRequest { kind: 'note'; handle: FileSystemFileHandle; place: VaultPlace }
export type OpenRequest = PdfRequest | NoteRequest;

class App {
  settings = $state<Settings>(structuredClone(DEFAULT_SETTINGS));
  docs = $state.raw<DocRecord[]>([]);
  open = $state.raw<OpenRequest | null>(null);
  error = $state('');
  ready = $state(false);
  /** Work that must finish before the page may reload, such as a PDF being written. */
  readonly #pending = new Set<Promise<unknown>>();

  async init() {
    [this.settings, this.docs] = await Promise.all([getSettings(), listDocs(), vaults.init()]);
    this.ready = true;
  }

  async refreshDocs() {
    this.docs = await listDocs();
  }

  saveSettings() {
    void putSettings(this.settings);
  }

  toggleTheme() {
    this.settings.theme = this.settings.theme === 'dark' ? 'light' : 'dark';
    this.saveSettings();
  }

  track<T>(p: Promise<T>): Promise<T> {
    this.#pending.add(p);
    void p.finally(() => this.#pending.delete(p));
    return p;
  }

  async settled() {
    while (this.#pending.size) await Promise.allSettled([...this.#pending]);
  }

  /** Opens a PDF. With a handle inside the open vault, its notebook becomes the `.md` file beside it. */
  async openFile(file: File, handle?: FileSystemFileHandle, place?: VaultPlace, page?: number) {
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      this.error = `${file.name} is not a PDF`;
      return;
    }
    this.error = '';
    const at = place ?? (handle ? await vaults.locate(handle) : null);
    this.open = { kind: 'pdf', file, ...(handle ? { handle } : {}), ...(at ? { place: at } : {}), ...(page ? { page } : {}) };
  }

  /** Opens a PDF of the open vault, at `page` when given. */
  async openVaultPdf(path: VaultPath, page?: number) {
    const { handle, ...place } = await vaults.place(path);
    await this.openFile(await handle.getFile(), handle, place, page);
  }

  openNote(handle: FileSystemFileHandle, place: VaultPlace) {
    this.error = '';
    this.open = { kind: 'note', handle, place };
  }

  /** Reopens a recent document from its stored handle, asking for write access so saves can go into the file. */
  async reopen(doc: DocRecord): Promise<boolean> {
    const h = doc.handle;
    if (!h) return false;
    try {
      if (!(await askPermission(h, 'readwrite')) && !(await askPermission(h, 'read'))) return false;
      await this.openFile(await h.getFile(), h);
      return true;
    } catch {
      return false;
    }
  }

  close() {
    this.open = null;
    void this.refreshDocs();
    void vaults.refresh();
  }
}

export const app = new App();

type LaunchParams = { files: readonly FileSystemHandle[] };
type LaunchWindow = Window & { launchQueue?: { setConsumer: (f: (p: LaunchParams) => void) => void } };

/** Opens the first PDF the operating system launched Estudio with (file association, "Open with"). */
export async function consumeLaunch({ files }: LaunchParams): Promise<void> {
  const h = files.find((f): f is FileSystemFileHandle => f.kind === 'file');
  if (h) await app.openFile(await h.getFile(), h);
}

export function listenForLaunches() {
  (window as LaunchWindow).launchQueue?.setConsumer((p) => void consumeLaunch(p));
}

type PickerWindow = Window & {
  showOpenFilePicker?: (o: object) => Promise<FileSystemFileHandle[]>;
};

export const pdfPickerTypes = [{ description: 'PDF documents', accept: { 'application/pdf': ['.pdf'] } }];

/** Uses the File System Access picker when present so the file can be saved to and reopened later. */
export async function pickPdf(fallback: HTMLInputElement): Promise<void> {
  const w = window as PickerWindow;
  if (!w.showOpenFilePicker) {
    fallback.click();
    return;
  }
  try {
    const [handle] = await w.showOpenFilePicker({ types: pdfPickerTypes, id: 'estudio-pdf' });
    if (handle) await app.openFile(await handle.getFile(), handle);
  } catch (e) {
    if ((e as DOMException).name !== 'AbortError') fallback.click();
  }
}

/** DataTransfer items are only readable synchronously inside the drop handler, so take them before awaiting. */
export async function filesFromDrop(e: DragEvent): Promise<{ file: File; handle?: FileSystemFileHandle }[]> {
  type WithHandle = DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> };
  const taken = [...(e.dataTransfer?.items ?? [])]
    .filter((i) => i.kind === 'file')
    .map((i) => ({ file: i.getAsFile(), handle: (i as WithHandle).getAsFileSystemHandle?.().catch(() => null) }));
  const out: { file: File; handle?: FileSystemFileHandle }[] = [];
  for (const { file, handle } of taken) {
    if (!file) continue;
    const h = await handle;
    out.push(h && h.kind === 'file' ? { file, handle: h as FileSystemFileHandle } : { file });
  }
  return out;
}
