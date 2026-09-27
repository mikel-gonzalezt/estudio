<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import '../styles/textlayer.css';
  import { app, type PdfRequest } from '../lib/app.svelte';
  import { buildKeymap, commandForEvent } from '../lib/registry';
  import { vaults } from '../lib/vaults.svelte';
  import VaultTree from '../components/VaultTree.svelte';
  import { openDocument, OpenElsewhere } from './open';
  import { ALREADY_OPEN, windows } from '../lib/windows';
  import { readerCommands } from './commands';
  import Outline from './Outline.svelte';
  import AnnotationsPanel from './AnnotationsPanel.svelte';
  import SelectionMenu from './SelectionMenu.svelte';
  import NotebookPane from './notebook/NotebookPane.svelte';
  import NotebookBridge from './notebook/NotebookBridge.svelte';
  import Splitter from '../components/Splitter.svelte';
  import { WIDE_NOTEBOOK, type PaneSide } from '../lib/panes';
  import { DEFAULT_SETTINGS } from '../lib/types';
  import CardsPanel from './CardsPanel.svelte';
  import CardEditor from './CardEditor.svelte';
  import type { RightTab } from './study.svelte';
  import Thumbnails from './Thumbnails.svelte';
  import SearchBar from './SearchBar.svelte';
  import Ruler from './Ruler.svelte';
  import LinkPreview from './LinkPreview.svelte';
  import CommandPalette from '../components/CommandPalette.svelte';
  import type { Reader, LeftTab } from './session.svelte';
  import StatusBar from './StatusBar.svelte';
  import Toolbar from './Toolbar.svelte';
  import Viewer from './Viewer.svelte';
  import PinsMount from './pins/PinsMount.svelte';
  import { readAloud } from './speech/entry.svelte';

  let { request }: { request: PdfRequest } = $props();

  let reader = $state<Reader | null>(null);
  let error = $state('');

  let paletteOpen = $state(false);
  const commands = $derived(reader ? readerCommands(reader, { openPalette: () => (paletteOpen = true) }) : []);
  const keymap = $derived(buildKeymap(commands));

  let destroyed = false;
  let release: (() => void) | null = null;

  onMount(async () => {
    try {
      const opened = await openDocument(request);
      if (destroyed) {
        void opened.reader.pdf.loadingTask.destroy().finally(opened.release);
        return;
      }
      reader = opened.reader;
      release = opened.release;
      document.title = `${reader.doc.title} · Estudio`;
      if (opened.isNew) {
        await tick();
        reader.fitWidth();
      }
    } catch (e) {
      if (e instanceof OpenElsewhere) elsewhere(e.doc);
      else error = e instanceof Error ? e.message : String(e);
    }
  });

  /** The window that sent this document here hears why it did not open, and a window opened just for it closes. */
  function elsewhere(doc: OpenElsewhere['doc']) {
    windows.focus(doc);
    if (request.from) {
      windows.post({ t: 'notice', to: request.from, text: ALREADY_OPEN });
      window.close();
    }
    app.close();
    app.notify(ALREADY_OPEN);
  }

  onDestroy(() => {
    destroyed = true;
    document.title = 'Estudio';
    readAloud.close();
    if (reader) {
      const r = reader;
      const done = release;
      void app.track(
        Promise.all([r.save(), r.study.dispose(), r.sync?.save()])
          .finally(() => r.pdf.loadingTask.destroy())
          .finally(() => {
            done?.();
            windows.post({ t: 'docs' });
          }),
      );
    }
  });

  function onVisibility() {
    if (document.visibilityState !== 'hidden' || !reader) return;
    void app.track(Promise.all([reader.save(), reader.study.notebook.flush(), reader.sync?.save()]));
  }

  const loadReview = () => import('./review/Review.svelte');

  $effect(() => {
    if (!reader) return;
    const r = reader;
    const t = setInterval(() => void r.study.refreshDue(), 60_000);
    return () => clearInterval(t);
  });

  const IDLE_AFTER_MS = 120_000;
  const TICK_MS = 5000;
  let lastActivity = Date.now();
  const markActive = () => (lastActivity = Date.now());

  // Reading time counts only while the tab is visible and the reader has touched it recently.
  $effect(() => {
    if (!reader) return;
    const r = reader;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastActivity < IDLE_AFTER_MS) r.addReading(TICK_MS);
    }, TICK_MS);
    return () => clearInterval(t);
  });

  const RIGHT_TABS: { id: RightTab; label: string }[] = [
    { id: 'notebook', label: 'Notebook' },
    { id: 'cards', label: 'Cards' },
  ];

  function onKeydown(e: KeyboardEvent) {
    lastActivity = Date.now();
    if (paletteOpen || reader?.study.draft || reader?.study.review) return;
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

  let leftPane = $state<HTMLElement>();
  let rightPane = $state<HTMLElement>();
  const roomFor = (side: PaneSide) => () =>
    window.innerWidth - ((side === 'left' ? rightPane : leftPane)?.getBoundingClientRect().width ?? 0);

  function resizePane(side: PaneSide, width: number, live: boolean) {
    if (side === 'left') app.settings.leftPaneW = width;
    else {
      app.settings.rightPaneW = width;
      app.settings.wideNotebook = false;
    }
    reader?.holdLayout(live);
    if (!live) app.saveSettings();
  }

  function resetPane(side: PaneSide) {
    if (side === 'left') app.settings.leftPaneW = DEFAULT_SETTINGS.leftPaneW;
    else {
      app.settings.rightPaneW = DEFAULT_SETTINGS.rightPaneW;
      app.settings.wideNotebook = false;
    }
    app.saveSettings();
  }

  const TABS = $derived<{ id: LeftTab; label: string }[]>([
    ...(vaults.current ? [{ id: 'files' as const, label: 'Files' }] : []),
    { id: 'outline', label: 'Outline' },
    { id: 'thumbnails', label: 'Pages' },
    { id: 'annotations', label: 'Annotations' },
  ]);
</script>

<svelte:window onkeydown={onKeydown} onpointerup={onPointerUp} onpointermove={markActive} onwheel={markActive} onbeforeunload={() => reader?.save()} />
<svelte:document onvisibilitychange={onVisibility} />

{#if error}
  <div class="fatal">
    <p>Could not open <strong>{request.file.name}</strong>: {error}</p>
    <button class="btn" onclick={() => app.close()}>Back to library</button>
  </div>
{:else if !reader}
  <div class="loading muted">Opening {request.file.name}…</div>
{:else}
  <div
    class="shell"
    class:left-open={reader.leftOpen && !reader.focus}
    class:right-open={reader.study.rightOpen && !reader.focus}
    class:focus={reader.focus}
    data-page-mode={app.settings.pageMode}
    style:--left-pane="{app.settings.leftPaneW}px"
    style:--right-pane={app.settings.wideNotebook ? `${WIDE_NOTEBOOK * 100}vw` : `${app.settings.rightPaneW}px`}
  >
    {#if !reader.focus}<div class="top"><Toolbar {reader} /></div>{/if}
    {#if reader.leftOpen && !reader.focus}
      <aside class="left" bind:this={leftPane}>
        <Splitter side="left" label="Resize sidebar" room={roomFor('left')} onresize={(w, live) => resizePane('left', w, live)} onreset={() => resetPane('left')} />
        <nav class="tabs">
          {#each TABS as t (t.id)}
            <button class:active={reader.leftTab === t.id} onclick={() => (reader!.leftTab = t.id)}>{t.label}</button>
          {/each}
        </nav>
        <div class="pane scroll-thin">
          {#if reader.leftTab === 'files' && vaults.current}<VaultTree compact current={request.place?.path} />
          {:else if reader.leftTab === 'outline'}<Outline {reader} />
          {:else if reader.leftTab === 'thumbnails'}<Thumbnails {reader} />
          {:else if reader.leftTab === 'annotations'}<AnnotationsPanel {reader} />{/if}
        </div>
      </aside>
    {/if}
    <main class="center">
      <Viewer {reader} />
      <PinsMount {reader} />
      {#if reader.search.open}<SearchBar {reader} />{/if}
      {#if reader.ruler}<Ruler band={Math.max(22, 26 * reader.scale)} />{/if}
      {#if readAloud.loaded}{@const { Bar, speaker } = readAloud.loaded}<Bar {speaker} />{/if}
      {#if reader.focus}<button class="exit-focus" onclick={() => (reader!.focus = false)}>Exit focus <kbd>f</kbd></button>{/if}
    </main>
    {#if reader.study.rightOpen && !reader.focus}
      <aside class="right" bind:this={rightPane}>
        <Splitter side="right" label="Resize study pane" room={roomFor('right')} onresize={(w, live) => resizePane('right', w, live)} onreset={() => resetPane('right')} />
        <nav class="tabs">
          {#each RIGHT_TABS as t (t.id)}
            <button class:active={reader.study.rightTab === t.id} onclick={() => (reader!.study.rightTab = t.id)}>
              {t.label}{#if t.id === 'cards' && reader.study.dueHere > 0}<span class="badge">{reader.study.dueHere}</span>{/if}
            </button>
          {/each}
          <button class="close" title="Close pane" aria-label="Close pane" onclick={() => (reader!.study.rightOpen = false)}>×</button>
        </nav>
        <div class="pane scroll-thin">
          {#if reader.study.rightTab === 'notebook'}<NotebookPane {reader} />{:else}<CardsPanel {reader} />{/if}
        </div>
      </aside>
    {/if}
    {#if !reader.focus}<div class="bottom"><StatusBar {reader} /></div>{/if}
  </div>
  <NotebookBridge {reader} />
  {#if reader.ann.menu}<SelectionMenu {reader} menu={reader.ann.menu} />{/if}
  {#if reader.linkPreview}<LinkPreview {reader} {...reader.linkPreview} />{/if}
  {#if paletteOpen}<CommandPalette {commands} onclose={() => (paletteOpen = false)} />{/if}
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
  .shell.left-open { --left-w: var(--left-pane); }
  .shell.right-open { --right-w: max(0px, min(var(--right-pane), calc(100vw - var(--left-w) - 320px))); }
  .right {
    grid-area: right;
    position: relative;
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
  .shell.focus { grid-template-rows: 0 minmax(0, 1fr) 0; }
  .shell[data-page-mode='dark'] { --page-filter: invert(0.9) hue-rotate(180deg); --page-bg: #1c1c1c; --hl-blend: screen; --hl-opacity: 0.4; }
  .shell[data-page-mode='sepia'] { --page-filter: sepia(0.5) saturate(1.15) brightness(0.96); --page-bg: #f1e7d0; }
  .exit-focus {
    position: absolute;
    top: 10px;
    right: 22px;
    z-index: 30;
    font-size: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    opacity: 0.35;
    transition: opacity 0.2s;
  }
  .exit-focus:hover { opacity: 1; }
  .left {
    grid-area: left;
    position: relative;
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
