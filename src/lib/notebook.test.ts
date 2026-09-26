import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './notebook';

describe('preview: images, maths and tables', () => {
  it('leaves every image source for the resolver, so none loads by itself', () => {
    const html = renderMarkdown('![Figure](attachments/Pasted%20image%201.png "T") ![x](https://e.org/a.png)');
    expect(html).toContain('data-src="attachments/Pasted%20image%201.png"');
    expect(html).toContain('alt="Figure"');
    expect(html).toContain('data-src="https://e.org/a.png"');
    expect(html).not.toMatch(/\ssrc=/);
  });

  it('renders Obsidian image embeds and leaves other embeds as text', () => {
    expect(renderMarkdown('![[diagram.png]]')).toContain('data-src="diagram.png"');
    expect(renderMarkdown('![[Other note]]')).not.toContain('<img');
  });

  it('marks inline and block maths for KaTeX', () => {
    const html = renderMarkdown('Energy $E=mc^2$ costs \\$5.\n\n$$\n\\int_0^1 x\\,dx\n$$\n');
    expect(html).toContain('<span class="math" data-latex="E=mc^2">');
    expect(html).toContain('<div class="math math-display" data-latex="\\int_0^1 x\\,dx">');
    expect(html).toContain('costs $5.');
  });

  it('renders GFM tables with alignment', () => {
    const html = renderMarkdown('| A | B |\n|:--|--:|\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toMatch(/<th align="right">B<\/th>/);
  });

  it('writes page links as text for printing', () => {
    const html = renderMarkdown('See [[p4|Intro]] and [[paper.pdf#page=3|p. 3]] and [[p7]]', { plainLinks: true });
    expect(html).toContain('Intro (p. 4)');
    expect(html).not.toContain('p. 3 (p. 3)');
    expect(html).toContain('>p. 7<');
    expect(html).not.toContain('data-page');
  });
});

describe('preview: hostile links', () => {
  const HOSTILE = [
    '[x](javascript:alert(1))',
    '[x](JaVaScRiPt:alert(1))',
    '[x](javascript&#58;alert(1))',
    '[x](javascript&#x3a;alert(1))',
    '[x](javascript&colon;alert(1))',
    '[x](&#106;avascript:alert(1))',
    '[x](java&#x09;script:alert(1))',
    '[x](<java\tscript:alert(1)>)',
    '[x](%20javascript:alert(1))',
    '[x](vbscript:msgbox(1))',
    '[x](data:text/html,<script>alert(1)</script>)',
    '[x](data:text/html;base64,PHNjcmlwdD4=)',
    '<javascript:alert(1)>',
    '[x][r]\n\n[r]: javascript:alert(1)',
    '[x](file:///C:/Windows/win.ini)',
    '[x](notes/other.md)',
  ];

  it.each(HOSTILE)('renders %j as plain text', (md) => {
    const html = renderMarkdown(md);
    expect(html).not.toMatch(/<a\b/);
    expect(html).not.toMatch(/href=/i);
  });

  it('shows raw HTML links and scripts as text', () => {
    const html = renderMarkdown('<a href="javascript:alert(1)">x</a> <img src=x onerror=alert(1)>\n\n<script>alert(1)</script>');
    expect(html).not.toMatch(/<a\b|<img\b|<script\b/);
    expect(html).toContain('&lt;a href=&quot;javascript:alert(1)&quot;&gt;');
  });

  it('keeps KaTeX \href as LaTeX source for the typesetter', () => {
    const html = renderMarkdown('$\href{javascript:alert(1)}{x}$');
    expect(html).not.toMatch(/<a\b/);
    expect(html).toContain('data-latex="\href{javascript:alert(1)}{x}"');
  });

  it('keeps web, mail and in-page links, opening outside the app', () => {
    const html = renderMarkdown('[a](https://example.org/x?a=1&b=2 "T") [b](mailto:me@example.org) [c](#top) <https://example.org>');
    expect(html).toContain('<a href="https://example.org/x?a=1&amp;b=2" title="T" target="_blank" rel="noopener noreferrer">a</a>');
    expect(html).toContain('<a href="mailto:me@example.org" target="_blank" rel="noopener noreferrer">b</a>');
    expect(html).toContain('<a href="#top">c</a>');
    expect(html).toContain('<a href="https://example.org/" target="_blank" rel="noopener noreferrer">https://example.org</a>');
  });
});
