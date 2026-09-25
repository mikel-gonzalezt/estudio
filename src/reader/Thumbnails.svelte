<script lang="ts">
  import { RenderingCancelledException } from 'pdfjs-dist';
  import { ANNOTATION_MODE, displaySize } from './pdf';
  import type { Reader } from './session.svelte';

  let { reader }: { reader: Reader } = $props();

  const WIDTH = 150;
  let list: HTMLUListElement;
  const rendered = new Set<number>();

  $effect(() => {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const li = e.target as HTMLElement;
        const n = Number(li.dataset.page);
        if (!e.isIntersecting) {
          if (rendered.delete(n)) li.querySelector('canvas')!.width = 0;
          continue;
        }
        if (rendered.has(n)) continue;
        rendered.add(n);
        void draw(n, li.querySelector('canvas')!);
      }
    }, { root: list.parentElement, rootMargin: '300px 0px' });
    for (const li of list.querySelectorAll('li')) io.observe(li);
    return () => io.disconnect();
  });

  async function draw(n: number, canvas: HTMLCanvasElement) {
    const page = await reader.page(n);
    const base = page.getViewport({ scale: 1 });
    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: (WIDTH / base.width) * dpr });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    try {
      await page.render({ canvas, viewport, annotationMode: ANNOTATION_MODE }).promise;
    } catch (e) {
      rendered.delete(n);
      if (!(e instanceof RenderingCancelledException)) throw e;
    }
  }

  $effect(() => {
    const cur = reader.currentPage;
    list.querySelector(`li[data-page="${cur}"]`)?.scrollIntoView({ block: 'nearest' });
  });
</script>

<ul bind:this={list}>
  {#each reader.info as p, i (i)}
    {@const s = displaySize(p)}
    <li data-page={i + 1}>
      <button class:current={reader.currentPage === i + 1} onclick={() => reader.jump({ page: i + 1, y: 0 })} aria-label="Page {i + 1}">
        <canvas style:width="{WIDTH}px" style:height="{(WIDTH * s.h) / s.w}px"></canvas>
        <span>{i + 1}</span>
      </button>
    </li>
  {/each}
</ul>

<style>
  ul { list-style: none; margin: 0; padding: 12px 0; display: grid; justify-items: center; gap: 12px; }
  button { display: grid; justify-items: center; gap: 4px; padding: 4px; border-radius: 6px; }
  canvas { background: white; box-shadow: var(--page-shadow); border: 2px solid transparent; border-radius: 2px; filter: var(--page-filter, none); }
  .current canvas { border-color: var(--accent); }
  span { font-size: 11px; color: var(--muted); }
  .current span { color: var(--accent); font-weight: 600; }
</style>
