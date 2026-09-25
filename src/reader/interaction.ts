import type { AnnId, Point, XY } from '../lib/types';

/** The one pointer interaction in flight. Positions are page-space (unrotated, normalised). */
export type Interaction =
  | { kind: 'idle' }
  | { kind: 'selecting'; page: number }
  | { kind: 'drawing'; page: number; points: Point[] }
  | { kind: 'erasing'; page: number; hits: AnnId[] }
  | { kind: 'dragging-area'; page: number; from: XY; to: XY }
  | { kind: 'placing-note'; page: number; at: XY };

export const IDLE: Interaction = { kind: 'idle' };
