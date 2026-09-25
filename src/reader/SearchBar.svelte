<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import type { Reader } from './session.svelte';

  let { reader }: { reader: Reader } = $props();
  const search = $derived(reader.search);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function onInput(v: string) {
    clearTimeout(timer);
    timer = setTimeout(() => void search.run(v), 180);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(timer);
      const v = (e.currentTarget as HTMLInputElement).value;
      if (v !== search.query) void search.run(v);
      else if (e.shiftKey) search.prev();
      else search.next();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      search.close();
    }
  }
</script>

<div class="search" role="search" data-testid="search-bar">
  <Icon name="search" size={16} />
  <input id="search-input" type="search" value={search.query} placeholder="Find in document" aria-label="Find in document"
    oninput={(e) => onInput(e.currentTarget.value)} onkeydown={onKey} />
  <span class="count muted" data-testid="search-count">
    {#if search.busy}…{:else if search.query.trim()}{search.hits.length ? `${search.current + 1} / ${search.hits.length}` : 'No matches'}{/if}
  </span>
  <button title="Previous (Shift+Enter)" disabled={!search.hits.length} onclick={() => search.prev()}><Icon name="back" size={16} /></button>
  <button title="Next (Enter)" disabled={!search.hits.length} onclick={() => search.next()}><Icon name="forward" size={16} /></button>
  <button title="Close (Esc)" onclick={() => search.close()}><Icon name="close" size={16} /></button>
</div>

<style>
  .search {
    position: absolute;
    top: 10px;
    right: 18px;
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px 4px 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--pop-shadow);
    color: var(--muted);
  }
  input { width: 200px; border: none; padding: 4px; background: transparent; }
  input:focus-visible { outline: none; }
  .count { font-size: 12px; min-width: 64px; text-align: right; font-variant-numeric: tabular-nums; }
  button { padding: 3px; color: var(--text); }
</style>
