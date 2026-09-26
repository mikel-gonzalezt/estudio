<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { app } from '../lib/app.svelte';
  import { COLOR_HEX, COLOR_IDS, DEFAULT_MEANINGS, type PageMode } from '../lib/types';
  import type { Reader } from './session.svelte';
  import { TOOL_IDS, TOOLS } from './tools';
  import { exportMarkdownFile, exportNotesFile, exportPdfFile, printNotesFile } from './exports';
  import { downloadBackup } from '../lib/backupio';

  let { reader }: { reader: Reader } = $props();
  const ann = $derived(reader.ann);
  let meaningsOpen = $state(false);
  let exportOpen = $state(false);
  let moreOpen = $state(false);
  let exporting = $state(false);

  async function run(f: () => unknown) {
    exportOpen = false;
    exporting = true;
    try {
      await f();
    } finally {
      exporting = false;
    }
  }

  function saveMeanings() {
    for (const c of COLOR_IDS) if (!app.settings.meanings[c].trim()) app.settings.meanings[c] = DEFAULT_MEANINGS[c];
    app.saveSettings();
  }
</script>

{#snippet viewControls()}
  <button title="Fit page (Ctrl 9)" onclick={() => reader.fitPage()}><Icon name="fitPage" /></button>
  <button title="Fit text width (w)" aria-label="Fit text width" class:on={reader.fit === 'text'} onclick={() => reader.toggleTextWidth()}><Icon name="fitText" /></button>
  <button title="Focus mode (f)" onclick={() => (reader.focus = true)}><Icon name="focus" /></button>
  <button title="Reading ruler (r)" class:on={reader.ruler} onclick={() => (reader.ruler = !reader.ruler)}><Icon name="ruler" /></button>
  <select class="mode" aria-label="Page mode" value={app.settings.pageMode} onchange={(e) => { app.settings.pageMode = e.currentTarget.value as PageMode; app.saveSettings(); }}>
    <option value="normal">Normal</option>
    <option value="dark">Dark pages</option>
    <option value="sepia">Sepia</option>
  </select>
{/snippet}

<header class="toolbar">
  <div class="group">
    <button title="Library" onclick={() => app.close()}><Icon name="library" /></button>
    <button title="Toggle sidebar (b)" class:on={reader.leftOpen} onclick={() => (reader.leftOpen = !reader.leftOpen)}><Icon name="sidebar" /></button>
    <span class="title" title={reader.doc.fileName}>{reader.doc.title}</span>
  </div>

  <div class="group center">
    {#each TOOL_IDS as id (id)}
      <button
        class:on={ann.tool === id}
        title="{TOOLS[id].label} ({TOOLS[id].key})"
        aria-label={TOOLS[id].label}
        aria-pressed={ann.tool === id}
        onclick={() => ann.setTool(id)}
      ><Icon name={TOOLS[id].icon} /></button>
    {/each}
    <span class="sep"></span>
    {#each COLOR_IDS as c, i (c)}
      <button
        class="swatch"
        class:on={ann.color === c}
        style:--c={COLOR_HEX[c]}
        title="{app.settings.meanings[c]} ({i + 1})"
        aria-label="Colour: {app.settings.meanings[c]}"
        onclick={() => (ann.color = c)}
      ></button>
    {/each}
    <div class="meanings-wrap">
      <button title="Edit colour meanings" onclick={() => (meaningsOpen = !meaningsOpen)} class:on={meaningsOpen}><Icon name="palette" /></button>
      {#if meaningsOpen}
        <div class="meanings" data-testid="meanings">
          <strong>Colour meanings</strong>
          {#each COLOR_IDS as c (c)}
            <label style:--c={COLOR_HEX[c]}>
              <span class="dot"></span>
              <input type="text" bind:value={app.settings.meanings[c]} onchange={saveMeanings} />
            </label>
          {/each}
          <button class="btn" onclick={() => (meaningsOpen = false)}>Done</button>
        </div>
      {/if}
    </div>
    <span class="sep"></span>
    <button title="Undo (Ctrl Z)" disabled={!ann.canUndo} onclick={() => ann.undo()}><Icon name="undo" /></button>
    <button title="Redo (Ctrl Y)" disabled={!ann.canRedo} onclick={() => ann.redo()}><Icon name="redo" /></button>
  </div>

  <div class="group">
    <button title="Zoom out (Ctrl -)" onclick={() => reader.zoomStep(-1)}><Icon name="zoomOut" /></button>
    <span class="zoom">{Math.round(reader.scale * 100)}%</span>
    <button title="Zoom in (Ctrl +)" onclick={() => reader.zoomStep(1)}><Icon name="zoomIn" /></button>
    <button title="Fit width (Ctrl 0)" onclick={() => reader.fitWidth()}><Icon name="fitWidth" /></button>
    <button title="Find (/)" onclick={() => reader.search.show()}><Icon name="search" /></button>
    <div class="view-inline">{@render viewControls()}</div>
    <div class="menu-wrap view-more">
      <button title="More view options" class:on={moreOpen} onclick={() => (moreOpen = !moreOpen)}><Icon name="more" /></button>
      {#if moreOpen}
        <div class="menu view-menu">{@render viewControls()}</div>
      {/if}
    </div>
    <span class="sep"></span>
    <button title="Notebook (N)" class:on={reader.study.rightOpen && reader.study.rightTab === 'notebook'} onclick={() => reader.study.showRight('notebook')}><Icon name="notebook" /></button>
    <button title="Flashcards (C)" class:on={reader.study.rightOpen && reader.study.rightTab === 'cards'} onclick={() => reader.study.showRight('cards')}><Icon name="card" /></button>
    <div class="menu-wrap">
      <button title="Export" class:on={exportOpen} disabled={exporting} onclick={() => (exportOpen = !exportOpen)}><Icon name="download" /></button>
      {#if exportOpen}
        <div class="menu" data-testid="export-menu">
          <button onclick={() => run(() => exportMarkdownFile(reader))}>Markdown (highlights, notes, notebook)</button>
          <button onclick={() => run(() => exportNotesFile(reader))} data-testid="export-notes">Notes only (.md)</button>
          <button onclick={() => run(() => void printNotesFile(reader))} data-testid="export-notes-pdf">Notes as PDF</button>
          <button onclick={() => run(() => exportPdfFile(reader))}>Annotated PDF</button>
          <button onclick={() => run(downloadBackup)}>Full backup (JSON)</button>
        </div>
      {/if}
    </div>
    <button title="Toggle theme" onclick={() => app.toggleTheme()}><Icon name={app.settings.theme === 'dark' ? 'sun' : 'moon'} /></button>
  </div>
</header>

<style>
  .toolbar {
    container: toolbar / inline-size;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    height: 44px;
    padding: 0 8px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .group { display: flex; align-items: center; gap: 2px; min-width: 0; }
  .center { flex: 1; justify-content: center; }
  .title { flex: 0 1 auto; min-width: 3em; font-weight: 600; margin-left: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }
  .zoom { min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; color: var(--muted); font-size: 13px; }
  .mode { font-size: 12px; padding: 3px 4px; margin-left: 4px; }
  .sep { width: 1px; height: 20px; background: var(--border); margin: 0 6px; }
  button { padding: 5px; color: var(--text); flex-shrink: 0; }
  button.on { background: var(--accent-soft); color: var(--accent); }
  .swatch { width: 22px; height: 22px; padding: 0; margin: 0 1px; border-radius: 50%; background: var(--c); border: 2px solid var(--surface); box-shadow: 0 0 0 1px var(--border); }
  .swatch:hover:not(:disabled) { background: var(--c); transform: scale(1.08); }
  .swatch.on { box-shadow: 0 0 0 2px var(--text); }
  .meanings-wrap, .menu-wrap { position: relative; }
  .menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 40;
    display: grid;
    min-width: 260px;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--pop-shadow);
  }
  .menu button { text-align: left; padding: 7px 10px; font-size: 13px; }
  .view-inline { display: contents; }
  .view-more { display: none; }
  .view-menu { display: flex; align-items: center; gap: 2px; min-width: 0; }
  .view-menu button { padding: 5px; }
  @container toolbar (max-width: 1240px) {
    .view-inline { display: none; }
    .view-more { display: block; }
  }
  @container toolbar (max-width: 1060px) {
    button { padding: 3px; }
    .sep { margin: 0 3px; }
  }
  .meanings {
    position: absolute;
    top: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 40;
    width: 240px;
    display: grid;
    gap: 6px;
    padding: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--pop-shadow);
  }
  .meanings label { display: flex; align-items: center; gap: 8px; }
  .meanings input { flex: 1; min-width: 0; }
  .dot { width: 14px; height: 14px; border-radius: 50%; background: var(--c); flex: none; }
</style>
