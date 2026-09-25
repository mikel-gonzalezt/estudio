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
  import Notebook from './Notebook.svelte';
  import CardsPanel from './CardsPanel.svelte';
  import CardEditor from './CardEditor.svelte';
  import type { RightTab } from './study.svelte';
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
      const r = new Reader(pdf, info, doc, await annotationsFor(doc.id));
      await r.study.load();
      reader = r;
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

  const loadReview = () => import('./review/Review.svelte');

  $effect(() => {
    if (!reader) return;
    const r = reader;
    const t = setInterval(() => void r.study.refreshDue(), 60_000);
    return () => clearInterval(t);
  });

  const RIGHT_TABS: { id: RightTab; label: string }[] = [
    { id: 'notebook', label: 'Notebook' },
    { id: 'cards', label: 'Cards' },
  ];

  function onKeydown(e: KeyboardEvent) {
    if (reader?.study.draft || reader?.study.review) return;
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
  <div class="shell" class:left-open={reader.leftOpen} class:right-open={reader.study.rightOpen}>
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
    {#if reader.study.rightOpen}
      <aside class="right">
        <nav class="tabs">
          {#each RIGHT_TABS as t (t.id)}
            <button class:active={reader.study.rightTab === t.id} onclick={() => (reader!.study.rightTab = t.id)}>
              {t.label}{#if t.id === 'cards' && reader.study.dueHere > 0}<span class="badge">{reader.study.dueHere}</span>{/if}
            </button>
          {/each}
          <button class="close" title="Close pane" aria-label="Close pane" onclick={() => (reader!.study.rightOpen = false)}>×</button>
        </nav>
        <div class="pane scroll-thin">
          {#if reader.study.rightTab === 'notebook'}<Notebook {reader} />{:else}<CardsPanel {reader} />{/if}
        </div>
      </aside>
    {/if}
    <div class="bottom"><StatusBar {reader} /></div>
  </div>
  {#if reader.ann.menu}<SelectionMenu {reader} menu={reader.ann.menu} />{/if}
  {#if reader.study.draft}<CardEditor study={reader.study} draft={reader.study.draft} />{/if}
  {#if reader.study.review}
    {#await loadReview() then m}<m.default {reader} />{/await}
  {/if}
{/if}

<style>
  .shell {
    height: 100%;
    display: grid;
    --left-w: 0px;
    --right-w: 0px;
    grid-template-columns: var(--left-w) minmax(0, 1fr) var(--right-w);
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas: 'top top top' 'left center right' 'bottom bottom bottom';
  }
  .shell.left-open { --left-w: 260px; }
  .shell.right-open { --right-w: 340px; }
  .right {
    grid-area: right;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--surface);
    border-left: 1px solid var(--border);
  }
  .right .pane { overflow: hidden; display: flex; flex-direction: column; }
  .right .pane > :global(*) { flex: 1; min-height: 0; overflow: auto; }
  .badge { margin-left: 5px; padding: 0 6px; border-radius: 9px; background: var(--accent); color: var(--accent-text); font-size: 10.5px; }
  .tabs .close { flex: 0 0 auto; font-size: 16px; line-height: 1; }
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
