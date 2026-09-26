import { describe, expect, it } from 'vitest';
import {
  candidatePaths, encodeRef, figureMarkdown, imageRefs, normalisePath, pastedImageName, refFrom, rewriteAttachmentRefs,
} from './attachments';

describe('names and references', () => {
  it("uses Obsidian's pasted image name", () => {
    expect(pastedImageName(new Date(2026, 8, 26, 14, 30, 12))).toBe('Pasted image 20260926143012.png');
  });
  it('encodes spaces as %20 and keeps parentheses', () => {
    expect(encodeRef('attachments/Pasted image 1 (2).png')).toBe('attachments/Pasted%20image%201%20(2).png');
  });
  it('writes references relative to the note folder', () => {
    expect(refFrom('notes/paper.md', 'notes/attachments/a b.png')).toBe('attachments/a%20b.png');
    expect(refFrom('paper.md', 'attachments/x.png')).toBe('attachments/x.png');
  });
  it('writes a clipped figure with its page link', () => {
    expect(figureMarkdown('attachments/f.png', 4)).toBe('![Figure](attachments/f.png) [[p4]]');
    expect(figureMarkdown('attachments/f.png', 4, 'paper.pdf')).toBe('![Figure](attachments/f.png) [[paper.pdf#page=4|p. 4]]');
  });
});

describe('imageRefs', () => {
  it('finds both image forms', () => {
    const md = 'a ![](attachments/x%20y.png) b ![Fig](estudio-attachment:abc "T") [[p4]]\n![[diagram.png]] ![[p.png|200]]';
    expect(imageRefs(md).map((r) => [r.src, r.embed])).toEqual([
      ['attachments/x%20y.png', false], ['estudio-attachment:abc', false], ['diagram.png', true], ['p.png', true],
    ]);
  });
  it('ignores page links and plain links', () => {
    expect(imageRefs('[[p3]] [x](y.png) [[paper.pdf#page=2]]')).toEqual([]);
  });
});

describe('rewriteAttachmentRefs', () => {
  it('rewrites only the attachments it is given', () => {
    const md = '![](estudio-attachment:a) and ![Figure](estudio-attachment:b "t") [[p2]] and ![](estudio-attachment:c)';
    const map: Record<string, string> = { a: 'attachments/A.png', b: 'attachments/B%201.png' };
    expect(rewriteAttachmentRefs(md, (id) => map[id])).toBe(
      '![](attachments/A.png) and ![Figure](attachments/B%201.png "t") [[p2]] and ![](estudio-attachment:c)',
    );
  });
  it('leaves text without attachments unchanged', () => {
    const md = '# T\n\n![](attachments/x.png)\n';
    expect(rewriteAttachmentRefs(md, () => 'z')).toBe(md);
  });
});

describe('resolution order', () => {
  it('tries the note folder, then the vault root', () => {
    expect(candidatePaths('attachments/a%20b.png', 'notes')).toEqual(['notes/attachments/a b.png', 'attachments/a b.png']);
    expect(candidatePaths('../img/x.png', 'notes/sub')).toEqual(['notes/img/x.png']);
    expect(candidatePaths('x.png', '')).toEqual(['x.png']);
  });
  it('normalises dot segments', () => {
    expect(normalisePath('a/./b/../c')).toBe('a/c');
    expect(normalisePath('../x')).toBeNull();
  });
});
