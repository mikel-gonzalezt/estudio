<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { getDoc, getSettings, patchSettings } from '../../lib/db';
  import { windows } from '../../lib/windows';
  import { askPermission } from '../../lib/fsaccess';
  import { linkedPdfName, resolveHome, type NotebookHome, type Resolved } from '../../lib/notebookstore';
  import { popoutHash, type NotebookContext } from '../../lib/notebooksync';
  import type { EditorMode } from '../../lib/types';
  import { NotebookChannel, NotebookDoc } from './doc.svelte';
  import type { NotebookHost } from './host.svelte';
  import Notebook from './Notebook.svelte';

  let { home }: { home: NotebookHome } = $props();
  const { docId } = untrack(() => home);
  let current = $state.raw(untrack(() => home));

  const channel = new NotebookChannel(docId);
  let doc = $state.raw<NotebookDoc | null>(null);
  let blocked = $state.raw<Exclude<Resolved, { kind: 'ready' }> | null>(null);
  let context = $state.raw<NotebookContext>({ title: '', page: 1, sections: [], annotations: [] });
  let connected = $state(false);
  let autoLinks = $state(true);
  let editorMode = $state<EditorMode>('document');

  async function setEditorMode(m: EditorMode) {
    editorMode = m;
    await patchSettings({ editorMode: m });
    windows.post({ t: 'settings', put: { editorMode: m } });
  }

  const host: NotebookHost = {
    get context() {
      return context;
    },
    follow: (target) => channel.post({ t: 'follow', target }),
  };

  async function setAutoLinks(on: boolean) {
    autoLinks = on;
    channel.post({ t: 'autoLinks', on });
    await patchSettings({ autoPageLinks: on });
    windows.post({ t: 'settings', put: { autoPageLinks: on } });
  }

  /** Opens the notebook where the reader keeps it, as its route names it. */
  async function attach() {
    const r = await resolveHome(current);
    if (r.kind !== 'ready') {
      blocked = r;
      return;
    }
    const d = new NotebookDoc(docId, channel, r.store, r.files, linkedPdfName(current));
    await d.load();
    blocked = null;
    doc = d;
    channel.post({ t: 'hello' });
  }

  async function grant(vault: Extract<Resolved, { kind: 'locked' }>['vault']) {
    if (await askPermission(vault.handle, 'readwrite')) await attach();
  }

  /** The reader moved the notebook: keep editing it in its new place, and reopen there after a reload. */
  async function follow(to: NotebookHome | null) {
    if (!to) {
      doc?.resume();
      return;
    }
    current = to;
    history.replaceState(null, '', `${location.pathname}${location.search}${popoutHash(to)}`);
    const r = await resolveHome(to);
    if (r.kind === 'ready' && doc) doc.resume({ store: r.store, files: r.files, pdfName: linkedPdfName(to) });
    else if (r.kind !== 'ready') {
      blocked = r;
      doc = null;
    }
  }

  function leave() {
    void doc?.flush();
    channel.post({ t: 'bye' });
  }

  onMount(() => {
    const off = channel.on((m) => {
      if (m.t === 'context') {
        context = m.ctx;
        connected = true;
      } else if (m.t === 'ping') channel.post({ t: 'open' });
      else if (m.t === 'moving') void (doc?.hold() ?? Promise.resolve()).then(() => channel.post({ t: 'held' }));
      else if (m.t === 'moved') void follow(m.home);
      else if (m.t === 'close') window.close();
    });
    void (async () => {
      const [settings, rec] = await Promise.all([getSettings(), getDoc(docId)]);
      document.documentElement.dataset.theme = settings.theme;
      autoLinks = settings.autoPageLinks;
      editorMode = settings.editorMode;
      if (rec && !context.title) context = { ...context, title: rec.title };
      await attach();
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
  {#if doc}
    <Notebook {doc} {host} {autoLinks} onAutoLinks={(on) => void setAutoLinks(on)} {editorMode} onEditorMode={(m) => void setEditorMode(m)} autofocus />
  {:else if blocked?.kind === 'locked'}
    {@const vault = blocked.vault}
    <div class="blocked" data-testid="popout-blocked">
      <p>This notebook is a file in the {vault.pdfFolder ? 'folder' : 'vault'} "{vault.name}", and Estudio needs access to it again.</p>
      <button class="btn primary" onclick={() => void grant(vault)}>Allow access to {vault.name}</button>
    </div>
  {:else if blocked?.kind === 'missing'}
    <div class="blocked" data-testid="popout-blocked">
      <p>{blocked.reason} This window cannot save notes, so nothing is shown here.</p>
      <p class="muted">Close it and open the PDF from its vault or the library.</p>
    </div>
  {/if}
</div>

<style>
  .window { height: 100%; display: flex; flex-direction: column; background: var(--surface); }
  header { display: flex; align-items: baseline; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 13px; }
  header strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  header span { margin-left: auto; font-size: 12px; white-space: nowrap; }
  .window > :global(.notebook) { flex: 1; min-height: 0; }
  .blocked { display: grid; justify-items: center; gap: 10px; padding: 32px 24px; text-align: center; }
  .blocked p { margin: 0; max-width: 46ch; }
</style>
