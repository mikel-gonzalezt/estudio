<script lang="ts">
  import type { VaultFolder } from '../../lib/types';
  import { walk } from '../../lib/vault';
  import { vaults } from '../../lib/vaults.svelte';

  let { value, onchange, testid = 'folder-picker' }: { value: VaultFolder; onchange: (f: VaultFolder) => void; testid?: string } = $props();

  const open = $derived(vaults.list.filter((v) => !vaults.locked.has(v.id)));
  let folders = $state<string[]>([]);
  const listId = `folders-${Math.random().toString(36).slice(2)}`;

  $effect(() => {
    const v = vaults.list.find((x) => x.id === value.vault);
    folders = [];
    if (!v || vaults.locked.has(v.id)) return;
    let dead = false;
    void walk(v.handle).then((entries) => {
      if (!dead) folders = entries.filter((e) => e.kind === 'directory').map((e) => e.path).sort();
    }, () => undefined);
    return () => (dead = true);
  });

  const clean = (dir: string) => dir.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
</script>

<div class="picker" data-testid={testid}>
  <select aria-label="Vault" value={value.vault} onchange={(e) => onchange({ vault: e.currentTarget.value as VaultFolder['vault'], dir: '' })}>
    {#each open as v (v.id)}<option value={v.id}>{v.name}</option>{/each}
  </select>
  <input
    type="text"
    aria-label="Folder in the vault"
    placeholder="Folder (empty for the vault root)"
    list={listId}
    value={value.dir}
    onchange={(e) => onchange({ vault: value.vault, dir: clean(e.currentTarget.value) })}
  />
  <datalist id={listId}>{#each folders as f (f)}<option value={f}></option>{/each}</datalist>
</div>

<style>
  .picker { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 6px; }
  select, input { min-width: 0; font-size: 12.5px; }
</style>
