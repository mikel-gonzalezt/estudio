import type { NoteFiles } from '../../lib/attachments';
import type { NotebookContext } from '../../lib/notebooksync';
import { isExternal, safeHref } from '../../lib/safeurl';
import type { NotebookHost } from './host.svelte';

/** What either editor (Markdown or Document mode) is given by the notebook around it. */
export interface EditorHooks {
  host: NotebookHost;
  /** Set for vault notebooks, whose links name the PDF; read on each use, as a notebook can move into a vault. */
  pdfName: () => string | undefined;
  autoLinks: () => boolean;
  files: () => NoteFiles;
  onChange: (text: string) => void;
  onBlur: () => void;
}

export interface NotebookEditor {
  /** Replaces the text with one that changed elsewhere, keeping the cursor where the texts agree. */
  setText(text: string): void;
  focus(): void;
  destroy(): void;
}

/** A `[[` link being typed: the text between `[[` and the cursor. */
export const LINK_QUERY = /\[\[[^[\]|\n]*$/;

export type LinkGroup = 'page' | 'section' | 'annotation';
export interface LinkOption { label: string; detail?: string; group: LinkGroup; page: number; linkLabel?: string }

export const GROUP_NAMES: Record<LinkGroup, string> = { page: 'Page', section: 'Sections', annotation: 'Annotations' };

const excerpt = (s: string, max = 70) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** Targets offered after `[[`: the page on screen, outline sections, then annotations matching `query`. */
export function linkOptions({ page, sections, annotations }: NotebookContext, query: string): LinkOption[] {
  const q = query.trim().toLowerCase();
  const matches = (s: string) => !q || s.toLowerCase().includes(q);
  return [
    ...(page === null ? [] : [{ label: `Current page (p. ${page})`, group: 'page' as const, page }]),
    ...sections.filter((s) => matches(s.title)).slice(0, 40).map((s): LinkOption => ({
      label: `${'  '.repeat(Math.min(s.depth, 3))}${s.title}`, detail: `p. ${s.page}`, group: 'section', page: s.page, linkLabel: s.title,
    })),
    ...annotations.filter((a) => a.text && matches(a.text)).slice(0, 30).map((a): LinkOption => ({
      label: excerpt(a.text), detail: `p. ${a.page}`, group: 'annotation', page: a.page, linkLabel: excerpt(a.text, 50),
    })),
  ];
}

/** Image files carried by a paste or a drop, such as a screenshot or a file from Explorer. */
export const imageFiles = (dt: DataTransfer | null) => [...(dt?.files ?? [])].filter((f) => f.type.startsWith('image/'));

/** Opens a link from a note in a new tab without an opener; the app window itself never navigates. */
export function openLink(a: HTMLAnchorElement) {
  const href = safeHref(a.getAttribute('href') ?? '');
  if (href && isExternal(href)) window.open(href, '_blank', 'noopener,noreferrer');
}
