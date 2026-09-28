import { describe, expect, it } from 'vitest';
import { freeName, leftBehind, planMove, rewriteImageRefs, type ImageOrigin } from './notebookmove';

const none = () => false;
const takenOf = (...paths: string[]) => (p: string) => paths.includes(p);
const origins = (o: Record<string, ImageOrigin>) => new Map(Object.entries(o));

describe('freeName', () => {
  it('keeps a free name and numbers a taken one', () => {
    expect(freeName('notes/paper.md', none)).toBe('notes/paper.md');
    expect(freeName('notes/paper.md', takenOf('notes/paper.md', 'notes/paper (2).md'))).toBe('notes/paper (3).md');
    expect(freeName('README', takenOf('README'))).toBe('README (2)');
  });
});

describe('planMove', () => {
  it('moves a database notebook into a vault folder: images become files beside it, page links name the PDF', () => {
    const plan = planMove({
      body: 'See [[p3]].\n\n![](estudio-attachment:a1)\n\n![Figure](estudio-attachment:a1) [[p4]]\n',
      pdfName: 'paper.pdf',
      planned: 'Notes/paper.md',
      origins: origins({ 'estudio-attachment:a1': { kind: 'db', id: 'a1', name: 'Pasted image 20260926143012.png' } }),
      taken: none,
    });
    expect(plan.notePath).toBe('Notes/paper.md');
    expect(plan.copies).toEqual([{ origin: { kind: 'db', id: 'a1', name: 'Pasted image 20260926143012.png' }, to: 'Notes/attachments/Pasted image 20260926143012.png' }]);
    expect(plan.body).toBe(
      'See [[paper.pdf#page=3|p. 3]].\n\n![](attachments/Pasted%20image%2020260926143012.png)\n\n![Figure](attachments/Pasted%20image%2020260926143012.png) [[paper.pdf#page=4|p. 4]]\n',
    );
  });

  it('moves a file notebook to another vault: never overwrites, and renames clashing images', () => {
    const plan = planMove({
      body: '![](attachments/a%20b.png) ![](attachments/c.png) ![[c.png]] ![](https://x.y/r.png) ![](missing.png)\n',
      pdfName: 'paper.pdf',
      planned: 'paper.md',
      origins: origins({
        'attachments/a%20b.png': { kind: 'file', path: 'Old/attachments/a b.png' },
        'attachments/c.png': { kind: 'file', path: 'Old/attachments/c.png' },
        'c.png': { kind: 'file', path: 'Old/attachments/c.png' },
      }),
      taken: takenOf('paper.md', 'attachments/c.png'),
    });
    expect(plan.notePath).toBe('paper (2).md');
    expect(plan.copies.map((c) => c.to)).toEqual(['attachments/a b.png', 'attachments/c (2).png']);
    expect(plan.body).toBe('![](attachments/a%20b.png) ![](attachments/c%20(2).png) ![[attachments/c (2).png]] ![](https://x.y/r.png) ![](missing.png)\n');
  });

  it('keeps an embed by name when its image keeps its name', () => {
    const plan = planMove({
      body: '![[d.png]]\n', pdfName: 'p.pdf', planned: 'A/p.md',
      origins: origins({ 'd.png': { kind: 'file', path: 'img/d.png' } }), taken: none,
    });
    expect(plan.copies).toEqual([{ origin: { kind: 'file', path: 'img/d.png' }, to: 'A/attachments/d.png' }]);
    expect(plan.body).toBe('![[d.png]]\n');
  });

  it('gives two different images of the same name two files', () => {
    const plan = planMove({
      body: '![](x/p.png) ![](y/p.png)\n', pdfName: 'p.pdf', planned: 'p.md',
      origins: origins({ 'x/p.png': { kind: 'file', path: 'x/p.png' }, 'y/p.png': { kind: 'file', path: 'y/p.png' } }), taken: none,
    });
    expect(plan.copies.map((c) => c.to)).toEqual(['attachments/p.png', 'attachments/p (2).png']);
    expect(plan.body).toBe('![](attachments/p.png) ![](attachments/p%20(2).png)\n');
  });

  it('leaves page links that already name a PDF alone', () => {
    const plan = planMove({ body: '[[other.pdf#page=2|p. 2]] [[p1|Intro]]\n', pdfName: 'p.pdf', planned: 'p.md', origins: new Map(), taken: none });
    expect(plan.body).toBe('[[other.pdf#page=2|p. 2]] [[p.pdf#page=1|Intro]]\n');
  });
});

describe('rewriteImageRefs', () => {
  it('rewrites only the references it is given', () => {
    const md = '![](estudio-attachment:a) and ![Figure](estudio-attachment:b "t") [[p2]] and ![](estudio-attachment:c)';
    const map: Record<string, string> = { 'estudio-attachment:a': 'attachments/A.png', 'estudio-attachment:b': 'attachments/B%201.png' };
    expect(rewriteImageRefs(md, (r) => map[r.src])).toBe(
      '![](attachments/A.png) and ![Figure](attachments/B%201.png "t") [[p2]] and ![](estudio-attachment:c)',
    );
  });
});

describe('leftBehind', () => {
  it('deletes only images from the old attachments folder that no other note mentions', () => {
    const moved = ['Old/attachments/a b.png', 'Old/attachments/shared.png', 'img/root.png'];
    const others = [{ text: '![](attachments/shared.png)' }];
    expect(leftBehind('Old/paper.md', moved, others)).toEqual(['Old/attachments/a b.png']);
    expect(leftBehind('Old/paper.md', moved, [{ text: '![](attachments/a%20b.png)' }])).toEqual(['Old/attachments/shared.png']);
  });
});
