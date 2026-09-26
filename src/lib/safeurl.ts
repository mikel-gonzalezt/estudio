const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', colon: ':', tab: '\t', newline: '\n', sol: '/', period: '.', num: '#',
};

const ENTITY = /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));?/gi;

const codePoint = (n: number) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '�');

/** Decodes the character references a browser would decode in an attribute; unknown names stay as written. */
export function decodeEntities(s: string): string {
  return s.replace(ENTITY, (m, dec?: string, hex?: string, name?: string) => {
    if (dec) return codePoint(Number(dec));
    if (hex) return codePoint(parseInt(hex, 16));
    return NAMED[name!.toLowerCase()] ?? m;
  });
}

const EXTERNAL = new Set(['http:', 'https:', 'mailto:']);

/**
 * The href a link in a note may carry: an `http`, `https` or `mailto` URL, normalised by the URL
 * parser, or an in-page `#fragment`. Null for anything else, which is then shown as plain text.
 * `raw` is checked after decoding character references, as the browser would read it.
 */
export function safeHref(raw: string): string | null {
  const s = decodeEntities(raw).replace(/^[\u0000- ]+|[\u0000- ]+$/g, '').replace(/[\t\n\r]/g, '');
  if (s.startsWith('#')) return s;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  return EXTERNAL.has(url.protocol) ? url.href : null;
}

/** An href from `safeHref` that leaves the app, as opposed to an in-page fragment. */
export const isExternal = (href: string) => !href.startsWith('#');
