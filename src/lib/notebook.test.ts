import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './notebook';

describe('preview: images, maths and tables', () => {
  it('leaves local image sources for the resolver and loads remote ones', () => {
    const html = renderMarkdown('![Figure](attachments/Pasted%20image%201.png "T") ![x](https://e.org/a.png)');
    expect(html).toContain('data-src="attachments/Pasted%20image%201.png"');
    expect(html).toContain('alt="Figure"');
    expect(html).toContain('src="https://e.org/a.png"');
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
