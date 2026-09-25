import { baseOf, type SyncBase } from '../lib/annmerge';
import { askPermission, hasPermission } from '../lib/fsaccess';
import { syncPdf } from '../lib/pdfworker';
import type { AnnId, ColorId, FileAnnotation, StoredAnnotation } from '../lib/types';

export type SaveState =
  | { kind: 'saved' }
  | { kind: 'pending' }
  | { kind: 'saving' }
  | { kind: 'permission' }
  | { kind: 'readonly'; reason: string }
  | { kind: 'error'; message: string };

export interface SyncHost {
  local(): StoredAnnotation[];
  /** Applies changes that came from the file, bypassing undo history. */
  applyRemote(put: FileAnnotation[], del: AnnId[]): void;
  saveBase(base: SyncBase): void;
  meanings(): Record<ColorId, string>;
}

const AUTOSAVE_MS = 2500;

/**
 * Keeps the annotations inside the PDF file in step with Estudio. IndexedDB stays the durable
 * copy; the file is rewritten a few seconds after the last edit and whenever the reader leaves.
 * Every save re-reads the file and merges first, so edits made by other apps are never clobbered.
 */
export class FileSync {
  state = $state.raw<SaveState>({ kind: 'saved' });
  readonly handle: FileSystemFileHandle;
  #base: SyncBase;
  readonly #host: SyncHost;
  #edits = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #chain: Promise<void> = Promise.resolve();

  constructor(handle: FileSystemFileHandle, base: SyncBase, host: SyncHost, state: SaveState = { kind: 'saved' }) {
    this.handle = handle;
    this.#base = base;
    this.#host = host;
    this.state = state;
  }

  get readonly() {
    return this.state.kind === 'readonly';
  }

  touch() {
    if (this.readonly) return;
    this.#edits++;
    if (this.state.kind !== 'permission') this.state = { kind: 'pending' };
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.save(), AUTOSAVE_MS);
  }

  /** Saves now if anything is waiting; safe to call repeatedly. */
  save(): Promise<void> {
    clearTimeout(this.#timer);
    this.#chain = this.#chain.then(() => this.#run());
    return this.#chain;
  }

  /** Grants write access from a click, then saves. */
  async allow() {
    if (await askPermission(this.handle, 'readwrite')) await this.save();
  }

  async #run() {
    if (this.readonly || this.state.kind === 'saved') return;
    const edits = this.#edits;
    const writable = await hasPermission(this.handle, 'readwrite');
    if (writable) this.state = { kind: 'saving' };
    try {
      const bytes = await (await this.handle.getFile()).arrayBuffer();
      const r = await syncPdf({ bytes, base: this.#base, local: this.#host.local(), write: writable, meanings: this.#host.meanings() });
      if (r.encrypted) {
        this.state = { kind: 'readonly', reason: 'This PDF is encrypted, so annotations stay in Estudio only.' };
        return;
      }
      this.#host.applyRemote(r.merge.toLocal.put, r.merge.toLocal.del);
      if (r.out) {
        const w = await this.handle.createWritable();
        await w.write(r.out as Uint8Array<ArrayBuffer>);
        await w.close();
      }
      if (r.merge.toRemote && !r.out) {
        this.state = { kind: 'permission' };
        return;
      }
      this.#base = baseOf(r.merge.result);
      this.#host.saveBase(this.#base);
      if (this.#edits === edits) this.state = { kind: 'saved' };
      else this.touch();
    } catch (e) {
      this.state = { kind: 'error', message: e instanceof Error ? e.message : String(e) };
    }
  }
}
