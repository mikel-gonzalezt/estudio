<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import { app } from '../../lib/app.svelte';
  import { popOutNotebook, toggleWideNotebook } from '../commands';
  import type { Reader } from '../session.svelte';
  import Notebook from './Notebook.svelte';

  let { reader }: { reader: Reader } = $props();
  const study = $derived(reader.study);

  function setAutoLinks(on: boolean) {
    app.settings.autoPageLinks = on;
    app.saveSettings();
  }
</script>

{#if study.poppedOut}
  <div class="away" data-testid="notebook-away">
    <Icon name="popout" size={28} />
    <p>The notebook is open in its own window.</p>
    <div class="row">
      <button class="btn" onclick={() => popOutNotebook(reader)}>Show window</button>
      <button class="btn" onclick={() => study.bringBack()} data-testid="bring-back">Bring back</button>
    </div>
  </div>
{:else}
  <Notebook doc={study.notebook} host={reader.notebookHost} autoLinks={app.settings.autoPageLinks} onAutoLinks={setAutoLinks}>
    {#snippet actions()}
      <button
        class="act"
        class:on={app.settings.wideNotebook}
        aria-pressed={app.settings.wideNotebook}
        title="Widen notebook (W)"
        aria-label="Widen notebook"
        onclick={() => toggleWideNotebook(reader)}
        data-testid="widen-notebook"
      ><Icon name="widen" size={15} /></button>
      <button class="act" title="Open in its own window" aria-label="Pop out notebook" onclick={() => popOutNotebook(reader)} data-testid="popout-notebook">
        <Icon name="popout" size={15} />
      </button>
    {/snippet}
  </Notebook>
{/if}

<style>
  .away { display: grid; place-content: center; justify-items: center; gap: 8px; padding: 24px; text-align: center; color: var(--muted); }
  .away p { margin: 0; }
  .row { display: flex; gap: 6px; }
  .act { flex: none; padding: 3px 5px; display: inline-flex; color: var(--muted); }
  .act :global(svg) { flex: none; }
  .act.on { color: var(--accent); background: var(--accent-soft); }
</style>
