import { mergeAnnotations, type MergeResult, type SyncBase } from './annmerge';
import { openPdf, readDoc, writeDoc } from './pdfannots';
import type { ColorId, FileAnnotation } from './types';

export interface SyncRequest {
  bytes: ArrayBuffer;
  base: SyncBase;
  local: FileAnnotation[];
  write: boolean;
  meanings: Record<ColorId, string>;
}

export interface SyncReply {
  encrypted: boolean;
  merge: MergeResult<FileAnnotation>;
  objectIds: string[];
  /** The new file contents, when `write` was set and the file needed them. */
  out: Uint8Array | null;
}

async function sync(req: SyncRequest): Promise<SyncReply> {
  const source = new Uint8Array(req.bytes);
  const doc = await openPdf(source);
  const read = readDoc(doc);
  if (read.encrypted) return { encrypted: true, merge: { result: req.local, toLocal: { put: [], del: [] }, toRemote: false }, objectIds: [], out: null };
  const merge = mergeAnnotations(req.base, req.local, read.annotations);
  let out: Uint8Array | null = null;
  if (req.write && merge.toRemote) {
    writeDoc(doc, source, merge.result, req.meanings);
    out = await doc.save();
  }
  return { encrypted: false, merge, objectIds: read.objectIds, out };
}

self.onmessage = async (e: MessageEvent<{ id: number; req: SyncRequest }>) => {
  const { id, req } = e.data;
  try {
    const value = await sync(req);
    (self as unknown as Worker).postMessage({ id, value }, value.out ? [value.out.buffer] : []);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
