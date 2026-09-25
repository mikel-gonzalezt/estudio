import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { BackupError, makeBackup, parseBackup } from '../backup';
import { newSrs } from '../fsrs';
import { DEFAULT_MEANINGS, type AnnId, type Card, type CardId, type DocId, type StoredAnnotation } from '../types';
import { exportMarkdown } from './markdown';
import { exportAnnotatedPdf } from './pdf';

const meta = (id: string, page: number) => ({ id: id as AnnId, docId: 'doc' as DocId, tags: [] as string[], createdAt: 0, updatedAt: 0, page });

const annotations: StoredAnnotation[] = [
  { ...meta('h1', 2), kind: 'highlight', rects: [{ x: 0.1, y: 0.2, w: 0.5, h: 0.02 }, { x: 0.1, y: 0.23, w: 0.3, h: 0.02 }], text: 'Attention is all you need', color: 'green', note: 'Core idea', tags: ['thesis'] },
  { ...meta('u1', 1), kind: 'underline', rects: [{ x: 0.2, y: 0.5, w: 0.2, h: 0.02 }], text: 'self-attention', color: 'yellow', note: '' },
  { ...meta('s1', 1), kind: 'strike', rects: [{ x: 0.2, y: 0.6, w: 0.2, h: 0.02 }], text: 'recurrence', color: 'pink', note: '' },
  { ...meta('i1', 1), kind: 'ink', strokes: [{ color: '#2a6fd1', width: 1.6, points: [{ x: 0.1, y: 0.1, p: 0.5 }, { x: 0.2, y: 0.15, p: 0.5 }] }] },
  { ...meta('n1', 1), kind: 'note', at: { x: 0.8, y: 0.1 }, note: 'Check the appendix', color: 'blue' },
  { ...meta('a1', 1), kind: 'area', rect: { x: 0.1, y: 0.7, w: 0.4, h: 0.2 }, note: 'Figure 1', color: 'orange' },
];

describe('markdown export', () => {
  const card: Card = { id: 'c' as CardId, docId: 'doc' as DocId, page: 2, front: 'The {{c1::Transformer}} drops recurrence', back: '', srs: newSrs(0) };
  const md = exportMarkdown({
    doc: { title: 'Attention', fileName: 'attention.pdf', pageCount: 15 },
    annotations, notebook: 'Summary, see [[p2]].', cards: [card], meanings: DEFAULT_MEANINGS, exportedAt: new Date(0),
  });

  it('starts with YAML front matter', () => {
    expect(md.startsWith('---\ntitle: "Attention"\nsource: "attention.pdf"')).toBe(true);
  });

  it('groups annotations by page in reading order', () => {
    expect(md.indexOf('### Page 1')).toBeLessThan(md.indexOf('### Page 2'));
    expect(md.indexOf('Page 2')).toBeLessThan(md.indexOf('> Attention is all you need'));
  });

  it('writes notes and colour meanings plus tags as Obsidian tags', () => {
    expect(md).toContain('> Attention is all you need\n\nCore idea\n\n#Definition #thesis');
    expect(md).toContain('#Doubt-review');
  });

  it('turns page links into plain references and lists cards', () => {
    expect(md).toContain('Summary, see (p. 2).');
    expect(md).toContain('- The Transformer drops recurrence (p. 2)');
  });
});

describe('annotated PDF export', () => {
  it('writes real annotation objects with page-space geometry', async () => {
    const src = await PDFDocument.create();
    src.addPage([600, 800]);
    src.addPage([600, 800]);
    const out = await exportAnnotatedPdf(await src.save(), annotations, DEFAULT_MEANINGS);

    const doc = await PDFDocument.load(out);
    const annotsOf = (i: number) => doc.getPages()[i]!.node.Annots()!;
    const dicts = (i: number) => annotsOf(i).asArray().map((r) => doc.context.lookup(r, PDFDict));
    const subtypes = dicts(0).map((d) => d.get(PDFName.of('Subtype'))!.toString());
    expect(subtypes.sort()).toEqual(['/Ink', '/Square', '/StrikeOut', '/Text', '/Underline']);

    const [hl] = dicts(1);
    expect(hl!.get(PDFName.of('Subtype'))!.toString()).toBe('/Highlight');
    const quads = hl!.lookup(PDFName.of('QuadPoints'), PDFArray).asArray().map((n) => (n as PDFNumber).asNumber());
    expect(quads).toHaveLength(16);
    // First quad's upper-left corner: x = 0.1 * 600, y = (1 - 0.2) * 800.
    expect(quads[0]).toBeCloseTo(60);
    expect(quads[1]).toBeCloseTo(640);
    const text = hl!.lookup(PDFName.of('Contents'), PDFHexString).decodeText();
    expect(text).toBe('Core idea\n\nDefinition #thesis');
  });
});

describe('backup', () => {
  it('round-trips through JSON', () => {
    const b = makeBackup({ docs: [], annotations, notebooks: [{ docId: 'doc' as DocId, markdown: 'x', updatedAt: 1 }], cards: [] }, 5);
    const parsed = parseBackup(JSON.stringify(b));
    expect(parsed.annotations).toHaveLength(annotations.length);
    expect(parsed.exportedAt).toBe(5);
  });

  it('rejects foreign or malformed files', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parseBackup('{"format":"other"}')).toThrow(BackupError);
    const b = makeBackup({ docs: [], annotations: [], notebooks: [], cards: [] }, 0);
    expect(() => parseBackup(JSON.stringify({ ...b, annotations: [{ id: 1 }] }))).toThrow(/annotations\[0\]/);
  });
});
