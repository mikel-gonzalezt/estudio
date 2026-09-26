import { AnnotationMode, GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { rectPageToDisplay, type Rotation } from '../lib/geometry';
import type { Rect } from '../lib/types';
import type { TextRun } from '../lib/citation';

GlobalWorkerOptions.workerSrc = workerUrl;

const assets = `${import.meta.env.BASE_URL}pdfjs/`;

/**
 * Every render uses this mode so that annotations Estudio draws itself, marked `noView` in the
 * document's annotation storage when they were imported from the file, are not painted twice.
 */
export const ANNOTATION_MODE = AnnotationMode.ENABLE_STORAGE;

export function loadPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  return getDocument({
    data,
    cMapUrl: `${assets}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assets}standard_fonts/`,
    wasmUrl: `${assets}wasm/`,
  }).promise;
}

/** Unrotated page box in points, plus how it is displayed. */
export interface PageInfo { w: number; h: number; x0: number; y0: number; rotation: Rotation }

export function pageInfo(page: PDFPageProxy): PageInfo {
  const [x0, y0, x1, y1] = page.view as [number, number, number, number];
  return { w: x1 - x0, h: y1 - y0, x0, y0, rotation: (((page.rotate % 360) + 360) % 360) as Rotation };
}

export const displaySize = (p: PageInfo) => (p.rotation % 180 === 0 ? { w: p.w, h: p.h } : { w: p.h, h: p.w });

export interface Target { page: number; y: number }

type Dest = unknown[];

/** A destination's page, plus its normalised top and (when the destination gives one) left in page space. */
export interface DestPoint extends Target { x: number | null }

export async function resolveDest(pdf: PDFDocumentProxy, dest: string | Dest | null, info: (page: number) => PageInfo | undefined): Promise<DestPoint | null> {
  const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
  if (!Array.isArray(explicit) || explicit.length === 0) return null;
  const ref = explicit[0];
  let pageIndex: number;
  if (typeof ref === 'number') pageIndex = ref;
  else if (ref && typeof ref === 'object') pageIndex = await pdf.getPageIndex(ref as Parameters<PDFDocumentProxy['getPageIndex']>[0]);
  else return null;
  const page = pageIndex + 1;
  const p = info(page);
  const mode = (explicit[1] as { name?: string } | undefined)?.name;
  let top: unknown;
  const left = mode === 'XYZ' || mode === 'FitR' ? explicit[2] : null;
  if (mode === 'XYZ') top = explicit[3];
  else if (mode === 'FitH' || mode === 'FitBH') top = explicit[2];
  else if (mode === 'FitR') top = explicit[5];
  const y = p && typeof top === 'number' ? Math.min(1, Math.max(0, 1 - (top - p.y0) / p.h)) : 0;
  const x = p && typeof left === 'number' ? Math.min(1, Math.max(0, (left - p.x0) / p.w)) : null;
  return { page, y, x };
}

interface RawTextItem { str?: string; transform?: number[]; width?: number; height?: number }

/** Horizontal text items in normalised page space; rotated text such as margin stamps is left out. */
export function textRuns(items: readonly unknown[], p: PageInfo): TextRun[] {
  const out: TextRun[] = [];
  for (const it of items as RawTextItem[]) {
    const t = it.transform;
    if (typeof it.str !== 'string' || !t || t[1] !== 0 || t[2] !== 0) continue;
    const h = (it.height ?? 0) / p.h;
    out.push({ str: it.str, x: (t[4]! - p.x0) / p.w, y: 1 - (t[5]! - p.y0) / p.h - h, w: (it.width ?? 0) / p.w, h });
  }
  return out;
}

export interface OutlineNode { title: string; dest: string | Dest | null; items: OutlineNode[] }

export async function outline(pdf: PDFDocumentProxy): Promise<OutlineNode[]> {
  const raw = await pdf.getOutline();
  const map = (items: typeof raw): OutlineNode[] =>
    (items ?? []).map((i) => ({ title: i.title, dest: i.dest as string | Dest | null, items: map(i.items) }));
  return map(raw);
}

export type { PDFDocumentProxy, PDFPageProxy };

/**
 * The region `rect` (page space, normalised) of a page as a PNG, drawn at `scale` device pixels
 * per point: 2 gives a figure sharp enough for notes and print.
 */
export async function renderRegion(page: PDFPageProxy, info: PageInfo, rect: Rect, scale = 2): Promise<Blob> {
  const viewport = page.getViewport({ scale });
  const r = rectPageToDisplay(rect, info.rotation);
  const x = Math.floor(r.x * viewport.width);
  const y = Math.floor(r.y * viewport.height);
  const w = Math.max(1, Math.ceil(r.w * viewport.width));
  const h = Math.max(1, Math.ceil(r.h * viewport.height));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  await page.render({ canvas, viewport, transform: [1, 0, 0, 1, -x, -y], annotationMode: ANNOTATION_MODE }).promise;
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('The clip could not be drawn.'))), 'image/png'));
}
