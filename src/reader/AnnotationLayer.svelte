<script lang="ts">
  import { pageToDisplay, rectFromPoints, rectPageToDisplay, strokeOutline, pressureWidth } from '../lib/geometry';
  import { COLOR_HEX, INK_HEX, type Point, type Rect, type StoredAnnotation, type XY } from '../lib/types';
  import { displaySize } from './pdf';
  import type { Reader } from './session.svelte';

  let { reader, n }: { reader: Reader; n: number } = $props();

  const info = $derived(reader.info[n - 1]!);
  const size = $derived(displaySize(info));
  const ann = $derived(reader.ann);
  const it = $derived(ann.interaction);
  const erasing = $derived(it.kind === 'erasing' && it.page === n ? new Set(it.hits) : null);
  const items = $derived(ann.onPage(n).filter((a) => !erasing?.has(a.id)));

  const R = (r: Rect) => {
    const d = rectPageToDisplay(r, info.rotation);
    return { x: d.x * size.w, y: d.y * size.h, w: d.w * size.w, h: d.h * size.h };
  };
  const P = (p: XY) => {
    const d = pageToDisplay(p, info.rotation);
    return { x: d.x * size.w, y: d.y * size.h };
  };
  const dispPoints = (pts: Point[]): Point[] => pts.map((p) => ({ ...pageToDisplay(p, info.rotation), p: p.p }));
  const outline = (pts: Point[], w: number) =>
    strokeOutline(dispPoints(pts), w, size).map((q) => `${q.x.toFixed(2)},${q.y.toFixed(2)}`).join(' ');

  function bbox(a: StoredAnnotation): Rect | null {
    switch (a.kind) {
      case 'highlight': case 'underline': case 'strike': {
        const rs = a.rects.map(R);
        const x = Math.min(...rs.map((r) => r.x));
        const y = Math.min(...rs.map((r) => r.y));
        return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
      }
      case 'area': return R(a.rect);
      case 'note': { const p = P(a.at); return { x: p.x - 2, y: p.y - 2, w: 18, h: 18 }; }
      case 'ink': {
        const ps = a.strokes.flatMap((s) => s.points.map(P));
        const x = Math.min(...ps.map((p) => p.x));
        const y = Math.min(...ps.map((p) => p.y));
        return { x, y, w: Math.max(...ps.map((p) => p.x)) - x, h: Math.max(...ps.map((p) => p.y)) - y };
      }
    }
  }

  const selectedBox = $derived.by(() => {
    const a = ann.selected ? ann.items.get(ann.selected) : undefined;
    return a && a.page === n ? bbox(a) : null;
  });
  const areaPreview = $derived(it.kind === 'dragging-area' && it.page === n ? R(rectFromPoints(it.from, it.to)) : null);
  const livePoints = $derived(it.kind === 'drawing' && it.page === n ? it.points : null);
</script>

<svg class="annotations" viewBox="0 0 {size.w} {size.h}" preserveAspectRatio="none" aria-hidden="true">
  {#each items as a (a.id)}
    {#if a.kind === 'highlight'}
      <g class="hl" fill={COLOR_HEX[a.color]}>
        {#each a.rects as r, i (i)}{@const q = R(r)}<rect x={q.x} y={q.y} width={q.w} height={q.h} rx="1" />{/each}
      </g>
    {:else if a.kind === 'underline' || a.kind === 'strike'}
      <g stroke={INK_HEX[a.color]} stroke-linecap="round">
        {#each a.rects as r, i (i)}
          {@const q = R(r)}
          {@const y = a.kind === 'underline' ? q.y + q.h * 0.95 : q.y + q.h * 0.55}
          <line x1={q.x} x2={q.x + q.w} y1={y} y2={y} stroke-width={Math.max(0.8, q.h * 0.09)} />
        {/each}
      </g>
    {:else if a.kind === 'area'}
      {@const q = R(a.rect)}
      <rect class="area" x={q.x} y={q.y} width={q.w} height={q.h} stroke={INK_HEX[a.color]} fill={COLOR_HEX[a.color]} />
    {:else if a.kind === 'note'}
      {@const p = P(a.at)}
      <g class="note" transform="translate({p.x} {p.y})">
        <path d="M0 0h14v10l-4 4H0z" fill={COLOR_HEX[a.color]} stroke={INK_HEX[a.color]} stroke-width="0.8" />
        <path d="M10 14v-4h4" fill="none" stroke={INK_HEX[a.color]} stroke-width="0.8" />
        <path d="M3 4h8M3 7h5" stroke={INK_HEX[a.color]} stroke-width="0.8" />
      </g>
    {:else if a.kind === 'ink'}
      {#each a.strokes as s, i (i)}
        {#if s.points.length === 1}
          {@const p = P(s.points[0]!)}
          <circle cx={p.x} cy={p.y} r={pressureWidth(s.width, s.points[0]!.p) / 2} fill={s.color} />
        {:else}
          <polygon points={outline(s.points, s.width)} fill={s.color} stroke={s.color} stroke-width="0.3" stroke-linejoin="round" />
        {/if}
      {/each}
    {/if}
  {/each}

  {#if livePoints && livePoints.length > 1}
    <polygon points={outline(livePoints, 1.6)} fill={INK_HEX[ann.color]} stroke={INK_HEX[ann.color]} stroke-width="0.3" />
  {/if}
  {#if areaPreview}
    <rect class="area preview" x={areaPreview.x} y={areaPreview.y} width={areaPreview.w} height={areaPreview.h} stroke={INK_HEX[ann.color]} fill={COLOR_HEX[ann.color]} />
  {/if}
  {#if selectedBox}
    <rect class="selected" x={selectedBox.x - 3} y={selectedBox.y - 3} width={selectedBox.w + 6} height={selectedBox.h + 6} rx="3" />
  {/if}
</svg>

<style>
  .annotations {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }
  .hl { mix-blend-mode: var(--hl-blend); opacity: var(--hl-opacity); }
  .area { fill-opacity: 0.12; stroke-width: 1.2; stroke-dasharray: 4 3; }
  .area.preview { fill-opacity: 0.18; }
  .selected { fill: none; stroke: var(--accent); stroke-width: 1.4; stroke-dasharray: 3 2; }
</style>
