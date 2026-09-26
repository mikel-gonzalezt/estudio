import { describe, expect, it } from 'vitest';
import { checkboxEdit, emptyItemEdit, isListItem, toggleWrap, type Edit } from './mdedit';
import { renderMarkdown } from './notebook';

const apply = (text: string, changes: readonly Edit[]) => {
  let out = text;
  for (const c of [...changes].sort((a, b) => b.from - a.from)) out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  return out;
};

function wrap(marked: string, mark: string) {
  const from = marked.indexOf('[');
  const to = marked.indexOf(']') - 1;
  const text = marked.replace('[', '').replace(']', '');
  const r = toggleWrap(text, from, to, mark);
  const out = apply(text, r.changes);
  return `${out.slice(0, r.anchor)}[${out.slice(r.anchor, r.head)}]${out.slice(r.head)}`;
}

describe('toggleWrap', () => {
  it('wraps a selection and keeps the text selected', () => {
    expect(wrap('a [word] b', '**')).toBe('a **[word]** b');
    expect(wrap('a [word] b', '==')).toBe('a ==[word]== b');
    expect(wrap('a [word] b', '`')).toBe('a `[word]` b');
  });

  it('unwraps when the markers sit just outside the selection', () => {
    expect(wrap('a **[word]** b', '**')).toBe('a [word] b');
    expect(wrap('a ~~[word]~~ b', '~~')).toBe('a [word] b');
  });

  it('unwraps when the selection includes the markers', () => {
    expect(wrap('a [**word**] b', '**')).toBe('a [word] b');
    expect(wrap('a [*word*] b', '*')).toBe('a [word] b');
  });

  it('inserts an empty pair at a cursor and removes it again', () => {
    expect(wrap('a [] b', '**')).toBe('a **[]** b');
    expect(wrap('a **[]** b', '**')).toBe('a [] b');
  });

  it('adds italics to bold text instead of breaking the bold', () => {
    expect(wrap('**[word]**', '*')).toBe('***[word]***');
    expect(wrap('***[word]***', '*')).toBe('**[word]**');
    expect(wrap('***[word]***', '**')).toBe('*[word]*');
  });

  it('does not treat a selection made only of markers as wrapped text', () => {
    expect(wrap('[**]', '**')).toBe('**[**]**');
  });
});

describe('checkboxEdit', () => {
  const toggle = (line: string) => apply(line, [checkboxEdit(line)]);

  it('flips a task', () => {
    expect(toggle('- [ ] milk')).toBe('- [x] milk');
    expect(toggle('  * [X] milk')).toBe('  * [ ] milk');
    expect(toggle('3. [ ] step')).toBe('3. [x] step');
  });

  it('turns a list item or plain line into a task', () => {
    expect(toggle('- milk')).toBe('- [ ] milk');
    expect(toggle('1) step')).toBe('1) [ ] step');
    expect(toggle('  buy milk')).toBe('  - [ ] buy milk');
    expect(toggle('> quoted')).toBe('> - [ ] quoted');
    expect(toggle('')).toBe('- [ ] ');
  });

  it('recognises list items', () => {
    expect(isListItem('- a')).toBe(true);
    expect(isListItem('  12. a')).toBe(true);
    expect(isListItem('-a')).toBe(false);
    expect(isListItem('text')).toBe(false);
  });
});

describe('preview highlight', () => {
  it('renders ==text== as a highlight, leaving code alone', () => {
    expect(renderMarkdown('a ==key **idea**== b')).toContain('<mark>key <strong>idea</strong></mark>');
    expect(renderMarkdown('`==x==` and a == b == c')).not.toContain('<mark>');
  });
});

describe('emptyItemEdit', () => {
  const run = (line: string) => {
    const e = emptyItemEdit(line);
    return e ? apply(line, [e]) : null;
  };

  it('removes the marker of an empty item, keeping its indentation', () => {
    expect(run('- ')).toBe('');
    expect(run('    2. ')).toBe('    ');
    expect(run('- [ ] ')).toBe('');
    expect(run('> - ')).toBe('> ');
  });

  it('leaves items with content alone', () => {
    expect(run('- a')).toBeNull();
    expect(run('- [ ] a')).toBeNull();
    expect(run('text')).toBeNull();
  });
});
