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

/**
 * Client-space rects for character ranges of a rendered text layer, one merged list per range.
 * Offsets index the string built by `pageText` (items joined, a space per <br>).
 */
export function textLayerRanges(layer: HTMLElement, ranges: readonly (readonly [number, number])[]): Rect[][] {
  const box = layer.getBoundingClientRect();
  const nodes: { node: Node; start: number }[] = [];
  let pos = 0;
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeName === 'BR') pos += 1;
    else if (n.nodeType === Node.TEXT_NODE) {
      nodes.push({ node: n, start: pos });
      pos += n.textContent?.length ?? 0;
    }
  }
  const locate = (offset: number): [Node, number] | null => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const { node, start } = nodes[i]!;
      if (offset >= start) return [node, Math.min(offset - start, node.textContent?.length ?? 0)];
    }
    return null;
  };
  return ranges.map(([s, e]) => {
    const a = locate(s);
    const b = locate(e);
    if (!a || !b) return [];
    const r = document.createRange();
    r.setStart(a[0], a[1]);
    r.setEnd(b[0], b[1]);
    return mergeLineRects([...r.getClientRects()].map((c) => normaliseRect(c, box)));
  });
}
