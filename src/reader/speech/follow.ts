import { textLayerRanges } from '../selection';
import type { Reader } from '../session.svelte';
import type { Rect } from '../../lib/types';

/** Auto-scroll holds off this long after the reader scrolls by hand. */
const USER_SCROLL_GRACE_MS = 4000;
/** A scroll event this soon after our own scroll is ours. */
const OWN_SCROLL_MS = 250;
/** The spoken sentence is kept between these fractions of the viewport height. */
const BAND = { top: 0.1, bottom: 0.8 };

const isFollowing = (node: Node, target: Node | null, container: Node) =>
  target ? target === node || target.contains(node) || !!(target.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)
    : !container.contains(node) && !!(container.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);

/**
 * Offset of a DOM point inside a text layer, in the page string `textLayerRanges` indexes
 * (items joined, one character per <br>).
 */
export function layerOffset(layer: HTMLElement, node: Node, offset: number): number {
  const target = node.nodeType === Node.TEXT_NODE ? null : (node.childNodes[offset] ?? null);
  let pos = 0;
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n === node && n.nodeType === Node.TEXT_NODE) return pos + offset;
    if (node.nodeType !== Node.TEXT_NODE && n.nodeType === Node.TEXT_NODE && isFollowing(n, target, node)) return pos;
    if (n.nodeName === 'BR') pos += 1;
    else if (n.nodeType === Node.TEXT_NODE) pos += n.textContent?.length ?? 0;
  }
  return pos;
}

export interface PagePoint { page: number; offset: number }

/** The page and text offset of a DOM point on a page's text layer, or null off the text. */
export function pagePoint(node: Node, offset: number): PagePoint | null {
  const el = node instanceof Element ? node : node.parentElement;
  const layer = el?.closest<HTMLElement>('.textLayer');
  const page = Number(layer?.closest<HTMLElement>('.page')?.dataset.page);
  return layer && page ? { page, offset: layerOffset(layer, node, offset) } : null;
}

/** The text-layer point under a click, snapping to the start of the span hit when the caret lands elsewhere. */
export function pointAt(x: number, y: number, target: EventTarget | null): PagePoint | null {
  const caret = document.caretPositionFromPoint?.(x, y);
  const hit = caret ? pagePoint(caret.offsetNode, caret.offset) : null;
  if (hit) return hit;
  const span = target instanceof Element ? target.closest('.textLayer span') : null;
  return span ? pagePoint(span, 0) : null;
}

/** Draws the spoken sentence over the text layer and keeps it in view unless the reader scrolled away. */
export class Follower {
  readonly #reader: Reader;
  readonly #scroller: HTMLElement | undefined;
  #box: HTMLElement | null = null;
  #waiting: MutationObserver | null = null;
  #userScrollAt = 0;
  #ownScrollAt = 0;

  constructor(reader: Reader) {
    this.#reader = reader;
    this.#scroller = reader.scroller;
    this.#scroller?.addEventListener('scroll', this.#onScroll, { passive: true });
  }

  #onScroll = () => {
    if (Date.now() - this.#ownScrollAt > OWN_SCROLL_MS) this.#userScrollAt = Date.now();
  };

  get #following() {
    return Date.now() - this.#userScrollAt > USER_SCROLL_GRACE_MS;
  }

  #scroll(page: number, y: number) {
    const el = this.#scroller;
    if (!el) return;
    this.#ownScrollAt = Date.now();
    this.#reader.scrollTo({ page, y }, el.clientHeight / 3);
  }

  show(page: number, start: number, end: number) {
    this.#waiting?.disconnect();
    this.#waiting = null;
    const pageEl = this.#reader.pageElement(page);
    const layer = pageEl?.querySelector<HTMLElement>('.textLayer');
    if (!pageEl || !layer) return;
    if (!layer.querySelector('span')) {
      this.#clearBox();
      if (this.#following) this.#scroll(page, 0);
      const wait = new MutationObserver(() => {
        if (layer.querySelector('span')) this.show(page, start, end);
      });
      wait.observe(layer, { childList: true });
      this.#waiting = wait;
      return;
    }
    const rects = textLayerRanges(layer, [[start, end]])[0] ?? [];
    this.#draw(pageEl, rects);
    const first = rects[0];
    if (first && this.#following && !this.#inView(pageEl, first, rects.at(-1)!)) this.#scroll(page, first.y);
  }

  #inView(pageEl: HTMLElement, first: Rect, last: Rect): boolean {
    const el = this.#scroller;
    if (!el) return true;
    const p = pageEl.getBoundingClientRect();
    const s = el.getBoundingClientRect();
    const top = p.top + first.y * p.height;
    const bottom = p.top + (last.y + last.h) * p.height;
    return top >= s.top + s.height * BAND.top && bottom <= s.top + s.height * BAND.bottom;
  }

  #draw(pageEl: HTMLElement, rects: Rect[]) {
    if (this.#box?.parentElement !== pageEl) {
      this.#clearBox();
      this.#box = document.createElement('div');
      this.#box.className = 'speech-hl';
      this.#box.setAttribute('aria-hidden', 'true');
      pageEl.append(this.#box);
    }
    this.#box.replaceChildren(...rects.map((r) => {
      const d = document.createElement('div');
      Object.assign(d.style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });
      return d;
    }));
  }

  #clearBox() {
    this.#box?.remove();
    this.#box = null;
  }

  clear() {
    this.#waiting?.disconnect();
    this.#waiting = null;
    this.#clearBox();
  }

  dispose() {
    this.clear();
    this.#scroller?.removeEventListener('scroll', this.#onScroll);
  }
}
