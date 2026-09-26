import { describe, expect, it } from 'vitest';
import { notebookFrontmatter, notebookIdIn, splitFrontmatter } from './frontmatter';
import type { DocId } from './types';

const id = 'abc123' as DocId;

describe('splitFrontmatter', () => {
  it('separates the block from the body', () => {
    expect(splitFrontmatter('---\ntags: [a]\n---\n# Notes\n')).toEqual({ front: 'tags: [a]\n', body: '# Notes\n' });
    expect(splitFrontmatter('---\r\na: 1\r\n---\r\nbody')).toEqual({ front: 'a: 1\r\n', body: 'body' });
    expect(splitFrontmatter('---\n---\nbody')).toEqual({ front: '', body: 'body' });
  });

  it('leaves text without frontmatter whole', () => {
    expect(splitFrontmatter('# Notes\n---\n')).toEqual({ front: null, body: '# Notes\n---\n' });
    expect(splitFrontmatter('---\nnot closed')).toEqual({ front: null, body: '---\nnot closed' });
  });
});

describe('notebookIdIn', () => {
  it('reads the id, quoted or not', () => {
    expect(notebookIdIn('---\nestudio-doc: abc123\npdf: "[[a.pdf]]"\n---\nbody')).toBe('abc123');
    expect(notebookIdIn('---\ntitle: x\nestudio-doc: "abc123" # the pdf\n---\n')).toBe('abc123');
  });

  it('works on a head cut short inside the frontmatter', () => {
    expect(notebookIdIn('---\nestudio-doc: abc123\nlong: aaaaaa')).toBe('abc123');
    expect(notebookIdIn('---\nlong: aaaa\nestudio-do')).toBeNull();
  });

  it('ignores the key outside the frontmatter', () => {
    expect(notebookIdIn('# Notes\nestudio-doc: abc123\n')).toBeNull();
    expect(notebookIdIn('---\na: 1\n---\nestudio-doc: abc123\n')).toBeNull();
    expect(notebookIdIn('---\n  estudio-doc: abc123\n---\n')).toBeNull();
  });
});

describe('notebookFrontmatter', () => {
  it('writes both keys for a file without frontmatter', () => {
    expect(notebookFrontmatter(null, id, 'paper.pdf')).toBe('---\nestudio-doc: abc123\npdf: "[[paper.pdf]]"\n---\n');
  });

  it('keeps every other key, including multi-line ones, and replaces stale values', () => {
    const front = 'pdf: "[[old.pdf]]"\ntags:\n  - study\n  - ml\nestudio-doc: zzz\naliases:\n- attn\nrating: 5\n';
    expect(notebookFrontmatter(front, id, 'new name.pdf')).toBe(
      '---\nestudio-doc: abc123\npdf: "[[new name.pdf]]"\ntags:\n  - study\n  - ml\naliases:\n- attn\nrating: 5\n---\n',
    );
  });

  it('drops a key given as a list along with its items', () => {
    expect(notebookFrontmatter('pdf:\n  - "[[a.pdf]]"\nx: 1\n', id, 'b.pdf')).toBe('---\nestudio-doc: abc123\npdf: "[[b.pdf]]"\nx: 1\n---\n');
  });

  it('is stable when written again', () => {
    const once = notebookFrontmatter('tags: [a]\n', id, 'p.pdf');
    const again = notebookFrontmatter(splitFrontmatter(once).front, id, 'p.pdf');
    expect(again).toBe(once);
    expect(notebookIdIn(once)).toBe(id);
  });
});
