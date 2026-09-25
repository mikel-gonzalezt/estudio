import type { Annotation, Point, Rect, XY } from './types';

export interface Box { left: number; top: number; width: number; height: number }
export interface Size { w: number; h: number }
export type Rotation = 0 | 90 | 180 | 270;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function normalisePoint(clientX: number, clientY: number, page: Box): XY {
  return { x: clamp01((clientX - page.left) / page.width), y: clamp01((clientY - page.top) / page.height) };
}

export function normaliseRect(r: Box, page: Box): Rect {
  const x0 = clamp01((r.left - page.left) / page.width);
  const y0 = clamp01((r.top - page.top) / page.height);
  const x1 = clamp01((r.left + r.width - page.left) / page.width);
  const y1 = clamp01((r.top + r.height - page.top) / page.height);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function rectFromPoints(a: XY, b: XY): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/** Pages are displayed rotated clockwise by `rot`; stored positions are relative to the unrotated page. */
export function displayToPage(d: XY, rot: Rotation): XY {
  switch (rot) {
    case 0: return { x: d.x, y: d.y };
    case 90: return { x: d.y, y: 1 - d.x };
    case 180: return { x: 1 - d.x, y: 1 - d.y };
    case 270: return { x: 1 - d.y, y: d.x };
  }
}

export function pageToDisplay(u: XY, rot: Rotation): XY {
  switch (rot) {
    case 0: return { x: u.x, y: u.y };
    case 90: return { x: 1 - u.y, y: u.x };
    case 180: return { x: 1 - u.x, y: 1 - u.y };
    case 270: return { x: u.y, y: 1 - u.x };
  }
}

function mapRect(r: Rect, f: (p: XY) => XY): Rect {
  const a = f({ x: r.x, y: r.y });
  const b = f({ x: r.x + r.w, y: r.y + r.h });
  return rectFromPoints(a, b);
}

export const rectDisplayToPage = (r: Rect, rot: Rotation) => mapRect(r, (p) => displayToPage(p, rot));
export const rectPageToDisplay = (r: Rect, rot: Rotation) => mapRect(r, (p) => pageToDisplay(p, rot));

/**
 * Collapse the client rects of a text selection into one rect per contiguous run on each line.
 * Text layers emit a rect per span, often overlapping or with hairline gaps between words.
 */
export function mergeLineRects(input: Rect[]): Rect[] {
  const rects = input.filter((r) => r.w > 0.0005 && r.h > 0.0005);
  if (rects.length === 0) return [];
  const heights = rects.map((r) => r.h).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)]!;
  // Containers (whole text layer, line wrappers) show up as oversized rects.
  const lineRects = rects.filter((r) => r.h <= median * 3);

  const lines: Rect[][] = [];
  for (const r of [...lineRects].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = lines.find((l) => l.some((o) => verticalOverlap(o, r) > 0.5 * Math.min(o.h, r.h)));
    if (line) line.push(r);
    else lines.push([r]);
  }

  const out: Rect[] = [];
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
    let cur = { ...line[0]! };
    for (const r of line.slice(1)) {
      const gap = r.x - (cur.x + cur.w);
      if (gap <= Math.max(cur.h, r.h) * 0.8) cur = union(cur, r);
      else {
        out.push(cur);
        cur = { ...r };
      }
    }
    out.push(cur);
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

function verticalOverlap(a: Rect, b: Rect): number {
  return Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
}

export function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function boundingRect(rects: Rect[]): Rect {
  return rects.reduce(union);
}

function inRect(p: XY, r: Rect, padX: number, padY: number): boolean {
  return p.x >= r.x - padX && p.x <= r.x + r.w + padX && p.y >= r.y - padY && p.y <= r.y + r.h + padY;
}

export function distToSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Hit test in page points so tolerance is isotropic regardless of page aspect ratio. */
export function hitTest(a: Annotation, p: XY, size: Size, tolPt = 6): boolean {
  const padX = tolPt / size.w;
  const padY = tolPt / size.h;
  switch (a.kind) {
    case 'highlight': case 'underline': case 'strike':
      return a.rects.some((r) => inRect(p, r, padX, padY));
    case 'area':
      return inRect(p, a.rect, padX, padY);
    case 'note':
      return inRect(p, { x: a.at.x, y: a.at.y, w: 0, h: 0 }, 14 / size.w, 14 / size.h);
    case 'ink': {
      const pt = { x: p.x * size.w, y: p.y * size.h };
      return a.strokes.some((s) => {
        const pts = s.points.map((q) => ({ x: q.x * size.w, y: q.y * size.h }));
        if (pts.length === 1) return Math.hypot(pt.x - pts[0]!.x, pt.y - pts[0]!.y) <= tolPt + s.width;
        for (let i = 1; i < pts.length; i++) if (distToSegment(pt, pts[i - 1]!, pts[i]!) <= tolPt + s.width / 2) return true;
        return false;
      });
    }
  }
}

/** Drops pointer samples closer than `minPt` to the previous one; keeps strokes light without visible loss. */
export function shouldAppend(last: Point | undefined, next: XY, size: Size, minPt = 0.75): boolean {
  if (!last) return true;
  return Math.hypot((next.x - last.x) * size.w, (next.y - last.y) * size.h) >= minPt;
}

/** Stroke width in points at a given pen pressure. Mouse reports 0.5 while pressed. */
export function pressureWidth(base: number, p: number): number {
  return base * (0.35 + 1.3 * p);
}

/**
 * Filled outline of a variable-width stroke in page points: left edge forward, right edge back.
 * Round ends are left to the renderer.
 */
export function strokeOutline(points: Point[], base: number, size: Size): XY[] {
  const pts = points.map((p) => ({ x: p.x * size.w, y: p.y * size.h, r: pressureWidth(base, p.p) / 2 }));
  if (pts.length < 2) return [];
  const left: XY[] = [];
  const right: XY[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(pts.length - 1, i + 1)]!;
    let nx = -(next.y - prev.y);
    let ny = next.x - prev.x;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const c = pts[i]!;
    left.push({ x: c.x + nx * c.r, y: c.y + ny * c.r });
    right.push({ x: c.x - nx * c.r, y: c.y - ny * c.r });
  }
  return [...left, ...right.reverse()];
}
