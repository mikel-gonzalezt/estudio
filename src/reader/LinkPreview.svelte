<script lang="ts">
  import { RenderingCancelledException } from 'pdfjs-dist';
  import type { Reader } from './session.svelte';

  let { reader, page, y, x, cy }: { reader: Reader; page: number; y: number; x: number; cy: number } = $props();

  const WIDTH = 440;
  const HEIGHT = 230;
  let canvas: HTMLCanvasElement;

  $effect(() => {
    let task: { cancel: () => void } | null = null;
    let alive = true;
    void (async () => {
      const p = await reader.page(page);
      if (!alive) return;
      const base = p.getViewport({ scale: 1 });
      const scale = WIDTH / base.width;
      const dpr = window.devicePixelRatio || 1;
      // Start a little above the destination so its heading is not clipped.
      const top = Math.max(0, y * base.height * scale - 24);
      const viewport = p.getViewport({ scale, offsetY: -top });
      canvas.width = Math.floor(WIDTH * dpr);
      canvas.height = Math.floor(HEIGHT * dpr);
      const t = p.render({ canvas, viewport, transform: [dpr, 0, 0, dpr, 0, 0] });
      task = t;
      try {
        await t.promise;
      } catch (e) {
        if (!(e instanceof RenderingCancelledException)) throw e;
      }
    })();
    return () => {
      alive = false;
      task?.cancel();
    };
  });

  const left = $derived(Math.max(8, Math.min(x - WIDTH / 2, window.innerWidth - WIDTH - 16)));
  const below = $derived(cy + HEIGHT + 40 < window.innerHeight);
</script>

<div class="preview" style:left="{left}px" style:top="{below ? cy + 18 : cy - HEIGHT - 34}px" data-testid="link-preview">
  <div class="label">Page {page}</div>
  <canvas bind:this={canvas} style:width="{WIDTH}px" style:height="{HEIGHT}px"></canvas>
</div>

<style>
  .preview {
    position: fixed;
    z-index: 70;
    padding: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--pop-shadow);
    pointer-events: none;
  }
  .label { font-size: 11px; color: var(--muted); padding: 0 2px 4px; }
  canvas { display: block; background: white; border-radius: 4px; filter: var(--page-filter, none); }
</style>
