import { imageUrl, type NoteFiles } from './attachments';
import { renderMath } from './katex';

/**
 * Finishes HTML from `renderMarkdown`: local images get their bytes through the note's files,
 * and maths is typeset. Resolves when every image and formula is in place.
 */
export async function hydrateNotes(root: HTMLElement, files: NoteFiles | null): Promise<void> {
  const work: Promise<unknown>[] = [];
  for (const img of root.querySelectorAll<HTMLImageElement>('img[data-src]')) {
    const src = img.dataset.src!;
    img.removeAttribute('data-src');
    img.dataset.ref = src;
    work.push((files ? imageUrl(files, src) : Promise.resolve(null)).then((url) => {
      if (url) {
        img.src = url;
        return img.decode().catch(() => undefined);
      }
      img.classList.add('missing');
      img.alt = img.alt || `Missing image: ${src}`;
      return undefined;
    }));
  }
  for (const el of root.querySelectorAll<HTMLElement>('.math[data-latex]')) {
    work.push(renderMath(el, el.dataset.latex!, el.classList.contains('math-display')));
  }
  await Promise.all(work);
}
