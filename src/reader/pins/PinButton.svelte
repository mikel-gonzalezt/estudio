<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import type { StoredAnnotation } from '../../lib/types';
  import type { Reader } from '../session.svelte';
  import { pinsFor } from './pins.svelte';

  let { reader, a }: { reader: Reader; a: StoredAnnotation } = $props();
  const pins = $derived(pinsFor(reader));
  const pinned = $derived(pins.isPinned(a.id));
</script>

{#if pins.enabled && a.kind === 'area'}
  <button
    class="act"
    class:on={pinned}
    title={pinned ? 'Unpin from the figure panel (Alt+P)' : 'Keep this clip in a floating panel while you read (Alt+P)'}
    onclick={() => pins.toggle(a.id)}
    data-testid="pin-area"
  ><Icon name="pin" size={16} /> {pinned ? 'Unpin' : 'Pin'}</button>
{/if}

<style>
  .act { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; border: 1px solid var(--border); }
  .act.on { background: var(--accent-soft); color: var(--accent); border-color: transparent; }
</style>
