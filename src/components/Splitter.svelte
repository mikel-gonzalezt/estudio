<script lang="ts">
  import { clampPane, dragWidth, keyWidth, PANE_LIMITS, type PaneSide } from '../lib/panes';

  let {
    side, label, room, onresize, onreset,
  }: {
    side: PaneSide;
    label: string;
    /** Window width available to this pane, i.e. minus the other pane. */
    room: () => number;
    /** `live` is true while dragging; a final call with false follows on release. */
    onresize: (width: number, live: boolean) => void;
    onreset: () => void;
  } = $props();

  let handle: HTMLDivElement;
  let drag: { x: number; w: number; pointer: number } | null = $state(null);
  let frame = 0;
  let pendingX = 0;
  let now = $state(0);

  const paneWidth = () => handle.parentElement!.getBoundingClientRect().width;
  const widthAt = (x: number) => (drag ? clampPane(side, dragWidth(side, drag.w, x - drag.x), room()) : 0);

  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, w: paneWidth(), pointer: e.pointerId };
    now = drag.w;
  }

  function move(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointer) return;
    pendingX = e.clientX;
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      now = widthAt(pendingX);
      onresize(now, true);
    });
  }

  function up(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointer) return;
    cancelAnimationFrame(frame);
    frame = 0;
    const w = widthAt(e.clientX);
    const moved = w !== drag.w;
    drag = null;
    if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
    if (moved) onresize(w, false);
  }

  function key(e: KeyboardEvent) {
    const next = keyWidth(side, paneWidth(), e.key, e.shiftKey);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    now = clampPane(side, next, room());
    onresize(now, false);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  bind:this={handle}
  class="splitter {side}"
  class:dragging={drag}
  role="separator"
  aria-orientation="vertical"
  aria-label={label}
  aria-valuemin={PANE_LIMITS[side].min}
  aria-valuemax={PANE_LIMITS[side].max}
  aria-valuenow={now}
  tabindex="0"
  title="Drag to resize, double-click to reset"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  ondblclick={onreset}
  onkeydown={key}
  onfocus={() => (now = Math.round(paneWidth()))}
  data-testid="splitter-{side}"
></div>

<style>
  .splitter {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 8px;
    z-index: 5;
    cursor: col-resize;
    touch-action: none;
  }
  .splitter.left { right: -4px; }
  .splitter.right { left: -4px; }
  .splitter::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 3px;
    width: 2px;
    background: transparent;
    transition: background 0.15s;
  }
  .splitter:hover::after, .splitter.dragging::after, .splitter:focus-visible::after { background: var(--accent); }
  .splitter:focus-visible { outline: none; }
</style>
