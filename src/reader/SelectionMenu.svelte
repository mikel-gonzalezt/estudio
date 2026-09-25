<script lang="ts">
  import Icon, { type IconName } from '../components/Icon.svelte';
  import { COLOR_HEX, type TextMarkupKind } from '../lib/types';
  import type { SelectionMenu } from './annotator.svelte';
  import type { Reader } from './session.svelte';

  let { reader, menu }: { reader: Reader; menu: SelectionMenu } = $props();
  const ann = $derived(reader.ann);

  const marks: { kind: TextMarkupKind; icon: IconName; label: string }[] = [
    { kind: 'highlight', icon: 'highlight', label: 'Highlight' },
    { kind: 'underline', icon: 'underline', label: 'Underline' },
    { kind: 'strike', icon: 'strike', label: 'Strikethrough' },
  ];

  const text = $derived(menu.parts.map((p) => p.text).join(' '));
  const left = $derived(Math.min(menu.x - 100, window.innerWidth - 330));

  async function copy() {
    await navigator.clipboard.writeText(text).catch(() => {});
    ann.menu = null;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="menu" style:left="{Math.max(8, left)}px" style:top="{menu.y + 8}px" onpointerdown={(e) => e.stopPropagation()} data-testid="selection-menu">
  {#each marks as m (m.kind)}
    <button title={m.label} onclick={() => ann.markParts(m.kind, menu.parts)} style:--c={COLOR_HEX[ann.color]}>
      <Icon name={m.icon} size={16} /><span>{m.label}</span>
    </button>
  {/each}
  <span class="sep"></span>
  <button title="Copy text" onclick={copy}><Icon name="copy" size={16} /></button>
</div>

<style>
  .menu {
    position: fixed;
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--pop-shadow);
  }
  button { display: inline-flex; align-items: center; gap: 5px; padding: 5px 7px; font-size: 12px; }
  button:first-child :global(svg) { color: var(--c); }
  .sep { width: 1px; height: 18px; background: var(--border); margin: 0 3px; }
</style>
