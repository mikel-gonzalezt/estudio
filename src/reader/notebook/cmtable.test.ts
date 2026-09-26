import { markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { cursorInTable } from './cmwidgets';

const DOC = 'Intro line\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nAfter | not a table';

const at = (anchor: number) => cursorInTable(EditorState.create({ doc: DOC, selection: { anchor }, extensions: markdownLanguage }));

describe('cursorInTable', () => {
  it('is true anywhere in a GFM table, including its first and last character', () => {
    const start = DOC.indexOf('| a');
    const end = DOC.indexOf('| 2 |') + '| 2 |'.length;
    expect(at(start)).toBe(true);
    expect(at(DOC.indexOf('---'))).toBe(true);
    expect(at(end)).toBe(true);
  });

  it('is false outside, including a line with a stray pipe', () => {
    expect(at(0)).toBe(false);
    expect(at(DOC.indexOf('| a') - 1)).toBe(false);
    expect(at(DOC.length)).toBe(false);
  });
});
