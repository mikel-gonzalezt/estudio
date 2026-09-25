import { describe, expect, it } from 'vitest';
import { buildTree, canMove, checkName, childrenOf, companionsOf, notebookPathOf, resolvePdfLink, uniqueName, type Entry } from './vaulttree';

const f = (path: string): Entry => ({ path, kind: 'file' });
const d = (path: string): Entry => ({ path, kind: 'directory' });

const tree = buildTree([
  f('b paper.pdf'), f('b paper.md'), f('a note.md'), f('image.png'), f('.hidden.md'),
  d('.obsidian'), f('.obsidian/workspace.md'), d('.estudio'),
  d('Year 2'), d('Year 10'), f('Year 2/lecture 10.pdf'), f('Year 2/lecture 9.pdf'),
  d('Year 2/deep'), f('Year 2/deep/x.pdf'), f('orphan/lost.pdf'),
]);

describe('vault tree', () => {
  it('lists folders first, in natural order, and hides dotfiles and other files', () => {
    expect(childrenOf(tree, '').map((n) => n.name)).toEqual(['Year 2', 'Year 10', 'a note.md', 'b paper.md', 'b paper.pdf']);
    expect(childrenOf(tree, 'Year 2').map((n) => n.name)).toEqual(['deep', 'lecture 9.pdf', 'lecture 10.pdf']);
    expect(tree.has('.obsidian/workspace.md')).toBe(false);
    expect(tree.has('orphan/lost.pdf')).toBe(false);
    expect(tree.get('b paper.pdf')!.kind).toBe('pdf');
    expect(tree.get('a note.md')!.kind).toBe('note');
  });

  it('pairs a PDF with its notebook', () => {
    expect(notebookPathOf('Year 2/lecture 9.pdf')).toBe('Year 2/lecture 9.md');
    expect(companionsOf(tree, 'b paper.pdf')).toEqual(['b paper.md']);
    expect(companionsOf(tree, 'Year 2/lecture 9.pdf')).toEqual([]);
    expect(companionsOf(tree, 'a note.md')).toEqual([]);
  });

  it('picks a free name instead of overwriting', () => {
    expect(uniqueName(tree, '', 'new.pdf')).toBe('new.pdf');
    expect(uniqueName(tree, '', 'B Paper.pdf')).toBe('B Paper (2).pdf');
    expect(uniqueName(tree, '', 'Year 2')).toBe('Year 2 (2)');
    expect(uniqueName(tree, '', 'b paper.pdf', ['b paper (2).pdf'])).toBe('b paper (3).pdf');
  });

  it('validates names', () => {
    expect(checkName(tree, '', '  ')).toBe('empty');
    expect(checkName(tree, '', 'a/b')).toBe('invalid');
    expect(checkName(tree, '', '.secret')).toBe('invalid');
    expect(checkName(tree, '', 'a note.md')).toBe('taken');
    expect(checkName(tree, '', 'A NOTE.md', 'a note.md')).toBeNull();
  });

  it('refuses moves into the entry itself, its descendants, its own folder, or onto a clash', () => {
    expect(canMove(tree, 'Year 2', 'Year 2/deep')).toBe(false);
    expect(canMove(tree, 'Year 2', 'Year 2')).toBe(false);
    expect(canMove(tree, 'Year 2/deep', 'Year 2')).toBe(false);
    expect(canMove(tree, 'Year 2/deep', '')).toBe(true);
    expect(canMove(tree, 'b paper.pdf', 'Year 10')).toBe(true);
    expect(canMove(tree, 'b paper.pdf', 'a note.md')).toBe(false);
    expect(canMove(tree, '', 'Year 10')).toBe(false);
  });
});

describe('resolving PDF links from notes', () => {
  it('takes paths relative to the note, then to the vault', () => {
    expect(resolvePdfLink(tree, 'lecture 9.pdf', 'Year 2')).toBe('Year 2/lecture 9.pdf');
    expect(resolvePdfLink(tree, 'Year 2/deep/x.pdf', '')).toBe('Year 2/deep/x.pdf');
    expect(resolvePdfLink(tree, 'deep/x.pdf', 'Year 2')).toBe('Year 2/deep/x.pdf');
  });

  it('finds a bare file name anywhere, ignoring case', () => {
    expect(resolvePdfLink(tree, 'X.PDF', '')).toBe('Year 2/deep/x.pdf');
    expect(resolvePdfLink(tree, 'b paper.pdf', 'Year 10')).toBe('b paper.pdf');
  });

  it('prefers the note folder, then the shortest path', () => {
    const t = buildTree([d('a'), d('a/b'), f('a/b/s.pdf'), f('a/s.pdf'), d('c'), f('c/s.pdf')]);
    expect(resolvePdfLink(t, 's.pdf', 'a/b')).toBe('a/b/s.pdf');
    expect(resolvePdfLink(t, 's.pdf', '')).toBe('a/s.pdf');
  });

  it('returns null for missing files and non-PDFs', () => {
    expect(resolvePdfLink(tree, 'nope.pdf', '')).toBeNull();
    expect(resolvePdfLink(tree, 'a note.md', '')).toBeNull();
  });
});
