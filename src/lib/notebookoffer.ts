import type { NotebookHome } from './notebookstore';

/** Ways to turn a notebook kept inside Estudio into a file. */
export type SaveAsFile = 'next-to-pdf' | 'vault-folder' | 'notes-only';

export interface FileOffer {
  /** The header says "Saved inside Estudio · Save as file". */
  label: boolean;
  options: readonly SaveAsFile[];
  /** Why the notebook cannot go next to the PDF. */
  why?: string;
}

export interface NotebookSituation {
  home: NotebookHome['kind'];
  /** The PDF was opened from a vault. */
  inVault: boolean;
  /** The PDF was opened with a file handle, so its folder can be asked for. */
  handle: boolean;
  /** "New notebooks go in: Next to the PDF". */
  nextToPdf: boolean;
}

export const NO_HANDLE_WHY = 'This PDF was opened without access to its file, so Estudio cannot save notes next to it.';

/**
 * What the notebook location menu offers. A notebook that is already a file offers nothing. A
 * notebook kept inside Estudio for a PDF outside any vault, while new notebooks go next to their
 * PDF, is flagged in the header, because the user expects a `.md` beside the PDF.
 */
export function fileOffer(s: NotebookSituation): FileOffer | null {
  if (s.home === 'vault') return null;
  if (s.inVault || !s.nextToPdf) return { label: false, options: ['vault-folder'] };
  if (s.handle) return { label: true, options: ['next-to-pdf', 'vault-folder'] };
  return { label: true, options: ['vault-folder', 'notes-only'], why: NO_HANDLE_WHY };
}
