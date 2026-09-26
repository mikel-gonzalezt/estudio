<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../../components/Icon.svelte';
  import { renderMarkdown } from '../../lib/notebook';
  import type { NotebookDoc } from './doc.svelte';
  import type { NotebookHost } from './host.svelte';
  import Editor from './Editor.svelte';

  let {
    doc, host, autoLinks, onAutoLinks, actions, autofocus = false,
  }: {
    doc: NotebookDoc;
    host: NotebookHost;
    autoLinks: boolean;
    /** Absent where there is no page being read to link, as in a standalone note. */
    onAutoLinks?: (on: boolean) => void;
    actions?: Snippet;
    autofocus?: boolean;
  } = $props();

  type Mode = 'write' | 'both' | 'preview';
  let mode = $state<Mode>('write');
  const html = $derived(renderMarkdown(doc.markdown));

  function onPreviewClick(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a');
    if (!a) return;
    e.preventDefault();
    const page = a.dataset.page;
    if (page) host.follow({ page: Number(page), file: a.dataset.file ?? null });
    else if (/^https?:/i.test(a.href)) window.open(a.href, '_blank', 'noopener');
  }
</script>

<div class="notebook" data-mode={mode}>
  <div class="head">
    <div class="modes" role="tablist">
      {#each [['write', 'Write'], ['both', 'Split'], ['preview', 'Preview']] as [m, label] (m)}
        <button role="tab" aria-selected={mode === m} class:on={mode === m} onclick={() => (mode = m as Mode)}>{label}</button>
      {/each}
    </div>
    {#if onAutoLinks}<button
      class="toggle"
      class:on={autoLinks}
      aria-pressed={autoLinks}
      title="Auto page links: a new paragraph starts with a link to the page you are reading when that page changed"
      onclick={() => onAutoLinks(!autoLinks)}
      data-testid="auto-links"
    ><Icon name="link" size={14} /><span>Auto links</span></button>{/if}
    {@render actions?.()}
  </div>
  {#if mode !== 'preview'}
    <Editor {doc} {host} {autoLinks} {autofocus} />
  {/if}
  {#if mode !== 'write'}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="preview scroll-thin" onclick={onPreviewClick} data-testid="notebook-preview">
      {#if doc.markdown.trim()}{@html html}{:else}<p class="muted">Nothing here yet. Type <code>[[</code> to link a page or section.</p>{/if}
    </div>
  {/if}
</div>

<style>
  .notebook { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .head { position: relative; display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .modes { display: flex; gap: 2px; margin-right: auto; }
  .head button { font-size: 12px; padding: 3px 8px; color: var(--muted); }
  .modes button.on { background: var(--surface-2); color: var(--text); }
  .toggle { display: inline-flex; align-items: center; gap: 4px; }
  .toggle.on { color: var(--accent); background: var(--accent-soft); }
  code { font: 11px var(--mono); }
  [data-mode='both'] :global(.cm-host) { flex: 1 1 50%; border-bottom: 1px solid var(--border); }
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
  .preview :global(mark) { background: color-mix(in srgb, #f5d000 40%, transparent); color: inherit; border-radius: 2px; padding: 0 1px; }
  .preview :global(code) { background: var(--surface-2); padding: 0 4px; border-radius: 4px; }
</style>
