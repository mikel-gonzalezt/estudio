import type { NoteFiles } from '../lib/attachments';
import { splitFrontmatter } from '../lib/frontmatter';
import { hydrateNotes } from '../lib/hydrate';
import { renderMarkdown } from '../lib/notebook';
import '../styles/notes.css';
import '../styles/print.css';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Prints the notebook as a document: images, tables and typeset maths in place, page links as
 * "p. 12". The browser's print dialog offers "Save as PDF".
 */
export async function printNotes(title: string, markdown: string, files: NoteFiles): Promise<void> {
  document.getElementById('print-notes')?.remove();
  const root = document.createElement('article');
  root.id = 'print-notes';
  root.className = 'notes-html';
  root.innerHTML = `<h1 class="print-title">${escapeHtml(title)}</h1>${renderMarkdown(splitFrontmatter(markdown).body, { plainLinks: true })}`;
  document.body.append(root);
  document.body.classList.add('printing-notes');
  await hydrateNotes(root, files);
  const title0 = document.title;
  document.title = `${title} (notes)`;
  const done = () => {
    root.remove();
    document.body.classList.remove('printing-notes');
    document.title = title0;
  };
  window.addEventListener('afterprint', done, { once: true });
  window.print();
}
