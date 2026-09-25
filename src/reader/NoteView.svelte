<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { app, type NoteRequest } from '../lib/app.svelte';
  import { fileNotebook } from '../lib/notebookstore';
  import type { DocId } from '../lib/types';
  import { vaults } from '../lib/vaults.svelte';
  import Icon from '../components/Icon.svelte';
  import VaultTree from '../components/VaultTree.svelte';
  import Notebook from './Notebook.svelte';
  import { Study } from './study.svelte';

  let { request }: { request: NoteRequest } = $props();

  const place = untrack(() => request.place);
  const study = new Study(`note:${place.path}` as DocId, fileNotebook(place.dir, place.name));
  const host = { study, jump: () => {} };
  let loaded = $state(false);
  let error = $state('');

  onMount(async () => {
    document.title = `${request.place.name.replace(/\.md$/i, '')} · Estudio`;
    try {
      await study.load();
      loaded = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  });

  onDestroy(() => {
    document.title = 'Estudio';
    if (loaded) void app.track(study.saveNotebook());
  });
</script>

<div class="note-shell">
  <header>
    <button class="btn" onclick={() => app.close()} title="Back to library"><Icon name="back" size={16} /> Library</button>
    <span class="title" title={request.place.path}>{request.place.name.replace(/\.md$/i, '')}</span>
    <span class="muted path">{request.place.path}</span>
  </header>
  {#if vaults.current}<aside><VaultTree compact current={request.place.path} /></aside>{/if}
  <main data-testid="note-view">
    {#if error}<p class="error">Could not open {request.place.name}: {error}</p>
    {:else if loaded}<Notebook reader={host} />{/if}
  </main>
</div>

<style>
  .note-shell {
    height: 100%;
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas: 'top top' 'left main';
  }
  header { grid-area: top; display: flex; align-items: center; gap: 12px; padding: 6px 10px; border-bottom: 1px solid var(--border); background: var(--surface); }
  header .btn { display: inline-flex; align-items: center; gap: 4px; }
  .title { font-weight: 600; }
  .path { font-size: 12px; margin-left: auto; }
  aside { grid-area: left; min-height: 0; border-right: 1px solid var(--border); background: var(--surface); }
  main { grid-area: main; min-height: 0; display: flex; flex-direction: column; background: var(--surface); }
  main > :global(*) { flex: 1; min-height: 0; }
  .error { padding: 24px; color: var(--danger); }
</style>
