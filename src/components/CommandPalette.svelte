<script lang="ts">
  import { formatChord } from '../lib/keys';
  import { fuzzyScore, type Command } from '../lib/registry';

  let { commands, onclose }: { commands: readonly Command[]; onclose: () => void } = $props();

  let query = $state('');
  let active = $state(0);
  let list: HTMLUListElement | undefined = $state();

  const results = $derived(
    commands
      .filter((c) => !c.when || c.when())
      .map((c) => ({ c, score: fuzzyScore(query, `${c.title} ${c.group}`) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.c),
  );

  $effect(() => {
    query;
    active = 0;
  });

  $effect(() => {
    list?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  });

  function run(c: Command | undefined) {
    if (!c) return;
    onclose();
    // Let the palette unmount first so commands that move focus are not undone.
    queueMicrotask(() => c.run());
  }

  function onKey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(results.length - 1, active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); onclose(); }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={onclose}>
  <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette" tabindex="-1" onclick={(e) => e.stopPropagation()} data-testid="palette">
    <!-- svelte-ignore a11y_autofocus -->
    <input type="text" bind:value={query} onkeydown={onKey} placeholder="Type a command…" autofocus aria-label="Command"
      role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant="palette-{active}" />
    <ul id="palette-list" role="listbox" bind:this={list} class="scroll-thin">
      {#each results as c, i (c.id)}
        <li id="palette-{i}" role="option" aria-selected={i === active} data-index={i}>
          <button class:active={i === active} onmouseenter={() => (active = i)} onclick={() => run(c)}>
            <span class="group">{c.group}</span>
            <span class="title">{c.title}</span>
            <span class="keys">{#each c.keys ?? [] as k (k)}<kbd>{formatChord(k)}</kbd>{/each}</span>
          </button>
        </li>
      {:else}
        <li class="empty muted">No matching command</li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 85; background: rgb(0 0 0 / 0.2); display: flex; justify-content: center; align-items: flex-start; padding-top: 12vh; }
  .palette { width: min(600px, calc(100vw - 32px)); background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--pop-shadow); overflow: hidden; }
  input { width: 100%; border: none; border-bottom: 1px solid var(--border); border-radius: 0; padding: 14px 16px; font-size: 15px; }
  input:focus-visible { outline: none; }
  ul { list-style: none; margin: 0; padding: 6px; max-height: min(420px, 60vh); overflow: auto; }
  button { width: 100%; display: grid; grid-template-columns: 76px 1fr auto; align-items: center; gap: 8px; text-align: left; padding: 7px 10px; }
  button.active { background: var(--accent-soft); }
  .group { font-size: 11px; color: var(--muted); }
  .keys { display: flex; gap: 4px; }
  .empty { padding: 12px; }
</style>
