<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import type { Reader } from './session.svelte';

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
</style>
