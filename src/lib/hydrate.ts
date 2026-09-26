import { imageSource, imageUrl, loadRemote, remoteImageLabel, remoteLoaded, type NoteFiles } from './attachments';
import { renderMath } from './katex';

/**
 * Shows the note image `src` in `img`. A remote image the user has not loaded yet stays hidden
 * behind a "Remote image: host · Load" placeholder put just before `img`. Resolves false when
 * the image is missing or may not load.
 */
export async function showNoteImage(img: HTMLImageElement, src: string, files: NoteFiles | null): Promise<boolean> {
  const source = imageSource(src);
  if (source.kind === 'remote') {
    img.referrerPolicy = 'no-referrer';
    if (!remoteLoaded(src)) {
      img.style.display = 'none';
      img.before(remotePlaceholder(source.host, src, () => {
        img.style.display = '';
        img.src = src;
      }));
      return true;
    }
  }
  const url = await imageUrl(files, src);
  if (!url) return false;
  img.src = url;
  return true;
}

function remotePlaceholder(host: string, src: string, load: () => void): HTMLElement {
  const box = document.createElement('span');
  box.className = 'remote-img';
  box.contentEditable = 'false';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Load';
  button.title = `Load ${src}`;
  const action = document.createElement('span');
  action.className = 'remote-img-load';
  action.append(' · ', button);
  box.append(remoteImageLabel(host), action);
  button.addEventListener('mousedown', (e) => e.stopPropagation());
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    loadRemote(src);
    box.remove();
    load();
  });
  return box;
}

/**
 * Finishes HTML from `renderMarkdown`: images get their bytes through the note's files, remote
 * ones wait for a click, and maths is typeset. Resolves when every image and formula is in place.
 */
export async function hydrateNotes(root: HTMLElement, files: NoteFiles | null): Promise<void> {
  const work: Promise<unknown>[] = [];
  for (const img of root.querySelectorAll<HTMLImageElement>('img[data-src]')) {
    const src = img.dataset.src!;
    img.removeAttribute('data-src');
    img.dataset.ref = src;
    work.push(showNoteImage(img, src, files).then((shown) => {
      if (shown) return img.src ? img.decode().catch(() => undefined) : undefined;
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
