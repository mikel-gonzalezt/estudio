<script lang="ts">
  import { untrack } from 'svelte';
  import { TextLayer, RenderingCancelledException, type PageViewport, type RenderTask } from 'pdfjs-dist';
  import { displaySize } from './pdf';
  import type { Reader } from './session.svelte';
  import AnnotationLayer from './AnnotationLayer.svelte';
  import AnnotationPopover from './AnnotationPopover.svelte';
  import NoteDraft from './NoteDraft.svelte';
  import { TOOLS } from './tools';

  let { reader, n, active, keep }: { reader: Reader; n: number; active: boolean; keep: boolean } = $props();

  // Browsers refuse or silently blank canvases past ~16-32 MP; cap the backing store.
  const MAX_PIXELS = 16_000_000;

  const size = $derived(displaySize(reader.info[n - 1]!));
  let host: HTMLDivElement;
  let textHost: HTMLDivElement;
  let hasCanvas = $state(false);
  let hasText = $state(false);

  let renderedScale = 0;
  let renderedDpr = 0;
  let task: RenderTask | null = null;
  let textLayer: TextLayer | null = null;

  async function render(scale: number) {
    const dpr = window.devicePixelRatio || 1;
    if (renderedScale === scale && renderedDpr === dpr && hasCanvas) return;
    const page = await reader.page(n);
    const viewport = page.getViewport({ scale });
    const out = Math.min(dpr, Math.sqrt(MAX_PIXELS / (viewport.width * viewport.height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width * out);
    canvas.height = Math.floor(viewport.height * out);
    task?.cancel();
    const t = page.render({ canvas, viewport, transform: out === 1 ? undefined : [out, 0, 0, out, 0, 0] });
    task = t;
    try {
      await t.promise;
    } catch (e) {
      if (e instanceof RenderingCancelledException) return;
      throw e;
    } finally {
      if (task === t) task = null;
    }
    // Swap only after the new bitmap is ready so zoom never flashes blank.
    const old = host.querySelector('canvas');
    host.replaceChildren(canvas);
    if (old) old.width = old.height = 0;
    hasCanvas = true;
    renderedScale = scale;
    renderedDpr = dpr;
    if (!textLayer) await buildText(page.getViewport({ scale }));
  }

  async function buildText(viewport: PageViewport) {
    const page = await reader.page(n);
    const tl = new TextLayer({ textContentSource: page.streamTextContent(), container: textHost, viewport });
    textLayer = tl;
    try {
      await tl.render();
      hasText = true;
    } catch {
      // Cancelled because the page scrolled out of range.
    }
  }

  function release() {
    task?.cancel();
    task = null;
    textLayer?.cancel();
    textLayer = null;
    const c = host?.querySelector('canvas');
    if (c) c.width = c.height = 0;
    host?.replaceChildren();
    textHost?.replaceChildren();
    hasCanvas = hasText = false;
    renderedScale = 0;
  }

  $effect(() => {
    const scale = reader.scale;
    if (!active) return;
    // Debounce re-renders during a zoom gesture; the old bitmap is stretched by CSS meanwhile.
    const timer = setTimeout(() => void render(scale), untrack(() => hasCanvas) ? 140 : 0);
    return () => {
      clearTimeout(timer);
      task?.cancel();
    };
  });

  $effect(() => {
    if (!keep) release();
  });

  $effect(() => release);

  const ann = $derived(reader.ann);
  const tool = $derived(TOOLS[ann.tool]);
  const selectedHere = $derived.by(() => {
    const a = ann.selected ? ann.items.get(ann.selected) : undefined;
    return a?.page === n ? a : undefined;
  });
  const draft = $derived(ann.interaction.kind === 'placing-note' && ann.interaction.page === n ? ann.interaction : null);

  function onDown(e: PointerEvent) {
    if (e.button !== 0) return;
    if (tool.captures) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    }
    const c = reader.pointerCtx(n, e);
    if (c) ann.pointer('down', c);
  }

  function onMove(e: PointerEvent) {
    if (!tool.captures || ann.interaction.kind === 'idle' || ann.interaction.kind === 'placing-note') return;
    // Coalesced samples keep fast pen strokes smooth.
    for (const ev of e.getCoalescedEvents?.() ?? [e]) {
      const c = reader.pointerCtx(n, ev);
      if (c) ann.pointer('move', c);
    }
  }

  function onUp(e: PointerEvent) {
    if (!tool.captures) return;
    const c = reader.pointerCtx(n, e);
    if (c) ann.pointer('up', c);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="page"
  class:raised={!!selectedHere || !!draft}
  data-page={n}
  onpointerdown={tool.captures ? undefined : onDown}
  style:width="{size.w * reader.scale}px"
  style:height="{size.h * reader.scale}px"
  style:--scale-factor={reader.scale}
>
  <div class="canvas-host" bind:this={host}></div>
  {#if !hasCanvas}<div class="placeholder">{n}</div>{/if}
  {#if keep}<AnnotationLayer {reader} {n} />{/if}
  <div class="textLayer" bind:this={textHost}></div>
  {#if tool.captures}
    <div
      class="overlay"
      style:cursor={tool.cursor}
      onpointerdown={onDown}
      onpointermove={onMove}
      onpointerup={onUp}
      onpointercancel={onUp}
    ></div>
  {/if}
  {#if selectedHere}{#key selectedHere.id}<AnnotationPopover {reader} a={selectedHere} />{/key}{/if}
  {#if draft}<NoteDraft {reader} page={n} at={draft.at} />{/if}
</div>

<style>
  .page {
    position: relative;
    flex: none;
    margin: 0 auto;
    background: white;
    box-shadow: var(--page-shadow);
    isolation: isolate;
    --user-unit: 1;
    --total-scale-factor: calc(var(--scale-factor) * var(--user-unit));
    --scale-round-x: 1px;
    --scale-round-y: 1px;
  }
  .page.raised { z-index: 2; }
  .overlay { position: absolute; inset: 0; z-index: 3; touch-action: none; }
  .canvas-host, .canvas-host :global(canvas) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .canvas-host :global(canvas) { filter: var(--page-filter, none); }
  .placeholder {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #b9b6ad;
    font-size: 28px;
  }
</style>
