import { baseOf } from '../lib/annmerge';
import { app, type PdfRequest } from '../lib/app.svelte';
import { annotationsFor, getDoc, putDoc, writeAnnotations } from '../lib/db';
import { syncPdf } from '../lib/pdfworker';
import type { AnnId, DocId, DocRecord, FileAnnotation, StoredAnnotation } from '../lib/types';
import { FileSync, type SaveState, type SyncHost } from './filesync.svelte';
import { loadPdf, pageInfo } from './pdf';
import { Reader } from './session.svelte';
import { findNotebook } from './study.svelte';

function syncHost(r: Reader): SyncHost {
  return {
    local: () => [...r.ann.items.values()],
    applyRemote: (put: FileAnnotation[], del: AnnId[]) => r.ann.applyExternal(put, del),
    saveBase: (base) => {
      r.doc.syncBase = base;
      void r.save();
    },
    meanings: () => app.settings.meanings,
  };
}

export interface Opened { reader: Reader; isNew: boolean }

/**
 * Loads a PDF and its study data. With a file handle, the annotations stored inside the PDF are
 * merged with Estudio's copy and the file becomes the place annotations are saved to.
 */
export async function openDocument(request: PdfRequest): Promise<Opened> {
  const { file, handle } = request;
  const bytes = await file.arrayBuffer();
  const pdf = await loadPdf(handle ? bytes.slice(0) : bytes);
  const id = (pdf.fingerprints[0] ?? `${file.name}:${file.size}`) as DocId;
  const [info, meta, existing, stored] = await Promise.all([
    Promise.all(Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1).then(pageInfo))),
    pdf.getMetadata().catch(() => null),
    getDoc(id),
    annotationsFor(id),
  ]);
  const now = Date.now();
  const metaTitle = (meta?.info as { Title?: string } | undefined)?.Title?.trim();
  const doc: DocRecord = existing
    ? { ...existing, fileName: file.name, openedAt: now }
    : {
        id, title: metaTitle || file.name.replace(/\.pdf$/i, ''), fileName: file.name, pageCount: pdf.numPages,
        lastPage: 1, lastZoom: 1, pagesSeen: [1], addedAt: now, openedAt: now, readingMs: 0,
      };

  if (request.page) doc.lastPage = Math.min(Math.max(1, request.page), pdf.numPages);

  let annotations: StoredAnnotation[] = stored;
  let state: SaveState = { kind: 'saved' };
  let behind = false;
  if (handle) {
    const same = existing?.handle ? await existing.handle.isSameEntry(handle).catch(() => false) : false;
    doc.syncBase = same ? existing?.syncBase ?? {} : {};
    doc.handle = handle;
    try {
      const r = await syncPdf({ bytes, base: doc.syncBase, local: stored, write: false, meanings: app.settings.meanings });
      if (r.encrypted) state = { kind: 'readonly', reason: 'This PDF is encrypted, so annotations stay in Estudio only.' };
      else {
        const withDoc = (a: FileAnnotation): StoredAnnotation => ({ ...a, docId: id });
        await writeAnnotations(r.merge.toLocal.put.map(withDoc), r.merge.toLocal.del);
        annotations = r.merge.result.map(withDoc);
        for (const objectId of r.objectIds) pdf.annotationStorage.setValue(objectId, { noView: true });
        behind = r.merge.toRemote;
        if (!behind) doc.syncBase = baseOf(r.merge.result);
      }
    } catch (e) {
      state = { kind: 'readonly', reason: `Estudio could not read this PDF's annotations (${e instanceof Error ? e.message : String(e)}), so it will not write to it.` };
    }
  }
  await putDoc(doc);
  const reader = new Reader(pdf, info, doc, annotations, request, await findNotebook(id, file.name, request.place));
  if (handle) {
    reader.sync = new FileSync(handle, doc.syncBase ?? {}, syncHost(reader), state);
    if (behind) reader.sync.touch();
  }
  await reader.study.load();
  return { reader, isNew: !existing };
}
