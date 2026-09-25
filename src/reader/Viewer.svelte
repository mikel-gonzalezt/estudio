<script lang="ts">
  import PageView from './PageView.svelte';
  import type { Reader } from './session.svelte';
  import { TwoFingerTap } from '../lib/gestures';

  let { reader }: { reader: Reader } = $props();

  let scroller: HTMLDivElement;
  let visible = $state.raw(new Set<number>());

  const first = $derived(visible.size ? Math.min(...visible) : reader.currentPage);
  const last = $derived(visible.size ? Math.max(...visible) : reader.currentPage);
  const isActive = (n: number) => n >= first - 1 && n <= last + 1;
  const isKept = (n: number) => n >= first - 3 && n <= last + 3;

  $effect(() => {
    reader.scroller = scroller;
    const io = new IntersectionObserver((entries) => {
      const next = new Set(visible);
      for (const e of entries) {
        const n = Number((e.target as HTMLElement).dataset.page);
        if (e.isIntersecting) next.add(n);
        else next.delete(n);
      }
      visible = next;
    }, { root: scroller });
    for (const el of scroller.querySelectorAll<HTMLElement>('.slot')) io.observe(el);

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = scroller.getBoundingClientRect();
      void reader.zoomBy(reader.scale * Math.exp(-e.deltaY * 0.0015), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    const tap = new TwoFingerTap();
    const touch = (f: (e: PointerEvent) => void) => (e: PointerEvent) => {
      if (e.pointerType === 'touch') f(e);
    };
    const onDown = touch((e) => tap.down(e.pointerId, e.clientX, e.clientY, e.timeStamp));
    const onMove = touch((e) => tap.move(e.pointerId, e.clientX, e.clientY));
    const onUp = touch((e) => {
      if (tap.up(e.pointerId, e.timeStamp)) void reader.toggleTextWidth();
    });
    const onCancel = touch((e) => tap.cancel(e.pointerId));
    const gestures = [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp], ['pointercancel', onCancel]] as const;
    for (const [type, f] of gestures) scroller.addEventListener(type, f, { capture: true });
    let lastWidth = scroller.clientWidth;
    const ro = new ResizeObserver(() => {
      if (scroller.clientWidth === lastWidth) return;
      lastWidth = scroller.clientWidth;
      reader.refit();
    });
    ro.observe(scroller);
    requestAnimationFrame(() => reader.scrollTo({ page: reader.doc.lastPage, y: 0 }));
    return () => {
      io.disconnect();
      ro.disconnect();
      scroller.removeEventListener('wheel', onWheel);
      for (const [type, f] of gestures) scroller.removeEventListener(type, f, { capture: true });
    };
  });
</script>

<div class="viewer scroll-thin" bind:this={scroller} onscroll={() => reader.onScroll()}>
  <div class="pages" style:min-height="{reader.offsets.at(-1)}px">
    {#each reader.info as _, i (i)}
      <div class="slot" data-page={i + 1}>
        <PageView {reader} n={i + 1} active={isActive(i + 1)} keep={isKept(i + 1)} />
      </div>
    {/each}
  </div>
</div>

<style>
  .viewer {
    position: relative;
    overflow: auto;
    height: 100%;
    background: var(--viewer-bg);
    overflow-anchor: none;
  }
  .pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 16px 16px;
    width: max-content;
    min-width: 100%;
  }
  .slot { flex: none; }
</style>
