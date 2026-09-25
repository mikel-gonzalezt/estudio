<script lang="ts">
  import { outline, resolveDest, type OutlineNode } from './pdf';
  import type { Reader } from './session.svelte';
  import OutlineItems from './OutlineItems.svelte';

  let { reader }: { reader: Reader } = $props();

  const nodes = $derived(outline(reader.pdf));

  async function go(node: OutlineNode) {
    const t = await resolveDest(reader.pdf, node.dest, (p) => reader.info[p - 1]);
    if (t) reader.jump(reader.targetAt(t.page, { x: 0, y: t.y }));
  }
</script>

{#await nodes}
  <p class="muted pad">Loading outline…</p>
{:then items}
  {#if items.length === 0}
    <p class="muted pad">This document has no outline.</p>
  {:else}
    <OutlineItems {items} {go} depth={0} />
  {/if}
{/await}

<style>
  .pad { padding: 12px; margin: 0; }
</style>
