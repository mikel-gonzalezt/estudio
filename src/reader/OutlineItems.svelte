<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import type { OutlineNode } from './pdf';
  import Self from './OutlineItems.svelte';

  let { items, go, depth }: { items: OutlineNode[]; go: (n: OutlineNode) => void; depth: number } = $props();
  let open = $state<Record<number, boolean>>({});
</script>

<ul class:root={depth === 0}>
  {#each items as item, i (i)}
    <li>
      <div class="row" style:padding-left="{depth * 14 + 4}px">
        {#if item.items.length}
          <button class="twisty" class:open={open[i] ?? depth === 0} aria-label="Toggle" onclick={() => (open[i] = !(open[i] ?? depth === 0))}>
            <Icon name="forward" size={14} />
          </button>
        {:else}
          <span class="twisty"></span>
        {/if}
        <button class="title" onclick={() => go(item)} title={item.title}>{item.title}</button>
      </div>
      {#if item.items.length && (open[i] ?? depth === 0)}
        <Self items={item.items} {go} depth={depth + 1} />
      {/if}
    </li>
  {/each}
</ul>

<style>
  ul { list-style: none; margin: 0; padding: 0; }
  ul.root { padding: 6px 4px; }
  .row { display: flex; align-items: center; gap: 2px; }
  .twisty { width: 20px; height: 22px; padding: 0; flex: none; display: grid; place-items: center; color: var(--muted); }
  .twisty :global(svg) { transition: transform 0.12s; }
  .twisty.open :global(svg) { transform: rotate(90deg); }
  .title {
    flex: 1;
    min-width: 0;
    text-align: left;
    padding: 3px 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 13px;
  }
</style>
