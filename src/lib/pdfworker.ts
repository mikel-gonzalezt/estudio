import type { SyncReply, SyncRequest } from './pdfannots.worker';

let worker: Worker | undefined;
let seq = 0;
const pending = new Map<number, { resolve: (v: SyncReply) => void; reject: (e: Error) => void }>();

function start(): Worker {
  const w = new Worker(new URL('./pdfannots.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<{ id: number; value?: SyncReply; error?: string }>) => {
    const p = pending.get(e.data.id);
    pending.delete(e.data.id);
    if (e.data.value) p?.resolve(e.data.value);
    else p?.reject(new Error(e.data.error ?? 'PDF worker failed'));
  };
  return w;
}

/**
 * Reads the annotations in `req.bytes`, merges them with the local ones and, when `req.write` is
 * set and the file is behind, produces the rewritten file. Runs off the main thread: pdf-lib
 * parses and serialises the whole document.
 */
export function syncPdf(req: SyncRequest): Promise<SyncReply> {
  worker ??= start();
  const id = ++seq;
  const plain: SyncRequest = { ...req, local: JSON.parse(JSON.stringify(req.local)), meanings: { ...req.meanings } };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ id, req: plain }, [plain.bytes]);
  });
}
