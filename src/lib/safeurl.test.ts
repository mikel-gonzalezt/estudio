import { describe, expect, it } from 'vitest';
import { decodeEntities, safeHref } from './safeurl';

const HOSTILE_HREFS = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  ' javascript:alert(1)',
  '\u0001javascript:alert(1)',
  'java\tscript:alert(1)',
  'java\nscript:alert(1)',
  'javascript&#58;alert(1)',
  'javascript&#x3A;alert(1)',
  'javascript&#0000058alert(1)',
  'javascript&colon;alert(1)',
  '&#106;avascript:alert(1)',
  'jav&#x09;ascript:alert(1)',
  'vbscript:msgbox(1)',
  'VBSCRIPT:msgbox(1)',
  'data:text/html,<script>alert(1)</script>',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  'DATA:image/svg+xml,<svg onload=alert(1)>',
  'file:///C:/Windows/win.ini',
  'blob:https://example.org/uuid',
  'estudio-attachment:abc',
  '//evil.example/x',
  'notes/other.md',
  '',
];

describe('safeHref', () => {
  it.each(HOSTILE_HREFS)('rejects %j', (href) => {
    expect(safeHref(href)).toBeNull();
  });

  it('keeps web, mail and in-page links, normalised', () => {
    expect(safeHref('https://example.org/a?b=1&c=2')).toBe('https://example.org/a?b=1&c=2');
    expect(safeHref('HTTP://Example.org')).toBe('http://example.org/');
    expect(safeHref(' https://example.org/\t')).toBe('https://example.org/');
    expect(safeHref('h&#116;tps://example.org/')).toBe('https://example.org/');
    expect(safeHref('mailto:someone@example.org')).toBe('mailto:someone@example.org');
    expect(safeHref('#p12')).toBe('#p12');
  });

  it('decodes numeric and common named references', () => {
    expect(decodeEntities('a&#58;b&#x3a;c&colon;d&amp;e&unknown;')).toBe('a:b:c:d&e&unknown;');
    expect(decodeEntities('&#0;&#x110000;')).toBe('\ufffd\ufffd');
  });
});
