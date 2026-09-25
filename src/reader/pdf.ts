import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Rotation } from '../lib/geometry';

GlobalWorkerOptions.workerSrc = workerUrl;

const assets = `${import.meta.env.BASE_URL}pdfjs/`;

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

/** Resolves a named or explicit destination to a page and a normalised top offset in page space. */
export async function resolveDest(pdf: PDFDocumentProxy, dest: string | Dest | null, info: (page: number) => PageInfo | undefined): Promise<Target | null> {
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
  if (mode === 'XYZ') top = explicit[3];
  else if (mode === 'FitH' || mode === 'FitBH') top = explicit[2];
  else if (mode === 'FitR') top = explicit[5];
  const y = p && typeof top === 'number' ? Math.min(1, Math.max(0, 1 - (top - p.y0) / p.h)) : 0;
  return { page, y };
}

export interface OutlineNode { title: string; dest: string | Dest | null; items: OutlineNode[] }

export async function outline(pdf: PDFDocumentProxy): Promise<OutlineNode[]> {
  const raw = await pdf.getOutline();
  const map = (items: typeof raw): OutlineNode[] =>
    (items ?? []).map((i) => ({ title: i.title, dest: i.dest as string | Dest | null, items: map(i.items) }));
  return map(raw);
}

export type { PDFDocumentProxy, PDFPageProxy };
