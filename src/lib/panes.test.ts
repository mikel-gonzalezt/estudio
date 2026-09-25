import { describe, expect, it } from 'vitest';
import { clampPane, dragWidth, keyWidth, MIN_CENTER, PANE_LIMITS } from './panes';

describe('pane widths', () => {
  it('clamps to the pane limits', () => {
    expect(clampPane('left', 50, 2000)).toBe(PANE_LIMITS.left.min);
    expect(clampPane('left', 9000, 2000)).toBe(PANE_LIMITS.left.max);
    expect(clampPane('right', 400.4, 2000)).toBe(400);
  });

  it('leaves the page view its minimum width', () => {
    expect(clampPane('right', 900, 1000)).toBe(1000 - MIN_CENTER);
  });

  it('prefers the pane minimum over the centre on tiny windows', () => {
    expect(clampPane('right', 900, 400)).toBe(PANE_LIMITS.right.min);
  });

  it('grows each pane away from its edge', () => {
    expect(dragWidth('left', 300, 40)).toBe(340);
    expect(dragWidth('right', 300, 40)).toBe(260);
  });

  it('moves the handle with arrow keys', () => {
    expect(keyWidth('left', 300, 'ArrowRight', false)).toBe(316);
    expect(keyWidth('right', 300, 'ArrowRight', true)).toBe(236);
    expect(keyWidth('right', 300, 'Home', false)).toBe(PANE_LIMITS.right.min);
    expect(keyWidth('left', 300, 'a', false)).toBeNull();
  });
});
