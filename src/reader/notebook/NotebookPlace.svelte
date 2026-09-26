<script lang="ts">
  import { app } from '../../lib/app.svelte';
  import type { VaultFolder } from '../../lib/types';
  import { vaults } from '../../lib/vaults.svelte';
  import type { Reader } from '../session.svelte';
  import FolderPicker from './FolderPicker.svelte';

  let { reader, onclose }: { reader: Reader; onclose: () => void } = $props();
  const study = $derived(reader.study);
  const home = $derived(study.home);
  const openVaults = $derived(vaults.list.filter((v) => !vaults.locked.has(v.id)));
  const vaultName = (id: string) => vaults.list.find((v) => v.id === id)?.name ?? 'a vault';
  const firstFolder = (): VaultFolder | null => {
    const v = vaults.current ?? openVaults[0];
    return app.settings.notebookFolder ?? (v ? { vault: v.id, dir: '' } : null);
  };

  let dest = $state<VaultFolder | null>(null);
  let busy = $state(false);
  let error = $state('');

  function setFolder(f: VaultFolder | null) {
    app.settings.notebookFolder = f;
    app.saveSettings();
  }

  async function move() {
    if (!dest) return;
    busy = true;
    error = '';
    try {
      await study.moveToVault(dest, reader.doc.fileName);
      dest = null;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

<div class="place" data-testid="notebook-place" role="dialog" aria-label="Notebook location">
  <section>
    <strong>This notebook</strong>
    {#if home.kind === 'vault'}
      <p data-testid="notebook-location"><span class="muted">{vaultName(home.vault)} /</span> {home.path}</p>
      {#if study.blocked}<p class="muted">Estudio needs access to that vault again.</p>{/if}
    {:else}
      <p data-testid="notebook-location" class="muted">Kept inside Estudio, not as a file.</p>
      {#if !openVaults.length}
        <p class="muted">Open a vault to keep notebooks as Markdown files.</p>
      {:else if dest}
        <FolderPicker value={dest} onchange={(f) => (dest = f)} testid="move-picker" />
        <div class="row">
          <button class="btn primary" disabled={busy || study.poppedOut} onclick={move} data-testid="move-notebook-go">Move here</button>
          <button class="btn" onclick={() => (dest = null)}>Cancel</button>
        </div>
        {#if study.poppedOut}<p class="muted">Bring the notebook back from its window first.</p>{/if}
      {:else}
        <button class="btn" onclick={() => (dest = firstFolder())} data-testid="move-notebook">Move notebook to a vault…</button>
      {/if}
      {#if error}<p class="error">{error}</p>{/if}
    {/if}
  </section>

  <section>
    <strong>New notebooks go in</strong>
    <label><input type="radio" name="nb-folder" checked={!app.settings.notebookFolder} onchange={() => setFolder(null)} data-testid="folder-next-to-pdf" /> Next to the PDF</label>
    <label>
      <input type="radio" name="nb-folder" checked={!!app.settings.notebookFolder} disabled={!openVaults.length} onchange={() => setFolder(firstFolder())} data-testid="folder-chosen" />
      A folder in a vault
    </label>
    {#if app.settings.notebookFolder}
      <FolderPicker value={app.settings.notebookFolder} onchange={setFolder} testid="new-notebook-picker" />
    {/if}
    <p class="muted small">A notebook keeps working wherever you move its file: its frontmatter names the PDF. PDFs outside a vault keep new notebooks inside Estudio unless a folder is chosen here.</p>
  </section>
  <div class="row end"><button class="btn" onclick={onclose}>Done</button></div>
</div>

<style>
  .place {
    position: absolute;
    top: calc(100% + 4px);
    right: 8px;
    z-index: 40;
    width: min(340px, calc(100% - 16px));
    display: grid;
    gap: 12px;
    padding: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--pop-shadow);
    font-size: 13px;
  }
  section { display: grid; gap: 6px; }
  p { margin: 0; overflow-wrap: anywhere; }
  label { display: flex; align-items: center; gap: 6px; }
  .row { display: flex; gap: 6px; }
  .end { justify-content: flex-end; }
  .small { font-size: 11.5px; }
  .error { color: var(--danger); }
</style>
