import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { mathError } from './katex';

describe('mathError', () => {
  it('is null for LaTeX that typesets', () => {
    expect(mathError(katex, String.raw`\frac{a}{b}`, false)).toBeNull();
    expect(mathError(katex, 'x^2', true)).toBeNull();
  });

  it("names KaTeX's complaint without its position suffix", () => {
    expect(mathError(katex, String.raw`\foo x`, false)).toBe(String.raw`Undefined control sequence: \foo`);
    expect(mathError(katex, String.raw`\frac{a}`, false)).toMatch(/^Unexpected end of input/);
  });
});

describe('untrusted commands', () => {
  it.each([String.raw`\href{javascript:alert(1)}{x}`, String.raw`\url{javascript:alert(1)}`, String.raw`\htmlData{onclick=alert(1)}{x}`])('%s makes no link or attribute', (latex) => {
    const html = katex.renderToString(latex, { throwOnError: false, output: 'html' });
    expect(html).not.toMatch(/<a\b|javascript:|onclick/);
  });
});
