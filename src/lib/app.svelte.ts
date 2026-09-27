import { getSettings, listDocs, patchSettings } from './db';
import { askPermission } from './fsaccess';
import { diff, isEmpty } from './patch';
import { DEFAULT_SETTINGS, type DocRecord, type Settings, type VaultId } from './types';
import { vaults } from './vaults.svelte';
import type { VaultPath } from './vaulttree';
import { ALREADY_OPEN, routeLaunch, windows, type WindowId } from './windows';

/** Where a file sits inside the open vault: the vault, its folder handle, its name and its vault path. */
export interface VaultPlace { vault: VaultId; dir: FileSystemDirectoryHandle; name: string; path: string }

/**
 * `page` opens the document there instead of where reading last stopped. `from` is the window that
 * asked this one to open the file; it hears back if the document turns out to be open elsewhere.
 */
export interface PdfRequest { kind: 'pdf'; file: File; handle?: FileSystemFileHandle; place?: VaultPlace; page?: number; from?: WindowId }
export interface NoteRequest { kind: 'note'; handle: FileSystemFileHandle; place: VaultPlace }
export type OpenRequest = PdfRequest | NoteRequest;

export interface OpenOptions { place?: VaultPlace; page?: number; from?: WindowId }

/** A new window the browser did not open (a blocked pop-up); a click opens it. */
export interface StalledWindow { name: string; retry: () => void }

const NOTICE_MS = 4000;

class App {
  settings = $state<Settings>(structuredClone(DEFAULT_SETTINGS));
  docs = $state.raw<DocRecord[]>([]);
  open = $state.raw<OpenRequest | null>(null);
  error = $state('');
  ready = $state(false);
  /** A short message that fades, such as "Already open in another window". */
  notice = $state('');
  stalled = $state.raw<StalledWindow[]>([]);
  #noticeTimer: ReturnType<typeof setTimeout> | undefined;
  /** The settings as this window last read or wrote them; a save writes only what differs. */
  #saved: Settings = structuredClone(DEFAULT_SETTINGS);
  /** Work that must finish before the page may reload, such as a PDF being written. */
  readonly #pending = new Set<Promise<unknown>>();

  async init() {
    windows.on((m) => {
      if (m.t === 'settings') this.#adoptSettings(m.put);
      else if (m.t === 'notice') this.notify(m.text);
      else if (m.t === 'docs' && !this.open) void this.refreshDocs();
      else if (m.t === 'vaults') void vaults.reload(m.vault);
    });
    [this.settings, this.docs] = await Promise.all([getSettings(), listDocs(), vaults.init()]);
    this.#saved = $state.snapshot(this.settings);
    this.ready = true;
  }

  async refreshDocs() {
    this.docs = await listDocs();
  }

  /** Saves the settings this window changed and tells the other windows. */
  saveSettings() {
    const now = $state.snapshot(this.settings);
    const { put } = diff(this.#saved, now);
    this.#saved = now;
    if (isEmpty({ put, del: [] })) return;
    void patchSettings(put).then(() => windows.post({ t: 'settings', put }));
  }

  #adoptSettings(put: Partial<Settings>) {
    Object.assign(this.settings, put);
    this.#saved = { ...this.#saved, ...structuredClone(put) };
  }

  toggleTheme() {
    this.settings.theme = this.settings.theme === 'dark' ? 'light' : 'dark';
    this.saveSettings();
  }

  notify(text: string) {
    this.notice = text;
    clearTimeout(this.#noticeTimer);
    this.#noticeTimer = setTimeout(() => (this.notice = ''), NOTICE_MS);
  }

  track<T>(p: Promise<T>): Promise<T> {
    this.#pending.add(p);
    void p.finally(() => this.#pending.delete(p));
    return p;
  }

  async settled() {
    while (this.#pending.size) await Promise.allSettled([...this.#pending]);
  }

  /**
   * Opens a PDF here. With a handle inside the open vault, its notebook becomes the `.md` file
   * beside it. A document another window shows is brought forward there instead.
   */
  async openFile(file: File, handle?: FileSystemFileHandle, { place, page, from }: OpenOptions = {}) {
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      this.error = `${file.name} is not a PDF`;
      return;
    }
    this.error = '';
    if (handle && (await this.#shownElsewhere(handle))) return;
    const at = place ?? (handle ? await vaults.locate(handle) : null);
    this.open = { kind: 'pdf', file, ...(handle ? { handle } : {}), ...(at ? { place: at } : {}), ...(page ? { page } : {}), ...(from ? { from } : {}) };
  }

  /** True when another window shows the file; that window is asked to come forward. */
  async #shownElsewhere(handle: FileSystemFileHandle): Promise<boolean> {
    const where = await windows.whereFile(handle);
    if (where.kind !== 'elsewhere') return false;
    windows.focus(where.doc);
    this.notify(ALREADY_OPEN);
    return true;
  }

  /** Opens a PDF in a new Estudio window. A document already shown in a window is brought forward instead. */
  async openInNewWindow(handle: FileSystemFileHandle, page?: number) {
    const where = await windows.whereFile(handle);
    if (where.kind === 'here') return;
    if (where.kind === 'elsewhere') {
      windows.focus(where.doc);
      this.notify(ALREADY_OPEN);
      return;
    }
    await windows.openWindow(handle, page, (retry) => {
      const w = { name: handle.name, retry };
      this.stalled = [...this.stalled, w];
      return () => (this.stalled = this.stalled.filter((x) => x !== w));
    });
  }

  /** Opens a recent document in a new window, asking for access first so the new window can read the file. */
  async openDocInNewWindow(doc: DocRecord) {
    const h = doc.handle;
    if (!h) {
      this.notify(`"${doc.title}" was opened without access to its file, so it can only open in this window.`);
      return;
    }
    if (!(await askPermission(h, 'readwrite')) && !(await askPermission(h, 'read'))) return;
    await this.openInNewWindow(h);
  }

  /** Opens a PDF of the open vault, at `page` when given. */
  async openVaultPdf(path: VaultPath, page?: number) {
    const { handle, ...place } = await vaults.place(path);
    await this.openFile(await handle.getFile(), handle, { place, ...(page ? { page } : {}) });
  }

  /** Opens the file another window opened this window for, if any. */
  async consumeHandoff() {
    const h = await windows.claim();
    if (!h) return;
    try {
      await this.openFile(await h.handle.getFile(), h.handle, { from: h.from as WindowId, ...(h.page ? { page: h.page } : {}) });
    } catch (e) {
      this.error = `Could not open ${h.handle.name}: ${e instanceof Error ? e.message : String(e)}`;
    }
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

/**
 * Opens the PDFs the operating system launched Estudio with (file association, "Open with"). An
 * open document is never replaced: the files go to new windows, except the first when this window
 * shows the library.
 */
export async function consumeLaunch({ files }: LaunchParams): Promise<void> {
  const pdfs = files.filter((f): f is FileSystemFileHandle => f.kind === 'file');
  const { here, windows: elsewhere } = routeLaunch(pdfs, !app.open);
  await Promise.all([
    here && here.getFile().then((f) => app.openFile(f, here)),
    ...elsewhere.map((h) => app.openInNewWindow(h)),
  ]);
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
