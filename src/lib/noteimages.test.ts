import { describe, expect, it } from 'vitest';
import { imageCandidates, normalizePath } from './noteimages';

describe('normalizePath', () => {
  it('resolves dot segments inside the vault', () => {
    expect(normalizePath('notes/./a/../attachments/x.png')).toBe('notes/attachments/x.png');
    expect(normalizePath('../x.png')).toBeNull();
  });
});

describe('imageCandidates', () => {
  it('looks beside the note first, then from the vault root, with percent-encoding decoded', () => {
    expect(imageCandidates('course/week 1', 'attachments/Pasted%20image%2020260926143012.png')).toEqual([
      'course/week 1/attachments/Pasted image 20260926143012.png',
      'attachments/Pasted image 20260926143012.png',
    ]);
    expect(imageCandidates('', 'fig.png')).toEqual(['fig.png']);
    expect(imageCandidates('notes', '../img/fig.png')).toEqual(['img/fig.png']);
  });
});
