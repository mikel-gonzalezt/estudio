<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { vaults } from '../lib/vaults.svelte';
  import { canMove, childrenOf, parentOf, ROOT, type TreeNode, type VaultPath } from '../lib/vaulttree';
  import Icon from './Icon.svelte';
  import { newWindowClick } from '../lib/keys';

  let { compact = false, current }: { compact?: boolean; current?: VaultPath } = $props();

  let menu = $state<{ path: VaultPath; x: number; y: number } | null>(null);
  let dragging = $state<VaultPath | null>(null);
  let over = $state<VaultPath | null>(null);

  const DRAG_TYPE = 'application/x-estudio-path';

  async function open(node: TreeNode) {
    if (node.kind === 'dir') {
      vaults.toggle(node.path);
      vaults.folder = node.path;
      return;
    }
    vaults.folder = parentOf(node.path);
    const { handle, ...place } = await vaults.place(node.path);
    if (node.kind === 'pdf') await app.openFile(await handle.getFile(), handle, { place });
    else app.openNote(handle, place);
  }

  async function openInNewWindow(path: VaultPath) {
    menu = null;
    const { handle } = await vaults.place(path);
    await app.openInNewWindow(handle);
  }

  function onItemClick(e: MouseEvent, node: TreeNode) {
    if (node.kind === 'pdf' && newWindowClick(e)) void openInNewWindow(node.path);
    else if (e.button === 0) void open(node);
  }

  async function newFolder() {
    const name = prompt('New folder name');
    if (name) await vaults.newFolder(vaults.folder, name);
  }

  async function newNote() {
    const name = prompt('New note name', 'Untitled');
    if (!name) return;
    const path = await vaults.newNote(vaults.folder, name);
    const node = path ? vaults.tree.get(path) : undefined;
    if (node) await open(node);
  }

  async function rename(path: VaultPath) {
    menu = null;
    const node = vaults.tree.get(path);
    const name = node && prompt(`Rename "${node.name}"`, node.name);
    if (name) await vaults.rename(path, name);
  }

  async function remove(path: VaultPath) {
    menu = null;
    const node = vaults.tree.get(path);
    if (!node) return;
    const what = node.kind === 'dir' ? `the folder "${node.name}" and everything in it` : `"${node.name}"`;
    if (confirm(`Delete ${what} from disk? This cannot be undone.`)) await vaults.remove(path);
  }

  function dropTarget(node: TreeNode | null): VaultPath {
    if (!node) return ROOT;
    return node.kind === 'dir' ? node.path : parentOf(node.path);
  }

  function onDragOver(e: DragEvent, node: TreeNode | null) {
    const target = dropTarget(node);
    const types = e.dataTransfer?.types ?? [];
    const ok = types.includes(DRAG_TYPE) ? dragging !== null && canMove(vaults.tree, dragging, target) : types.includes('Files');
    if (!ok) return;
    e.preventDefault();
    e.stopPropagation();
    over = target;
  }

  async function onDrop(e: DragEvent, node: TreeNode | null) {
    const target = dropTarget(node);
    e.preventDefault();
    e.stopPropagation();
    over = null;
    const from = e.dataTransfer?.getData(DRAG_TYPE);
    if (from) {
      dragging = null;
      await vaults.move(from, target);
    } else if (e.dataTransfer?.files.length) {
      await vaults.importFiles(target, [...e.dataTransfer.files]);
    }
  }

  function onKey(e: KeyboardEvent, node: TreeNode) {
    if (e.key === 'F2') rename(node.path);
    else if (e.key === 'Delete') remove(node.path);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
</script>

<svelte:window onclick={() => (menu = null)} />

{#if vaults.current}
  <div class="vault" class:compact data-testid="vault-tree">
    <header>
      <span class="name" title={vaults.current.name}><Icon name="vault" size={15} /> {vaults.current.name}</span>
      <span class="actions">
        <button title="New note in {vaults.folder || 'the vault root'}" aria-label="New note" onclick={newNote}><Icon name="filePlus" size={16} /></button>
        <button title="New folder in {vaults.folder || 'the vault root'}" aria-label="New folder" onclick={newFolder}><Icon name="folderPlus" size={16} /></button>
        <button title="Import PDFs into {vaults.folder || 'the vault root'}" aria-label="Import PDFs" onclick={() => vaults.importPdfs(vaults.folder)}><Icon name="upload" size={16} /></button>
        <button title="Refresh" aria-label="Refresh" onclick={() => vaults.refresh()}><Icon name="reset" size={15} /></button>
      </span>
    </header>
    {#if vaults.error}<p class="error">{vaults.error}</p>{/if}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="root scroll-thin"
      class:over={over === ROOT}
      ondragover={(e) => onDragOver(e, null)}
      ondragleave={() => (over = null)}
      ondrop={(e) => onDrop(e, null)}
      role="tree"
      tabindex="-1"
    >
      {#if childrenOf(vaults.tree, ROOT).length === 0}
        <p class="muted empty">This folder has no PDFs or notes yet. Import PDFs or drop them here.</p>
      {/if}
      {@render level(ROOT, 0)}
    </div>
  </div>
{/if}

{#if menu}
  <div class="menu" style:left="{menu.x}px" style:top="{menu.y}px" role="menu">
    {#if vaults.tree.get(menu.path)?.kind === 'pdf'}
      <button role="menuitem" onclick={() => openInNewWindow(menu!.path)}>Open in new window <kbd>Ctrl+click</kbd></button>
    {/if}
    <button role="menuitem" onclick={() => rename(menu!.path)}>Rename <kbd>F2</kbd></button>
    <button role="menuitem" class="danger" onclick={() => remove(menu!.path)}>Delete <kbd>Del</kbd></button>
  </div>
{/if}

{#snippet level(dir: VaultPath, depth: number)}
  {#each childrenOf(vaults.tree, dir) as node (node.path)}
    <div
      class="row"
      class:current={node.path === current}
      class:folder-here={node.kind === 'dir' && node.path === vaults.folder}
      class:over={node.kind === 'dir' && over === node.path}
      style:padding-left="{6 + depth * 14}px"
      draggable="true"
      ondragstart={(e) => { dragging = node.path; e.dataTransfer?.setData(DRAG_TYPE, node.path); }}
      ondragend={() => { dragging = null; over = null; }}
      ondragover={(e) => onDragOver(e, node)}
      ondrop={(e) => onDrop(e, node)}
      oncontextmenu={(e) => { e.preventDefault(); menu = { path: node.path, x: e.clientX, y: e.clientY }; }}
      role="treeitem"
      aria-selected={node.path === current}
      aria-expanded={node.kind === 'dir' ? vaults.expanded.has(node.path) : undefined}
      tabindex="-1"
    >
      <button class="item" onclick={(e) => onItemClick(e, node)} onauxclick={(e) => onItemClick(e, node)}
        onmousedown={(e) => { if (e.button === 1) e.preventDefault(); }} onkeydown={(e) => onKey(e, node)} data-path={node.path}>
        {#if node.kind === 'dir'}
          <span class="chev" class:open={vaults.expanded.has(node.path)}><Icon name="chevron" size={12} /></span>
          <Icon name="folder" size={15} />
        {:else}
          <span class="chev"></span>
          <Icon name={node.kind === 'pdf' ? 'file' : 'notebook'} size={15} />
        {/if}
        <span class="label">{node.kind === 'note' ? node.name.replace(/\.md$/i, '') : node.name}</span>
      </button>
      <button class="more" title="More" aria-label="More actions for {node.name}"
        onclick={(e) => { e.stopPropagation(); menu = { path: node.path, x: e.clientX, y: e.clientY }; }}><Icon name="more" size={14} /></button>
    </div>
    {#if node.kind === 'dir' && vaults.expanded.has(node.path)}{@render level(node.path, depth + 1)}{/if}
  {/each}
{/snippet}

<style>
  .vault { display: flex; flex-direction: column; min-height: 0; height: 100%; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 6px 6px 6px 10px; border-bottom: 1px solid var(--border); }
  .name { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .actions { display: flex; gap: 2px; flex: none; }
  .actions button { padding: 3px; color: var(--muted); }
  .error { margin: 6px 10px; color: var(--danger); font-size: 12px; }
  .root { flex: 1; overflow: auto; padding: 4px 0 24px; min-height: 60px; }
  .root.over, .row.over { background: var(--accent-soft); }
  .empty { padding: 8px 12px; font-size: 12px; }
  .row { position: relative; display: flex; align-items: center; border-radius: 6px; margin: 0 4px; }
  .row:hover { background: var(--surface-2); }
  .row.current { background: var(--accent-soft); }
  .row.current .label { color: var(--accent); font-weight: 600; }
  .row.folder-here .label { font-weight: 600; }
  .item { flex: 1; min-width: 0; display: flex; align-items: center; gap: 5px; padding: 3px 4px; text-align: left; font-size: 13px; background: none; }
  .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chev { width: 12px; display: inline-flex; color: var(--muted); transition: transform 0.12s; }
  .chev.open { transform: rotate(90deg); }
  .more { padding: 2px; color: var(--muted); opacity: 0; }
  .row:hover .more, .row:focus-within .more { opacity: 1; }
  .compact .item { font-size: 12.5px; }
  .menu {
    position: fixed;
    z-index: 60;
    display: grid;
    min-width: 150px;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.16);
  }
  .menu button { display: flex; justify-content: space-between; gap: 16px; padding: 5px 8px; text-align: left; font-size: 13px; }
  .menu .danger { color: var(--danger); }
  kbd { font-size: 10.5px; color: var(--muted); }
</style>
