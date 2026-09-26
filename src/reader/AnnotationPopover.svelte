<script lang="ts">
  import { focusOnMount } from '../lib/focus';
  import { untrack } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import { app } from '../lib/app.svelte';
  import { pageToDisplay } from '../lib/geometry';
  import { annotationAnchor, annotationText, COLOR_HEX, COLOR_IDS, KIND_LABEL, type ColorId, type StoredAnnotation } from '../lib/types';
  import { displaySize, renderRegion } from './pdf';
  import type { Reader } from './session.svelte';
  import PinButton from './pins/PinButton.svelte';

  let { reader, a }: { reader: Reader; a: StoredAnnotation } = $props();

  const ann = $derived(reader.ann);
  const info = $derived(reader.info[a.page - 1]!);
  const pos = $derived.by(() => {
    const d = pageToDisplay(annotationAnchor(a), info.rotation);
    const s = displaySize(info);
    const w = s.w * reader.scale;
    return { left: Math.max(0, Math.min(d.x * w, w - 300)), top: d.y * s.h * reader.scale + 8 };
  });

  // Captured once: the popover is keyed by annotation, and blur can fire during teardown after props are gone.
  const initial = untrack(() => a);
  const id = initial.id;
  const annotator = untrack(() => reader.ann);
  let note = $state(initial.kind === 'ink' ? '' : initial.note);
  let tags = $state(initial.tags.join(', '));

  function commit() {
    const parsed = [...new Set(tags.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean))];
    annotator.update(id, (x) => (x.kind === 'ink' ? { ...x, tags: parsed } : { ...x, note, tags: parsed }));
  }

  function setColor(c: ColorId) {
    commit();
    annotator.update(id, (x) => (x.kind === 'ink' ? x : { ...x, color: c }));
  }

  function sourceText(): string {
    const x = untrack(() => a);
    return annotationText(x) || note || KIND_LABEL[x.kind];
  }

  function quote() {
    commit();
    const x = untrack(() => a);
    const body = annotationText(x);
    reader.study.quote(body || note || KIND_LABEL[x.kind], x.page, body ? note.trim() : '');
  }

  let sending = $state(false);

  /** Draws the clipped region at twice its size and adds it to the notebook with its page link. */
  async function toNotes() {
    const x = untrack(() => a);
    if (x.kind !== 'area' || sending) return;
    commit();
    sending = true;
    try {
      const png = await renderRegion(await reader.page(x.page), reader.info[x.page - 1]!, x.rect);
      await reader.study.figure(png, x.page);
    } catch (e) {
      alert(`The figure could not be added: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      sending = false;
    }
  }

  function card() {
    commit();
    reader.study.draft = { page: initial.page, text: sourceText(), annId: id, cloze: false };
  }

  function close() {
    commit();
    annotator.select(null);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="popover"
  style:left="{pos.left}px"
  style:top="{pos.top}px"
  onpointerdown={(e) => e.stopPropagation()}
  onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
  data-testid="annotation-popover"
>
  <header>
    <strong>{KIND_LABEL[a.kind]}</strong>
    <span class="muted">p. {a.page}</span>
    {#if a.kind !== 'ink'}<span class="meaning" style:--c={COLOR_HEX[a.color]}>{app.settings.meanings[a.color]}</span>{/if}
    <button class="x" title="Close (Esc)" onclick={close}><Icon name="close" size={14} /></button>
  </header>

  {#if a.kind !== 'ink'}
    <div class="swatches">
      {#each COLOR_IDS as c (c)}
        <button class="swatch" class:on={a.color === c} style:--c={COLOR_HEX[c]} title={app.settings.meanings[c]} aria-label={app.settings.meanings[c]} onclick={() => setColor(c)}></button>
      {/each}
    </div>
    <textarea bind:value={note} onblur={commit} rows="3" placeholder="Add a note…" use:focusOnMount={a.kind === 'note' || a.kind === 'area'}></textarea>
  {/if}
  <input type="text" bind:value={tags} onblur={commit} onkeydown={(e) => { if (e.key === 'Enter') commit(); }} placeholder="Tags, comma separated" />

  <footer>
    {#if a.kind === 'area'}
      <button class="act" onclick={() => void toNotes()} disabled={sending} title="Add this clip to the notebook as an image" data-testid="send-to-notes"><Icon name="notebook" size={16} /> Send to notes</button>
      <PinButton {reader} {a} />
    {:else}
      <button class="act" onclick={quote} title="Quote to notebook"><Icon name="quote" size={16} /> Quote</button>
    {/if}
    <button class="act" onclick={card} title="Make a flashcard"><Icon name="card" size={16} /> Card</button>
    <div class="grow"></div>
    <button class="danger" title="Delete (Del)" onclick={() => ann.remove(a.id)}><Icon name="trash" size={16} /></button>
  </footer>
</div>

<style>
  .popover {
    position: absolute;
    z-index: 20;
    width: 292px;
    padding: 10px;
    display: grid;
    gap: 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--pop-shadow);
    font-size: 13px;
    color: var(--text);
    cursor: auto;
  }
  header { display: flex; align-items: center; gap: 8px; }
  .meaning {
    font-size: 11px;
    padding: 1px 7px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--c) 30%, transparent);
  }
  .x { margin-left: auto; padding: 2px; }
  .swatches { display: flex; gap: 6px; }
  .swatch { width: 20px; height: 20px; padding: 0; border-radius: 50%; background: var(--c); border: 2px solid transparent; }
  .swatch:hover:not(:disabled) { background: var(--c); }
  .swatch.on { border-color: var(--text); }
  textarea { resize: vertical; min-height: 56px; }
  footer { display: flex; align-items: center; gap: 4px; }
  .grow { flex: 1; }
  .act { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; border: 1px solid var(--border); }
  .danger { color: var(--danger); padding: 4px; }
</style>
