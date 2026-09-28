<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import type { EditorMode } from '../../lib/types';
  import { app } from '../../lib/app.svelte';
  import { fileOffer } from '../../lib/notebookoffer';
  import { popOutNotebook, toggleWideNotebook } from '../commands';
  import type { Reader } from '../session.svelte';
  import Notebook from './Notebook.svelte';
  import NotebookPlace from './NotebookPlace.svelte';

  let { reader }: { reader: Reader } = $props();
  const study = $derived(reader.study);
  const offer = $derived(fileOffer({
    home: study.home.kind, inVault: !!reader.source.place, handle: !!reader.source.handle, nextToPdf: !app.settings.notebookFolder,
  }));

  function setEditorMode(m: EditorMode) {
    app.settings.editorMode = m;
    app.saveSettings();
  }

  function setAutoLinks(on: boolean) {
    app.settings.autoPageLinks = on;
    app.saveSettings();
  }
</script>

{#if study.blocked}
  {@const vault = study.blocked}
  <div class="away" data-testid="notebook-blocked">
    <Icon name="vault" size={28} />
    <p>This notebook is a file in the {vault.pdfFolder ? 'folder' : 'vault'} "{vault.name}", and Estudio needs access to it again.</p>
    <button class="btn primary" onclick={() => void study.unblock()} data-testid="notebook-unblock">Allow access to {vault.name}</button>
  </div>
{:else if study.poppedOut}
  <div class="away" data-testid="notebook-away">
    <Icon name="popout" size={28} />
    <p>The notebook is open in its own window.</p>
    <div class="row">
      <button class="btn" onclick={() => popOutNotebook(reader)}>Show window</button>
      <button class="btn" onclick={() => study.bringBack()} data-testid="bring-back">Bring back</button>
      <button class="btn" aria-expanded={study.placeOpen} onclick={() => (study.placeOpen = !study.placeOpen)} data-testid="notebook-more">Location…</button>
    </div>
    <div class="anchor">{#if study.placeOpen}<NotebookPlace {reader} {offer} onclose={() => (study.placeOpen = false)} />{/if}</div>
  </div>
{:else}
  <Notebook doc={study.notebook} host={reader.notebookHost} autoLinks={app.settings.autoPageLinks} onAutoLinks={setAutoLinks} editorMode={app.settings.editorMode} onEditorMode={setEditorMode}>
    {#snippet actions()}
      {#if offer?.label}<button class="inside" title="This notebook is not a file yet" onclick={() => (study.placeOpen = true)} data-testid="save-as-file">
        Saved inside Estudio · <span>Save as file</span>
      </button>{/if}
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
      <span class="more">
        <button
          class="act"
          class:on={study.placeOpen}
          title="Where this notebook is, and where new notebooks go"
          aria-label="Notebook location"
          aria-expanded={study.placeOpen}
          onclick={() => (study.placeOpen = !study.placeOpen)}
          data-testid="notebook-more"
        ><Icon name="more" size={15} /></button>
        {#if study.placeOpen}<NotebookPlace {reader} {offer} onclose={() => (study.placeOpen = false)} />{/if}
      </span>
    {/snippet}
  </Notebook>
{/if}

<style>
  .away { display: grid; place-content: center; justify-items: center; gap: 8px; padding: 24px; text-align: center; color: var(--muted); }
  .away p { margin: 0; max-width: 40ch; }
  .row { display: flex; gap: 6px; }
  .act { flex: none; padding: 3px 5px; display: inline-flex; color: var(--muted); }
  .act :global(svg) { flex: none; }
  .more { display: inline-flex; }
  .anchor { position: relative; justify-self: stretch; text-align: left; color: var(--text); }
  .inside { font-size: 11.5px; padding: 3px 6px; color: var(--muted); }
  .inside span { color: var(--accent); }
  .inside:hover span { text-decoration: underline; }
  .act.on { color: var(--accent); background: var(--accent-soft); }
</style>
