<script lang="ts">
  import { app, pickPdf } from '../lib/app.svelte';
  import { deleteDoc } from '../lib/db';
  import type { DocRecord } from '../lib/types';
  import Icon from './Icon.svelte';
  import { downloadBackup, restoreBackup } from '../lib/backupio';
  import { pwa } from '../lib/pwa.svelte';
  import { vaults } from '../lib/vaults.svelte';
  import VaultTree from './VaultTree.svelte';
  import { newWindowClick } from '../lib/keys';
  import { windows } from '../lib/windows';

  let input: HTMLInputElement;
  let locating = $state<DocRecord | null>(null);
  let restoreInput: HTMLInputElement;
  let notice = $state('');

  // Every document keeps its record (progress, cards, notes), so the list is shortened on screen only.
  const RECENT_SHOWN = 12;
  let showAll = $state(false);
  let filter = $state('');
  const matching = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    return q ? app.docs.filter((d) => `${d.title} ${d.fileName}`.toLowerCase().includes(q)) : app.docs;
  });
  const shown = $derived(showAll || filter.trim() ? matching : matching.slice(0, RECENT_SHOWN));

  async function onRestore() {
    const f = restoreInput.files?.[0];
    restoreInput.value = '';
    if (!f) return;
    try {
      const r = await restoreBackup(f);
      notice = `Restored ${r.docs} documents, ${r.annotations} annotations and ${r.cards} cards.`;
      await app.refreshDocs();
    } catch (e) {
      notice = `Restore failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  function onInput() {
    const f = input.files?.[0];
    if (f) void app.openFile(f);
    input.value = '';
  }

  async function openDoc(doc: DocRecord) {
    if (await app.reopen(doc)) return;
    locating = doc;
    await pickPdf(input);
  }

  async function remove(doc: DocRecord) {
    if ((await windows.where(doc.id)).kind === 'elsewhere') {
      windows.focus(doc.id);
      app.notify(`"${doc.title}" is open in another window. Close it there first.`);
      return;
    }
    if (!confirm(`Remove "${doc.title}" and all its annotations, notes and cards from this device?`)) return;
    await deleteDoc(doc.id);
    await app.refreshDocs();
  }

  const progress = (d: DocRecord) => Math.round((d.pagesSeen.length / Math.max(1, d.pageCount)) * 100);

  function ago(t: number): string {
    const s = (Date.now() - t) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return new Date(t).toLocaleDateString();
  }

  const fmtTime = (ms: number) => {
    const m = Math.round(ms / 60000);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
  };
</script>

<main class="library">
  <header>
    <div class="brand">
      <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width="28" height="28" />
      <h1>Estudio</h1>
    </div>
    <div class="actions">
      {#if pwa.installPrompt && !pwa.standalone}
        <button class="btn install" onclick={() => pwa.install()} title="Install Estudio as an app so PDFs open in it from Explorer" data-testid="install">
          <span class="row"><Icon name="download" size={16} /> Install Estudio</span>
        </button>
      {/if}
      <button class="btn" onclick={() => app.toggleTheme()} title="Toggle theme">
        <Icon name={app.settings.theme === 'dark' ? 'sun' : 'moon'} />
      </button>
      <button class="btn" onclick={downloadBackup} title="Download a JSON backup of all documents, annotations, notebooks and cards">
        <span class="row"><Icon name="download" size={16} /> Backup</span>
      </button>
      <button class="btn" onclick={() => restoreInput.click()} title="Restore from a JSON backup">
        <span class="row"><Icon name="upload" size={16} /> Restore</span>
      </button>
      {#if vaults.supported}
        <button class="btn" onclick={() => vaults.add()} title="Open a folder as a vault: PDFs and Markdown notes organised in folders, like Obsidian">
          <span class="row"><Icon name="vault" size={16} /> Open vault</span>
        </button>
      {/if}
      <button class="btn primary" onclick={() => pickPdf(input)}>
        <span class="row"><Icon name="open" /> Open PDF</span>
      </button>
    </div>
  </header>

  <input bind:this={input} type="file" accept="application/pdf,.pdf" hidden onchange={onInput} data-testid="file-input" />

  <input bind:this={restoreInput} type="file" accept="application/json,.json" hidden onchange={onRestore} data-testid="restore-input" />
  {#if notice}<p class="hint">{notice}</p>{/if}

  {#if app.error}<p class="error">{app.error}</p>{/if}

  {#if locating}
    <p class="hint">"{locating.title}" can't be reopened directly. Pick the file again to continue where you left off.</p>
  {/if}

  {#if vaults.list.length}
    <section class="vaults" aria-label="Vaults">
      {#each vaults.list as v (v.id)}
        <span class="vault-chip" class:on={vaults.current?.id === v.id}>
          <button onclick={() => vaults.open(v)} title={vaults.locked.has(v.id) ? `Allow Estudio to open "${v.name}" again` : `Open "${v.name}"`}>
            <Icon name="vault" size={14} /> {v.name}
            {#if vaults.locked.has(v.id)}<span class="lock">Allow access</span>{/if}
          </button>
          <button class="x" title="Forget this vault (files stay on disk)" aria-label="Forget {v.name}"
            onclick={() => { if (confirm(`Forget the vault "${v.name}"? Its files stay on disk.`)) void vaults.forget(v); }}>×</button>
        </span>
      {/each}
    </section>
    {#if vaults.error && !vaults.current}<p class="error">{vaults.error}</p>{/if}
  {/if}

  <div class="body" class:with-vault={!!vaults.current}>
  {#if vaults.current}
    <aside class="tree"><VaultTree /></aside>
  {/if}
  <div class="docs">
  {#if app.ready && app.docs.length === 0}
    <section class="empty">
      <div class="drop">
        <Icon name="open" size={36} />
        <h2>Open a PDF to start studying</h2>
        <p class="muted">Drag a file anywhere onto this window, or use <strong>Open PDF</strong>. Highlights, notes and flashcards stay on this device.</p>
      </div>
    </section>
  {:else}
    <div class="recent-head">
      <h2 class="section">Recent</h2>
      {#if app.docs.length > RECENT_SHOWN}
        <input class="filter" type="search" placeholder="Search {app.docs.length} documents" bind:value={filter} aria-label="Search documents" />
      {/if}
    </div>
    <ul class="grid">
      {#each shown as doc (doc.id)}
        <li class="doc">
          <button class="open" title="Ctrl+click opens it in a new window"
            onclick={(e) => (newWindowClick(e) ? app.openDocInNewWindow(doc) : openDoc(doc))}
            onauxclick={(e) => { if (newWindowClick(e)) void app.openDocInNewWindow(doc); }}
            onmousedown={(e) => { if (e.button === 1) e.preventDefault(); }}>
            <span class="title">{doc.title}</span>
            <span class="file muted">{doc.fileName}</span>
            <span class="bar" title="{progress(doc)}% of pages seen"><span style:width="{progress(doc)}%"></span></span>
            <span class="meta muted">
              <span>{progress(doc)}% · p. {doc.lastPage}/{doc.pageCount}</span>
              <span>{fmtTime(doc.readingMs)} · {ago(doc.openedAt)}</span>
            </span>
          </button>
          <button class="new-window" disabled={!doc.handle} data-testid="open-new-window"
            title={doc.handle ? 'Open in new window' : 'Opened without access to its file, so it can only open in this window'}
            aria-label="Open {doc.title} in a new window" onclick={() => app.openDocInNewWindow(doc)}><Icon name="popout" size={15} /></button>
          <button class="remove" title="Remove from library" onclick={() => remove(doc)}><Icon name="trash" size={16} /></button>
        </li>
      {/each}
    </ul>
    {#if !filter.trim() && matching.length > RECENT_SHOWN}
      <button class="btn more" onclick={() => (showAll = !showAll)} data-testid="recent-more">
        {showAll ? 'Show fewer' : `Show all ${matching.length}`}
      </button>
    {/if}
  {/if}
  </div>
  </div>
</main>

<style>
  .library {
    height: 100%;
    overflow: auto;
    padding: 28px max(24px, calc((100% - 1040px) / 2));
  }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  h1 { font-size: 22px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
  .actions { display: flex; gap: 8px; }
  .row { display: inline-flex; align-items: center; gap: 6px; }
  .recent-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .filter { font-size: 13px; padding: 4px 8px; width: min(240px, 50%); }
  .more { margin-top: 12px; }
  .section { font-size: 13px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 12px; }
  .error { color: var(--danger); }
  .hint { background: var(--accent-soft); padding: 8px 12px; border-radius: var(--radius); }
  .empty { display: grid; place-items: center; min-height: 50vh; }
  .drop {
    text-align: center;
    max-width: 440px;
    padding: 40px;
    border: 2px dashed var(--border);
    border-radius: 16px;
    display: grid;
    justify-items: center;
    gap: 6px;
    color: var(--muted);
  }
  .drop h2 { color: var(--text); font-size: 18px; margin: 8px 0 0; }
  .grid {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
  }
  .doc { position: relative; }
  .open {
    width: 100%;
    text-align: left;
    display: grid;
    gap: 6px;
    padding: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
  }
  .open:hover:not(:disabled) { background: var(--surface); border-color: var(--accent); }
  .title { font-weight: 600; font-size: 15px; padding-right: 52px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .file { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar { height: 5px; background: var(--surface-3); border-radius: 3px; overflow: hidden; margin-top: 6px; }
  .bar span { display: block; height: 100%; background: var(--accent); }
  .meta { display: flex; justify-content: space-between; font-size: 12px; }
  .remove { position: absolute; top: 10px; right: 8px; color: var(--muted); }
  .new-window { position: absolute; top: 10px; right: 34px; color: var(--muted); opacity: 0; }
  .doc:hover .new-window:not(:disabled), .new-window:focus-visible { opacity: 1; }
  .install { border-color: var(--accent); color: var(--accent); font-weight: 600; }
  .vaults { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
  .vault-chip { display: inline-flex; align-items: center; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); }
  .vault-chip.on { border-color: var(--accent); background: var(--accent-soft); }
  .vault-chip button { display: inline-flex; align-items: center; gap: 6px; padding: 4px 4px 4px 12px; font-size: 13px; }
  .vault-chip .x { padding: 4px 10px 4px 6px; color: var(--muted); }
  .lock { font-size: 11px; font-weight: 600; color: var(--danger); }
  .body.with-vault { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 20px; align-items: start; }
  .tree { position: sticky; top: 0; height: calc(100vh - 200px); min-height: 300px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); overflow: hidden; }
</style>
