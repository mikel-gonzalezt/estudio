<script lang="ts">
  import { app } from '../../lib/app.svelte';
  import type { FileOffer } from '../../lib/notebookoffer';
  import type { VaultFolder, VaultId } from '../../lib/types';
  import { vaults } from '../../lib/vaults.svelte';
  import { exportNotesFile } from '../exports';
  import type { Reader } from '../session.svelte';
  import FolderPicker from './FolderPicker.svelte';

  let { reader, offer, onclose }: { reader: Reader; offer: FileOffer | null; onclose: () => void } = $props();
  const study = $derived(reader.study);
  const home = $derived(study.home);
  const openVaults = $derived(vaults.list.filter((v) => !vaults.locked.has(v.id)));
  const vaultName = (id: VaultId) => vaults.byId(id)?.name ?? 'a vault';
  const offers = (o: 'next-to-pdf' | 'notes-only') => !!offer?.options.includes(o);
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

  async function besidePdf() {
    const pdf = reader.source.handle;
    if (!pdf) return;
    busy = true;
    error = '';
    try {
      const r = await study.moveBesidePdf(pdf, reader.doc.fileName);
      if (r === 'elsewhere') error = `That folder does not hold "${reader.doc.fileName}". Pick the folder the PDF is in. Nothing was saved.`;
      // Edge refuses Downloads, Desktop and Documents themselves ("contains system files"), and the refusal reaches us only as a cancel.
      else if (r === 'cancelled') error = 'No folder was chosen, so the notebook stays inside Estudio. Edge never allows Downloads, Desktop or Documents themselves: keep the PDF in a folder inside them (for example Downloads\\Estudio), or use "In a vault folder…".';
    } catch (e) {
      error = `The notebook stays inside Estudio: ${e instanceof Error ? e.message : String(e)}`;
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
      {#if study.blocked}<p class="muted">Estudio needs access to that {study.blocked.pdfFolder ? 'folder' : 'vault'} again.</p>{/if}
    {:else}
      <p data-testid="notebook-location" class="muted">Kept inside Estudio, not as a file.</p>
      {#if offer?.why}<p class="muted small" data-testid="notebook-why">{offer.why}</p>{/if}
      {#if !dest && (offers('next-to-pdf') || offers('notes-only'))}
        <div class="row wrap">
          {#if offers('next-to-pdf')}<button class="btn primary" disabled={busy || study.poppedOut} onclick={besidePdf} data-testid="save-next-to-pdf">Next to the PDF</button>{/if}
          <button class="btn" disabled={!openVaults.length} onclick={() => (dest = firstFolder())} data-testid="move-notebook">In a vault folder…</button>
          {#if offers('notes-only')}<button class="btn" onclick={() => exportNotesFile(reader)} data-testid="save-notes-only">Notes only (.md)</button>{/if}
        </div>
        {#if !openVaults.length}<p class="muted small">Open a vault to put the notebook in a vault folder.</p>{/if}
        {#if study.poppedOut}<p class="muted">Bring the notebook back from its window first.</p>{/if}
      {:else if !openVaults.length}
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
    <p class="muted small">A notebook keeps working wherever you move its file: its frontmatter names the PDF. PDFs outside a vault ask once for access to their folder.</p>
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
  .wrap { flex-wrap: wrap; }
  .end { justify-content: flex-end; }
  .small { font-size: 11.5px; }
  .error { color: var(--danger); }
</style>
