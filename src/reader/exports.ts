import { app } from '../lib/app.svelte';
import { download, safeName } from '../lib/download';
import { exportMarkdown } from '../lib/export/markdown';
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

export async function exportPdfFile(r: Reader) {
  const [{ exportAnnotatedPdf }, bytes] = await Promise.all([import('../lib/export/pdf'), r.file.arrayBuffer()]);
  const out = await exportAnnotatedPdf(bytes, r.ann.sorted, app.settings.meanings);
  download(out as Uint8Array<ArrayBuffer>, `${safeName(r.doc.fileName.replace(/\.pdf$/i, ''))} (annotated).pdf`, 'application/pdf');
}
