<script lang="ts">
  import { onMount } from 'svelte';
  import { rectPageToDisplay } from '../lib/geometry';
  import type { Rect } from '../lib/types';
  import { resolveDest } from './pdf';
  import type { Reader } from './session.svelte';

  let { reader, n }: { reader: Reader; n: number } = $props();

  interface Link { rect: Rect; dest?: unknown; url?: string }
  let links = $state.raw<Link[]>([]);
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    let alive = true;
    void (async () => {
      const page = await reader.page(n);
      const info = reader.info[n - 1]!;
      const anns = (await page.getAnnotations({ intent: 'display' })) as { subtype?: string; rect: number[]; dest?: unknown; url?: string; unsafeUrl?: string }[];
      if (!alive) return;
      links = anns
        .filter((a) => a.subtype === 'Link' && (a.dest || a.url))
        .map((a) => {
          const [x1, y1, x2, y2] = a.rect as [number, number, number, number];
          const page = { x: (Math.min(x1, x2) - info.x0) / info.w, y: 1 - (Math.max(y1, y2) - info.y0) / info.h, w: Math.abs(x2 - x1) / info.w, h: Math.abs(y2 - y1) / info.h };
          return { rect: rectPageToDisplay(page, info.rotation), ...(a.dest ? { dest: a.dest } : {}), ...(a.url ? { url: a.url } : {}) };
        });
    })();
    return () => {
      alive = false;
      clearTimeout(hoverTimer);
    };
  });

  const resolve = (l: Link) => resolveDest(reader.pdf, l.dest as string | unknown[], (p) => reader.info[p - 1]);

  async function follow(e: MouseEvent, l: Link) {
    e.preventDefault();
    clearTimeout(hoverTimer);
    reader.hidePreview();
    if (l.url) {
      window.open(l.url, '_blank', 'noopener');
      return;
    }
    const t = await resolve(l);
    if (t) reader.jump(reader.targetAt(t.page, { x: 0, y: t.y }));
  }

  function enter(e: MouseEvent, l: Link) {
    if (!l.dest) return;
    const { clientX, clientY } = e;
    const name = typeof l.dest === 'string' ? l.dest : null;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(async () => {
      const dest = await resolve(l);
      if (dest) reader.showPreview({ dest, name, clientX, clientY });
    }, 300);
  }

  function leave() {
    clearTimeout(hoverTimer);
    reader.hidePreview(250);
  }
</script>

<div class="links" class:live={reader.ann.tool === 'select'}>
  {#each links as l, i (i)}
    <a
      href={l.url ?? '#'}
      style:left="{l.rect.x * 100}%"
      style:top="{l.rect.y * 100}%"
      style:width="{l.rect.w * 100}%"
      style:height="{l.rect.h * 100}%"
      title={l.url}
      aria-label={l.url ?? 'Internal link'}
      onclick={(e) => follow(e, l)}
      onmouseenter={(e) => enter(e, l)}
      onmouseleave={leave}
    ></a>
  {/each}
</div>

<style>
  .links { position: absolute; inset: 0; pointer-events: none; z-index: 2; }
  .links.live a { pointer-events: auto; }
  a { position: absolute; border-radius: 2px; }
  a:hover { background: color-mix(in srgb, var(--accent) 14%, transparent); outline: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); }
</style>
