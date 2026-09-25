import { describe, expect, it } from 'vitest';
import { isCloze, nextClozeNumber, plainCloze, renderCloze, wrapCloze } from './cloze';
import { appendBlock, formatPageLink, pageLinks, quoteBlock, renderMarkdown } from './notebook';

describe('notebook', () => {
  it('quotes multi-line text with a trailing page back-link', () => {
    expect(quoteBlock('line one\nline two', 7)).toBe('> line one\n> line two [[p7]]\n');
  });

  it('appends blocks separated by one blank line', () => {
    expect(appendBlock('', 'a\n')).toBe('a\n');
    expect(appendBlock('# Notes\n\n\n', 'a\n')).toBe('# Notes\n\na\n');
  });

  it('finds page links', () => {
    expect(pageLinks('see [[p3]] and [[p12]], not [[x4]]')).toEqual([3, 12]);
  });

  it('renders page links as jump anchors', () => {
    const html = renderMarkdown('As shown in [[p4]].');
    expect(html).toContain('data-page="4"');
    expect(html).toContain('class="plink"');
  });

  it('writes and reads Obsidian-style links that name the PDF in vault notebooks', () => {
    expect(formatPageLink(3, undefined, 'my paper.pdf')).toBe('[[my paper.pdf#page=3|p. 3]]');
    expect(formatPageLink(3)).toBe('[[p3]]');
    expect(quoteBlock('x', 5, 'a.pdf')).toBe('> x [[a.pdf#page=5|p. 5]]\n');
    expect(pageLinks('[[a.pdf#page=5|p. 5]] [[b.pdf#page=6]] [[p7]]')).toEqual([5, 6, 7]);
    const html = renderMarkdown('see [[a.pdf#page=5|Fig <2>]]');
    expect(html).toContain('data-page="5"');
    expect(html).toContain('Fig&nbsp;&lt;2&gt;');
  });

  it('escapes raw HTML and neutralises javascript links', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))');
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/href="javascript/i);
  });

  it('renders quotes and emphasis', () => {
    expect(renderMarkdown('> **bold** [[p2]]')).toMatch(/<blockquote>[\s\S]*<strong>bold<\/strong>[\s\S]*data-page="2"/);
  });
});

describe('cloze', () => {
  const front = 'The {{c1::Transformer}} uses {{c2::self-attention::mechanism}}.';

  it('detects cloze syntax', () => {
    expect(isCloze(front)).toBe(true);
    expect(isCloze('plain text')).toBe(false);
  });

  it('hides deletions, showing hints when present', () => {
    expect(renderCloze(front, false)).toBe('The <span class="cloze-gap">[...]</span> uses <span class="cloze-gap">[mechanism]</span>.');
  });

  it('reveals answers and escapes HTML', () => {
    expect(renderCloze('a <b> {{c1::x}}', true)).toBe('a &lt;b&gt; <mark class="cloze">x</mark>');
  });

  it('wraps a selection in the next cloze number', () => {
    expect(nextClozeNumber(front)).toBe(3);
    expect(wrapCloze('alpha beta', 6, 10)).toBe('alpha {{c1::beta}}');
    expect(wrapCloze('alpha beta', 3, 3)).toBe('alpha beta');
  });

  it('strips cloze markup to plain text', () => {
    expect(plainCloze(front)).toBe('The Transformer uses self-attention.');
  });
});
