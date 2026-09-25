<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { app } from '../lib/app.svelte';
  import type { Reader } from './session.svelte';

  let { reader }: { reader: Reader } = $props();
</script>

<header class="toolbar">
  <div class="group">
    <button title="Library" onclick={() => app.close()}><Icon name="library" /></button>
    <button title="Toggle sidebar (b)" class:on={reader.leftOpen} onclick={() => (reader.leftOpen = !reader.leftOpen)}><Icon name="sidebar" /></button>
    <span class="title" title={reader.doc.fileName}>{reader.doc.title}</span>
  </div>

  <div class="group center"></div>

  <div class="group">
    <button title="Zoom out (Ctrl -)" onclick={() => reader.zoomStep(-1)}><Icon name="zoomOut" /></button>
    <span class="zoom">{Math.round(reader.scale * 100)}%</span>
    <button title="Zoom in (Ctrl +)" onclick={() => reader.zoomStep(1)}><Icon name="zoomIn" /></button>
    <button title="Fit width (Ctrl 0)" onclick={() => reader.fitWidth()}><Icon name="fitWidth" /></button>
    <button title="Fit page (Ctrl 9)" onclick={() => reader.fitPage()}><Icon name="fitPage" /></button>
    <span class="sep"></span>
    <button title="Toggle theme" onclick={() => app.toggleTheme()}><Icon name={app.settings.theme === 'dark' ? 'sun' : 'moon'} /></button>
  </div>
</header>

<style>
  .toolbar {
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
  .title { font-weight: 600; margin-left: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }
  .zoom { min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; color: var(--muted); font-size: 13px; }
  .sep { width: 1px; height: 20px; background: var(--border); margin: 0 6px; }
  button { padding: 5px; color: var(--text); }
  button.on { background: var(--accent-soft); color: var(--accent); }
</style>
