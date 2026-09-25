import { PDFDocument, PDFHexString, PDFString, type PDFPage } from 'pdf-lib';
import { COLOR_HEX, type ColorId, type Rect, type StoredAnnotation, type XY } from '../types';

const rgb = (hex: string): number[] => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);

interface Box { x: number; y: number; width: number; height: number }

/** Normalised page space (y down, relative to the crop box) to PDF user space (y up). */
function toPdf(box: Box, p: XY): [number, number] {
  return [box.x + p.x * box.width, box.y + (1 - p.y) * box.height];
}

function pdfRect(box: Box, r: Rect): [number, number, number, number] {
  const [x1, y2] = toPdf(box, { x: r.x, y: r.y });
  const [x2, y1] = toPdf(box, { x: r.x + r.w, y: r.y + r.h });
  return [x1, y1, x2, y2];
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

const SUBTYPE = { highlight: 'Highlight', underline: 'Underline', strike: 'StrikeOut' } as const;

function contents(a: StoredAnnotation, meanings: Record<ColorId, string>): string {
  const parts: string[] = [];
  if (a.kind !== 'ink' && a.note.trim()) parts.push(a.note.trim());
  const labels = [a.kind === 'ink' ? '' : meanings[a.color], ...a.tags.map((t) => `#${t}`)].filter(Boolean);
  if (labels.length) parts.push(labels.join(' '));
  return parts.join('\n\n');
}

function pdfDate(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

function addAnnotation(doc: PDFDocument, page: PDFPage, a: StoredAnnotation, meanings: Record<ColorId, string>) {
  const box = page.getCropBox();
  const base: Record<string, unknown> = {
    Type: 'Annot',
    F: 4,
    NM: PDFString.of(a.id),
    M: PDFString.of(pdfDate(a.updatedAt)),
    T: PDFHexString.fromText('Estudio'),
    Contents: PDFHexString.fromText(contents(a, meanings)),
  };
  let dict: Record<string, unknown>;
  switch (a.kind) {
    case 'highlight': case 'underline': case 'strike': {
      const rects = a.rects.map((r) => pdfRect(box, r));
      dict = {
        ...base,
        Subtype: SUBTYPE[a.kind],
        Rect: bounds(rects),
        QuadPoints: a.rects.flatMap((r) => quad(box, r)),
        C: rgb(COLOR_HEX[a.color]),
        CA: a.kind === 'highlight' ? 0.5 : 1,
      };
      break;
    }
    case 'ink': {
      const lists = a.strokes.map((s) => s.points.flatMap((p) => toPdf(box, p)));
      const xs = lists.flatMap((l) => l.filter((_, i) => i % 2 === 0));
      const ys = lists.flatMap((l) => l.filter((_, i) => i % 2 === 1));
      const w = Math.max(...a.strokes.map((s) => s.width));
      dict = {
        ...base,
        Subtype: 'Ink',
        Rect: [Math.min(...xs) - w, Math.min(...ys) - w, Math.max(...xs) + w, Math.max(...ys) + w],
        InkList: lists,
        C: rgb(a.strokes[0]?.color ?? '#000000'),
        BS: { W: w },
      };
      break;
    }
    case 'note': {
      const [x, y] = toPdf(box, a.at);
      dict = { ...base, Subtype: 'Text', Rect: [x, y - 18, x + 18, y], Name: 'Comment', Open: false, C: rgb(COLOR_HEX[a.color]) };
      break;
    }
    case 'area':
      dict = { ...base, Subtype: 'Square', Rect: pdfRect(box, a.rect), C: rgb(COLOR_HEX[a.color]), BS: { W: 1.2, S: 'D', D: [4, 3] } };
      break;
  }
  const ref = doc.context.register(doc.context.obj(dict as never));
  page.node.addAnnot(ref);
}

/** Writes annotations as real PDF annotation objects so other readers can show and edit them. */
export async function exportAnnotatedPdf(
  bytes: ArrayBuffer | Uint8Array,
  annotations: readonly StoredAnnotation[],
  meanings: Record<ColorId, string>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const pages = doc.getPages();
  for (const a of annotations) {
    const page = pages[a.page - 1];
    if (page) addAnnotation(doc, page, a, meanings);
  }
  return doc.save();
}
