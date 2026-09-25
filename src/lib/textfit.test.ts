import { describe, expect, it } from 'vitest';
import { centredScrollLeft, fitTextScale, FULL_PAGE, textBounds } from './textfit';
import { TwoFingerTap } from './gestures';
import type { TextRun } from './citation';

const run = (x: number, y: number, w: number, h: number, str = 'text'): TextRun => ({ str, x, y, w, h });

describe('textBounds', () => {
  it('unions the boxes of the text runs', () => {
    const b = textBounds([run(0.2, 0.1, 0.3, 0.02), run(0.52, 0.5, 0.3, 0.02), run(0.2, 0.9, 0.1, 0.02)]);
    expect(b.x).toBeCloseTo(0.2);
    expect(b.y).toBeCloseTo(0.1);
    expect(b.w).toBeCloseTo(0.62);
    expect(b.h).toBeCloseTo(0.82);
  });

  it('ignores blank and zero-size runs', () => {
    const b = textBounds([run(0.25, 0.25, 0.5, 0.125), run(0, 0, 1, 0, ' '), run(0.01, 0.01, 0, 0.1), run(0.9, 0.9, 0.05, 0.05, '  ')]);
    expect(b).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.125 });
  });

  it('clamps runs that spill off the page', () => {
    expect(textBounds([run(-0.1, 0.5, 0.5, 0.1), run(0.8, 0.95, 0.4, 0.1)])).toEqual({ x: 0, y: 0.5, w: 1, h: 0.5 });
  });

  it('falls back to the full page when there is no text', () => {
    expect(textBounds([])).toEqual(FULL_PAGE);
    expect(textBounds([run(0.1, 0.1, 0.2, 0.1, ' ')])).toEqual(FULL_PAGE);
  });
});

describe('fit text width', () => {
  const page = { w: 612, h: 792 };
  const column = { x: 0.176, y: 0.1, w: 0.648, h: 0.8 };

  it('scales the text column to the viewport less the padding', () => {
    const scale = fitTextScale(column, page, 1032, 32);
    expect(column.w * page.w * scale).toBeCloseTo(1000);
  });

  it('centres the column in the viewport', () => {
    const scale = fitTextScale(column, page, 1032, 32);
    const pageWidth = page.w * scale;
    const left = centredScrollLeft(16, column, pageWidth, 1032);
    const textLeftOnScreen = 16 + column.x * pageWidth - left;
    expect(textLeftOnScreen).toBeCloseTo(16);
  });

  it('never scrolls to a negative offset', () => {
    expect(centredScrollLeft(0, FULL_PAGE, 400, 1000)).toBe(0);
  });
});

describe('TwoFingerTap', () => {
  it('fires when two touches land together and lift without moving', () => {
    const g = new TwoFingerTap();
    g.down(1, 100, 100, 0);
    g.down(2, 200, 100, 80);
    g.move(1, 104, 103);
    expect(g.up(1, 180)).toBe(false);
    expect(g.up(2, 200)).toBe(true);
  });

  it('ignores a single tap', () => {
    const g = new TwoFingerTap();
    g.down(1, 100, 100, 0);
    expect(g.up(1, 100)).toBe(false);
  });

  it('ignores touches that land too far apart in time', () => {
    const g = new TwoFingerTap();
    g.down(1, 100, 100, 0);
    g.down(2, 200, 100, 300);
    g.up(1, 320);
    expect(g.up(2, 330)).toBe(false);
  });

  it('ignores a pinch or two-finger scroll', () => {
    const g = new TwoFingerTap();
    g.down(1, 100, 100, 0);
    g.down(2, 200, 100, 30);
    g.move(2, 260, 100);
    g.up(1, 150);
    expect(g.up(2, 160)).toBe(false);
  });

  it('ignores a long press and three-finger taps', () => {
    const g = new TwoFingerTap();
    g.down(1, 100, 100, 0);
    g.down(2, 200, 100, 30);
    g.up(1, 900);
    expect(g.up(2, 910)).toBe(false);
    g.down(1, 100, 100, 1000);
    g.down(2, 200, 100, 1010);
    g.down(3, 300, 100, 1020);
    g.up(1, 1100);
    g.up(2, 1100);
    expect(g.up(3, 1100)).toBe(false);
  });

  it('ignores a gesture the browser cancelled, and recovers for the next one', () => {
    const g = new TwoFingerTap();
    g.down(1, 100, 100, 0);
    g.down(2, 200, 100, 30);
    g.cancel(1);
    expect(g.up(2, 100)).toBe(false);
    g.down(1, 100, 100, 500);
    g.down(2, 200, 100, 520);
    g.up(1, 600);
    expect(g.up(2, 610)).toBe(true);
  });
});
