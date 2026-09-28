import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { loadRemote } from '../attachments';
import { DOCX_MIME, notesToDocx, parseNotes, type FormulaRenderer, type ImageResolver, type ResolvedImage } from './docx';

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const png = (width: number, height: number): ResolvedImage => ({ bytes: PNG, mime: 'image/png', width, height });

const images: Record<string, ResolvedImage> = {
  'attachments/Pasted%20image%2020260926143012.png': png(1200, 600),
  'small.png': png(100, 50),
  'estudio-attachment:abc': png(300, 300),
};
const resolveImage: ImageResolver = async (src) => images[src] ?? null;
const rendered: string[] = [];
const renderFormula: FormulaRenderer = async (latex) => {
  rendered.push(latex);
  return png(80, 20);
};

async function unzip(markdown: string) {
  const blob = await notesToDocx(markdown, { title: 'Paper', resolveImage, renderFormula });
  return JSZip.loadAsync(await blob.arrayBuffer());
}

async function body(markdown: string): Promise<string> {
  const xml = await (await unzip(markdown)).file('word/document.xml')!.async('string');
  return /<w:body>([\s\S]*)<w:sectPr/.exec(xml)![1]!;
}

const text = (xml: string) => [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
const paragraphs =(xml: string) => xml.match(/<w:p>[\s\S]*?<\/w:p>|<w:p [\s\S]*?<\/w:p>/g) ?? [];

describe('notesToDocx', () => {
  it('produces a Word document with the title as a property', async () => {
    const blob = await notesToDocx('hi', { title: 'Paper', resolveImage });
    expect(blob.type).toBe(DOCX_MIME);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(await zip.file('docProps/core.xml')!.async('string')).toContain('<dc:title>Paper</dc:title>');
  });

  it('drops the frontmatter', async () => {
    const xml = await body('---\nestudio-doc: abc\npdf: "[[paper.pdf]]"\n---\n# Notes\n');
    expect(xml).not.toContain('estudio-doc');
    expect(xml).toContain('>Notes</w:t>');
  });

  it('writes headings in Word heading styles that carry outline levels', async () => {
    const zip = await unzip('# One\n\n### Three');
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toMatch(/<w:pStyle w:val="Heading1"\/>[^]*?>One</);
    expect(xml).toMatch(/<w:pStyle w:val="Heading3"\/>[^]*?>Three</);
    const styles = await zip.file('word/styles.xml')!.async('string');
    for (const level of [1, 2, 3, 4, 5, 6]) {
      expect(styles).toMatch(new RegExp(`w:styleId="Heading${level}"[^]*?<w:outlineLvl w:val="${level - 1}"/>[^]*?</w:style>`));
    }
  });

  it('writes bold, italic, strike, inline code and highlight', async () => {
    const xml = await body('**b** *i* ~~s~~ `c` ==h **hb**==');
    expect(xml).toMatch(/<w:b\/>[^]*?<w:t[^>]*>b<\/w:t>/);
    expect(xml).toMatch(/<w:i\/>[^]*?<w:t[^>]*>i<\/w:t>/);
    expect(xml).toMatch(/<w:strike\/>[^]*?<w:t[^>]*>s<\/w:t>/);
    expect(xml).toMatch(/<w:rFonts w:ascii="Consolas"[^]*?<w:shd [^>]*w:fill="F2F2F2"[^]*?<w:t[^>]*>c<\/w:t>/);
    expect(xml).toMatch(/<w:rPr><w:highlight w:val="yellow"\/>[^]*?<\/w:rPr><w:t[^>]*>h <\/w:t>/);
    expect(xml).toMatch(/<w:rPr><w:b\/><w:bCs\/><w:highlight w:val="yellow"\/>[^]*?<\/w:rPr><w:t[^>]*>hb<\/w:t>/);
    expect(xml).not.toContain('==');
  });

  it('leaves unmatched highlight markers as text', async () => {
    expect(await body('a == b')).toContain('>a == b</w:t>');
  });

  it('writes soft line breaks as Word line breaks, as the preview shows them', async () => {
    expect(await body('one\ntwo')).toMatch(/>one<\/w:t><\/w:r><w:r><w:br\/><w:t[^>]*>two</);
  });

  it('writes page links as their text, not as links', async () => {
    const xml = await body('See [[p12]], [[p3|Intro]] and [[paper.pdf#page=7|p. 7]].');
    expect(xml).toContain('>p. 12</w:t>');
    expect(xml).toContain('>Intro</w:t>');
    expect(xml).toContain('>p. 7</w:t>');
    expect(xml).not.toContain('[[');
    expect(xml).not.toContain('<w:hyperlink');
  });

  it('writes external links as hyperlinks', async () => {
    const zip = await unzip('[site](https://example.com) and [ref][r] and [bad](javascript&#58;alert(1))\n\n[r]: https://ref.org');
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toMatch(/<w:hyperlink [^>]*r:id="[^"]+"[^]*?<w:rStyle w:val="Hyperlink"\/>[^]*?>site<\/w:t>/);
    expect(await zip.file('word/styles.xml')!.async('string')).toContain('w:styleId="Hyperlink"');
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
    expect(rels).toMatch(/Target="https:\/\/example.com\/" TargetMode="External"/);
    expect(rels).not.toContain('javascript');
    expect(rels).toMatch(/Target="https:\/\/ref.org\/" TargetMode="External"/);
  });

  it('writes bullet, numbered and nested lists with numbering levels', async () => {
    const xml = await body('- a\n    - b\n\n1. one\n2. two\n\ntext\n\n1. again');
    const ps = paragraphs(xml);
    const num = (p: string) => /<w:ilvl w:val="(\d)"\/><w:numId w:val="(\d+)"\/>/.exec(p)?.slice(1);
    const [a, b, one, two, , again] = ps.map(num);
    expect(a![0]).toBe('0');
    expect(b![0]).toBe('1');
    expect(b![1]).toBe(a![1]);
    expect(one![1]).toBe(two![1]);
    expect(one![1]).not.toBe(a![1]);
    expect(again![1]).not.toBe(one![1]);
    const numbering = await (await unzip('- a\n\n1. one')).file('word/numbering.xml')!.async('string');
    expect(numbering).toContain('<w:numFmt w:val="decimal"/>');
    expect(numbering).toContain('<w:lvlText w:val="•"/>');
  });

  it('writes tasks as ballot-box bullets', async () => {
    const zip = await unzip('- [ ] todo\n- [x] done');
    const numbering = await zip.file('word/numbering.xml')!.async('string');
    expect(numbering).toContain('<w:lvlText w:val="☐"/>');
    expect(numbering).toContain('<w:lvlText w:val="☑"/>');
    const xml = await zip.file('word/document.xml')!.async('string');
    const ids = [...xml.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(2);
    expect(xml).not.toContain('[ ]');
  });

  it('writes a blockquote indented with a left border', async () => {
    const xml = await body('> quoted [[p4]]');
    expect(xml).toMatch(/<w:pBdr><w:left w:val="single"[^>]*\/><\/w:pBdr>/);
    expect(xml).toContain('<w:ind w:left="360"/>');
    expect(xml).toContain('>p. 4</w:t>');
  });

  it('writes a code block in shaded monospace, one line per break', async () => {
    const xml = await body('```js\nconst a = 1;\nreturn a;\n```');
    expect(xml).toMatch(/<w:shd [^>]*w:fill="F2F2F2"/);
    expect(xml).toMatch(/Consolas[^]*>const a = 1;<\/w:t><\/w:r><w:r>[^]*<w:br\/><w:t[^>]*>return a;/);
  });

  it('writes a horizontal rule as a bottom border', async () => {
    expect(await body('a\n\n---\n\nb')).toMatch(/<w:pBdr><w:bottom w:val="single"/);
  });

  it('writes a GFM table with a bold header row, borders and alignment', async () => {
    const xml = await body('| Term | Page | Note |\n|:--|:-:|--:|\n| **x** | [[p2]] | $y^2$ |\n| short |');
    expect(xml).toContain('<w:tblHeader/>');
    expect(xml).toMatch(/<w:tblBorders><w:top w:val="single"/);
    expect(xml).toMatch(/<w:b\/>[^]*?>Term<\/w:t>/);
    expect(xml).toMatch(/<w:jc w:val="center"\/>[^]*?>Page</);
    expect(xml).toMatch(/<w:jc w:val="right"\/>[^]*?>Note</);
    expect(xml.match(/<w:tr>/g)).toHaveLength(3);
    expect(xml.match(/<w:tc>/g)).toHaveLength(9);
    expect(xml).toContain('>p. 2</w:t>');
    expect(xml).toContain('<m:sSup>');
  });

  it('embeds images scaled to the page width, keeping the aspect ratio', async () => {
    const zip = await unzip('![Figure](attachments/Pasted%20image%2020260926143012.png) [[p4]]\n\n![](small.png)\n\n![[small.png]]\n\n![](estudio-attachment:abc)');
    const xml = await zip.file('word/document.xml')!.async('string');
    const extents = [...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map((m) => [Number(m[1]) / 9525, Number(m[2]) / 9525]);
    expect(extents).toEqual([[600, 300], [100, 50], [100, 50], [300, 300]]);
    expect(xml).toContain('descr="Figure"');
    expect(xml.match(/<w:drawing>/g)).toHaveLength(4);
  });

  it('says so in italics when an image cannot be found', async () => {
    const xml = await body('![x](missing.png)');
    expect(xml).toMatch(/<w:i\/>[^]*?>\[image not found: missing.png\]<\/w:t>/);
    expect(xml).not.toContain('<w:drawing>');
  });

  it('writes a remote image as its placeholder until the user loaded it', async () => {
    const src = 'https://img.example.org/fig.png';
    images[src] = png(100, 50);
    const before = await body(`![x](${src})`);
    expect(before).toMatch(/<w:i\/>[^]*?>\[Remote image: img.example.org\]<\/w:t>/);
    expect(before).not.toContain('<w:drawing>');
    loadRemote(src);
    expect(await body(`![x](${src})`)).toContain('<w:drawing>');
  });

  it('writes a formula that maps to OMML as a native Word equation', async () => {
    rendered.length = 0;
    const xml = await body('Inline $\\frac{a}{b}$ here.\n\n$$\n\\sum_{i=1}^{n} x_i^2\n$$');
    expect(xml).toMatch(/<w:p>[^]*?>Inline <\/w:t><\/w:r><m:oMath><m:f>/);
    expect(xml).toMatch(/<m:oMathPara><m:oMath><m:nary><m:naryPr><m:chr m:val="∑"\/>/);
    expect(rendered).toEqual([]);
  });

  it('falls back to a picture of a formula outside the OMML subset, with its LaTeX as alt text', async () => {
    rendered.length = 0;
    const xml = await body('$$\n\\cancel{x} + 1\n$$');
    expect(rendered).toEqual(['\\cancel{x} + 1']);
    expect(xml).not.toContain('<m:oMath');
    expect(xml).toContain('<w:drawing>');
    expect(xml).toContain('descr="\\cancel{x} + 1"');
  });

  it('keeps the LaTeX as text when a formula can be neither converted nor drawn', async () => {
    const blob = await notesToDocx('$\\cancel{x}$', { title: 't', resolveImage, renderFormula: async () => null });
    const xml = await (await JSZip.loadAsync(await blob.arrayBuffer())).file('word/document.xml')!.async('string');
    expect(xml).toContain('>$\\cancel{x}$</w:t>');
  });

  it('reads dollars with inner spaces as text, not maths', async () => {
    expect(text(await body('from $5 to $10'))).toBe('from $5 to $10');
  });
});

describe('parseNotes', () => {
  it('finds page links and highlights inside other formatting', () => {
    const tree = parseNotes('**see [[p3]]** ==a *b*==');
    const p = tree.children[0]!;
    expect(p.type).toBe('paragraph');
    const kids = (p as { children: { type: string }[] }).children.map((c) => c.type);
    expect(kids).toEqual(['strong', 'text', 'highlight']);
    expect(JSON.stringify(p)).toContain('"type":"pageLink","page":3');
  });
});

describe('empty lines', () => {
  it('writes an &nbsp; line as its own blank paragraph, not as the entity', async () => {
    const xml = await body('one\n\n&nbsp;\n\ntwo\n');
    expect(text(xml)).not.toContain('&amp;nbsp;');
    expect(paragraphs(xml).map((p) => text(p).trim())).toEqual(['one', '', 'two']);
  });
});
