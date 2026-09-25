import { tick } from 'svelte';
import type { DocRecord, Rect, StoredAnnotation, XY } from '../lib/types';
import { Annotator } from './annotator.svelte';
import { Study } from './study.svelte';
import { Search } from './search.svelte';
import { displayToPage, normalisePoint, pageToDisplay, rectPageToDisplay } from '../lib/geometry';
import { centredScrollLeft, fitTextScale, textBounds } from '../lib/textfit';
import type { PointerCtx } from './tools';
import { putDoc } from '../lib/db';
import type { TextRun } from '../lib/citation';
import type { PdfRequest } from '../lib/app.svelte';
import type { FileSync } from './filesync.svelte';
import { fileNotebook } from '../lib/notebookstore';
import { stemOf } from '../lib/vaulttree';
import { displaySize, textRuns, type DestPoint, type PageInfo, type PDFDocumentProxy, type PDFPageProxy, type Target } from './pdf';

export const PAGE_GAP = 12;
export const PAGE_PAD = 16;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 5;
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

export type FitMode = 'width' | 'page' | 'text';

export type LeftTab = 'files' | 'outline' | 'thumbnails' | 'annotations';

export interface LinkPreviewState { dest: DestPoint; name: string | null; clientX: number; clientY: number }

export class Reader {
  readonly pdf: PDFDocumentProxy;
  readonly info: PageInfo[];
  /** Where the document came from; pdf.js detaches the buffer it was given, so exports read it again. */
  readonly source: PdfRequest;
  /** Present when annotations are saved into the PDF file itself. */
  sync: FileSync | null = null;
  readonly ann: Annotator;
  readonly study: Study;
  readonly search: Search;
  fit = $state<FitMode | null>(null);
  focus = $state(false);
  ruler = $state(false);
  linkPreview = $state.raw<LinkPreviewState | null>(null);
  thumbsOpen = $state(false);
  doc: DocRecord = $state()!;
  scale = $state(1);
  currentPage = $state(1);
  leftOpen = $state(true);
  leftTab = $state<LeftTab>('outline');
  scroller: HTMLElement | undefined = $state();
  back: Target[] = $state([]);
  forward: Target[] = $state([]);

  readonly #pages = new Map<number, Promise<PDFPageProxy>>();
  readonly #runs = new Map<number, Promise<TextRun[]>>();
  readonly #bounds = new Map<number, Promise<Rect>>();
  #beforeTextFit: { scale: number; fit: FitMode | null } | null = null;
  #previewTimer: ReturnType<typeof setTimeout> | undefined;
  #saveTimer: ReturnType<typeof setTimeout> | undefined;
  readonly #seen: Set<number>;

  constructor(pdf: PDFDocumentProxy, info: PageInfo[], doc: DocRecord, annotations: StoredAnnotation[], source: PdfRequest) {
    this.pdf = pdf;
    this.source = source;
    this.ann = new Annotator(this, doc.id, annotations);
    const place = source.place;
    this.study = place
      ? new Study(doc.id, fileNotebook(place.dir, `${stemOf(place.name)}.md`, doc.id), place.name)
      : new Study(doc.id);
    this.search = new Search(this);
    this.info = info;
    this.doc = doc;
    this.scale = doc.lastZoom;
    this.currentPage = doc.lastPage;
    this.#seen = new Set(doc.pagesSeen);
  }

  /** Current file contents. A handle is re-read because the File taken at open goes stale once the file is saved. */
  async bytes(): Promise<ArrayBuffer> {
    const { handle, file } = this.source;
    return (handle ? await handle.getFile() : file).arrayBuffer();
  }

  showLeft(tab: LeftTab) {
    this.leftOpen = true;
    this.leftTab = tab;
  }

  get pageCount() {
    return this.info.length;
  }

  /** Top offset of each page (and the total height at the end) in CSS px at the current scale. */
  offsets = $derived.by(() => {
    const out: number[] = [];
    let y = PAGE_PAD;
    for (const p of this.info) {
      out.push(y);
      y += displaySize(p).h * this.scale + PAGE_GAP;
    }
    out.push(y + PAGE_PAD - PAGE_GAP);
    return out;
  });

  page(n: number): Promise<PDFPageProxy> {
    let p = this.#pages.get(n);
    if (!p) {
      p = this.pdf.getPage(n);
      this.#pages.set(n, p);
    }
    return p;
  }

  textRuns(n: number): Promise<TextRun[]> {
    let r = this.#runs.get(n);
    if (!r) {
      r = this.page(n).then((p) => p.getTextContent()).then((tc) => textRuns(tc.items, this.info[n - 1]!));
      this.#runs.set(n, r);
    }
    return r;
  }

  /** The union of a page's text boxes (page space), so zooming can crop the margins away. */
  textBounds(n: number): Promise<Rect> {
    let b = this.#bounds.get(n);
    if (!b) {
      b = this.textRuns(n).then(textBounds);
      this.#bounds.set(n, b);
    }
    return b;
  }

  showPreview(p: LinkPreviewState) {
    clearTimeout(this.#previewTimer);
    this.linkPreview = p;
  }

  /** Hides the preview after `delay` ms, long enough for the pointer to travel from the link onto the preview. */
  hidePreview(delay = 0) {
    clearTimeout(this.#previewTimer);
    if (delay) this.#previewTimer = setTimeout(() => (this.linkPreview = null), delay);
    else this.linkPreview = null;
  }

  holdPreview() {
    clearTimeout(this.#previewTimer);
  }

  pageAt(scrollTop: number): number {
    const probe = scrollTop + (this.scroller?.clientHeight ?? 0) * 0.3;
    let lo = 0;
    let hi = this.info.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.offsets[mid]! <= probe) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  }

  here(): Target {
    const el = this.scroller;
    if (!el) return { page: this.currentPage, y: 0 };
    const page = this.pageAt(el.scrollTop);
    const h = displaySize(this.info[page - 1]!).h * this.scale;
    return { page, y: Math.max(0, (el.scrollTop - this.offsets[page - 1]!) / h) };
  }

  onScroll() {
    if (!this.scroller) return;
    this.ann.menu = null;
    const page = this.pageAt(this.scroller.scrollTop);
    if (page !== this.currentPage) {
      this.currentPage = page;
      if (!this.#seen.has(page)) {
        this.#seen.add(page);
        this.doc.pagesSeen = [...this.#seen].sort((a, b) => a - b);
      }
      this.doc.lastPage = page;
      this.scheduleSave();
    }
  }

  pageElement(n: number): HTMLElement | null {
    return this.scroller?.querySelector<HTMLElement>(`.page[data-page="${n}"]`) ?? null;
  }

  pointerCtx(page: number, e: { clientX: number; clientY: number; pressure: number; pointerType: string }): PointerCtx | null {
    const el = this.pageElement(page);
    const p = this.info[page - 1];
    if (!el || !p) return null;
    const at = displayToPage(normalisePoint(e.clientX, e.clientY, el.getBoundingClientRect()), p.rotation);
    const pressure = e.pointerType === 'mouse' ? 0.5 : e.pressure || 0.5;
    return { ann: this.ann, page, at, pressure, size: { w: p.w, h: p.h } };
  }

  /** Converts a page-space point (unrotated, normalised) into a scroll target. */
  targetAt(page: number, at: XY): Target {
    const rot = this.info[page - 1]?.rotation ?? 0;
    return { page, y: pageToDisplay(at, rot).y };
  }

  /** `y` is the normalised position within the displayed page to bring near the top. */
  scrollTo(t: Target, margin = 24) {
    const el = this.scroller;
    if (!el) return;
    const page = Math.min(this.pageCount, Math.max(1, t.page));
    const h = displaySize(this.info[page - 1]!).h * this.scale;
    el.scrollTop = this.offsets[page - 1]! + t.y * h - (t.y > 0 ? margin : PAGE_PAD / 2);
  }

  jump(t: Target) {
    this.back = [...this.back.slice(-49), this.here()];
    this.forward = [];
    this.scrollTo(t, 80);
  }

  goBack() {
    const t = this.back.at(-1);
    if (!t) return;
    this.forward = [this.here(), ...this.forward];
    this.back = this.back.slice(0, -1);
    this.scrollTo(t, 0);
  }

  goForward() {
    const t = this.forward[0];
    if (!t) return;
    this.back = [...this.back, this.here()];
    this.forward = this.forward.slice(1);
    this.scrollTo(t, 0);
  }

  /** Keeps the document point under `anchor` (client coords within the scroller) fixed while zooming. */
  async zoomTo(next: number, anchor?: { x: number; y: number }) {
    const el = this.scroller;
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(next * 1000) / 1000));
    if (!el || scale === this.scale) {
      this.scale = scale;
      return;
    }
    const ax = anchor?.x ?? el.clientWidth / 2;
    const ay = anchor?.y ?? 0;
    const page = this.pageAt(el.scrollTop + ay - el.clientHeight * 0.3);
    const top = this.offsets[page - 1]!;
    const within = (el.scrollTop + ay - top) / this.scale;
    const ratio = scale / this.scale;
    const left = (el.scrollLeft + ax) * ratio - ax;
    this.scale = scale;
    this.doc.lastZoom = scale;
    this.scheduleSave();
    await tick();
    el.scrollTop = this.offsets[page - 1]! + within * scale - ay;
    el.scrollLeft = left;
  }

  /** User-driven zoom; drops any fit mode so resizes stop re-fitting. */
  zoomBy(next: number, anchor?: { x: number; y: number }) {
    this.fit = null;
    return this.zoomTo(next, anchor);
  }

  zoomStep(dir: 1 | -1) {
    this.fit = null;
    const cur = this.scale;
    const next = dir > 0 ? ZOOM_STEPS.find((z) => z > cur + 0.001) : [...ZOOM_STEPS].reverse().find((z) => z < cur - 0.001);
    void this.zoomTo(next ?? cur);
  }

  #fitSize() {
    const el = this.scroller;
    const p = this.info[this.currentPage - 1];
    return el && p ? { el, size: displaySize(p) } : undefined;
  }

  fitWidth() {
    const f = this.#fitSize();
    this.fit = 'width';
    if (f) void this.zoomTo((f.el.clientWidth - 32) / f.size.w);
  }

  async fitPage() {
    const f = this.#fitSize();
    if (!f) return;
    const page = this.currentPage;
    this.fit = 'page';
    await this.zoomTo(Math.min((f.el.clientWidth - 32) / f.size.w, (f.el.clientHeight - PAGE_PAD * 2) / f.size.h));
    this.scrollTo({ page, y: 0 });
  }

  /** Scales the current page's text column to the viewport width and scrolls it to the centre. */
  async fitTextWidth() {
    const f = this.#fitSize();
    if (!f) return;
    const page = this.currentPage;
    const bounds = rectPageToDisplay(await this.textBounds(page), this.info[page - 1]!.rotation);
    this.fit = 'text';
    await this.zoomTo(fitTextScale(bounds, f.size, f.el.clientWidth, 32));
    const el = this.pageElement(page);
    if (!el) return;
    const pageLeft = el.getBoundingClientRect().left - f.el.getBoundingClientRect().left + f.el.scrollLeft;
    f.el.scrollLeft = centredScrollLeft(pageLeft, bounds, f.size.w * this.scale, f.el.clientWidth);
  }

  /** Switches to fit-text-width, or back to the zoom that was in use before it. */
  async toggleTextWidth() {
    const before = this.#beforeTextFit;
    if (this.fit === 'text' && before) {
      this.#beforeTextFit = null;
      if (before.fit === 'width') this.fitWidth();
      else if (before.fit === 'page') await this.fitPage();
      else await this.zoomBy(before.scale);
      return;
    }
    this.#beforeTextFit = { scale: this.scale, fit: this.fit };
    await this.fitTextWidth();
  }

  refit() {
    if (this.fit === 'width') this.fitWidth();
    else if (this.fit === 'page') void this.fitPage();
    else if (this.fit === 'text') void this.fitTextWidth();
  }

  /** Adds active reading time; the caller decides what counts as active. */
  addReading(ms: number) {
    this.doc.readingMs += ms;
    this.scheduleSave();
  }

  scrollBy(dy: number) {
    this.scroller?.scrollBy({ top: dy });
  }

  pageStep(dir: 1 | -1) {
    const target = this.currentPage + dir;
    if (target >= 1 && target <= this.pageCount) this.scrollTo({ page: target, y: 0 });
  }

  scheduleSave() {
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => void this.save(), 800);
  }

  async save() {
    clearTimeout(this.#saveTimer);
    await putDoc(this.doc);
  }
}
