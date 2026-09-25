<script lang="ts">
  import { renderMarkdown } from '../lib/notebook';
  import type { Reader } from './session.svelte';

  let { reader }: { reader: Reader } = $props();
  const study = $derived(reader.study);

  type Mode = 'write' | 'both' | 'preview';
  let mode = $state<Mode>('both');
  const html = $derived(renderMarkdown(study.markdown));

  function onPreviewClick(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a');
    if (!a) return;
    e.preventDefault();
    const page = a.dataset.page;
    if (page) reader.jump({ page: Number(page), y: 0 });
    else if (/^https?:/i.test(a.href)) window.open(a.href, '_blank', 'noopener');
  }
</script>

<div class="notebook" data-mode={mode}>
  <div class="modes" role="tablist">
    {#each [['write', 'Write'], ['both', 'Split'], ['preview', 'Preview']] as [m, label] (m)}
      <button role="tab" aria-selected={mode === m} class:on={mode === m} onclick={() => (mode = m as Mode)}>{label}</button>
    {/each}
    <span class="hint muted">Link pages with <code>[[p12]]</code></span>
  </div>
  {#if mode !== 'preview'}
    <textarea
      class="editor scroll-thin"
      value={study.markdown}
      oninput={(e) => study.setMarkdown(e.currentTarget.value)}
      onblur={() => study.saveNotebook()}
      placeholder={'# Notes\n\nWrite in Markdown. Quote a selection or annotation to add it here with a link back to its page.'}
      spellcheck="true"
      aria-label="Notebook"
      data-testid="notebook-editor"
    ></textarea>
  {/if}
  {#if mode !== 'write'}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="preview scroll-thin" onclick={onPreviewClick} data-testid="notebook-preview">
      {#if study.markdown.trim()}{@html html}{:else}<p class="muted">Nothing here yet.</p>{/if}
    </div>
  {/if}
</div>

<style>
  .notebook { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .modes { display: flex; align-items: center; gap: 2px; padding: 6px 8px; border-bottom: 1px solid var(--border); }
  .modes button { font-size: 12px; padding: 3px 8px; color: var(--muted); }
  .modes button.on { background: var(--surface-2); color: var(--text); }
  .hint { margin-left: auto; font-size: 11px; }
  code { font: 11px var(--mono); }
  .editor {
    flex: 1;
    min-height: 0;
    resize: none;
    border: none;
    border-radius: 0;
    padding: 12px;
    font: 13px/1.55 var(--mono);
    background: var(--surface);
  }
  .editor:focus-visible { outline: none; }
  [data-mode='both'] .editor { flex: 1 1 50%; border-bottom: 1px solid var(--border); }
  .preview { flex: 1 1 50%; min-height: 0; overflow: auto; padding: 4px 14px 14px; font-size: 13.5px; line-height: 1.6; }
  .preview :global(blockquote) { margin: 10px 0; padding: 2px 12px; border-left: 3px solid var(--accent); color: var(--text); background: var(--surface-2); border-radius: 0 6px 6px 0; }
  .preview :global(h1) { font-size: 18px; }
  .preview :global(h2) { font-size: 16px; }
  .preview :global(h3) { font-size: 14px; }
  .preview :global(.plink) {
    font-size: 11px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 10px;
    background: var(--accent-soft);
    color: var(--accent);
    text-decoration: none;
    white-space: nowrap;
  }
  .preview :global(code) { background: var(--surface-2); padding: 0 4px; border-radius: 4px; }
</style>
