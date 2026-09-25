import {
  PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString, type PDFObject, type PDFPage,
} from 'pdf-lib';
import { md5, toHex } from './md5';
import {
  COLOR_HEX, COLOR_IDS, type AnnId, type ColorId, type FileAnnotation, type Point, type Rect, type Stroke, type XY,
} from './types';

/** Estudio-only fields, stored as JSON in each annotation's `/EstudioData` string. */
interface EstudioData {
  v: 1;
  kind: FileAnnotation['kind'];
  color?: ColorId;
  tags: string[];
  text?: string;
  strokes?: { color: string; width: number; p: number[] }[];
  createdAt: number;
  updatedAt: number;
}

export interface PdfRead {
  annotations: FileAnnotation[];
  /** pdf.js ids (`12R`) of the annotation objects Estudio now draws itself, so the renderer can skip them. */
  objectIds: string[];
  encrypted: boolean;
}

const KEY = PDFName.of('EstudioData');
const n = (name: string) => PDFName.of(name);

const SUBTYPE_KIND = {
  Highlight: 'highlight', Underline: 'underline', StrikeOut: 'strike', Ink: 'ink', Text: 'note', Square: 'area',
} as const;
type OwnedSubtype = keyof typeof SUBTYPE_KIND;
const KIND_SUBTYPE: Record<FileAnnotation['kind'], OwnedSubtype> = {
  highlight: 'Highlight', underline: 'Underline', strike: 'StrikeOut', ink: 'Ink', note: 'Text', area: 'Square',
};

interface Box { x: number; y: number; width: number; height: number }

export function openPdf(bytes: ArrayBuffer | Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
}

/** Normalised page space (y down, relative to the crop box) to PDF user space (y up). */
const toPdf = (box: Box, p: XY): [number, number] => [box.x + p.x * box.width, box.y + (1 - p.y) * box.height];
const fromPdf = (box: Box, x: number, y: number): XY => ({ x: (x - box.x) / box.width, y: 1 - (y - box.y) / box.height });

function pdfRect(box: Box, r: Rect): [number, number, number, number] {
  const [x1, y2] = toPdf(box, { x: r.x, y: r.y });
  const [x2, y1] = toPdf(box, { x: r.x + r.w, y: r.y + r.h });
  return [x1, y1, x2, y2];
}

function rectFrom(box: Box, xs: number[], ys: number[]): Rect {
  const a = fromPdf(box, Math.min(...xs), Math.max(...ys));
  const b = fromPdf(box, Math.max(...xs), Math.min(...ys));
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

const hexRgb = (hex: string): number[] => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
const rgbHex = (c: number[]) => `#${c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}`;

function nearestColor(rgb: number[]): ColorId {
  const d = (id: ColorId) => hexRgb(COLOR_HEX[id]).reduce((s, v, i) => s + (v - rgb[i]!) ** 2, 0);
  return COLOR_IDS.reduce((best, id) => (d(id) < d(best) ? id : best));
}

function pdfDate(t: number): string {
  const d = new Date(t);
  const p = (v: number) => String(v).padStart(2, '0');
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

function parsePdfDate(s: string | undefined): number {
  const m = s && /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Z+-])?(\d{2})?'?(\d{2})?/.exec(s);
  if (!m) return 0;
  const [, y, mo = '01', d = '01', h = '00', mi = '00', se = '00', tz, th = '00', tm = '00'] = m;
  const utc = Date.UTC(+y!, +mo - 1, +d, +h, +mi, +se);
  const offset = (tz === '+' ? 1 : tz === '-' ? -1 : 0) * (+th * 60 + +tm) * 60_000;
  return utc - offset;
}

function text(dict: PDFDict, key: string): string | undefined {
  const v = dict.lookup(n(key));
  return v instanceof PDFString || v instanceof PDFHexString ? v.decodeText() : undefined;
}

function numbers(v: PDFObject | undefined): number[] {
  return v instanceof PDFArray ? v.asArray().map((x) => (x instanceof PDFNumber ? x.asNumber() : Number.NaN)) : [];
}

function colorOf(dict: PDFDict): number[] | null {
  const c = numbers(dict.lookup(n('C')));
  if (c.length === 3) return c;
  if (c.length === 1) return [c[0]!, c[0]!, c[0]!];
  if (c.length === 4) return [0, 1, 2].map((i) => (1 - c[i]!) * (1 - c[3]!));
  return null;
}

function parseData(raw: string | undefined): EstudioData | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<EstudioData>;
    if (d.v !== 1 || typeof d.kind !== 'string' || typeof d.updatedAt !== 'number') return null;
    return {
      v: 1, kind: d.kind, tags: Array.isArray(d.tags) ? d.tags.filter((t) => typeof t === 'string') : [],
      createdAt: typeof d.createdAt === 'number' ? d.createdAt : d.updatedAt, updatedAt: d.updatedAt,
      ...(d.color && COLOR_IDS.includes(d.color) ? { color: d.color } : {}),
      ...(typeof d.text === 'string' ? { text: d.text } : {}),
      ...(Array.isArray(d.strokes) ? { strokes: d.strokes } : {}),
    };
  } catch {
    return null;
  }
}

function subtypeOf(dict: PDFDict): OwnedSubtype | null {
  const s = dict.lookup(n('Subtype'));
  const name = s instanceof PDFName ? s.decodeText() : '';
  if (!(name in SUBTYPE_KIND)) return null;
  // Replies and review states are threaded onto another annotation; they are not notes of their own.
  if (name === 'Text' && dict.has(n('IRT'))) return null;
  const flags = dict.lookup(n('F'));
  if (flags instanceof PDFNumber && flags.asNumber() & 2) return null;
  return name as OwnedSubtype;
}

function colorFor(dict: PDFDict, data: EstudioData | null): ColorId {
  const c = colorOf(dict);
  if (data?.color && (!c || nearestColor(c) === data.color)) return data.color;
  return c ? nearestColor(c) : 'yellow';
}

function readOne(dict: PDFDict, subtype: OwnedSubtype, box: Box, page: number, id: AnnId, data: EstudioData | null): FileAnnotation | null {
  const updatedAt = Math.max(data?.updatedAt ?? 0, parsePdfDate(text(dict, 'M')));
  const meta = {
    id, page, tags: data?.tags ?? [], updatedAt,
    createdAt: data?.createdAt ?? (parsePdfDate(text(dict, 'CreationDate')) || updatedAt),
  };
  const note = text(dict, 'Contents') ?? '';
  const r = numbers(dict.lookup(n('Rect')));
  const rect = r.length === 4 ? rectFrom(box, [r[0]!, r[2]!], [r[1]!, r[3]!]) : null;
  const kind = SUBTYPE_KIND[subtype];
  switch (kind) {
    case 'highlight': case 'underline': case 'strike': {
      const q = numbers(dict.lookup(n('QuadPoints')));
      const rects: Rect[] = [];
      for (let i = 0; i + 8 <= q.length; i += 8) {
        const quad = q.slice(i, i + 8);
        rects.push(rectFrom(box, quad.filter((_, j) => j % 2 === 0), quad.filter((_, j) => j % 2 === 1)));
      }
      if (!rects.length && rect) rects.push(rect);
      if (!rects.length) return null;
      return { ...meta, kind, rects, text: data?.text ?? '', color: colorFor(dict, data), note };
    }
    case 'ink': {
      const lists = dict.lookup(n('InkList'));
      if (!(lists instanceof PDFArray)) return null;
      const c = colorOf(dict);
      const bs = dict.lookup(n('BS'));
      const bw = bs instanceof PDFDict ? bs.lookup(n('W')) : undefined;
      const w = bw instanceof PDFNumber ? bw.asNumber() : 1;
      const strokes: Stroke[] = lists.asArray().map((l, si) => {
        const xy = numbers(l instanceof PDFRef ? dict.context.lookup(l) : l);
        const saved = data?.strokes?.[si];
        const pts: Point[] = [];
        for (let i = 0; i + 1 < xy.length; i += 2) {
          const p = fromPdf(box, xy[i]!, xy[i + 1]!);
          pts.push({ ...p, p: saved?.p[i / 2] ?? 0.5 });
        }
        return { color: saved?.color ?? (c ? rgbHex(c) : '#000000'), width: saved?.width ?? w, points: pts };
      }).filter((s) => s.points.length > 0);
      return strokes.length ? { ...meta, kind, strokes } : null;
    }
    case 'note':
      return r.length === 4 ? { ...meta, kind, at: fromPdf(box, Math.min(r[0]!, r[2]!), Math.max(r[1]!, r[3]!)), note, color: colorFor(dict, data) } : null;
    case 'area':
      return rect ? { ...meta, kind, rect, note, color: colorFor(dict, data) } : null;
  }
}

const pdfjsId = (ref: PDFRef) => (ref.generationNumber === 0 ? `${ref.objectNumber}R` : `${ref.objectNumber}R${ref.generationNumber}`);

interface Owned { page: PDFPage; index: number; ref: PDFRef | null; dict: PDFDict; subtype: OwnedSubtype }

/** Every annotation Estudio reads and rewrites: its own, plus markup it imported from other apps. */
function owned(doc: PDFDocument): Owned[] {
  const out: Owned[] = [];
  doc.getPages().forEach((page) => {
    page.node.Annots()?.asArray().forEach((item, index) => {
      const ref = item instanceof PDFRef ? item : null;
      const dict = ref ? doc.context.lookup(ref) : item;
      if (!(dict instanceof PDFDict)) return;
      const subtype = subtypeOf(dict);
      if (subtype) out.push({ page, index, ref, dict, subtype });
    });
  });
  return out;
}

export function readDoc(doc: PDFDocument): PdfRead {
  if (doc.isEncrypted) return { annotations: [], objectIds: [], encrypted: true };
  const pages = doc.getPages();
  const seen = new Set<string>();
  const annotations: FileAnnotation[] = [];
  const objectIds: string[] = [];
  for (const o of owned(doc)) {
    const nm = text(o.dict, 'NM');
    const fallback = o.ref ? `pdf-${o.ref.objectNumber}-${o.ref.generationNumber}` : `pdf-p${pages.indexOf(o.page) + 1}-${o.index}`;
    const id = (nm && !seen.has(nm) ? nm : fallback) as AnnId;
    seen.add(id);
    const a = readOne(o.dict, o.subtype, o.page.getCropBox(), pages.indexOf(o.page) + 1, id, parseData(text(o.dict, 'EstudioData')));
    if (!a) continue;
    annotations.push(a);
    if (o.ref) objectIds.push(pdfjsId(o.ref));
  }
  return { annotations, objectIds, encrypted: false };
}

export async function readAnnotations(bytes: ArrayBuffer | Uint8Array): Promise<PdfRead> {
  return readDoc(await openPdf(bytes));
}

/** Acrobat's QuadPoints order: upper-left, upper-right, lower-left, lower-right. */
function quad(box: Box, r: Rect): number[] {
  const [x1, y1, x2, y2] = pdfRect(box, r);
  return [x1, y2, x2, y2, x1, y1, x2, y1];
}

function bounds(rects: [number, number, number, number][]): [number, number, number, number] {
  return [
    Math.min(...rects.map((r) => r[0])), Math.min(...rects.map((r) => r[1])),
    Math.max(...rects.map((r) => r[2])), Math.max(...rects.map((r) => r[3])),
  ];
}

function subject(a: FileAnnotation, meanings: Record<ColorId, string> | undefined): string {
  const label = a.kind !== 'ink' && meanings ? meanings[a.color] : '';
  return [label, ...a.tags.map((t) => `#${t}`)].filter(Boolean).join(' ');
}

function estudioData(a: FileAnnotation): EstudioData {
  const base = { v: 1 as const, kind: a.kind, tags: a.tags, createdAt: a.createdAt, updatedAt: a.updatedAt };
  switch (a.kind) {
    case 'highlight': case 'underline': case 'strike': return { ...base, color: a.color, text: a.text };
    case 'ink': return { ...base, strokes: a.strokes.map((s) => ({ color: s.color, width: s.width, p: s.points.map((p) => p.p) })) };
    case 'note': case 'area': return { ...base, color: a.color };
  }
}

function annotationDict(a: FileAnnotation, box: Box, pageRef: PDFRef, meanings?: Record<ColorId, string>): Record<string, unknown> {
  const subj = subject(a, meanings);
  const base: Record<string, unknown> = {
    Type: 'Annot',
    Subtype: KIND_SUBTYPE[a.kind],
    F: 4,
    P: pageRef,
    NM: PDFHexString.fromText(a.id),
    M: PDFString.of(pdfDate(a.updatedAt)),
    CreationDate: PDFString.of(pdfDate(a.createdAt)),
    T: PDFHexString.fromText('Estudio'),
    Contents: PDFHexString.fromText(a.kind === 'ink' ? '' : a.note),
    ...(subj ? { Subj: PDFHexString.fromText(subj) } : {}),
    EstudioData: PDFHexString.fromText(JSON.stringify(estudioData(a))),
  };
  switch (a.kind) {
    case 'highlight': case 'underline': case 'strike':
      return {
        ...base,
        Rect: bounds(a.rects.map((r) => pdfRect(box, r))),
        QuadPoints: a.rects.flatMap((r) => quad(box, r)),
        C: hexRgb(COLOR_HEX[a.color]),
        CA: a.kind === 'highlight' ? 0.5 : 1,
      };
    case 'ink': {
      const lists = a.strokes.map((s) => s.points.flatMap((p) => toPdf(box, p)));
      const xs = lists.flatMap((l) => l.filter((_, i) => i % 2 === 0));
      const ys = lists.flatMap((l) => l.filter((_, i) => i % 2 === 1));
      const w = Math.max(...a.strokes.map((s) => s.width));
      return {
        ...base,
        Rect: [Math.min(...xs) - w, Math.min(...ys) - w, Math.max(...xs) + w, Math.max(...ys) + w],
        InkList: lists,
        C: hexRgb(a.strokes[0]?.color ?? '#000000'),
        BS: { W: w },
      };
    }
    case 'note': {
      const [x, y] = toPdf(box, a.at);
      return { ...base, Rect: [x, y - 18, x + 18, y], Name: 'Comment', Open: false, C: hexRgb(COLOR_HEX[a.color]) };
    }
    case 'area':
      return { ...base, Rect: pdfRect(box, a.rect), C: hexRgb(COLOR_HEX[a.color]), BS: { W: 1.2, S: 'D', D: [4, 3] } };
  }
}

function idBytes(v: PDFObject | undefined): Uint8Array | null {
  if (v instanceof PDFHexString || v instanceof PDFString) {
    const b = v.asBytes();
    return b.length === 16 && b.some((x) => x !== 0) ? b : null;
  }
  return null;
}

/**
 * Pins the first trailer /ID to what pdf.js fingerprints the source by (its valid /ID, else the MD5
 * of its first 1024 bytes, zero-padded like pdf.js does), so the rewritten file keeps the same DocId.
 */
function keepFingerprint(doc: PDFDocument, source: Uint8Array) {
  const id = doc.context.trailerInfo.ID;
  const first = id instanceof PDFArray ? idBytes(id.lookup(0)) : null;
  const head = new Uint8Array(1024);
  head.set(source.subarray(0, 1024));
  const fp = first ?? md5(head);
  doc.context.trailerInfo.ID = doc.context.obj([PDFHexString.of(toHex(fp)), PDFHexString.of(toHex(crypto.getRandomValues(new Uint8Array(16))))]);
}

/** Replaces the annotations Estudio owns with `anns`; links, form fields and everything else stay as they were. */
export function writeDoc(doc: PDFDocument, source: Uint8Array, anns: readonly FileAnnotation[], meanings?: Record<ColorId, string>) {
  if (doc.isEncrypted) throw new Error('This PDF is encrypted, so Estudio cannot write into it');
  const drop = new Set<PDFRef | PDFDict>();
  for (const o of owned(doc)) {
    drop.add(o.ref ?? o.dict);
    const popup = o.dict.get(n('Popup'));
    if (popup instanceof PDFRef) drop.add(popup);
  }
  const pages = doc.getPages();
  for (const page of pages) {
    const annots = page.node.Annots();
    if (!annots) continue;
    const keep = annots.asArray().filter((item) => {
      if (drop.has(item as PDFRef)) return false;
      const dict = item instanceof PDFRef ? doc.context.lookup(item) : item;
      if (drop.has(dict as PDFDict)) return false;
      const parent = dict instanceof PDFDict ? dict.get(n('Parent')) : undefined;
      return !(parent instanceof PDFRef && drop.has(parent) && dict instanceof PDFDict && dict.lookup(n('Subtype')) === n('Popup'));
    });
    if (keep.length !== annots.size()) page.node.set(n('Annots'), doc.context.obj(keep));
  }
  for (const d of drop) if (d instanceof PDFRef) doc.context.delete(d);
  for (const a of anns) {
    const page = pages[a.page - 1];
    if (!page) continue;
    const ref = doc.context.register(doc.context.obj(annotationDict(a, page.getCropBox(), page.ref, meanings) as never));
    page.node.addAnnot(ref);
  }
  keepFingerprint(doc, source);
}

export async function writeAnnotations(
  bytes: ArrayBuffer | Uint8Array,
  anns: readonly FileAnnotation[],
  meanings?: Record<ColorId, string>,
): Promise<Uint8Array> {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const doc = await openPdf(source);
  writeDoc(doc, source, anns, meanings);
  return doc.save();
}
