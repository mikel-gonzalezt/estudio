export type DocId = string & { __brand: 'DocId' };
export type AnnId = string & { __brand: 'AnnId' };
export type CardId = string & { __brand: 'CardId' };

export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number; p: number }
export interface XY { x: number; y: number }

export interface DocRecord {
  id: DocId; title: string; fileName: string; pageCount: number;
  lastPage: number; lastZoom: number; pagesSeen: number[];
  addedAt: number; openedAt: number; readingMs: number;
  handle?: FileSystemFileHandle;
  /** Each annotation's updatedAt as of the last time the file at `handle` and Estudio agreed. */
  syncBase?: Record<AnnId, number>;
  /** Area clips pinned to the floating figure panel, in the order they were pinned. */
  pins?: AnnId[];
}

export type VaultId = string & { __brand: 'VaultId' };

/** A folder the reader works in, Obsidian style. The handle keeps its access grant across restarts. */
export interface Vault { id: VaultId; name: string; handle: FileSystemDirectoryHandle; addedAt: number; openedAt: number }

/** A file in a vault: the vault and its '/'-separated path from the vault root. */
export interface NotebookLoc { vault: VaultId; path: string }

/** A folder in a vault; `dir` is '' for the vault root. */
export interface VaultFolder { vault: VaultId; dir: string }

export const COLOR_IDS = ['yellow', 'green', 'blue', 'pink', 'orange', 'purple'] as const;
export type ColorId = (typeof COLOR_IDS)[number];

export const DEFAULT_MEANINGS: Record<ColorId, string> = {
  yellow: 'Important', green: 'Definition', blue: 'Example',
  pink: 'Doubt / review', orange: 'Formula', purple: 'Personal idea',
};

export const COLOR_HEX: Record<ColorId, string> = {
  yellow: '#f5d142', green: '#7ccf8a', blue: '#6fb0f0',
  pink: '#f08fb4', orange: '#f5a54a', purple: '#b391e8',
};

/** Darker variants for pen strokes, which need contrast against white paper. */
export const INK_HEX: Record<ColorId, string> = {
  yellow: '#c99a06', green: '#2e8f48', blue: '#2a6fd1',
  pink: '#d23f7a', orange: '#dc7412', purple: '#7b4fcf',
};

export type TextMarkupKind = 'highlight' | 'underline' | 'strike';

export interface Stroke { color: string; width: number; points: Point[] }

export type Annotation =
  | { kind: TextMarkupKind; page: number; rects: Rect[]; text: string; color: ColorId; note: string }
  | { kind: 'ink'; page: number; strokes: Stroke[] }
  | { kind: 'note'; page: number; at: XY; note: string; color: ColorId }
  | { kind: 'area'; page: number; rect: Rect; note: string; color: ColorId };

export type AnnotationKind = Annotation['kind'];

interface FileMeta { id: AnnId; tags: string[]; createdAt: number; updatedAt: number }
/** An annotation as it lives inside a PDF file, before it is attached to a document. */
export type FileAnnotation = Annotation & FileMeta;
export type StoredAnnotation = FileAnnotation & { docId: DocId };

export interface Notebook { docId: DocId; markdown: string; updatedAt: number }

export type SrsState = 'new' | 'learning' | 'review' | 'relearning';
export interface Srs {
  due: number; stability: number; difficulty: number; reps: number; lapses: number;
  state: SrsState; last?: number;
}

export interface Card {
  id: CardId; docId: DocId; annId?: AnnId; page: number;
  front: string; back: string;
  srs: Srs;
}

export type Theme = 'light' | 'dark';
export type PageMode = 'normal' | 'dark' | 'sepia';

export interface Settings {
  meanings: Record<ColorId, string>;
  theme: Theme;
  pageMode: PageMode;
  pomodoroWorkMin: number;
  pomodoroBreakMin: number;
  /** Pane widths in CSS px. */
  leftPaneW: number;
  rightPaneW: number;
  /** The notebook pane takes most of the window and the page view shrinks. */
  wideNotebook: boolean;
  /** A new notebook paragraph starts with a link to the page being read when that page changed. */
  autoPageLinks: boolean;
  /** Where a new notebook `.md` is created: null puts it next to its PDF. */
  notebookFolder: VaultFolder | null;
  /** How notebooks are edited: formatted like a document, or as Markdown source. */
  editorMode: EditorMode;
  /** Pinned figures: area clips kept in a floating panel over the reader. Off hides every trace of it. */
  pinnedFigures: boolean;
  pinPanel: PinPanelLayout;
  /** Read aloud shows its buttons, key and commands. */
  readAloud: boolean;
  /** Speaking rate, 1 being the voice's normal speed. */
  speechRate: number;
  /** The voice (`voiceURI`) chosen for each document language; '' holds the choice for undetected languages. */
  speechVoices: Record<string, string>;
}

/** The pinned-figure panel, placed by its distance in CSS px from the bottom-right corner of the page view. */
export interface PinPanelLayout { right: number; bottom: number; w: number; h: number; collapsed: boolean; hidden: boolean; follow: boolean }

export type EditorMode = 'document' | 'markdown';

export const DEFAULT_SETTINGS: Settings = {
  meanings: DEFAULT_MEANINGS,
  theme: 'light',
  pageMode: 'normal',
  pomodoroWorkMin: 25,
  pomodoroBreakMin: 5,
  leftPaneW: 260,
  rightPaneW: 340,
  wideNotebook: false,
  autoPageLinks: true,
  notebookFolder: null,
  editorMode: 'document',
  pinnedFigures: true,
  pinPanel: { right: 16, bottom: 16, w: 320, h: 260, collapsed: false, hidden: false, follow: true },
  readAloud: true,
  speechRate: 1,
  speechVoices: {},
};

export function newId<T extends AnnId | CardId>(): T {
  return crypto.randomUUID() as T;
}

export function annotationNote(a: Annotation): string {
  return a.kind === 'ink' ? '' : a.note;
}

export function annotationText(a: Annotation): string {
  return a.kind === 'highlight' || a.kind === 'underline' || a.kind === 'strike' ? a.text : '';
}

export function annotationColor(a: Annotation): ColorId | undefined {
  return a.kind === 'ink' ? undefined : a.color;
}

/** Top edge of an annotation, for jump targets and sorting. */
export function annotationTop(a: Annotation): number {
  switch (a.kind) {
    case 'highlight': case 'underline': case 'strike':
      return Math.min(...a.rects.map((r) => r.y));
    case 'ink':
      return Math.min(...a.strokes.flatMap((s) => s.points.map((p) => p.y)));
    case 'note':
      return a.at.y;
    case 'area':
      return a.rect.y;
  }
}

/** Bottom-left corner of an annotation in page space, where its editor opens. */
export function annotationAnchor(a: Annotation): XY {
  switch (a.kind) {
    case 'highlight': case 'underline': case 'strike': {
      const last = a.rects.reduce((m, r) => (r.y + r.h > m.y + m.h ? r : m));
      return { x: Math.min(...a.rects.map((r) => r.x)), y: last.y + last.h };
    }
    case 'ink': {
      const pts = a.strokes.flatMap((s) => s.points);
      return { x: Math.min(...pts.map((p) => p.x)), y: Math.max(...pts.map((p) => p.y)) };
    }
    case 'note':
      return { x: a.at.x, y: a.at.y + 0.02 };
    case 'area':
      return { x: a.rect.x, y: a.rect.y + a.rect.h };
  }
}

export const KIND_LABEL: Record<AnnotationKind, string> = {
  highlight: 'Highlight', underline: 'Underline', strike: 'Strikethrough',
  ink: 'Drawing', note: 'Note', area: 'Area clip',
};
