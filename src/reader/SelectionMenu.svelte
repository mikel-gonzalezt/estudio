<script lang="ts">
  import Icon, { type IconName } from '../components/Icon.svelte';
  import { COLOR_HEX, type TextMarkupKind } from '../lib/types';
  import type { SelectionMenu } from './annotator.svelte';
  import type { Reader } from './session.svelte';
  import { app } from '../lib/app.svelte';
  import { readAloud } from './speech/entry.svelte';

  let { reader, menu }: { reader: Reader; menu: SelectionMenu } = $props();
  const ann = $derived(reader.ann);

  const marks: { kind: TextMarkupKind; icon: IconName; label: string }[] = [
    { kind: 'highlight', icon: 'highlight', label: 'Highlight' },
    { kind: 'underline', icon: 'underline', label: 'Underline' },
    { kind: 'strike', icon: 'strike', label: 'Strikethrough' },
  ];

  const text = $derived(menu.parts.map((p) => p.text).join(' '));
  const left = $derived(Math.min(menu.x - 100, window.innerWidth - 290));

  const page = $derived(menu.parts[0]!.page);

  function done() {
    ann.menu = null;
    window.getSelection()?.removeAllRanges();
  }

  function quote() {
    reader.study.quote(text, page);
    done();
  }

  function card() {
    reader.study.draft = { page, text, cloze: false };
    done();
  }

  async function copy() {
    await navigator.clipboard.writeText(text).catch(() => {});
    ann.menu = null;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="menu" style:left="{Math.max(8, left)}px" style:top="{menu.y + 8}px" onpointerdown={(e) => e.stopPropagation()} data-testid="selection-menu">
  {#each marks as m (m.kind)}
    <button title={m.label} onclick={() => ann.markParts(m.kind, menu.parts)} style:--c={COLOR_HEX[ann.color]}>
      <Icon name={m.icon} size={16} />
    </button>
  {/each}
  <span class="sep"></span>
  <button title="Quote to notebook" onclick={quote}><Icon name="quote" size={16} /><span>Quote</span></button>
  <button title="Make a flashcard" onclick={card}><Icon name="card" size={16} /><span>Card</span></button>
  <button title="Copy text" onclick={copy}><Icon name="copy" size={16} /></button>
  {#if app.settings.readAloud}<button title="Read aloud from here" onmousedown={(e) => e.preventDefault()} onclick={() => { readAloud.start(reader, 'here'); done(); }} data-testid="read-from-here"><Icon name="speak" size={16} /></button>{/if}
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
  button:first-child { background: color-mix(in srgb, var(--c) 22%, transparent); }
  .sep { width: 1px; height: 18px; background: var(--border); margin: 0 3px; }
</style>
