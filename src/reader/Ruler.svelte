<script lang="ts">
  let { band }: { band: number } = $props();
  let host: HTMLDivElement;
  let y = $state(-1);

  function onMove(e: PointerEvent) {
    const r = host.getBoundingClientRect();
    y = e.clientY >= r.top && e.clientY <= r.bottom ? e.clientY - r.top : y;
  }
</script>

<svelte:window onpointermove={onMove} />

<div class="ruler" bind:this={host} aria-hidden="true" data-testid="ruler">
  {#if y >= 0}
    <div class="shade" style:top="0" style:height="{Math.max(0, y - band / 2)}px"></div>
    <div class="line" style:top="{y - band / 2}px" style:height="{band}px"></div>
    <div class="shade" style:top="{y + band / 2}px" style:bottom="0"></div>
  {/if}
</div>

<style>
  .ruler { position: absolute; inset: 0; pointer-events: none; z-index: 25; }
  .shade { position: absolute; left: 0; right: 0; background: rgb(15 20 18 / 0.42); }
  .line { position: absolute; left: 0; right: 0; box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--accent) 70%, transparent); }
</style>
