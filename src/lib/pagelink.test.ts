import { describe, expect, it } from 'vitest';
import {
  autoLinkInsert, blockInsertion, formatPageLink, isFirstKeystroke, pageAbove, pageLinkAtStart, parsePageLinks, startsParagraph,
} from './pagelink';
import { renderMarkdown } from './notebook';
import { exportMarkdown } from './export/markdown';
import { DEFAULT_MEANINGS } from './types';

describe('page link parsing', () => {
  it('reads the native form with offsets', () => {
    expect(parsePageLinks('a [[p3]] b')).toEqual([{ from: 2, to: 8, page: 3, label: null }]);
  });

  it('reads labels on the native form', () => {
    expect(parsePageLinks('[[p12|Attention]]')).toEqual([{ from: 0, to: 17, page: 12, label: 'Attention' }]);
  });

  it("reads Obsidian's PDF link form, with and without a label", () => {
    expect(parsePageLinks('[[papers/Attention Is All You Need.pdf#page=4]]').map((l) => [l.page, l.label])).toEqual([[4, null]]);
    expect(parsePageLinks('[[x.PDF#page=9|Fig. 2]]').map((l) => [l.page, l.label])).toEqual([[9, 'Fig. 2']]);
  });

  it('ignores lookalikes', () => {
    expect(parsePageLinks('[[x4]] [[p]] [[p0]] [[note.md#page=2]] [p3] [[p3')).toEqual([]);
  });

  it('shifts offsets', () => {
    expect(parsePageLinks('[[p1]]', 10)[0]).toMatchObject({ from: 10, to: 16 });
  });

  it('matches only at the start for tokenizers', () => {
    expect(pageLinkAtStart('[[p2]] tail')).toMatchObject({ page: 2, to: 6 });
    expect(pageLinkAtStart(' [[p2]]')).toBeNull();
  });
});

describe('formatPageLink', () => {
  it('writes the native form', () => {
    expect(formatPageLink(7)).toBe('[[p7]]');
    expect(formatPageLink(7, '  3.2  Attention ')).toBe('[[p7|3.2 Attention]]');
  });

  it('keeps labels parseable', () => {
    const link = formatPageLink(5, 'a [weird] | label\nhere');
    expect(parsePageLinks(link)).toEqual([{ from: 0, to: link.length, page: 5, label: 'a weird label here' }]);
  });

  it('round-trips through the parser', () => {
    for (const [p, l] of [[1, undefined], [42, 'Results']] as const) {
      expect(parsePageLinks(formatPageLink(p, l))[0]).toMatchObject({ page: p, label: l ?? null });
    }
  });
});

describe('auto page links', () => {
  it('finds the nearest link above the cursor', () => {
    const t = '[[p1]] one\n\n[[p4]] two\n\n';
    expect(pageAbove(t, t.length)).toBe(4);
    expect(pageAbove(t, 11)).toBe(1);
    expect(pageAbove('no links', 8)).toBeNull();
  });

  it('ignores links below the cursor', () => {
    expect(pageAbove('a\n[[p9]]', 1)).toBeNull();
  });

  it('inserts a chip when the reader moved to another page', () => {
    expect(autoLinkInsert('[[p2]] note\n', 12, 5)).toBe('[[p5]] ');
    expect(autoLinkInsert('', 0, 1)).toBe('[[p1]] ');
  });

  it('stays quiet on the same page', () => {
    expect(autoLinkInsert('[[p5]] note\n', 12, 5)).toBeNull();
    expect(autoLinkInsert('[[doc.pdf#page=5|x]] note\n', 26, 5)).toBeNull();
  });

  it('fires on Enter only at the end of a line with content', () => {
    expect(startsParagraph('some text', true)).toBe(true);
    expect(startsParagraph('   ', true)).toBe(false);
    expect(startsParagraph('some text', false)).toBe(false);
  });

  it('counts only typing into an empty notebook as a first keystroke', () => {
    expect(isFirstKeystroke(0, 'input.type')).toBe(true);
    expect(isFirstKeystroke(3, 'input.type')).toBe(false);
    for (const e of ['input.paste', 'input.drop', 'undo', 'redo', undefined]) expect(isFirstKeystroke(0, e)).toBe(false);
  });
});

describe('blockInsertion', () => {
  const apply = (t: string, pos: number, b: string) => {
    const { from, insert } = blockInsertion(t, pos, b);
    return t.slice(0, from) + insert + t.slice(from);
  };

  it('puts the block on its own paragraph after the current line', () => {
    expect(apply('first line\nsecond', 3, '> q [[p1]]\n')).toBe('first line\n\n> q [[p1]]\n\nsecond');
  });

  it('inserts into an empty notebook', () => {
    expect(apply('', 0, '> q\n')).toBe('> q\n');
  });

  it('inserts before a line when dropped at its start', () => {
    expect(apply('a\n\nb', 3, '> q\n')).toBe('a\n\n> q\n\nb');
  });

  it('appends at the end', () => {
    expect(apply('a', 1, '> q\n')).toBe('a\n\n> q\n');
  });
});

describe('page links in rendering and export', () => {
  it('renders labelled and Obsidian links as chips', () => {
    const html = renderMarkdown('[[p3|Intro]] and [[a.pdf#page=8]]');
    expect(html).toContain('data-page="3"');
    expect(html).toContain('>Intro</a>');
    expect(html).toContain('data-page="8"');
    expect(html).toContain('p.&nbsp;8');
  });

  it('escapes labels', () => {
    expect(renderMarkdown('[[p3|<b>x</b>]]')).not.toContain('<b>');
  });

  it('unlinks every form on export', () => {
    const md = exportMarkdown({
      doc: { title: 't', fileName: 't.pdf', pageCount: 9 }, annotations: [], cards: [], meanings: DEFAULT_MEANINGS,
      exportedAt: new Date(0), notebook: 'see [[p2]], [[p3|Intro]] and [[a.pdf#page=4]]',
    });
    expect(md).toContain('see (p. 2), Intro (p. 3) and (p. 4)');
  });
});
