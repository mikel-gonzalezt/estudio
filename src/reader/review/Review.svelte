<script lang="ts">
  import { onMount } from 'svelte';
  import { isCloze, renderCloze } from '../../lib/cloze';
  import { dueCards, putCard } from '../../lib/db';
  import { formatInterval, GRADES, preview, schedule, type Grade } from '../../lib/fsrs';
  import type { Card } from '../../lib/types';
  import type { Reader } from '../session.svelte';

  let { reader }: { reader: Reader } = $props();
  const study = $derived(reader.study);

  let queue = $state.raw<Card[]>([]);
  let loaded = $state(false);
  let shown = $state(false);
  let done = $state(0);
  let busy = false;

  const card = $derived(queue[0]);
  const options = $derived(card ? preview(card.srs, Date.now()) : null);
  const LABELS: Record<Grade, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

  onMount(async () => {
    const now = Date.now();
    const due = await dueCards(now, study.review === 'doc' ? study.docId : undefined);
    queue = due.sort((a, b) => a.srs.due - b.srs.due);
    loaded = true;
  });

  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
  const face = (c: Card, reveal: boolean) => (isCloze(c.front) ? renderCloze(c.front, reveal) : escape(c.front));

  async function grade(g: Grade) {
    if (!card || busy) return;
    busy = true;
    const now = Date.now();
    const next: Card = { ...card, srs: schedule(card.srs, g, now) };
    await putCard(next);
    const rest = queue.slice(1);
    // Short learning steps come back within this session, as in Anki.
    const soon = next.srs.due - now < 20 * 60_000;
    queue = soon ? [...rest, next] : rest;
    if (!soon) done++;
    shown = false;
    busy = false;
  }

  async function close() {
    study.review = null;
    await study.refreshDue();
  }

  function onKey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Escape') return void close();
    if (!card) return;
    if (!shown && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      shown = true;
      return;
    }
    if (shown && ['1', '2', '3', '4'].includes(e.key)) void grade(Number(e.key) as Grade);
  }
</script>

<svelte:window onkeydowncapture={onKey} />

<div class="review" role="dialog" aria-modal="true" aria-label="Flashcard review" data-testid="review">
  <header>
    <strong>Review · {study.review === 'doc' ? reader.doc.title : 'All documents'}</strong>
    <span class="muted">{done} done · {queue.length} left</span>
    <button class="btn" onclick={close}>Close (Esc)</button>
  </header>

  <main>
    {#if !loaded}
      <p class="muted">Loading…</p>
    {:else if !card}
      <div class="finished">
        <h2>All caught up</h2>
        <p class="muted">{done} card{done === 1 ? '' : 's'} reviewed. The scheduler will bring them back when you are about to forget.</p>
        <button class="btn primary" onclick={close}>Back to reading</button>
      </div>
    {:else}
      <article class="card">
        <div class="front">{@html face(card, shown)}</div>
        {#if shown && !isCloze(card.front)}
          <hr />
          <div class="back">{@html escape(card.back)}</div>
        {/if}
        <p class="src muted">p. {card.page}{card.docId !== reader.doc.id ? ' · other document' : ''}</p>
      </article>

      <div class="controls">
        {#if !shown}
          <button class="btn primary big" onclick={() => (shown = true)}>Show answer <kbd>Space</kbd></button>
        {:else if options}
          {#each GRADES as g (g)}
            <button class="grade g{g}" onclick={() => grade(g)}>
              <span>{LABELS[g]}</span>
              <small>{formatInterval(options[g].due - Date.now())} · <kbd>{g}</kbd></small>
            </button>
          {/each}
        {/if}
      </div>
    {/if}
  </main>
</div>

<style>
  .review { position: fixed; inset: 0; z-index: 90; display: flex; flex-direction: column; background: var(--bg); }
  header { display: flex; align-items: center; gap: 16px; padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--surface); }
  header .btn { margin-left: auto; }
  main { flex: 1; display: grid; place-content: center; gap: 24px; padding: 24px; overflow: auto; }
  .card {
    width: min(680px, calc(100vw - 48px));
    min-height: 220px;
    padding: 28px 32px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    box-shadow: var(--page-shadow);
    font-size: 19px;
    line-height: 1.55;
  }
  .card :global(.cloze-gap) { color: var(--accent); font-weight: 700; }
  .card :global(mark.cloze) { background: var(--accent-soft); color: var(--accent); font-weight: 600; border-radius: 4px; padding: 0 3px; }
  hr { border: none; border-top: 1px solid var(--border); margin: 18px 0; }
  .src { font-size: 12px; margin: 18px 0 0; }
  .controls { display: flex; justify-content: center; gap: 10px; }
  .big { padding: 10px 22px; font-size: 15px; }
  .grade { display: grid; gap: 2px; min-width: 110px; padding: 10px 14px; border: 1px solid var(--border); background: var(--surface); border-radius: 10px; }
  .grade span { font-weight: 600; }
  .grade small { color: var(--muted); font-size: 11px; }
  .g1 span { color: var(--danger); }
  .g3 span, .g4 span { color: var(--accent); }
  .finished { text-align: center; max-width: 420px; }
</style>
