<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../../components/Icon.svelte';
  import '../../styles/notes.css';
  import { hydrateNotes } from '../../lib/hydrate';
  import { renderMarkdown } from '../../lib/notebook';
  import type { NotebookDoc } from './doc.svelte';
  import type { NotebookHost } from './host.svelte';
  import type { EditorMode } from '../../lib/types';
  import Editor from './Editor.svelte';
  import FormulaDialog from './FormulaDialog.svelte';

  let {
    doc, host, autoLinks, onAutoLinks, editorMode, onEditorMode, actions, autofocus = false,
  }: {
    doc: NotebookDoc;
    host: NotebookHost;
    autoLinks: boolean;
    /** Absent where there is no page being read to link, as in a standalone note. */
    onAutoLinks?: (on: boolean) => void;
    editorMode: EditorMode;
    onEditorMode: (m: EditorMode) => void;
    actions?: Snippet;
    autofocus?: boolean;
  } = $props();

  let markdownEditor: Editor | undefined = $state();
  /** Document mode and everything it needs load on first use. */
  let docEditor: ReturnType<typeof loadDocEditor> | null = null;
  const loadDocEditor = () => import('./docmode/DocEditor.svelte');
  const docEditorModule = () => (docEditor ??= loadDocEditor());

  type Mode = 'write' | 'both' | 'preview';
  let mode = $state<Mode>('write');
  const html = $derived(renderMarkdown(doc.markdown));

  function hydrate(node: HTMLElement, html: string) {
    void hydrateNotes(node, doc.files);
    return { update: () => void hydrateNotes(node, doc.files) };
  }

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
    <div class="modes kind" role="radiogroup" aria-label="Editing mode">
      {#each [['document', 'Document', 'Edit like a document: formatting shows as you write'], ['markdown', 'Markdown', 'Edit the Markdown source']] as [m, label, title] (m)}
        <button role="radio" aria-checked={editorMode === m} class:on={editorMode === m} {title} onclick={() => onEditorMode(m as EditorMode)} data-testid="editor-mode-{m}">{label}</button>
      {/each}
    </div>
    {#if editorMode === 'markdown' && mode !== 'preview'}<button
      class="toggle"
      title="Line up the pipes of the table at the cursor (Alt+Shift+F)"
      onclick={() => markdownEditor?.formatTable()}
      data-testid="format-table"
    >Format table</button>{/if}
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
    {#if editorMode === 'document'}
      {#await docEditorModule()}
        <div class="loading muted">Loading the editor…</div>
      {:then m}
        <m.default {doc} {host} {autoLinks} {autofocus} />
      {:catch e}
        <p class="muted">Could not load the editor: {String(e)}</p>
      {/await}
    {:else}
      <Editor bind:this={markdownEditor} {doc} {host} {autoLinks} {autofocus} />
    {/if}
  {/if}
  {#if mode !== 'write'}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="preview notes-html scroll-thin" onclick={onPreviewClick} use:hydrate={html} data-testid="notebook-preview">
      {#if doc.markdown.trim()}{@html html}{:else}<p class="muted">Nothing here yet. Type <code>[[</code> to link a page or section.</p>{/if}
    </div>
  {/if}
</div>
<FormulaDialog />

<style>
  .notebook { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .head { position: relative; display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .modes { display: flex; gap: 2px; margin-right: auto; }
  .head button { font-size: 12px; padding: 3px 8px; color: var(--muted); }
  .modes button.on { background: var(--surface-2); color: var(--text); }
  .toggle { display: inline-flex; align-items: center; gap: 4px; }
  .toggle.on { color: var(--accent); background: var(--accent-soft); }
  code { font: 11px var(--mono); }
  [data-mode='both'] :global(.cm-host), [data-mode='both'] :global(.doc-editor) { flex: 1 1 50%; border-bottom: 1px solid var(--border); }
  .kind { margin-right: 0; }
  .loading { flex: 1; padding: 12px; font-size: 12px; }
  .preview { flex: 1 1 50%; min-height: 0; overflow: auto; padding: 4px 14px 14px; }
</style>
