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
}

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

export type TextMarkupKind = 'highlight' | 'underline' | 'strike';

export interface Stroke { color: string; width: number; points: Point[] }

export type Annotation =
  | { kind: TextMarkupKind; page: number; rects: Rect[]; text: string; color: ColorId; note: string }
  | { kind: 'ink'; page: number; strokes: Stroke[] }
  | { kind: 'note'; page: number; at: XY; note: string; color: ColorId }
  | { kind: 'area'; page: number; rect: Rect; note: string; color: ColorId };

export type AnnotationKind = Annotation['kind'];

interface AnnMeta { id: AnnId; docId: DocId; tags: string[]; createdAt: number; updatedAt: number }
export type StoredAnnotation = Annotation & AnnMeta;

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
}

export const DEFAULT_SETTINGS: Settings = {
  meanings: DEFAULT_MEANINGS,
  theme: 'light',
  pageMode: 'normal',
  pomodoroWorkMin: 25,
  pomodoroBreakMin: 5,
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
