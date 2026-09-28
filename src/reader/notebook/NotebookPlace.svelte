<script lang="ts">
  import { app } from '../../lib/app.svelte';
  import type { FileOffer } from '../../lib/notebookoffer';
  import type { NotebookLoc, VaultFolder, VaultId } from '../../lib/types';
  import { vaults } from '../../lib/vaults.svelte';
  import { parentOf } from '../../lib/vaulttree';
  import { exportNotesFile } from '../exports';
  import type { Reader } from '../session.svelte';
  import FolderPicker from './FolderPicker.svelte';

  let { reader, offer, onclose }: { reader: Reader; offer: FileOffer | null; onclose: () => void } = $props();
  const study = $derived(reader.study);
  const home = $derived(study.home);
  const here = $derived(study.location());
  const openVaults = $derived(vaults.list.filter((v) => !vaults.locked.has(v.id)));
  const vaultName = (id: VaultId) => vaults.byId(id)?.name ?? 'a vault';
  const offers = (o: 'next-to-pdf' | 'notes-only') => !!offer?.options.includes(o);
  const firstFolder = (): VaultFolder | null => {
    const v = vaults.current ?? openVaults[0];
    return app.settings.notebookFolder ?? (v ? { vault: v.id, dir: '' } : null);
  };
  const isIn = (l: NotebookLoc | null, vault: VaultId, dir: string) => !!l && l.vault === vault && parentOf(l.path) === dir;

  /** Where the PDF is, when Estudio can write beside it without asking. */
  let pdfAt = $state.raw<NotebookLoc | null>(null);
  $effect(() => {
    const { place, handle } = reader.source;
    pdfAt = place ? { vault: place.vault, path: place.path } : null;
    if (!place && handle) void vaults.folderOf(handle).then((l) => (pdfAt = l ?? null));
  });
  const besidePdfNow = $derived(!!pdfAt && isIn(here, pdfAt.vault, parentOf(pdfAt.path)));
  const canBesidePdf = $derived(home.kind === 'db' ? offers('next-to-pdf') : !besidePdfNow && (!!pdfAt || !!reader.source.handle));

  let dest = $state<VaultFolder | null>(null);
  let suggest = $state<VaultFolder | 'pdf' | null>(null);
  let busy = $state(false);
  let error = $state('');
  let notice = $state('');

  function setFolder(f: VaultFolder | null) {
    app.settings.notebookFolder = f;
    app.saveSettings();
    error = '';
    notice = '';
    if (f) suggest = isIn(here, f.vault, f.dir) ? null : f;
    else suggest = canBesidePdf ? 'pdf' : null;
  }

  async function run(f: () => Promise<string | undefined>) {
    busy = true;
    error = '';
    notice = '';
    try {
      notice = (await f()) ?? '';
      dest = null;
      suggest = null;
    } catch (e) {
      error = `${home.kind === 'db' ? 'The notebook stays inside Estudio' : 'The notebook stays where it was'}: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      busy = false;
    }
  }

  const moveTo = (folder: VaultFolder) => run(() => study.moveToVault(folder, reader.doc.fileName));

  async function besidePdf() {
    if (pdfAt) return moveTo({ vault: pdfAt.vault, dir: parentOf(pdfAt.path) });
    const pdf = reader.source.handle;
    if (!pdf) return;
    await run(async () => {
      const r = await study.moveBesidePdf(pdf, reader.doc.fileName);
      if (r === 'elsewhere') throw new Error(`that folder does not hold "${reader.doc.fileName}". Pick the folder the PDF is in. Nothing was saved.`);
      // Edge refuses Downloads, Desktop and Documents themselves ("contains system files"), and the refusal reaches us only as a cancel.
      if (r === 'cancelled') throw new Error('no folder was chosen. Edge never allows Downloads, Desktop or Documents themselves: keep the PDF in a folder inside them (for example Downloads\\Estudio), or use a vault folder.');
      return undefined;
    });
  }
</script>

<div class="place" data-testid="notebook-place" role="dialog" aria-label="Notebook location">
  <section>
    <strong>This notebook</strong>
    {#if here}
      <p data-testid="notebook-location"><span class="muted">{vaultName(here.vault)} /</span> {here.path}</p>
      {#if study.blocked}<p class="muted">Estudio needs access to that {study.blocked.pdfFolder ? 'folder' : 'vault'} again.</p>{/if}
    {:else}
      <p data-testid="notebook-location" class="muted">Kept inside Estudio, not as a file.</p>
      {#if offer?.why}<p class="muted small" data-testid="notebook-why">{offer.why}</p>{/if}
    {/if}
    {#if dest}
      <FolderPicker value={dest} onchange={(f) => (dest = f)} testid="move-picker" />
      <div class="row">
        <button class="btn primary" disabled={busy} onclick={() => dest && moveTo(dest)} data-testid="move-notebook-go">Move here</button>
        <button class="btn" onclick={() => (dest = null)}>Cancel</button>
      </div>
    {:else if !study.blocked}
      <div class="row wrap">
        {#if canBesidePdf}<button class="btn primary" disabled={busy} onclick={besidePdf} data-testid="save-next-to-pdf">Next to the PDF</button>{/if}
        {#if openVaults.length}
          <button class="btn" onclick={() => (dest = firstFolder())} data-testid="move-notebook">{offer?.label ? 'In a vault folder…' : 'Move notebook to a vault…'}</button>
        {/if}
        {#if offers('notes-only')}<button class="btn" onclick={() => exportNotesFile(reader)} data-testid="save-notes-only">Notes only (.md)</button>{/if}
      </div>
      {#if !openVaults.length}<p class="muted small">Open a vault to {home.kind === 'db' ? 'keep the notebook as a Markdown file in a vault folder' : 'move the notebook to a vault folder'}.</p>{/if}
    {/if}
    {#if error}<p class="error">{error}</p>{/if}
    {#if notice}<p class="error" data-testid="move-warning">{notice}</p>{/if}
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
    {#if suggest}
      <div class="row wrap suggest" data-testid="also-move">
        <span>This notebook stays where it is. Also move it there?</span>
        <button class="btn primary" disabled={busy} onclick={() => (suggest === 'pdf' ? besidePdf() : suggest && moveTo(suggest))} data-testid="also-move-go">Move it</button>
        <button class="btn" onclick={() => (suggest = null)}>No</button>
      </div>
    {/if}
    <p class="muted small">This applies to notebooks created from now on. A notebook keeps working wherever you move its file: its frontmatter names the PDF. PDFs outside a vault ask once for access to their folder.</p>
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
  .suggest { align-items: center; }
</style>
