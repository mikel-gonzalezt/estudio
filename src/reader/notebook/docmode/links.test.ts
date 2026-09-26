// @vitest-environment jsdom
import { DOMParser as PMDOMParser, DOMSerializer } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import { DocMarkdown } from './markdown';
import { docExtensions } from './schema';

const md = new DocMarkdown(docExtensions());
const { schema } = md;

function html(markdown: string): string {
  const div = document.createElement('div');
  div.append(DOMSerializer.fromSchema(schema).serializeFragment(md.parse(markdown).doc.content));
  return div.innerHTML;
}

function pastedHrefs(markup: string): string[] {
  const div = document.createElement('div');
  div.innerHTML = markup;
  const hrefs: string[] = [];
  PMDOMParser.fromSchema(schema).parse(div).descendants((n) => {
    for (const m of n.marks) if (m.type.name === 'link') hrefs.push(m.attrs.href as string);
  });
  return hrefs;
}

describe('Document mode links', () => {
  it.each([
    '[x](javascript:alert(1))',
    '[x](javascript&#58;alert(1))',
    '[x](JAVASCRIPT&colon;alert(1))',
    '[x](vbscript:msgbox(1))',
    '[x](data:text/html,<script>alert(1)</script>)',
  ])('shows %j with no href', (text) => {
    const out = html(text);
    expect(out).not.toMatch(/href="[^"]/);
    expect(out).not.toMatch(/javascript|vbscript|data:/i);
  });

  it('opens web links in a new tab without an opener', () => {
    expect(html('[x](https://example.org)')).toBe('<p><a target="_blank" rel="noopener noreferrer" href="https://example.org">x</a></p>');
  });

  it('drops the link from pasted HTML with a script URL', () => {
    const hrefs = pastedHrefs(
      '<p><a href="javascript:alert(1)">a</a> <a href="  JaVaScRiPt:alert(1)">b</a> <a href="data:text/html,x">c</a>'
      + ' <a href="vbscript:x">d</a> <a href="https://example.org/">e</a></p>',
    );
    expect(hrefs).toEqual(['https://example.org/']);
  });
});
