<script lang="ts">
  import { RenderingCancelledException, type RenderTask } from 'pdfjs-dist';
  import { rectPageToDisplay } from '../../lib/geometry';
  import { displaySize, drawRegion } from '../pdf';
  import type { Reader } from '../session.svelte';
  import type { PinnedFigure } from './pins.svelte';

  let { reader, fig }: { reader: Reader; fig: PinnedFigure } = $props();

  const MAX_PIXELS = 8_000_000;

  /** A canvas draws text with its document's fonts, and pdf.js registers the PDF's fonts in this one; the pop-out gets a copy of the pixels. */
  function copyInto(doc: Document, from: HTMLCanvasElement): HTMLCanvasElement {
    const c = doc.createElement('canvas');
    c.width = from.width;
    c.height = from.height;
    c.getContext('2d')!.drawImage(from, 0, 0);
    from.width = from.height = 0;
    return c;
  }

  const unpaced = (t: RenderTask) => {
    const internal = (t as unknown as { _internalRenderTask?: { _useRequestAnimationFrame?: boolean } })._internalRenderTask;
    if (internal) internal._useRequestAnimationFrame = false;
  };

  let box: HTMLDivElement;
  let size = $state({ w: 0, h: 0, dpr: 1 });
  let drawn = '';

  // The observers come from the window the figure is shown in, which may be the pop-out.
  $effect(() => {
    const view = box.ownerDocument.defaultView!;
    const measure = () => (size = { w: box.clientWidth, h: box.clientHeight, dpr: view.devicePixelRatio || 1 });
    const ro = new view.ResizeObserver(measure);
    ro.observe(box);
    let mq: MediaQueryList | null = null;
    const onDpr = () => {
      measure();
      watchDpr();
    };
    const watchDpr = () => {
      mq?.removeEventListener('change', onDpr);
      mq = view.matchMedia(`(resolution: ${view.devicePixelRatio}dppx)`);
      mq.addEventListener('change', onDpr);
    };
    measure();
    watchDpr();
    return () => {
      ro.disconnect();
      mq?.removeEventListener('change', onDpr);
    };
  });

  $effect(() => {
    const { w, h, dpr } = size;
    const f = fig;
    if (!w || !h) return;
    let task: RenderTask | null = null;
    let stale = false;
    // While the panel is resized the old bitmap is stretched; the new one is drawn once it settles.
    const timer = setTimeout(async () => {
      const page = await reader.page(f.page);
      if (stale) return;
      const info = reader.info[f.page - 1]!;
      const r = rectPageToDisplay(f.rect, info.rotation);
      const s = displaySize(info);
      const fw = r.w * s.w;
      const fh = r.h * s.h;
      const scale = Math.min(Math.min(w / fw, h / fh) * dpr, Math.sqrt(MAX_PIXELS / (fw * fh)));
      const canvas = document.createElement('canvas');
      task = drawRegion(page, info, f.rect, canvas, scale);
      // pdf.js paces rendering with this window's animation frames, which stop while the pop-out hides it.
      if (box.ownerDocument !== document) unpaced(task);
      try {
        await task.promise;
      } catch (e) {
        if (e instanceof RenderingCancelledException) return;
        throw e;
      }
      const old = box.querySelector('canvas');
      box.replaceChildren(box.ownerDocument === document ? canvas : copyInto(box.ownerDocument, canvas));
      if (old) old.width = old.height = 0;
      drawn = f.id;
    }, drawn === f.id ? 120 : 0);
    return () => {
      stale = true;
      clearTimeout(timer);
      task?.cancel();
    };
  });

  $effect(() => () => {
    const c = box.querySelector('canvas');
    if (c) c.width = c.height = 0;
  });
</script>

<div class="figure" bind:this={box} data-testid="pin-figure" data-ann={fig.id}></div>

<style>
  .figure { width: 100%; height: 100%; }
  .figure :global(canvas) { display: block; width: 100%; height: 100%; object-fit: contain; }
</style>
