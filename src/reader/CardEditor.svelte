<script lang="ts">
  import { focusOnMount } from '../lib/focus';
  import { untrack } from 'svelte';
  import { isCloze, renderCloze, wrapCloze } from '../lib/cloze';
  import type { CardDraft } from './study.svelte';
  import type { Study } from './study.svelte';

  let { study, draft }: { study: Study; draft: CardDraft } = $props();

  const init = untrack(() => draft);
  let cloze = $state(init.cloze);
  let front = $state(init.cloze ? init.text : '');
  let back = $state(init.cloze ? '' : init.text);
  let area: HTMLTextAreaElement | undefined = $state();

  const valid = $derived(cloze ? isCloze(front) : front.trim().length > 0 && back.trim().length > 0);

  function setType(c: boolean) {
    if (c === cloze) return;
    if (c && !front.trim()) front = back;
    cloze = c;
  }

  function makeGap() {
    if (!area) return;
    const { selectionStart: s, selectionEnd: e } = area;
    front = wrapCloze(front, s, e);
    area.focus();
  }

  async function save() {
    if (valid) await study.saveCard(front, cloze ? '' : back, draft);
  }

  const cancel = () => (study.draft = null);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="scrim" onclick={cancel}>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-label="New flashcard"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => {
      e.stopPropagation();
      if (e.key === 'Escape') cancel();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save();
    }}
    data-testid="card-editor"
  >
    <header>
      <h2>New flashcard</h2>
      <span class="muted">p. {draft.page}</span>
    </header>
    <div class="types" role="radiogroup" aria-label="Card type">
      <button role="radio" aria-checked={!cloze} class:on={!cloze} onclick={() => setType(false)}>Basic</button>
      <button role="radio" aria-checked={cloze} class:on={cloze} onclick={() => setType(true)}>Cloze</button>
    </div>

    {#if cloze}
      <label>
        <span>Text <span class="muted">select words and press "Make gap" (or Ctrl+Shift+C)</span></span>
        <textarea bind:this={area} bind:value={front} rows="5" use:focusOnMount
          onkeydown={(e) => { if (e.key.toLowerCase() === 'c' && e.ctrlKey && e.shiftKey) { e.preventDefault(); makeGap(); } }}
        ></textarea>
      </label>
      <div class="row">
        <button class="btn" onclick={makeGap}>Make gap</button>
        {#if isCloze(front)}<p class="preview">{@html renderCloze(front, false)}</p>{/if}
      </div>
    {:else}
      <label>
        <span>Front (question)</span>
        <textarea bind:value={front} rows="2" use:focusOnMount placeholder="What should you recall?"></textarea>
      </label>
      <label>
        <span>Back (answer)</span>
        <textarea bind:value={back} rows="4"></textarea>
      </label>
    {/if}

    <footer>
      <button class="btn" onclick={cancel}>Cancel</button>
      <button class="btn primary" disabled={!valid} onclick={save}>Add card</button>
    </footer>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; background: rgb(0 0 0 / 0.28); }
  .dialog {
    width: min(520px, calc(100vw - 32px));
    display: grid;
    gap: 12px;
    padding: 18px;
    background: var(--surface);
    border-radius: 14px;
    box-shadow: var(--pop-shadow);
  }
  header { display: flex; align-items: baseline; gap: 10px; }
  h2 { font-size: 16px; margin: 0; }
  .types { display: flex; gap: 4px; }
  .types button { border: 1px solid var(--border); padding: 4px 14px; }
  .types button.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); font-weight: 600; }
  label { display: grid; gap: 4px; font-size: 12.5px; }
  textarea { resize: vertical; font-size: 14px; }
  .row { display: flex; align-items: center; gap: 10px; }
  .preview { margin: 0; font-size: 13px; }
  .preview :global(.cloze-gap) { color: var(--accent); font-weight: 600; }
  footer { display: flex; justify-content: flex-end; gap: 8px; }
</style>
