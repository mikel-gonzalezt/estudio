<script lang="ts">
  import { RenderingCancelledException } from 'pdfjs-dist';
  import { tick } from 'svelte';
  import { entryText, looksLikeReference, paperLink, scholarUrl } from '../lib/citation';
  import type { DestPoint } from './pdf';
  import type { Reader } from './session.svelte';

  let { reader, dest, name, clientX, clientY }: { reader: Reader; dest: DestPoint; name: string | null; clientX: number; clientY: number } = $props();

  const WIDTH = 440;
  const HEIGHT = 230;
  let canvas: HTMLCanvasElement | undefined = $state();
  let entry = $state<string | null | undefined>(undefined);
  const link = $derived(entry ? paperLink(entry) : null);

  $effect(() => {
    let task: { cancel: () => void } | null = null;
    let alive = true;
    const { page, y, x } = dest;
    entry = undefined;
    void (async () => {
      const text = entryText(await reader.textRuns(page), { x, y });
      if (!alive) return;
      entry = looksLikeReference(text, name) ? text : null;
      if (entry) return;
      await tick();
      const p = await reader.page(page);
      if (!alive || !canvas) return;
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

  const left = $derived(Math.max(8, Math.min(clientX - WIDTH / 2, window.innerWidth - WIDTH - 16)));
  const below = $derived(clientY + HEIGHT + 40 < window.innerHeight);
  const LINK_LABEL = { doi: 'DOI', arxiv: 'arXiv', url: 'link' } as const;
</script>

<div
  class="preview"
  role="tooltip"
  style:width="{WIDTH}px"
  style:left="{left}px"
  style:top={below ? `${clientY + 18}px` : undefined}
  style:bottom={below ? undefined : `${window.innerHeight - clientY + 16}px`}
  data-testid="link-preview"
  onmouseenter={() => reader.holdPreview()}
  onmouseleave={() => reader.hidePreview(150)}
>
  <div class="label">Page {dest.page}{entry ? ' · Reference' : ''}</div>
  {#if entry}
    <p class="entry" data-testid="reference-text">{entry}</p>
    <div class="actions">
      {#if link}
        <a class="btn primary" href={link.href} target="_blank" rel="noopener noreferrer" title={link.href} onclick={() => reader.hidePreview()}>Open paper ({LINK_LABEL[link.kind]})</a>
      {:else}
        <a class="btn" href={scholarUrl(entry)} target="_blank" rel="noopener noreferrer" onclick={() => reader.hidePreview()}>Search Scholar</a>
      {/if}
    </div>
  {:else if entry === null}
    <canvas bind:this={canvas} style:width="{WIDTH}px" style:height="{HEIGHT}px"></canvas>
  {/if}
</div>

<style>
  .preview {
    position: fixed;
    z-index: 70;
    box-sizing: content-box;
    padding: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--pop-shadow);
  }
  .label { font-size: 11px; color: var(--muted); padding: 0 2px 4px; }
  canvas { display: block; background: white; border-radius: 4px; filter: var(--page-filter, none); }
  .entry { margin: 2px 4px 8px; font-size: 13px; line-height: 1.45; max-height: 180px; overflow: auto; user-select: text; }
  .actions { display: flex; gap: 6px; padding: 0 2px 2px; }
  .actions a { text-decoration: none; font-size: 12px; }
</style>
