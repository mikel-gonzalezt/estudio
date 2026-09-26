<script lang="ts">
  import type { Reader } from '../session.svelte';
  import PinPanel from './PinPanel.svelte';
  import { pinsFor } from './pins.svelte';

  let { reader }: { reader: Reader } = $props();
  const pins = $derived(pinsFor(reader));

  $effect(() => {
    const p = pins;
    return () => p.bringBack();
  });
</script>

<svelte:window onpagehide={() => pins.bringBack()} />

{#if pins.visible && !pins.poppedOut}
  <PinPanel {pins} />
{/if}
