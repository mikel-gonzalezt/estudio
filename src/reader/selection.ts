import { mergeLineRects, normaliseRect, rectDisplayToPage } from '../lib/geometry';
import type { Rect } from '../lib/types';
import type { PageInfo } from './pdf';

export interface SelectionPart { page: number; rects: Rect[]; text: string }

/**
 * Text of a range inside a pdf.js text layer. `Range.toString()` drops the <br> line breaks
 * pdf.js inserts, gluing words across lines; this restores them and rejoins hyphenated breaks.
 */
export function rangeText(range: Range, root: Node): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let out = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!range.intersectsNode(node)) continue;
    if (node.nodeName === 'BR') {
      out = out.endsWith('-') ? out.slice(0, -1) : `${out} `;
      continue;
    }
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const text = node.textContent ?? '';
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : text.length;
    out += text.slice(start, end);
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Splits the current window selection into one part per page, in page space. */
export function captureSelection(scroller: HTMLElement, info: readonly PageInfo[]): SelectionPart[] {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return [];
  const range = sel.getRangeAt(0);
  const parts: SelectionPart[] = [];
  for (const pageEl of scroller.querySelectorAll<HTMLElement>('.page')) {
    const layer = pageEl.querySelector('.textLayer');
    if (!layer || !range.intersectsNode(layer)) continue;
    const page = Number(pageEl.dataset.page);
    const sub = document.createRange();
    sub.selectNodeContents(layer);
    if (layer.contains(range.startContainer)) sub.setStart(range.startContainer, range.startOffset);
    if (layer.contains(range.endContainer)) sub.setEnd(range.endContainer, range.endOffset);
    const box = pageEl.getBoundingClientRect();
    const rot = info[page - 1]!.rotation;
    const display = [...sub.getClientRects()].map((r) => normaliseRect(r, box));
    const rects = mergeLineRects(display).map((r) => rectDisplayToPage(r, rot));
    const text = rangeText(sub, layer);
    if (rects.length && text) parts.push({ page, rects, text });
  }
  return parts;
}
