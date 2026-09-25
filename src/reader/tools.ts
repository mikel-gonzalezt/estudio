import type { IconName } from '../components/Icon.svelte';
import { hitTest, rectFromPoints, shouldAppend, type Size } from '../lib/geometry';
import { INK_HEX, type TextMarkupKind, type XY } from '../lib/types';
import type { Annotator } from './annotator.svelte';
import { IDLE, type Interaction } from './interaction';

export interface PointerCtx {
  ann: Annotator;
  page: number;
  /** Page-space, normalised. */
  at: XY;
  pressure: number;
  /** Unrotated page size in points. */
  size: Size;
}

type Handler = (c: PointerCtx, s: Interaction) => Interaction;

export interface Tool {
  label: string;
  key: string;
  icon: IconName;
  cursor: string;
  /** Pointer-capturing tools get an overlay above the text layer; the rest leave native text selection alive. */
  captures: boolean;
  down?: Handler;
  move?: Handler;
  up?: Handler;
}

const PEN_WIDTH = 1.6;
const ERASE_TOLERANCE_PT = 5;

function markup(kind: TextMarkupKind, label: string, key: string, icon: IconName): Tool {
  return {
    label, key, icon, cursor: 'text', captures: false,
    down: (c) => ({ kind: 'selecting', page: c.page }),
    up: (c, s) => {
      if (s.kind === 'selecting') c.ann.markSelection(kind);
      return IDLE;
    },
  };
}

function eraseAt(c: PointerCtx, s: Interaction & { kind: 'erasing' }): Interaction {
  const hits = c.ann.onPage(c.page)
    .filter((a) => !s.hits.includes(a.id) && hitTest(a, c.at, c.size, ERASE_TOLERANCE_PT))
    .map((a) => a.id);
  return hits.length ? { ...s, hits: [...s.hits, ...hits] } : s;
}

export const TOOLS = {
  select: {
    label: 'Select', key: 'v', icon: 'select', cursor: 'auto', captures: false,
    down: (c) => ({ kind: 'selecting', page: c.page }),
    up: (c, s) => {
      if (s.kind === 'selecting') c.ann.afterSelect(c);
      return IDLE;
    },
  },
  highlight: markup('highlight', 'Highlight', 'h', 'highlight'),
  underline: markup('underline', 'Underline', 'u', 'underline'),
  strike: markup('strike', 'Strikethrough', 'x', 'strike'),
  pen: {
    label: 'Pen', key: 'p', icon: 'pen', cursor: 'crosshair', captures: true,
    down: (c) => ({ kind: 'drawing', page: c.page, points: [{ ...c.at, p: c.pressure }] }),
    move: (c, s) => {
      if (s.kind !== 'drawing' || s.page !== c.page || !shouldAppend(s.points.at(-1), c.at, c.size)) return s;
      return { ...s, points: [...s.points, { ...c.at, p: c.pressure }] };
    },
    up: (c, s) => {
      if (s.kind === 'drawing') {
        c.ann.add({ kind: 'ink', page: s.page, strokes: [{ color: INK_HEX[c.ann.color], width: PEN_WIDTH, points: s.points }] });
      }
      return IDLE;
    },
  },
  eraser: {
    label: 'Eraser', key: 'e', icon: 'eraser', cursor: 'cell', captures: true,
    down: (c) => eraseAt(c, { kind: 'erasing', page: c.page, hits: [] }),
    move: (c, s) => (s.kind === 'erasing' && s.page === c.page ? eraseAt(c, s) : s),
    up: (c, s) => {
      if (s.kind === 'erasing') c.ann.removeMany(s.hits);
      return IDLE;
    },
  },
  note: {
    label: 'Sticky note', key: 'n', icon: 'note', cursor: 'copy', captures: true,
    down: (_c, s) => s,
    up: (c) => ({ kind: 'placing-note', page: c.page, at: c.at }),
  },
  area: {
    label: 'Area clip', key: 'a', icon: 'area', cursor: 'crosshair', captures: true,
    down: (c) => ({ kind: 'dragging-area', page: c.page, from: c.at, to: c.at }),
    move: (c, s) => (s.kind === 'dragging-area' && s.page === c.page ? { ...s, to: c.at } : s),
    up: (c, s) => {
      if (s.kind !== 'dragging-area') return IDLE;
      const rect = rectFromPoints(s.from, s.to);
      if (rect.w * c.size.w > 6 && rect.h * c.size.h > 6) {
        const a = c.ann.add({ kind: 'area', page: s.page, rect, note: '', color: c.ann.color });
        c.ann.select(a.id);
      }
      return IDLE;
    },
  },
} satisfies Record<string, Tool>;

export type ToolId = keyof typeof TOOLS;
export const TOOL_IDS = Object.keys(TOOLS) as ToolId[];

export function tool(id: ToolId): Tool {
  return TOOLS[id];
}
