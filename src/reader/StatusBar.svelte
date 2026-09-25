<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import type { Reader } from './session.svelte';
  import PomodoroWidget from '../components/PomodoroWidget.svelte';

  const fmt = (ms: number) => {
    const m = Math.floor(ms / 60000);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
  };

  let { reader }: { reader: Reader } = $props();
  let draft = $state('');
  let editing = $state(false);

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const n = Number.parseInt(draft, 10);
    if (Number.isFinite(n)) reader.jump({ page: Math.min(reader.pageCount, Math.max(1, n)), y: 0 });
    (document.activeElement as HTMLElement | null)?.blur();
  }
</script>

<footer class="status">
  <div class="group">
    <button title="Back (Alt ←)" disabled={reader.back.length === 0} onclick={() => reader.goBack()}><Icon name="back" size={16} /></button>
    <button title="Forward (Alt →)" disabled={reader.forward.length === 0} onclick={() => reader.goForward()}><Icon name="forward" size={16} /></button>
    <form onsubmit={submit} class="goto">
      <span class="muted">Page</span>
      <input
        id="goto-page"
        type="text"
        inputmode="numeric"
        aria-label="Go to page (g)"
        value={editing ? draft : String(reader.currentPage)}
        onfocus={() => { editing = true; draft = String(reader.currentPage); }}
        oninput={(e) => (draft = e.currentTarget.value)}
        onblur={() => (editing = false)}
        onkeydown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); }}
      />
      <span class="muted">of {reader.pageCount}</span>
    </form>
  </div>
  <div class="group">
    <span class="muted" title="Active reading time for this document" data-testid="reading-time"><Icon name="timer" size={13} /> {fmt(reader.doc.readingMs)}</span>
    <span class="vsep"></span>
    <PomodoroWidget />
    <span class="vsep"></span>
    <button class="due" class:has={reader.study.dueAll > 0} title="Review due cards" disabled={reader.study.dueAll === 0}
      onclick={() => (reader.study.review = reader.study.dueHere > 0 ? 'doc' : 'all')} data-testid="due-badge">
      <Icon name="card" size={14} /> {reader.study.dueAll} due
    </button>
    <span class="muted">{Math.round(reader.scale * 100)}%</span>
  </div>
</footer>

<style>
  .status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 30px;
    padding: 0 8px;
    background: var(--surface);
    border-top: 1px solid var(--border);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .group { display: flex; align-items: center; gap: 6px; }
  .goto { display: flex; align-items: center; gap: 6px; margin-left: 4px; }
  input { width: 44px; text-align: center; padding: 1px 4px; font-size: 12px; }
  button { padding: 2px; }
  .muted :global(svg) { display: inline; vertical-align: -2px; }
  .vsep { width: 1px; height: 16px; background: var(--border); }
  .due { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 10px; font-size: 12px; color: var(--muted); }
  .due.has { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
</style>
