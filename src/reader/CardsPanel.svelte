<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { isCloze, renderCloze } from '../lib/cloze';
  import { formatInterval } from '../lib/fsrs';
  import type { Card } from '../lib/types';
  import type { Reader } from './session.svelte';

  let { reader }: { reader: Reader } = $props();
  const study = $derived(reader.study);
  const sorted = $derived([...study.cards].sort((a, b) => a.srs.due - b.srs.due));

  function dueLabel(c: Card): string {
    const d = c.srs.due - Date.now();
    if (c.srs.state === 'new') return 'new';
    return d <= 0 ? 'due' : `in ${formatInterval(d)}`;
  }

  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
</script>

<div class="cards">
  <div class="actions">
    <button class="btn primary" disabled={study.dueHere === 0} onclick={() => (study.review = 'doc')} data-testid="review-doc">
      Review this document ({study.dueHere})
    </button>
    <button class="btn" disabled={study.dueAll === 0} onclick={() => (study.review = 'all')}>All documents ({study.dueAll})</button>
    <button class="btn" onclick={() => (study.draft = { page: reader.currentPage, text: '', cloze: false })}>New card</button>
  </div>
  <ul>
    {#each sorted as c (c.id)}
      <li>
        <button class="front" onclick={() => reader.jump({ page: c.page, y: 0 })} title="Go to page {c.page}">
          {@html isCloze(c.front) ? renderCloze(c.front, true) : escape(c.front)}
        </button>
        <div class="meta">
          <span class="muted">p. {c.page} · {isCloze(c.front) ? 'cloze' : 'basic'} · <span class:due={dueLabel(c) === 'due' || dueLabel(c) === 'new'}>{dueLabel(c)}</span></span>
          <button class="del" title="Delete card" onclick={() => study.removeCard(c.id)}><Icon name="trash" size={14} /></button>
        </div>
      </li>
    {:else}
      <li class="empty muted">No cards yet. Select text or open an annotation and choose <strong>Card</strong>.</li>
    {/each}
  </ul>
</div>

<style>
  .cards { display: flex; flex-direction: column; min-height: 100%; }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; border-bottom: 1px solid var(--border); }
  .actions .btn { font-size: 12px; padding: 4px 9px; }
  ul { list-style: none; margin: 0; padding: 6px; display: grid; gap: 6px; }
  li { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; background: var(--surface); }
  .front { display: block; width: 100%; text-align: left; padding: 0; font-size: 13px; }
  .front :global(mark) { background: var(--accent-soft); color: var(--accent); border-radius: 3px; padding: 0 2px; }
  .meta { display: flex; justify-content: space-between; align-items: center; font-size: 11px; margin-top: 4px; }
  .due { color: var(--accent); font-weight: 600; }
  .del { padding: 2px; color: var(--muted); }
  .empty { border: none; font-size: 12.5px; }
</style>
