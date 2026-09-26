<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { app, type NoteRequest } from '../lib/app.svelte';
  import { vaultFiles } from '../lib/attachments';
  import { fileNotebook } from '../lib/notebookstore';
  import type { DocId } from '../lib/types';
  import { vaults } from '../lib/vaults.svelte';
  import { parentOf } from '../lib/vaulttree';
  import Icon from '../components/Icon.svelte';
  import VaultTree from '../components/VaultTree.svelte';
  import Notebook from './notebook/Notebook.svelte';
  import { NotebookChannel, NotebookDoc } from './notebook/doc.svelte';
  import type { NotebookHost } from './notebook/host.svelte';

  let { request }: { request: NoteRequest } = $props();

  const place = untrack(() => request.place);
  const docId = `note:${place.path}` as DocId;
  const files = vaultFiles(() => {
    const root = vaults.list.find((v) => v.id === place.vault)?.handle;
    return root ? { root, notePath: place.path } : null;
  });
  const doc = new NotebookDoc(docId, new NotebookChannel(docId), fileNotebook(place.dir, place.name), files);
  let loaded = $state(false);
  let error = $state('');
  let notice = $state('');

  /** A note is not about one document, so only links that name a PDF lead anywhere. */
  const host: NotebookHost = {
    context: { title: place.name, page: null, sections: [], annotations: [] },
    follow({ page, file }) {
      const path = file ? vaults.resolvePdf(file, parentOf(place.path)) : null;
      if (path) void app.openVaultPdf(path, page);
      else notice = file ? `There is no ${file} in this vault.` : `[[p${page}]] names no PDF; write it as [[paper.pdf#page=${page}]].`;
    },
  };

  onMount(async () => {
    document.title = `${request.place.name.replace(/\.md$/i, '')} · Estudio`;
    try {
      await doc.load();
      loaded = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  });

  onDestroy(() => {
    document.title = 'Estudio';
    if (loaded) void app.track(doc.flush().finally(() => doc.channel.close()));
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
    {:else if loaded}
      {#if notice}<p class="notice" role="status">{notice} <button class="btn" onclick={() => (notice = '')}>OK</button></p>{/if}
      <Notebook {doc} {host} autoLinks={false} editorMode={app.settings.editorMode} onEditorMode={(m) => { app.settings.editorMode = m; app.saveSettings(); }} />
    {/if}
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
  main > .notice { flex: none; margin: 0; padding: 6px 12px; display: flex; align-items: center; gap: 8px; font-size: 12.5px; background: var(--surface-2); border-bottom: 1px solid var(--border); }
</style>
