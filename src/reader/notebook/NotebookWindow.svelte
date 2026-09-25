<script lang="ts">
  import { onMount } from 'svelte';
  import { getDoc, getSettings, putSettings } from '../../lib/db';
  import { idbNotebook } from '../../lib/notebookstore';
  import { POPOUT_ROUTE, type NotebookContext } from '../../lib/notebooksync';
  import type { DocId } from '../../lib/types';
  import { NotebookChannel, NotebookDoc } from './doc.svelte';
  import type { NotebookHost } from './host.svelte';
  import Notebook from './Notebook.svelte';

  const docId = decodeURIComponent(POPOUT_ROUTE.exec(location.hash)?.[1] ?? '') as DocId;

  const channel = new NotebookChannel(docId);
  const doc = new NotebookDoc(docId, channel, idbNotebook(docId));
  let context = $state.raw<NotebookContext>({ title: '', page: 1, sections: [], annotations: [] });
  let connected = $state(false);
  let autoLinks = $state(true);
  let ready = $state(false);

  const host: NotebookHost = {
    get context() {
      return context;
    },
    jump: (page) => channel.post({ t: 'jump', page }),
  };

  async function setAutoLinks(on: boolean) {
    autoLinks = on;
    channel.post({ t: 'autoLinks', on });
    await putSettings({ ...(await getSettings()), autoPageLinks: on });
  }

  function leave() {
    void doc.flush();
    channel.post({ t: 'bye' });
  }

  onMount(() => {
    const off = channel.on((m) => {
      if (m.t === 'context') {
        context = m.ctx;
        connected = true;
      } else if (m.t === 'ping') channel.post({ t: 'open' });
      else if (m.t === 'close') window.close();
    });
    void (async () => {
      const [settings, rec] = await Promise.all([getSettings(), getDoc(docId), doc.load()]);
      document.documentElement.dataset.theme = settings.theme;
      autoLinks = settings.autoPageLinks;
      if (rec && !context.title) context = { ...context, title: rec.title };
      ready = true;
    })();
    channel.post({ t: 'hello' });
    return () => {
      off();
      channel.close();
    };
  });

  $effect(() => {
    document.title = `Notebook · ${context.title || 'Estudio'}`;
  });
</script>

<svelte:window onpagehide={leave} />

<div class="window">
  <header>
    <strong>{context.title || 'Notebook'}</strong>
    <span class="muted" data-testid="popout-status">
      {connected ? `Reading p. ${context.page}` : 'Reader not open: page links will not jump'}
    </span>
  </header>
  {#if ready}
    <Notebook {doc} {host} {autoLinks} onAutoLinks={(on) => void setAutoLinks(on)} autofocus />
  {/if}
</div>

<style>
  .window { height: 100%; display: flex; flex-direction: column; background: var(--surface); }
  header { display: flex; align-items: baseline; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 13px; }
  header strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  header span { margin-left: auto; font-size: 12px; white-space: nowrap; }
  .window > :global(.notebook) { flex: 1; min-height: 0; }
</style>
