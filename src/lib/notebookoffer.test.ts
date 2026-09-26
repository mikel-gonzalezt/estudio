import { describe, expect, it } from 'vitest';
import { fileOffer, NO_HANDLE_WHY } from './notebookoffer';

const base = { home: 'db', inVault: false, handle: true, nextToPdf: true } as const;

describe('fileOffer', () => {
  it('offers nothing for a notebook that is a file, in a vault or a granted PDF folder', () => {
    expect(fileOffer({ ...base, home: 'vault', inVault: true })).toBeNull();
    expect(fileOffer({ ...base, home: 'vault' })).toBeNull();
  });

  it('flags a PDF opened with a handle and offers its folder or a vault folder', () => {
    expect(fileOffer(base)).toEqual({ label: true, options: ['next-to-pdf', 'vault-folder'] });
  });

  it('without a handle, offers a vault folder and the notes download, and says why', () => {
    expect(fileOffer({ ...base, handle: false })).toEqual({ label: true, options: ['vault-folder', 'notes-only'], why: NO_HANDLE_WHY });
  });

  it('keeps the plain move for vault PDFs and when new notebooks go to a vault folder', () => {
    expect(fileOffer({ ...base, inVault: true })).toEqual({ label: false, options: ['vault-folder'] });
    expect(fileOffer({ ...base, nextToPdf: false })).toEqual({ label: false, options: ['vault-folder'] });
  });
});
