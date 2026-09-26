import { Fragment } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import { docExtensions } from './schema';
import { DocMarkdown, type Parsed } from './markdown';

const md = new DocMarkdown(docExtensions());

/** One entry per row of docs/NOTES-FORMAT.md, plus our own additions. */
const CORPUS: Record<string, string> = {
  headings: '# One\n\n## Two\n\n###### Six\n',
  emphasis: 'Some **bold**, *italic*, ~~strike~~ and ==highlight== text.\n',
  underscores: 'Readers accept __bold__ and _italic_ too.\n',
  inlineCode: 'Inline `code` here.\n',
  codeBlock: '```js\nconst x = 1;\n```\n',
  bullets: '- one\n- two\n    - nested\n- three\n',
  ordered: '1. first\n2. second\n3. third\n',
  tasks: '- [ ] todo\n- [x] done\n',
  quote: '> quoted text [[p3]]\n',
  table: '| A | B |\n|:--|--:|\n| 1 | 2 |\n| x | **y** |\n',
  pageLinks: 'See [[p12]] and [[p4|Intro]] and [[paper.pdf#page=3|p. 3]] and [[paper.pdf#page=9]].\n',
  inlineMath: 'Energy $E=mc^2$ and a price of \\$5.\n',
  blockMath: '$$\n\\int_0^1 x\\,dx\n$$\n',
  image: '![](attachments/Pasted%20image%2020260926143012.png)\n',
  imageTitle: '![Figure](estudio-attachment:abc123 "A title") [[p4]]\n',
  embed: '![[diagram.png]]\n',
  rule: 'Above\n\n---\n\nBelow\n',
  breaks: 'first line\nsecond line\n',
  frontmatter: '---\nestudio-doc: abc\npdf: "[[a.pdf]]"\ntags: [x]\n---\n# Title\n\nBody [[p1]]\n',
  literals: 'Text with [brackets], a_b_c, 2 * 3, 5 < 6 and a [link](https://x.y).\n',
};

const ALL = Object.values(CORPUS).map((s) => s.replace(/^---[\s\S]*?---\n/, '')).join('\n');

const roundTrip = (text: string) => {
  const p = md.parse(text);
  return md.serialize(p.doc, p);
};

/** What an edited block turns into: the serialiser alone, with no source to fall back on. */
const fresh = (text: string) => {
  const p = md.parse(text);
  return md.serialize(p.doc, { ...p, lead: '', blocks: [] } satisfies Parsed);
};

describe('Document mode round trip', () => {
  it.each(Object.entries(CORPUS))('keeps an untouched %s note byte for byte', (_k, text) => {
    expect(roundTrip(text)).toBe(text);
  });

  it('keeps a long mixed note, CRLF-free, byte for byte', () => expect(roundTrip(ALL)).toBe(ALL));

  it('keeps blank lines at the start and extra blank lines between blocks', () => {
    const text = '\n\n# T\n\n\n\npara\n';
    expect(roundTrip(text)).toBe(text);
  });
});

/**
 * The serialiser writes each syntax in the form the contract names. The only differences allowed
 * are the documented normalisations: table columns are padded so the pipes line up, the
 * alternative reader forms (`__b__`, `_i_`) are written as `**b**`, `*i*`, and a backslash
 * escape is written only where the text would otherwise read as markup.
 */
describe('Document mode serialiser (edited blocks)', () => {
  const NORMALISED: Record<string, string> = {
    table: '| A   |     B |\n| :-- | ----: |\n| 1   |     2 |\n| x   | **y** |\n',
    underscores: 'Readers accept **bold** and *italic* too.\n',
    inlineMath: 'Energy $E=mc^2$ and a price of $5.\n',
  };
  it.each(Object.entries(CORPUS))('writes %s in the contract form', (k, text) => {
    const body = text.replace(/^---[\s\S]*?---\n/, '');
    expect(fresh(text).replace(/^---[\s\S]*?---\n/, '')).toBe(NORMALISED[k] ?? body);
  });
});

describe('editing one block', () => {
  it('rewrites only the edited block', () => {
    const text = '# T\n\nA  paragraph   with odd  spacing [[p1]]\n\n- [ ] task\n\nLast one.\n';
    const p = md.parse(text);
    const edited = p.doc.copy(p.doc.content.replaceChild(p.doc.childCount - 1, md.schema.nodes.paragraph!.create(null, md.schema.text('Changed.'))));
    expect(md.serialize(edited, p)).toBe('# T\n\nA  paragraph   with odd  spacing [[p1]]\n\n- [ ] task\n\nChanged.\n');
  });

  it('writes a new block between kept ones with one blank line around it', () => {
    const text = '# T\n\nEnd\n';
    const p = md.parse(text);
    const para = md.schema.nodes.paragraph!.create(null, md.schema.text('New'));
    const doc = p.doc.copy(Fragment.from([p.doc.child(0), para, p.doc.child(1)]));
    expect(md.serialize(doc, p)).toBe('# T\n\nNew\n\nEnd\n');
  });
});

describe('plain text typed in Document mode', () => {
  const LITERALS = [
    'a_b_c and _not italic_', '2 * 3 * 4', '*stars*', 'x [[p3]] literal', '[a](b) literal', 'a == b == c',
    '==mark==', 'costs $5 and $6', 'one $ only', '`tick`', '~~no~~', '5 < 6 and <b>', '# not a heading',
    '- not a list', '1. not a list', '> not a quote', 'back\\slash \\* and \\n', '![not](image)', 'C:\\path\\file',
  ];
  it.each(LITERALS)('reads back as the same text: %s', (text) => {
    const para = md.schema.nodes.paragraph!.create(null, md.schema.text(text));
    const doc = md.schema.topNodeType.create(null, [para]);
    const out = md.serialize(doc, { front: '', lead: '', blocks: [], doc });
    const back = md.parse(out).doc;
    expect(back.childCount).toBe(1);
    expect(back.child(0).type.name).toBe('paragraph');
    expect(back.child(0).textContent).toBe(text);
    expect(back.child(0).firstChild?.marks ?? []).toEqual([]);
  });
});
