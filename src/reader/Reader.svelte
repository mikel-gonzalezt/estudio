<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import '../styles/textlayer.css';
  import { app, type OpenRequest } from '../lib/app.svelte';
  import { annotationsFor, getDoc, putDoc } from '../lib/db';
  import { buildKeymap, commandForEvent } from '../lib/registry';
  import type { DocId, DocRecord } from '../lib/types';
  import { readerCommands } from './commands';
  import Outline from './Outline.svelte';
  import AnnotationsPanel from './AnnotationsPanel.svelte';
  import SelectionMenu from './SelectionMenu.svelte';
  import { loadPdf, pageInfo } from './pdf';
  import { Reader, type LeftTab } from './session.svelte';
  import StatusBar from './StatusBar.svelte';
  import Toolbar from './Toolbar.svelte';
  import Viewer from './Viewer.svelte';

  let { request }: { request: OpenRequest } = $props();

  let reader = $state<Reader | null>(null);
  let error = $state('');

  const commands = $derived(reader ? readerCommands(reader) : []);
  const keymap = $derived(buildKeymap(commands));

  onMount(async () => {
    try {
      const { file, handle } = request;
      const pdf = await loadPdf(await file.arrayBuffer());
      const info = await Promise.all(Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1).then(pageInfo)));
      const id = (pdf.fingerprints[0] ?? `${file.name}:${file.size}`) as DocId;
      const meta = await pdf.getMetadata().catch(() => null);
      const metaTitle = (meta?.info as { Title?: string } | undefined)?.Title?.trim();
      const now = Date.now();
      const existing = await getDoc(id);
      const doc: DocRecord = existing
        ? { ...existing, openedAt: now, ...(handle ? { handle } : {}) }
        : {
            id, title: metaTitle || file.name.replace(/\.pdf$/i, ''), fileName: file.name, pageCount: pdf.numPages,
            lastPage: 1, lastZoom: 1, pagesSeen: [1], addedAt: now, openedAt: now, readingMs: 0,
            ...(handle ? { handle } : {}),
          };
      await putDoc(doc);
      reader = new Reader(pdf, info, doc, await annotationsFor(doc.id));
      document.title = `${doc.title} · Estudio`;
      if (!existing) {
        await tick();
        reader.fitWidth();
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  });

  onDestroy(() => {
    document.title = 'Estudio';
    if (reader) {
      void reader.save();
      void reader.pdf.loadingTask.destroy();
    }
  });

  function onKeydown(e: KeyboardEvent) {
    const cmd = commandForEvent(keymap, e);
    if (!cmd) return;
    e.preventDefault();
    cmd.run();
  }

  function onPointerUp(e: PointerEvent) {
    const s = reader?.ann.interaction;
    if (!reader || s?.kind !== 'selecting') return;
    const r = reader;
    // Let the browser settle the selection before reading it.
    setTimeout(() => {
      const c = r.pointerCtx(s.page, e);
      if (c) r.ann.pointer('up', c);
    }, 0);
  }

  const TABS: { id: LeftTab; label: string }[] = [
    { id: 'outline', label: 'Outline' },
    { id: 'annotations', label: 'Annotations' },
  ];
</script>

<svelte:window onkeydown={onKeydown} onpointerup={onPointerUp} onbeforeunload={() => reader?.save()} />

{#if error}
  <div class="fatal">
    <p>Could not open <strong>{request.file.name}</strong>: {error}</p>
    <button class="btn" onclick={() => app.close()}>Back to library</button>
  </div>
{:else if !reader}
  <div class="loading muted">Opening {request.file.name}…</div>
{:else}
  <div class="shell" class:left-open={reader.leftOpen}>
    <div class="top"><Toolbar {reader} /></div>
    {#if reader.leftOpen}
      <aside class="left">
        <nav class="tabs">
          {#each TABS as t (t.id)}
            <button class:active={reader.leftTab === t.id} onclick={() => (reader!.leftTab = t.id)}>{t.label}</button>
          {/each}
        </nav>
        <div class="pane scroll-thin">
          {#if reader.leftTab === 'outline'}<Outline {reader} />
          {:else if reader.leftTab === 'annotations'}<AnnotationsPanel {reader} />{/if}
        </div>
      </aside>
    {/if}
    <main class="center"><Viewer {reader} /></main>
    <div class="bottom"><StatusBar {reader} /></div>
  </div>
  {#if reader.ann.menu}<SelectionMenu {reader} menu={reader.ann.menu} />{/if}
{/if}

<style>
  .shell {
    height: 100%;
    display: grid;
    grid-template-columns: 0 minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas: 'top top' 'left center' 'bottom bottom';
  }
  .shell.left-open { grid-template-columns: 260px minmax(0, 1fr); }
  .top { grid-area: top; }
  .left {
    grid-area: left;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--surface);
    border-right: 1px solid var(--border);
  }
  .center { grid-area: center; min-width: 0; min-height: 0; position: relative; }
  .bottom { grid-area: bottom; }
  .tabs { display: flex; gap: 2px; padding: 6px; border-bottom: 1px solid var(--border); }
  .tabs button { flex: 1; font-size: 12px; padding: 4px 6px; color: var(--muted); }
  .tabs button.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
  .pane { flex: 1; overflow: auto; min-height: 0; }
  .loading, .fatal { height: 100%; display: grid; place-content: center; gap: 12px; text-align: center; }
</style>
