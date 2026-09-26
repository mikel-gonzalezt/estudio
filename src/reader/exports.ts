import { mergeAnnotations } from '../lib/annmerge';
import { app } from '../lib/app.svelte';
import { download, safeName } from '../lib/download';
import { exportMarkdown, exportNotes } from '../lib/export/markdown';
import type { Reader } from './session.svelte';

export function exportMarkdownFile(r: Reader) {
  const md = exportMarkdown({
    doc: r.doc,
    annotations: r.ann.sorted,
    notebook: r.study.notebook.markdown,
    cards: r.study.cards,
    meanings: app.settings.meanings,
    exportedAt: new Date(),
  });
  download(md, `${safeName(r.doc.title)}.md`, 'text/markdown');
}

export function exportNotesFile(r: Reader) {
  download(exportNotes(r.study.notebook.markdown), `${safeName(r.doc.title)} (notes).md`, 'text/markdown');
}

/** The notebook as a print-styled page; the print dialog's "Save as PDF" makes the file. */
export async function printNotesFile(r: Reader) {
  const { printNotes } = await import('./printnotes');
  await r.study.notebook.flush();
  await printNotes(r.doc.title, r.study.notebook.markdown, r.study.notebook.files);
}

/** A copy of the PDF with the annotations inside. Annotations another app left in the file are kept. */
export async function exportPdfFile(r: Reader) {
  const [{ readAnnotations, writeAnnotations }, bytes] = await Promise.all([import('../lib/pdfannots'), r.bytes()]);
  const own = r.ann.sorted;
  const anns = r.sync ? own : mergeAnnotations({}, own, (await readAnnotations(bytes)).annotations).result;
  const out = await writeAnnotations(bytes, anns, app.settings.meanings);
  download(out as Uint8Array<ArrayBuffer>, `${safeName(r.doc.fileName.replace(/\.pdf$/i, ''))} (annotated).pdf`, 'application/pdf');
}
