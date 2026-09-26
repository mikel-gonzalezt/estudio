<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import { app } from '../../lib/app.svelte';
  import type { PageMode, PinPanelLayout } from '../../lib/types';
  import PinFigure from './PinFigure.svelte';
  import type { Pins } from './pins.svelte';

  let { pins, windowed = false }: { pins: Pins; windowed?: boolean } = $props();

  /** The page view's page modes, applied to a figure drawn outside it (possibly in another window). */
  const PAGE_FILTER: Record<PageMode, string> = {
    normal: 'none',
    dark: 'invert(0.9) hue-rotate(180deg)',
    sepia: 'sepia(0.5) saturate(1.15) brightness(0.96)',
  };

  const MIN_W = 200;
  const MIN_H = 150;

  const layout = $derived(pins.layout);
  const shown = $derived(pins.shown);
  const index = $derived(shown ? pins.figures.indexOf(shown) + 1 : 0);

  let panel = $state<HTMLElement>();

  $effect(() => {
    if (windowed && panel) panel.ownerDocument.documentElement.dataset.theme = app.settings.theme;
  });

  /** Follows one pointer drag, handing `move` the offset from where it started, and saves the layout on release. */
  function track(e: PointerEvent, move: (start: PinPanelLayout, dx: number, dy: number, room: DOMRect) => Partial<PinPanelLayout>) {
    if (e.button !== 0 || !panel?.parentElement) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const start = { ...layout };
    const room = panel.parentElement.getBoundingClientRect();
    const onMove = (m: PointerEvent) => {
      app.settings.pinPanel = { ...start, ...move(start, m.clientX - e.clientX, m.clientY - e.clientY, room) };
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      app.saveSettings();
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  function drag(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    track(e, (s, dx, dy, room) => ({
      right: clamp(s.right - dx, 0, room.width - s.w),
      bottom: clamp(s.bottom - dy, 0, room.height - s.h),
    }));
  }

  /** The panel hangs from its bottom-right corner, so it grows from the top-left one. */
  function resize(e: PointerEvent) {
    track(e, (s, dx, dy, room) => ({
      w: clamp(s.w - dx, MIN_W, room.width - s.right),
      h: clamp(s.h - dy, MIN_H, room.height - s.bottom),
    }));
  }

  function jump() {
    if (!shown) return;
    pins.jumpTo(shown);
    if (windowed) window.focus();
  }
</script>

{#if !windowed && layout.collapsed}
  <button
    class="tab"
    style:right="min({layout.right}px, calc(100% - 120px))"
    style:bottom="min({layout.bottom}px, calc(100% - 40px))"
    title="Show pinned figures"
    onclick={() => pins.setLayout({ collapsed: false })}
    data-testid="pin-tab"
  ><Icon name="pin" size={15} /> Figures <span class="count">{pins.figures.length}</span></button>
{:else}
  <section
    class="panel"
    class:windowed
    bind:this={panel}
    style:right={windowed ? undefined : `min(${layout.right}px, calc(100% - ${layout.w}px))`}
    style:bottom={windowed ? undefined : `min(${layout.bottom}px, calc(100% - ${layout.h}px))`}
    style:width={windowed ? undefined : `min(${layout.w}px, 100%)`}
    style:height={windowed ? undefined : `min(${layout.h}px, 100%)`}
    aria-label="Pinned figures"
    data-testid="pin-panel"
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <header onpointerdown={windowed ? undefined : drag}>
      <button title="Previous figure" aria-label="Previous figure" disabled={pins.figures.length < 2} onclick={() => pins.step(-1)}><Icon name="back" size={15} /></button>
      <span class="where" data-testid="pin-where">{index} / {pins.figures.length}{shown ? ` · p. ${shown.page}` : ''}</span>
      <button title="Next figure" aria-label="Next figure" disabled={pins.figures.length < 2} onclick={() => pins.step(1)}><Icon name="forward" size={15} /></button>
      <div class="grow"></div>
      <button
        class="follow"
        class:on={layout.follow}
        aria-pressed={layout.follow}
        title="Follow reading: show the pinned figure nearest the page being read"
        onclick={() => pins.setLayout({ follow: !layout.follow })}
        data-testid="pin-follow"
      >Follow</button>
      {#if shown}<button title="Unpin this figure" aria-label="Unpin this figure" onclick={() => pins.unpin(shown.id)} data-testid="pin-unpin"><Icon name="pin" size={15} /></button>{/if}
      {#if windowed}
        <button title="Back into the reader" aria-label="Back into the reader" onclick={() => pins.bringBack()}><Icon name="popout" size={15} /></button>
      {:else}
        <button title="Open in its own window" aria-label="Open in its own window" onclick={() => pins.popOut() || alert('The browser blocked the window. Allow pop-ups for Estudio and try again.')} data-testid="pin-popout"><Icon name="popout" size={15} /></button>
        <button class="collapse" title="Collapse" aria-label="Collapse" onclick={() => pins.setLayout({ collapsed: true })} data-testid="pin-collapse"><Icon name="chevron" size={15} /></button>
        <button title="Hide (P)" aria-label="Hide pinned figures" onclick={() => pins.setLayout({ hidden: true })}><Icon name="close" size={15} /></button>
      {/if}
    </header>
    {#if shown}
      <button class="stage" title="Go to p. {shown.page}" onclick={jump} style:filter={PAGE_FILTER[app.settings.pageMode]} data-testid="pin-stage">
        <PinFigure reader={pins.reader} fig={shown} />
      </button>
      {#if shown.note}<p class="note" title={shown.note}>{shown.note}</p>{/if}
    {/if}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    {#if !windowed}<div class="grip" onpointerdown={resize} title="Resize" data-testid="pin-grip"></div>{/if}
  </section>
{/if}

<style>
  .panel {
    position: absolute;
    z-index: 15;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--pop-shadow);
    overflow: hidden;
    font-size: 12px;
    color: var(--text);
  }
  .panel.windowed { position: static; height: 100%; border: 0; border-radius: 0; box-shadow: none; }
  header {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px 4px 3px 12px;
    border-bottom: 1px solid var(--border);
    cursor: grab;
    user-select: none;
    touch-action: none;
  }
  .windowed header { cursor: auto; padding-left: 4px; }
  header button { padding: 3px; color: var(--text); }
  .where { font-variant-numeric: tabular-nums; color: var(--muted); white-space: nowrap; }
  .grow { flex: 1; }
  .collapse :global(svg) { transform: rotate(90deg); }
  .follow { font-size: 11px; padding: 2px 7px; border: 1px solid var(--border); border-radius: 9px; }
  .follow.on { background: var(--accent-soft); color: var(--accent); border-color: transparent; }
  .stage { flex: 1; min-height: 0; padding: 6px; border-radius: 0; background: #fff; cursor: pointer; }
  .stage:hover:not(:disabled) { background: #fff; }
  .note { margin: 0; padding: 4px 8px; border-top: 1px solid var(--border); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .grip {
    position: absolute;
    left: 0;
    top: 0;
    width: 12px;
    height: 12px;
    z-index: 1;
    cursor: nwse-resize;
    touch-action: none;
    background: linear-gradient(315deg, transparent 50%, var(--border) 50%, var(--border) 62%, transparent 62%, transparent 75%, var(--border) 75%, var(--border) 87%, transparent 87%);
  }
  .tab {
    position: absolute;
    z-index: 15;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    font-size: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: var(--pop-shadow);
    color: var(--text);
  }
  .count { padding: 0 6px; border-radius: 9px; background: var(--accent); color: var(--accent-text); font-size: 10.5px; }
</style>
