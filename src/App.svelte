<script lang="ts">
  import { onMount } from 'svelte';
  import { app, filesFromDrop, listenForLaunches } from './lib/app.svelte';
  import Library from './components/Library.svelte';
  import { pwa } from './lib/pwa.svelte';
  import { windows } from './lib/windows';

  let dragging = $state(false);
  const loadReader = () => import('./reader/Reader.svelte');
  const loadNote = () => import('./reader/NoteView.svelte');

  $effect(() => {
    document.documentElement.dataset.theme = app.settings.theme;
  });

  // An update reloads every window, so it waits until no window shows a document; the last one
  // to return to the library applies it.
  $effect(() => {
    if (pwa.updateReady && !app.open) {
      void app.settled().then(async () => (app.open || (await windows.anyDocOpen()) ? undefined : pwa.applyUpdate()));
    }
  });

  $effect(() => {
    if (pwa.reloadPending && !app.open) void app.settled().then(() => (app.open ? undefined : location.reload()));
  });

  onMount(() => {
    void app.init().then(() => app.consumeHandoff()).then(listenForLaunches);
    // Warm the reader chunk while the library is idle so opening a file feels instant.
    requestIdleCallback?.(() => void loadReader());
  });

  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dragging = true;
  }

  async function onDrop(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dragging = false;
    const [first] = await filesFromDrop(e);
    if (first) await app.openFile(first.file, first.handle);
  }
</script>

<svelte:window ondragover={onDragOver} ondragleave={(e) => { if (!e.relatedTarget) dragging = false; }} ondrop={onDrop} />

{#if app.open}
  {#key app.open}
    {#if app.open.kind === 'pdf'}
      {#await loadReader() then m}
        <m.default request={app.open} />
      {:catch err}
        <p class="fatal">Could not load the reader: {String(err)}</p>
      {/await}
    {:else}
      {#await loadNote() then m}
        <m.default request={app.open} />
      {:catch err}
        <p class="fatal">Could not load the note editor: {String(err)}</p>
      {/await}
    {/if}
  {/key}
{:else}
  <Library />
{/if}

{#if app.notice || app.stalled.length}
  <div class="toasts" role="status">
    {#if app.notice}<p>{app.notice}</p>{/if}
    {#each app.stalled as w (w)}
      <p>
        Open {w.name} in a new window?
        <button class="btn primary" onclick={() => { w.retry(); app.stalled = app.stalled.filter((x) => x !== w); }} data-testid="stalled-open">Open</button>
        <button class="btn" onclick={() => (app.stalled = app.stalled.filter((x) => x !== w))}>Dismiss</button>
      </p>
    {/each}
  </div>
{/if}

{#if dragging}
  <div class="drop-veil"><div>Drop a PDF to open it</div></div>
{/if}

<style>
  .drop-veil {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    backdrop-filter: blur(2px);
    pointer-events: none;
  }
  .drop-veil div {
    padding: 20px 32px;
    border: 2px dashed var(--accent);
    border-radius: 14px;
    background: var(--surface);
    font-size: 18px;
  }
  .fatal { padding: 24px; color: var(--danger); }
  .toasts {
    position: fixed;
    left: 50%;
    bottom: 24px;
    z-index: 90;
    transform: translateX(-50%);
    display: grid;
    gap: 8px;
    max-width: min(560px, calc(100vw - 32px));
  }
  .toasts p {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--pop-shadow);
    font-size: 13.5px;
  }
</style>
