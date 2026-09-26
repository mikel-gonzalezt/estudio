import { describe, expect, it } from 'vitest';
import { blockMathAt, findMath, inlineMathAt } from './mathsyntax';

describe('inline maths', () => {
  it.each([
    ['$x^2$ rest', 'x^2'],
    ['$E=mc^2$.', 'E=mc^2'],
    ['$a \\$ b$', 'a \\$ b'],
    ['$x$', 'x'],
  ])('reads %s', (src, latex) => expect(inlineMathAt(src)?.latex).toBe(latex));

  it.each(['$ x$', '$x $', '$$x$$', '$5 and $6', '$\n$'])('rejects %s', (src) => expect(inlineMathAt(src)).toBeNull());
});

describe('block maths', () => {
  it('reads $$ on its own lines', () => {
    expect(blockMathAt('$$\n\\int_0^1 x\\,dx\n$$\nafter')).toEqual({ raw: '$$\n\\int_0^1 x\\,dx\n$$', latex: '\\int_0^1 x\\,dx' });
  });
  it('needs the closing $$ on its own line', () => expect(blockMathAt('$$\nx $$')).toBeNull());
});

describe('findMath', () => {
  it('finds inline and block spans with offsets, skipping escaped dollars and code', () => {
    const text = 'a $x$ b \\$5 and `$no$`\n$$\ny\n$$\n';
    expect(findMath(text)).toEqual([
      { from: 2, to: 5, latex: 'x', display: false },
      { from: 23, to: 30, latex: 'y', display: true },
    ]);
  });
  it('skips fenced code', () => expect(findMath('```\n$x$\n```\n$y$')).toEqual([{ from: 12, to: 15, latex: 'y', display: false }]));
});
