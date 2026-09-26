import temml from 'temml';

/** A plain XML element: MathML read from temml, and the OMML written for Word. */
export interface XmlNode { name: string; attrs: Record<string, string>; children: XmlChild[] }
export type XmlChild = XmlNode | string;

/** The formula uses MathML that has no OMML mapping here; the caller falls back to a picture. */
export class UnsupportedMath extends Error {}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e] ?? m),
  );

/** Reads the well-formed XML that temml writes: elements, attributes, text, no comments or CDATA. */
export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  for (const m of xml.matchAll(/<(\/?)([\w:-]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g)) {
    const top = stack.at(-1)!;
    if (m[5] !== undefined) {
      top.children.push(decode(m[5]));
      continue;
    }
    if (m[1]) {
      stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of m[3]!.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]!] = decode(a[2]!);
    const el: XmlNode = { name: m[2]!, attrs, children: [] };
    top.children.push(el);
    if (!m[4]) stack.push(el);
  }
  const first = root.children.find((c): c is XmlNode => typeof c !== 'string');
  if (!first) throw new UnsupportedMath('empty');
  return first;
}

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toXml(n: XmlChild): string {
  if (typeof n === 'string') return escapeXml(n);
  const attrs = Object.entries(n.attrs).map(([k, v]) => ` ${k}="${escapeXml(v)}"`).join('');
  return n.children.length ? `<${n.name}${attrs}>${n.children.map(toXml).join('')}</${n.name}>` : `<${n.name}${attrs}/>`;
}

const m = (name: string, children: XmlChild[] = [], attrs: Record<string, string> = {}): XmlNode => ({ name: `m:${name}`, attrs, children });
const val = (name: string, v: string) => m(name, [], { 'm:val': v });

const elements = (n: XmlNode) => n.children.filter((c): c is XmlNode => typeof c !== 'string');
const textOf = (n: XmlNode): string => n.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');

const NARY = new Set([...'∑∏∐∫∬∭∮∯∰⋀⋁⋂⋃⨀⨁⨂⨄⨆']);
/** Operators that end the operand of a sum or integral written without braces. */
const NARY_STOP = new Set([...'=<>≤≥≠≈≡∼≃≅→←⇒⇔,;+−-±∓']);
const INVISIBLE = /^[⁡-⁤]*$/;
const ACCENTS: Record<string, string> = {
  'ˆ': '̂', '^': '̂', '˜': '̃', '~': '̃', '¯': '̄', '‾': '̅', '→': '⃗', '⃗': '⃗',
  '˙': '̇', '¨': '̈', 'ˇ': '̌', '˘': '̆', '´': '́', '`': '̀', '˚': '̊',
};
const GROUP_CHARS = new Set([...'⏟⏞︸︷']);

function run(text: string, style?: 'p' | 'b' | 'bi' | 'nor'): XmlNode {
  const props = style === 'nor' ? [m('rPr', [m('nor')])] : style ? [m('rPr', [val('sty', style)])] : [];
  return m('r', [...props, { name: 'm:t', attrs: { 'xml:space': 'preserve' }, children: [text] }]);
}

function miStyle(n: XmlNode, text: string): 'p' | 'b' | 'bi' | undefined {
  const v = n.attrs.mathvariant;
  if (v === 'bold') return 'b';
  if (v === 'bold-italic') return 'bi';
  if (v === 'normal') return 'p';
  return [...text].length > 1 ? 'p' : undefined;
}

function space(n: XmlNode): XmlNode[] {
  const w = /^([\d.]+)(em|pt|px)?$/.exec(n.attrs.width ?? '');
  if (!w) return [];
  const em = Number(w[1]) / (w[2] === 'pt' ? 10 : w[2] === 'px' ? 16 : 1);
  if (em >= 0.9) return [run(' '.repeat(Math.round(em)))];
  return em >= 0.25 ? [run(' ')] : [];
}

const isMo = (n: XmlNode | undefined, test: (t: string) => boolean) => n?.name === 'mo' && test(textOf(n).trim());
const isFence = (n: XmlNode | undefined) => n?.name === 'mo' && n.attrs.fence === 'true';

/** The n-ary operator a scripted element is built on, with its limits. */
function naryParts(n: XmlNode): { chr: string; sub?: XmlNode; sup?: XmlNode; under: boolean } | null {
  const [base, a, b] = elements(n);
  if (n.name === 'mrow' && n.children.length === 1 && base) return naryParts(base);
  if (n.name === 'mo' && NARY.has(textOf(n).trim())) return { chr: textOf(n).trim(), under: false };
  if (!isMo(base, (t) => NARY.has(t))) return null;
  const chr = textOf(base!).trim();
  switch (n.name) {
    case 'msub': return { chr, sub: a, under: false };
    case 'msup': return { chr, sup: a, under: false };
    case 'msubsup': return { chr, sub: a, sup: b, under: false };
    case 'munder': return { chr, sub: a, under: true };
    case 'mover': return { chr, sup: a, under: true };
    case 'munderover': return { chr, sub: a, sup: b, under: true };
    default: return null;
  }
}

function nary(p: NonNullable<ReturnType<typeof naryParts>>, body: XmlNode[]): XmlNode {
  const props = [val('chr', p.chr), val('limLoc', p.under ? 'undOvr' : 'subSup')];
  if (!p.sub) props.push(val('subHide', '1'));
  if (!p.sup) props.push(val('supHide', '1'));
  return m('nary', [m('naryPr', props), m('sub', p.sub ? node(p.sub) : []), m('sup', p.sup ? node(p.sup) : []), m('e', row(body))]);
}

function row(nodes: XmlNode[]): XmlNode[] {
  const out: XmlNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const p = naryParts(nodes[i]!);
    if (!p) {
      out.push(...node(nodes[i]!));
      continue;
    }
    let j = i + 1;
    while (j < nodes.length && !isMo(nodes[j], (t) => NARY_STOP.has(t)) && !naryParts(nodes[j]!)) j++;
    out.push(nary(p, nodes.slice(i + 1, j)));
    i = j - 1;
  }
  return out;
}

const arg = (name: string, n: XmlNode | undefined) => m(name, n ? node(n) : []);

const isMiddle = (n: XmlNode) => n.name === 'mo' && n.attrs.stretchy === 'true' && n.attrs.form === 'infix';

/** `\left( … \middle| … \right)`: one delimiter object whose parts are split by the middle bars. */
function fenced(kids: XmlNode[]): XmlNode {
  const chr = (n: XmlNode) => textOf(n).trim();
  const parts: XmlNode[][] = [[]];
  const seps = new Set<string>();
  for (const k of kids.slice(1, -1)) {
    if (isMiddle(k)) {
      seps.add(chr(k));
      parts.push([]);
    } else parts.at(-1)!.push(k);
  }
  if (seps.size > 1) throw new UnsupportedMath('mixed \\middle delimiters');
  const props = [val('begChr', chr(kids[0]!)), ...(seps.size ? [val('sepChr', [...seps][0]!)] : []), val('endChr', chr(kids.at(-1)!))];
  return m('d', [m('dPr', props), ...parts.map((p) => m('e', row(p)))]);
}

function table(n: XmlNode): XmlNode {
  const rows = elements(n).map((r) => {
    if (r.name !== 'mtr') throw new UnsupportedMath(r.name);
    return elements(r);
  });
  const cols = Math.max(...rows.map((r) => r.length));
  const align = (c: number) => {
    const cls = rows.map((r) => r[c]?.attrs.class ?? '');
    return cls.every((s) => s.includes('tml-left')) ? 'left' : cls.every((s) => s.includes('tml-right')) ? 'right' : 'center';
  };
  const mcs = Array.from({ length: cols }, (_, c) => m('mc', [m('mcPr', [val('count', '1'), val('mcJc', align(c))])]));
  return m('m', [
    m('mPr', [m('mcs', mcs)]),
    ...rows.map((r) => m('mr', Array.from({ length: cols }, (_, c) => m('e', r[c] ? row(elements(r[c]!)) : [])))),
  ]);
}

function scripted(n: XmlNode): XmlNode {
  const [base, a, b] = elements(n);
  if (n.name === 'mover' && a && isMo(a, (t) => t in ACCENTS)) {
    return m('acc', [m('accPr', [val('chr', ACCENTS[textOf(a).trim()]!)]), arg('e', base)]);
  }
  if ((n.name === 'mover' || n.name === 'munder') && a && isMo(a, (t) => GROUP_CHARS.has(t))) {
    const top = n.name === 'mover';
    return m('groupChr', [m('groupChrPr', [val('chr', textOf(a).trim()), val('pos', top ? 'top' : 'bot'), val('vertJc', top ? 'bot' : 'top')]), arg('e', base)]);
  }
  switch (n.name) {
    case 'msub': return m('sSub', [arg('e', base), arg('sub', a)]);
    case 'msup': return m('sSup', [arg('e', base), arg('sup', a)]);
    case 'msubsup': return m('sSubSup', [arg('e', base), arg('sub', a), arg('sup', b)]);
    case 'munder': return m('limLow', [arg('e', base), arg('lim', a)]);
    case 'mover': return m('limUpp', [arg('e', base), arg('lim', a)]);
    default: return m('limUpp', [m('e', [m('limLow', [arg('e', base), arg('lim', a)])]), arg('lim', b)]);
  }
}

function node(n: XmlNode): XmlNode[] {
  const kids = elements(n);
  switch (n.name) {
    case 'math':
    case 'mstyle':
    case 'mpadded':
      return row(kids);
    case 'mrow':
      return kids.length >= 2 && isFence(kids[0]) && isFence(kids.at(-1)) ? [fenced(kids)] : row(kids);
    case 'semantics':
      return kids[0] ? node(kids[0]) : [];
    case 'mphantom':
      return [];
    case 'mspace':
      return space(n);
    case 'mi': {
      const t = textOf(n);
      return [run(t, miStyle(n, t))];
    }
    case 'mn':
      return [run(textOf(n))];
    case 'mo': {
      const t = textOf(n);
      return INVISIBLE.test(t) ? [] : [run(t)];
    }
    case 'mtext':
    case 'ms':
      return [run(textOf(n), 'nor')];
    case 'mfrac': {
      const thin = /^0(\.0*)?(px|pt|em)?$/.test(n.attrs.linethickness ?? '');
      return [m('f', [...(thin ? [m('fPr', [val('type', 'noBar')])] : []), arg('num', kids[0]), arg('den', kids[1])])];
    }
    case 'msqrt':
      return [m('rad', [m('radPr', [val('degHide', '1')]), m('deg'), m('e', row(kids))])];
    case 'mroot':
      return [m('rad', [arg('deg', kids[1]), arg('e', kids[0])])];
    case 'msub':
    case 'msup':
    case 'msubsup':
    case 'munder':
    case 'mover':
    case 'munderover':
      return [scripted(n)];
    case 'menclose': {
      const notation = n.attrs.notation ?? '';
      if (notation === 'top' || notation === 'bottom') return [m('bar', [m('barPr', [val('pos', notation === 'top' ? 'top' : 'bot')]), m('e', row(kids))])];
      if (notation === 'box') return [m('borderBox', [m('e', row(kids))])];
      throw new UnsupportedMath(`menclose ${notation}`);
    }
    case 'mtable':
      return [table(n)];
    default:
      throw new UnsupportedMath(n.name);
  }
}

export function latexToMathml(latex: string, display: boolean): string {
  return temml.renderToString(latex, { displayMode: display, xml: true, throwOnError: true });
}

/**
 * The `m:oMath` element for a LaTeX formula. Throws `UnsupportedMath` when the formula needs
 * MathML outside the mapped subset, and temml's `ParseError` when the LaTeX does not parse.
 */
export function latexToOmml(latex: string, display: boolean): XmlNode {
  return m('oMath', node(parseXml(latexToMathml(latex, display))));
}
