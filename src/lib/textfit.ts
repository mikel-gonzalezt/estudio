import type { TextRun } from './citation';
import type { Rect } from './types';
import type { Size } from './geometry';

export const FULL_PAGE: Rect = { x: 0, y: 0, w: 1, h: 1 };

/** Union of the non-blank text runs on a page, clamped to the page; the whole page when there is no text. */
export function textBounds(runs: readonly TextRun[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of runs) {
    if (!r.str.trim() || r.w <= 0 || r.h <= 0) continue;
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(1, x1);
  y1 = Math.min(1, y1);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : FULL_PAGE;
}

/** Scale at which `bounds` (normalised, display orientation) spans the viewport width less `pad` px. */
export const fitTextScale = (bounds: Rect, page: Size, viewportWidth: number, pad: number) =>
  Math.max(1, viewportWidth - pad) / (bounds.w * page.w);

/** scrollLeft that centres `bounds` in the viewport, given where the page's left edge sits in the scrolled content. */
export function centredScrollLeft(pageLeft: number, bounds: Rect, pageWidthPx: number, viewportWidth: number): number {
  return Math.max(0, pageLeft + (bounds.x + bounds.w / 2) * pageWidthPx - viewportWidth / 2);
}
