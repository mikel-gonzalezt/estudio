export type PaneSide = 'left' | 'right';

export const PANE_LIMITS: Record<PaneSide, { min: number; max: number }> = {
  left: { min: 180, max: 520 },
  right: { min: 260, max: 1400 },
};

/** The page view never gets narrower than this, whatever the panes ask for. */
export const MIN_CENTER = 320;

/** Share of the window the notebook takes when widened. */
export const WIDE_NOTEBOOK = 0.6;

/** `room` is the window width left after the other pane. */
export function clampPane(side: PaneSide, width: number, room: number): number {
  const { min, max } = PANE_LIMITS[side];
  return Math.round(Math.max(min, Math.min(max, room - MIN_CENTER, width)));
}

/** The left pane grows as the pointer moves right, the right pane as it moves left. */
export function dragWidth(side: PaneSide, startWidth: number, dx: number): number {
  return side === 'left' ? startWidth + dx : startWidth - dx;
}

const KEY_STEP = 16;
const KEY_STEP_BIG = 64;

/** Width after a key press on a focused handle, or null for keys the handle ignores. */
export function keyWidth(side: PaneSide, width: number, key: string, shift: boolean): number | null {
  const step = shift ? KEY_STEP_BIG : KEY_STEP;
  switch (key) {
    case 'ArrowLeft': return dragWidth(side, width, -step);
    case 'ArrowRight': return dragWidth(side, width, step);
    case 'Home': return PANE_LIMITS[side].min;
    case 'End': return PANE_LIMITS[side].max;
    default: return null;
  }
}
