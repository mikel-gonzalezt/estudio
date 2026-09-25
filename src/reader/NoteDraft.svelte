<script lang="ts">
  import { pageToDisplay } from '../lib/geometry';
  import { IDLE } from './interaction';
  import { displaySize } from './pdf';
  import type { Reader } from './session.svelte';
  import type { XY } from '../lib/types';

  let { reader, page, at }: { reader: Reader; page: number; at: XY } = $props();

  let text = $state('');
  const info = $derived(reader.info[page - 1]!);
  const pos = $derived.by(() => {
    const d = pageToDisplay(at, info.rotation);
    const s = displaySize(info);
    const w = s.w * reader.scale;
    return { left: Math.max(0, Math.min(d.x * w, w - 280)), top: d.y * s.h * reader.scale + 20 };
  });

  function save() {
    reader.ann.add({ kind: 'note', page, at, note: text.trim(), color: reader.ann.color });
    reader.ann.interaction = IDLE;
  }

  const cancel = () => (reader.ann.interaction = IDLE);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="draft"
  style:left="{pos.left}px"
  style:top="{pos.top}px"
  onpointerdown={(e) => e.stopPropagation()}
  onpointerup={(e) => e.stopPropagation()}
  onkeydown={(e) => {
    if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
  }}
>
  <!-- svelte-ignore a11y_autofocus -->
  <textarea bind:value={text} rows="3" placeholder="Note text… (Ctrl+Enter to save)" autofocus data-testid="note-draft"></textarea>
  <div class="row">
    <button class="btn" onclick={cancel}>Cancel</button>
    <button class="btn primary" onclick={save}>Add note</button>
  </div>
</div>

<style>
  .draft {
    position: absolute;
    z-index: 20;
    width: 272px;
    display: grid;
    gap: 8px;
    padding: 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--pop-shadow);
    cursor: auto;
  }
  .row { display: flex; justify-content: flex-end; gap: 6px; }
  textarea { resize: vertical; }
</style>
