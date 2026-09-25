<script lang="ts">
  import { app } from '../lib/app.svelte';
  import {
    annotationColor, annotationNote, annotationText, COLOR_HEX, COLOR_IDS, KIND_LABEL,
    type AnnotationKind, type ColorId,
  } from '../lib/types';
  import type { Reader } from './session.svelte';
  import { setQuoteDrag } from '../lib/notebook';
  import { annotationQuote } from './notebook/host.svelte';

  let { reader }: { reader: Reader } = $props();
  const ann = $derived(reader.ann);

  let query = $state('');
  let colors = $state<ColorId[]>([]);
  let kind = $state<AnnotationKind | ''>('');
  let tag = $state('');

  const allTags = $derived([...new Set(ann.sorted.flatMap((a) => a.tags))].sort());
  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return ann.sorted.filter((a) => {
      const c = annotationColor(a);
      if (colors.length && (!c || !colors.includes(c))) return false;
      if (kind && a.kind !== kind) return false;
      if (tag && !a.tags.includes(tag)) return false;
      if (q && !`${annotationText(a)} ${annotationNote(a)} ${a.tags.join(' ')}`.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  const toggle = (c: ColorId) => (colors = colors.includes(c) ? colors.filter((x) => x !== c) : [...colors, c]);

</script>

<div class="panel">
  <div class="filters">
    <input type="search" placeholder="Search annotations" bind:value={query} aria-label="Search annotations" />
    <div class="chips">
      {#each COLOR_IDS as c (c)}
        <button class="chip" class:on={colors.includes(c)} style:--c={COLOR_HEX[c]} title={app.settings.meanings[c]} onclick={() => toggle(c)}>
          <span class="dot"></span>{app.settings.meanings[c]}
        </button>
      {/each}
    </div>
    <div class="row">
      <select bind:value={kind} aria-label="Filter by kind">
        <option value="">All kinds</option>
        {#each Object.entries(KIND_LABEL) as [k, l] (k)}<option value={k}>{l}</option>{/each}
      </select>
      <select bind:value={tag} aria-label="Filter by tag" disabled={allTags.length === 0}>
        <option value="">All tags</option>
        {#each allTags as t (t)}<option value={t}>#{t}</option>{/each}
      </select>
    </div>
    <div class="count muted">{filtered.length} of {ann.items.size}</div>
  </div>

  <ul>
    {#each filtered as a (a.id)}
      {@const c = annotationColor(a)}
      <li>
        <button class="item" class:active={ann.selected === a.id} style:--c={c ? COLOR_HEX[c] : 'var(--muted)'} onclick={() => ann.reveal(a)}
          draggable="true" ondragstart={(e) => e.dataTransfer && setQuoteDrag(e.dataTransfer, { text: annotationQuote(a), page: a.page })}
          title="Click to open, drag into the notebook to quote">
          <span class="meta"><span class="kind">{KIND_LABEL[a.kind]}</span><span class="muted">p. {a.page}</span></span>
          {#if annotationText(a)}<span class="text quote">{annotationText(a)}</span>{/if}
          {#if annotationNote(a)}<span class="note">{annotationNote(a)}</span>{/if}
          {#if a.tags.length}<span class="tags">{#each a.tags as t (t)}<span>#{t}</span>{/each}</span>{/if}
        </button>
      </li>
    {:else}
      <li class="empty muted">{ann.items.size ? 'Nothing matches these filters.' : 'No annotations yet. Pick a tool in the toolbar (h, u, p, n) and mark up the page.'}</li>
    {/each}
  </ul>
</div>

<style>
  .panel { display: flex; flex-direction: column; min-height: 100%; }
  .filters { display: grid; gap: 6px; padding: 8px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--surface); z-index: 1; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chip { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 2px 7px; border: 1px solid var(--border); border-radius: 12px; }
  .chip.on { background: color-mix(in srgb, var(--c) 28%, transparent); border-color: var(--c); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
  .row { display: flex; gap: 6px; }
  .row select { flex: 1; min-width: 0; font-size: 12px; padding: 3px 4px; }
  input[type='search'] { width: 100%; }
  .count { font-size: 11px; }
  ul { list-style: none; margin: 0; padding: 6px; display: grid; gap: 4px; }
  .item {
    width: 100%;
    text-align: left;
    display: grid;
    gap: 3px;
    padding: 7px 9px;
    border-left: 3px solid var(--c);
    border-radius: 4px 6px 6px 4px;
    background: var(--surface);
  }
  .item.active { background: var(--accent-soft); }
  .meta { display: flex; justify-content: space-between; font-size: 11px; }
  .kind { font-weight: 600; color: var(--muted); }
  .text { font-size: 12.5px; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .quote { font-style: italic; }
  .note { font-size: 12.5px; white-space: pre-wrap; }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; font-size: 11px; color: var(--accent); }
  .empty { padding: 12px; font-size: 12.5px; }
</style>
