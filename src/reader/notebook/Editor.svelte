<script lang="ts">
  import { onMount } from 'svelte';
  import type { NotebookEditor } from './cm';
  import type { NotebookDoc } from './doc.svelte';
  import type { NotebookHost } from './host.svelte';

  let { doc, host, autoLinks, autofocus = false }: { doc: NotebookDoc; host: NotebookHost; autoLinks: boolean; autofocus?: boolean } = $props();

  let el: HTMLDivElement;
  let editor = $state.raw<NotebookEditor | null>(null);
  let failed = $state('');

  onMount(() => {
    let ed: NotebookEditor | null = null;
    let dead = false;
    import('./cm').then(({ createEditor }) => {
      if (dead) return;
      ed = createEditor(el, doc.markdown, {
        host,
        pdfName: doc.pdfName,
        autoLinks: () => autoLinks,
        onChange: (t) => doc.edit(t),
        onBlur: () => void doc.flush(),
      });
      editor = ed;
      if (autofocus) ed.focus();
    }, (e: unknown) => (failed = String(e)));
    return () => {
      dead = true;
      ed?.destroy();
    };
  });

  $effect(() => {
    editor?.setText(doc.markdown);
  });
</script>

<div class="cm-host" bind:this={el} data-testid="notebook-editor">
  {#if failed}<p class="muted">Could not load the editor: {failed}</p>{/if}
</div>

<style>
  .cm-host { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--surface); }
  .cm-host :global(.cm-editor) { flex: 1; min-height: 0; font: 13px/1.6 var(--mono); }
  .cm-host :global(.cm-editor.cm-focused) { outline: none; }
  .cm-host :global(.cm-scroller) { overflow: auto; font-family: inherit; line-height: inherit; }
  .cm-host :global(.cm-content) { padding: 12px 0; caret-color: var(--text); }
  .cm-host :global(.cm-line) { padding: 0 12px; }
  .cm-host :global(.cm-cursor) { border-left-color: var(--text); }
  .cm-host :global(.cm-selectionBackground) { background: var(--accent-soft) !important; }
  .cm-host :global(.cm-placeholder) { color: var(--muted); }
  .cm-host :global(.cm-plink) {
    font: 600 11px var(--font);
    padding: 1px 7px;
    margin: 0 1px;
    border-radius: 10px;
    background: var(--accent-soft);
    color: var(--accent);
    cursor: pointer;
    white-space: nowrap;
    vertical-align: 1px;
  }
  .cm-host :global(.cm-plink:hover) { background: var(--accent); color: var(--accent-text); }
  :global(.cm-tooltip.cm-tooltip-autocomplete) {
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: var(--pop-shadow);
    overflow: hidden;
    font: 12.5px var(--font);
  }
  :global(.cm-tooltip-autocomplete > ul) { max-height: 18em; max-width: min(460px, 90vw); }
  :global(.cm-tooltip-autocomplete > ul > li) { padding: 3px 10px !important; }
  :global(.cm-tooltip-autocomplete > ul > li[aria-selected]) { background: var(--accent-soft) !important; color: var(--text) !important; }
  :global(.cm-tooltip-autocomplete completion-section) {
    display: block;
    padding: 5px 10px 2px;
    font-size: 10.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    border-bottom: none;
  }
  :global(.cm-completionDetail) { margin-left: 10px; font-style: normal; color: var(--muted); }
</style>
