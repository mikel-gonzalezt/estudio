import { describe, expect, it } from 'vitest';
import {
  displayToPage, hitTest, mergeLineRects, normalisePoint, normaliseRect, pageToDisplay,
  rectDisplayToPage, rectFromPoints, shouldAppend, strokeOutline, type Rotation,
} from './geometry';
import type { Annotation } from './types';

const page = { left: 100, top: 50, width: 600, height: 800 };
const size = { w: 612, h: 792 };

describe('normalisation', () => {
  it('maps client coordinates into [0,1] page space', () => {
    expect(normalisePoint(400, 450, page)).toEqual({ x: 0.5, y: 0.5 });
    expect(normalisePoint(0, 2000, page)).toEqual({ x: 0, y: 1 });
  });

  it('clamps rects that overflow the page', () => {
    const r = normaliseRect({ left: 640, top: 40, width: 120, height: 20 }, page);
    expect(r.x).toBeCloseTo(0.9);
    expect(r.w).toBeCloseTo(0.1);
    expect(r.y).toBe(0);
    expect(r.h).toBeCloseTo(10 / 800);
  });

  it('builds rects from any two corners', () => {
    expect(rectFromPoints({ x: 0.5, y: 0.6 }, { x: 0.2, y: 0.1 })).toEqual({ x: 0.2, y: 0.1, w: 0.3, h: 0.5 });
  });
});

describe('rotation', () => {
  const rotations: Rotation[] = [0, 90, 180, 270];
  it.each(rotations)('display<->page round-trips at %i degrees', (rot) => {
    const p = { x: 0.2, y: 0.7 };
    const back = pageToDisplay(displayToPage(p, rot), rot);
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it('90 degrees moves the unrotated top-left corner to the display top-right', () => {
    expect(pageToDisplay({ x: 0, y: 0 }, 90)).toEqual({ x: 1, y: 0 });
  });

  it('keeps rect extents positive after rotation', () => {
    const r = rectDisplayToPage({ x: 0.1, y: 0.2, w: 0.3, h: 0.1 }, 90);
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
    expect(r.x).toBeCloseTo(0.2);
    expect(r.y).toBeCloseTo(0.6);
  });
});

describe('mergeLineRects', () => {
  it('merges word rects on one line and keeps lines apart', () => {
    const merged = mergeLineRects([
      { x: 0.1, y: 0.1, w: 0.1, h: 0.02 },
      { x: 0.205, y: 0.1005, w: 0.1, h: 0.019 },
      { x: 0.1, y: 0.13, w: 0.3, h: 0.02 },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.x).toBeCloseTo(0.1);
    expect(merged[0]!.w).toBeCloseTo(0.205);
  });

  it('drops degenerate and container-sized rects', () => {
    const merged = mergeLineRects([
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 0.1, y: 0.1, w: 0, h: 0.02 },
      { x: 0.1, y: 0.1, w: 0.2, h: 0.02 },
      { x: 0.1, y: 0.2, w: 0.2, h: 0.02 },
    ]);
    expect(merged).toEqual([
      { x: 0.1, y: 0.1, w: 0.2, h: 0.02 },
      { x: 0.1, y: 0.2, w: 0.2, h: 0.02 },
    ]);
  });

  it('splits a line where columns leave a wide gap', () => {
    const merged = mergeLineRects([
      { x: 0.1, y: 0.1, w: 0.3, h: 0.02 },
      { x: 0.6, y: 0.1, w: 0.3, h: 0.02 },
    ]);
    expect(merged).toHaveLength(2);
  });
});

describe('hitTest', () => {
  const hl: Annotation = { kind: 'highlight', page: 1, rects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.02 }], text: 'x', color: 'yellow', note: '' };
  const ink: Annotation = {
    kind: 'ink', page: 1,
    strokes: [{ color: '#000', width: 2, points: [{ x: 0.1, y: 0.5, p: 0.5 }, { x: 0.5, y: 0.5, p: 0.5 }] }],
  };

  it('hits inside a highlight rect and misses far away', () => {
    expect(hitTest(hl, { x: 0.15, y: 0.11 }, size)).toBe(true);
    expect(hitTest(hl, { x: 0.5, y: 0.5 }, size)).toBe(false);
  });

  it('hits near an ink segment within tolerance in points', () => {
    expect(hitTest(ink, { x: 0.3, y: 0.5 + 4 / size.h }, size)).toBe(true);
    expect(hitTest(ink, { x: 0.3, y: 0.5 + 20 / size.h }, size)).toBe(false);
  });
});

describe('strokes', () => {
  it('skips samples closer than the minimum distance', () => {
    const last = { x: 0.5, y: 0.5, p: 0.5 };
    expect(shouldAppend(last, { x: 0.5 + 0.1 / size.w, y: 0.5 }, size)).toBe(false);
    expect(shouldAppend(last, { x: 0.5 + 2 / size.w, y: 0.5 }, size)).toBe(true);
    expect(shouldAppend(undefined, { x: 0, y: 0 }, size)).toBe(true);
  });

  it('outlines a stroke with twice as many vertices as samples', () => {
    const pts = [{ x: 0.1, y: 0.1, p: 0.5 }, { x: 0.2, y: 0.1, p: 1 }, { x: 0.3, y: 0.1, p: 0 }];
    const outline = strokeOutline(pts, 2, size);
    expect(outline).toHaveLength(6);
    const halfWidthAtFullPressure = Math.abs(outline[1]!.y - outline[4]!.y) / 2;
    expect(halfWidthAtFullPressure).toBeCloseTo((2 * 1.65) / 2);
  });
});
