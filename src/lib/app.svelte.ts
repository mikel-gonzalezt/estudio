import { getSettings, listDocs, putSettings } from './db';
import { DEFAULT_SETTINGS, type DocRecord, type Settings } from './types';

export interface OpenRequest { file: File; handle?: FileSystemFileHandle }

class App {
  settings = $state<Settings>(structuredClone(DEFAULT_SETTINGS));
  docs = $state.raw<DocRecord[]>([]);
  open = $state.raw<OpenRequest | null>(null);
  error = $state('');
  ready = $state(false);

  async init() {
    [this.settings, this.docs] = await Promise.all([getSettings(), listDocs()]);
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

  openFile(file: File, handle?: FileSystemFileHandle) {
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      this.error = `${file.name} is not a PDF`;
      return;
    }
    this.error = '';
    this.open = handle ? { file, handle } : { file };
  }

  async reopen(doc: DocRecord): Promise<boolean> {
    const h = doc.handle;
    if (!h) return false;
    type Permissioned = FileSystemFileHandle & {
      queryPermission?: (o: object) => Promise<PermissionState>;
      requestPermission?: (o: object) => Promise<PermissionState>;
    };
    const ph = h as Permissioned;
    try {
      const opts = { mode: 'read' };
      if ((await ph.queryPermission?.(opts)) !== 'granted' && (await ph.requestPermission?.(opts)) !== 'granted') return false;
      this.openFile(await h.getFile(), h);
      return true;
    } catch {
      return false;
    }
  }

  close() {
    this.open = null;
    void this.refreshDocs();
  }
}

export const app = new App();

type PickerWindow = Window & {
  showOpenFilePicker?: (o: object) => Promise<FileSystemFileHandle[]>;
};

/** Uses the File System Access picker when present so the file can be reopened from the library later. */
export async function pickPdf(fallback: HTMLInputElement): Promise<void> {
  const w = window as PickerWindow;
  if (!w.showOpenFilePicker) {
    fallback.click();
    return;
  }
  try {
    const [handle] = await w.showOpenFilePicker({
      types: [{ description: 'PDF documents', accept: { 'application/pdf': ['.pdf'] } }],
    });
    if (handle) app.openFile(await handle.getFile(), handle);
  } catch (e) {
    if ((e as DOMException).name !== 'AbortError') fallback.click();
  }
}

/** DataTransfer items are only readable synchronously inside the drop handler, so take them before awaiting. */
export async function filesFromDrop(e: DragEvent): Promise<OpenRequest[]> {
  type WithHandle = DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> };
  const taken = [...(e.dataTransfer?.items ?? [])]
    .filter((i) => i.kind === 'file')
    .map((i) => ({ file: i.getAsFile(), handle: (i as WithHandle).getAsFileSystemHandle?.().catch(() => null) }));
  const out: OpenRequest[] = [];
  for (const { file, handle } of taken) {
    if (!file) continue;
    const h = await handle;
    out.push(h && h.kind === 'file' ? { file, handle: h as FileSystemFileHandle } : { file });
  }
  return out;
}
