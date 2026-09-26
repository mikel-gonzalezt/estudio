import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { md5, toHex } from './md5';
import { readAnnotations, writeAnnotations } from './pdfannots';
import { DEFAULT_MEANINGS, type AnnId, type FileAnnotation } from './types';

const meta = (id: string, page: number, tags: string[] = []) => ({ id: id as AnnId, tags, createdAt: 1_700_000_000_000, updatedAt: 1_700_000_500_000, page });

const annotations: FileAnnotation[] = [
  { ...meta('h1', 2, ['thesis']), kind: 'highlight', rects: [{ x: 0.1, y: 0.2, w: 0.5, h: 0.02 }, { x: 0.1, y: 0.23, w: 0.3, h: 0.02 }], text: 'Attention is all you need', color: 'green', note: 'Core idea' },
  { ...meta('u1', 1), kind: 'underline', rects: [{ x: 0.2, y: 0.5, w: 0.2, h: 0.02 }], text: 'self-attention', color: 'yellow', note: '' },
  { ...meta('s1', 1), kind: 'strike', rects: [{ x: 0.2, y: 0.6, w: 0.2, h: 0.02 }], text: 'recurrence', color: 'pink', note: 'wrong' },
  { ...meta('i1', 1), kind: 'ink', strokes: [
    { color: '#2a6fd1', width: 1.6, points: [{ x: 0.1, y: 0.1, p: 0.2 }, { x: 0.2, y: 0.15, p: 0.9 }] },
    { color: '#d23f7a', width: 3, points: [{ x: 0.3, y: 0.3, p: 0.5 }] },
  ] },
  { ...meta('n1', 1), kind: 'note', at: { x: 0.8, y: 0.1 }, note: 'Check the appendix ✓', color: 'blue' },
  { ...meta('a1', 1), kind: 'area', rect: { x: 0.1, y: 0.7, w: 0.4, h: 0.2 }, note: 'Figure 1', color: 'orange' },
];

async function blankPdf(pages = 2): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([600, 800]);
  return doc.save();
}

/** A page carrying markup made by another app, a link, a reply and a popup. */
async function foreignPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const ctx = doc.context;
  const hl = ctx.register(ctx.obj({
    Type: 'Annot', Subtype: 'Highlight', Rect: [60, 600, 360, 620], QuadPoints: [60, 620, 360, 620, 60, 600, 360, 600],
    C: [1, 1, 0], Contents: PDFString.of('from Acrobat'), M: PDFString.of("D:20240102030405+01'00'"),
  }));
  const popup = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [400, 600, 500, 700], Parent: hl }));
  (ctx.lookup(hl) as PDFDict).set(PDFName.of('Popup'), popup);
  const link = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [10, 10, 50, 30], A: { S: 'URI', URI: PDFString.of('https://example.org') } }));
  const reply = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [60, 600, 78, 618], IRT: hl, Contents: PDFString.of('a reply') }));
  const square = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Square', Rect: [100, 100, 200, 200], C: [0, 0, 1], NM: PDFString.of('acro-sq') }));
  page.node.set(PDFName.of('Annots'), ctx.obj([hl, popup, link, reply, square]));
  return doc.save();
}

async function subtypes(bytes: Uint8Array, pageIndex = 0): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const annots = doc.getPages()[pageIndex]!.node.Annots();
  return (annots?.asArray() ?? []).map((r) => doc.context.lookup(r, PDFDict).get(PDFName.of('Subtype'))!.toString()).sort();
}

async function fingerprint(bytes: Uint8Array): Promise<string> {
  const task = getDocument({ data: bytes.slice() });
  const fp = (await task.promise).fingerprints[0]!;
  await task.destroy();
  return fp;
}

describe('md5', () => {
  it('matches the reference vectors', () => {
    expect(toHex(md5(new Uint8Array()))).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(toHex(md5(new TextEncoder().encode('abc')))).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(toHex(md5(new TextEncoder().encode('a'.repeat(1000))))).toBe('cabe45dcc9ae5b66ba86600cca6b8ba8');
  });
});

describe('PDF annotations round trip', () => {
  it('reads back exactly what it wrote', async () => {
    const out = await writeAnnotations(await blankPdf(), annotations, DEFAULT_MEANINGS);
    const { annotations: back, encrypted } = await readAnnotations(out);
    expect(encrypted).toBe(false);
    expect(back).toHaveLength(annotations.length);
    for (const want of annotations) {
      const got = back.find((a) => a.id === want.id)!;
      expect(got, want.id).toBeDefined();
      expect(roundNumbers(got)).toEqual(roundNumbers(want));
    }
  });

  it('writes standard annotation objects other readers understand', async () => {
    const out = await writeAnnotations(await blankPdf(), annotations, DEFAULT_MEANINGS);
    expect(await subtypes(out, 0)).toEqual(['/Ink', '/Square', '/StrikeOut', '/Text', '/Underline']);
    const doc = await PDFDocument.load(out);
    const hl = doc.context.lookup(doc.getPages()[1]!.node.Annots()!.get(0), PDFDict);
    expect(hl.get(PDFName.of('Subtype'))!.toString()).toBe('/Highlight');
    expect(hl.lookup(PDFName.of('QuadPoints'), PDFArray).size()).toBe(16);
    expect(hl.lookup(PDFName.of('Contents'), PDFHexString).decodeText()).toBe('Core idea');
    expect(hl.lookup(PDFName.of('Subj'), PDFHexString).decodeText()).toBe('Definition #thesis');
    expect(hl.lookup(PDFName.of('NM'), PDFHexString).decodeText()).toBe('h1');
  });

  it('replaces its own annotations instead of adding duplicates', async () => {
    const once = await writeAnnotations(await blankPdf(), annotations);
    const edited = annotations.filter((a) => a.id !== 'u1').map((a) => (a.id === 'n1' ? { ...a, note: 'edited', updatedAt: a.updatedAt + 1 } : a));
    const twice = await writeAnnotations(once, edited);
    const { annotations: back } = await readAnnotations(twice);
    expect(back.map((a) => a.id).sort()).toEqual(edited.map((a) => a.id).sort());
    expect(back.find((a) => a.id === 'n1')).toMatchObject({ note: 'edited' });
    expect(await subtypes(twice, 0)).toEqual(['/Ink', '/Square', '/StrikeOut', '/Text']);
  });

  it('imports markup from other apps and leaves links and replies alone', async () => {
    const src = await foreignPdf();
    const { annotations: found, objectIds } = await readAnnotations(src);
    expect(found).toHaveLength(2);
    const hl = found.find((a): a is Extract<FileAnnotation, { rects: unknown }> => a.kind === 'highlight')!;
    expect(hl).toMatchObject({ color: 'yellow', note: 'from Acrobat', text: '', tags: [] });
    expect(hl.id).toMatch(/^pdf-\d+-0$/);
    expect(hl.updatedAt).toBe(Date.UTC(2024, 0, 2, 2, 4, 5));
    expect(hl.rects[0]!.x).toBeCloseTo(0.1);
    const sq = found.find((a) => a.kind === 'area')!;
    expect(sq).toMatchObject({ id: 'acro-sq', color: 'blue' });
    expect(objectIds).toHaveLength(2);
    expect(objectIds.every((id) => /^\d+R$/.test(id))).toBe(true);

    const out = await writeAnnotations(src, [{ ...hl, color: 'pink', updatedAt: hl.updatedAt + 1 }]);
    expect(await subtypes(out)).toEqual(['/Highlight', '/Link', '/Text']);
    const { annotations: back } = await readAnnotations(out);
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ id: hl.id, color: 'pink', note: 'from Acrobat' });
  });

  it('keeps the pdf.js fingerprint when the file has no /ID', async () => {
    const src = await blankPdf();
    expect((await PDFDocument.load(src)).context.trailerInfo.ID).toBeUndefined();
    const before = await fingerprint(src);
    const once = await writeAnnotations(src, annotations);
    expect(await fingerprint(once)).toBe(before);
    expect(await fingerprint(await writeAnnotations(once, annotations.slice(1)))).toBe(before);
  });

  it('keeps the pdf.js fingerprint when the file has a trailer /ID', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([600, 800]).drawText('A paper with an /ID', { x: 50, y: 700 });
    const id = PDFHexString.of('0f1e2d3c4b5a69788796a5b4c3d2e1f0');
    doc.context.trailerInfo.ID = doc.context.obj([id, id]);
    const src = await doc.save();
    expect((await PDFDocument.load(src)).context.trailerInfo.ID).toBeDefined();
    const before = await fingerprint(src);
    expect(before).toBe('0f1e2d3c4b5a69788796a5b4c3d2e1f0');
    const once = await writeAnnotations(src, annotations);
    expect(await fingerprint(once)).toBe(before);
    expect(await fingerprint(await writeAnnotations(once, annotations.slice(1)))).toBe(before);
  });

  it('keeps the pdf.js fingerprint of a real document across saves', async () => {
    const fs = (await import('node:fs' as string)) as { readFileSync(path: string): Uint8Array };
    const src = new Uint8Array(fs.readFileSync('samples/sample-study.pdf'));
    const before = await fingerprint(src);
    const once = await writeAnnotations(src, annotations);
    expect(await fingerprint(once)).toBe(before);
    const { annotations: back } = await readAnnotations(once);
    expect(back.map((a) => a.id).sort()).toEqual(annotations.map((a) => a.id).sort());
  });
});

function roundNumbers<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_, x) => (typeof x === 'number' ? Math.round(x * 1e4) / 1e4 : x))) as T;
}
