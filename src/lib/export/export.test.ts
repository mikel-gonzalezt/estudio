import { describe, expect, it } from 'vitest';
import { BackupError, makeBackup, parseBackup } from '../backup';
import { newSrs } from '../fsrs';
import { DEFAULT_MEANINGS, type AnnId, type Card, type CardId, type DocId, type StoredAnnotation } from '../types';
import { exportMarkdown, exportNotes } from './markdown';

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

describe('notes-only export', () => {
  it('keeps only the notebook text, with page links as readable references', () => {
    const nb = '---\nestudio-doc: x\npdf: "[[a.pdf]]"\n---\n# Notes\n\n[[p3]] first point\n> quote [[a.pdf#page=12|Intro]]\n- see [[p4|Method]] and [[b c.pdf#page=7]]\n\n';
    expect(exportNotes(nb)).toBe('# Notes\n\n(p. 3) first point\n> quote Intro (p. 12)\n- see Method (p. 4) and (p. 7)\n');
  });

  it('keeps image references, tables and maths as written', () => {
    const nb = '![Figure](attachments/Pasted%20image%201.png) [[p4]]\n\n![[diagram.png]]\n\n| a | b |\n|---|---|\n| $x$ | 2 |\n\n$$\n\\int x\n$$\n';
    expect(exportNotes(nb)).toBe('![Figure](attachments/Pasted%20image%201.png) (p. 4)\n\n![[diagram.png]]\n\n| a | b |\n|---|---|\n| $x$ | 2 |\n\n$$\n\\int x\n$$\n');
  });

  it('is empty for an empty notebook', () => {
    expect(exportNotes('  \n')).toBe('');
  });
});
