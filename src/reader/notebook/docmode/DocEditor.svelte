<script lang="ts" module>
  const ICONS = {
    bold: 'M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z',
    italic: 'M10 5h8M6 19h8M14 5l-4 14',
    strike: 'M5 12h14M16 6.5A4 4 0 0 0 12 5c-2.5 0-4 1.3-4 3 0 3.5 8 2.5 8 7 0 1.9-1.8 3-4 3a4.5 4.5 0 0 1-4.3-2.5',
    highlight: 'M9 11l-5 5v3h3l5-5M9 11l6-6 4 4-6 6M9 11l4 4M14 20h7',
    code: 'M9 7l-5 5 5 5M15 7l5 5-5 5',
    bullets: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
    numbers: 'M10 6h10M10 12h10M10 18h10M4 5l1.5-1v5M4 14.5a1.5 1.5 0 0 1 3 0c0 1.5-3 2-3 3.5h3',
    task: 'M4 5h5v5H4zM4 15l2 2 3-4M13 7h7M13 16h7',
    quote: 'M7 7h4v4c0 3-1.5 5-4 6M14 7h4v4c0 3-1.5 5-4 6',
    page: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
    image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15.5 9.5h.01',
    formula: 'M18 5H7l6 7-6 7h11',
    undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
    redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
    rowAbove: 'M4 12h16v7H4zM12 3v6M9 6h6',
    rowBelow: 'M4 5h16v7H4zM12 15v6M9 18h6',
    colLeft: 'M12 4h7v16h-7zM3 12h6M6 9v6',
    colRight: 'M5 4h7v16H5zM15 12h6M18 9v6',
    delRow: 'M4 8h16v8H4zM9 12h6',
    delCol: 'M8 4h8v16H8zM12 9v6',
    delTable: 'M4 5h16v14H4zM9 9l6 6M15 9l-6 6',
  } as const;
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import type { Editor } from '@tiptap/core';
  import type { NotebookDoc } from '../doc.svelte';
  import type { NotebookHost } from '../host.svelte';
  import { createDocEditor, type DocEditor } from './editor';

  let { doc, host, autoLinks, autofocus = false }: { doc: NotebookDoc; host: NotebookHost; autoLinks: boolean; autofocus?: boolean } = $props();

  let el: HTMLDivElement;
  let picker: HTMLInputElement;
  let api = $state.raw<DocEditor | null>(null);
  let tick = $state(0);

  onMount(() => {
    const ed = createDocEditor(el, doc.markdown, {
      host,
      pdfName: () => doc.pdfName,
      autoLinks: () => autoLinks,
      files: () => doc.files,
      onChange: (t) => doc.edit(t),
      onBlur: () => void doc.flush(),
    });
    const bump = () => tick++;
    ed.editor.on('transaction', bump);
    api = ed;
    if (autofocus) ed.focus();
    return () => {
      ed.editor.off('transaction', bump);
      ed.destroy();
    };
  });

  $effect(() => {
    api?.setText(doc.markdown);
  });

  type Chain = ReturnType<Editor['chain']>;
  const run = (f: (c: Chain) => Chain) => api && f(api.editor.chain().focus()).run();
  const active = (name: string, attrs?: Record<string, unknown>) => (void tick, api?.editor.isActive(name, attrs) ?? false);
  const can = (f: (c: ReturnType<Editor['can']>) => boolean) => (void tick, api ? f(api.editor.can()) : false);

  const block = $derived.by(() => {
    void tick;
    const e = api?.editor;
    if (!e) return 'p';
    for (let l = 1; l <= 6; l++) if (e.isActive('heading', { level: l })) return `h${l}`;
    return 'p';
  });
  const inTable = $derived((void tick, api?.editor.isActive('table') ?? false));

  function setBlock(v: string) {
    if (v === 'p') run((c) => c.setParagraph());
    else run((c) => c.setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6 }));
  }

  function pickImages(e: Event & { currentTarget: HTMLInputElement }) {
    const files = [...(e.currentTarget.files ?? [])];
    e.currentTarget.value = '';
    if (files.length) void api?.insertImages(files);
  }

  type Btn = { icon: keyof typeof ICONS; title: string; on?: () => boolean; run: () => unknown; disabled?: () => boolean; testid?: string };
  const groups: Btn[][] = [
    [
      { icon: 'bold', title: 'Bold (Ctrl+B)', on: () => active('bold'), run: () => run((c) => c.toggleBold()) },
      { icon: 'italic', title: 'Italic (Ctrl+I)', on: () => active('italic'), run: () => run((c) => c.toggleItalic()) },
      { icon: 'strike', title: 'Strikethrough (Ctrl+Shift+X)', on: () => active('strike'), run: () => run((c) => c.toggleStrike()) },
      { icon: 'highlight', title: 'Highlight (Ctrl+Shift+H)', on: () => active('highlight'), run: () => run((c) => c.toggleHighlight()) },
      { icon: 'code', title: 'Code (Ctrl+E)', on: () => active('code'), run: () => run((c) => c.toggleCode()) },
    ],
    [
      { icon: 'bullets', title: 'Bulleted list', on: () => active('bulletList'), run: () => run((c) => c.toggleBulletList()) },
      { icon: 'numbers', title: 'Numbered list', on: () => active('orderedList'), run: () => run((c) => c.toggleOrderedList()) },
      { icon: 'task', title: 'Checklist (Ctrl+Enter ticks)', on: () => active('taskList'), run: () => run((c) => c.toggleTaskList()) },
      { icon: 'quote', title: 'Quote', on: () => active('blockquote'), run: () => run((c) => c.toggleBlockquote()) },
    ],
    [
      { icon: 'page', title: 'Link the page you are reading (Ctrl+L)', run: () => api?.insertPageLink(), disabled: () => host.context.page === null, testid: 'doc-link-page' },
      { icon: 'table', title: 'Insert a table', run: () => run((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true })), disabled: () => inTable, testid: 'doc-table' },
      { icon: 'image', title: 'Insert an image', run: () => picker.click(), testid: 'doc-image' },
      { icon: 'formula', title: 'Insert a formula (Ctrl+M)', run: () => api?.insertFormula(), testid: 'doc-formula' },
    ],
    [
      { icon: 'undo', title: 'Undo (Ctrl+Z)', run: () => run((c) => c.undo()), disabled: () => !can((c) => c.undo()) },
      { icon: 'redo', title: 'Redo (Ctrl+Y)', run: () => run((c) => c.redo()), disabled: () => !can((c) => c.redo()) },
    ],
  ];
  const tableBtns: Btn[] = [
    { icon: 'rowAbove', title: 'Add a row above', run: () => run((c) => c.addRowBefore()) },
    { icon: 'rowBelow', title: 'Add a row below', run: () => run((c) => c.addRowAfter()), testid: 'table-row-below' },
    { icon: 'colLeft', title: 'Add a column to the left', run: () => run((c) => c.addColumnBefore()) },
    { icon: 'colRight', title: 'Add a column to the right', run: () => run((c) => c.addColumnAfter()), testid: 'table-col-right' },
    { icon: 'delRow', title: 'Delete this row', run: () => run((c) => c.deleteRow()), testid: 'table-del-row' },
    { icon: 'delCol', title: 'Delete this column', run: () => run((c) => c.deleteColumn()), testid: 'table-del-col' },
    { icon: 'delTable', title: 'Delete the table', run: () => run((c) => c.deleteTable()), testid: 'table-delete' },
  ];
</script>

{#snippet button(b: Btn)}
  <button
    type="button"
    class:on={b.on?.()}
    aria-pressed={b.on ? b.on() : undefined}
    disabled={b.disabled?.() ?? false}
    title={b.title}
    aria-label={b.title}
    onmousedown={(e) => e.preventDefault()}
    onclick={() => b.run()}
    data-testid={b.testid}
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={ICONS[b.icon]} /></svg>
  </button>
{/snippet}

<div class="doc-editor">
  <div class="bar" role="toolbar" aria-label="Formatting" data-testid="doc-toolbar">
    <select aria-label="Text style" value={block} onchange={(e) => setBlock(e.currentTarget.value)} data-testid="doc-block">
      <option value="p">Normal text</option>
      <option value="h1">Title</option>
      <option value="h2">Heading</option>
      <option value="h3">Subheading</option>
      <option value="h4">Heading 4</option>
      <option value="h5">Heading 5</option>
      <option value="h6">Heading 6</option>
    </select>
    {#each groups as g, i (i)}
      <span class="group">{#each g as b (b.icon)}{@render button(b)}{/each}</span>
    {/each}
    <input bind:this={picker} type="file" accept="image/*" multiple hidden onchange={pickImages} />
  </div>
  {#if inTable}
    <div class="bar table-bar" role="toolbar" aria-label="Table" data-testid="table-toolbar">
      <span class="label">Table</span>
      <span class="group">{#each tableBtns as b (b.icon)}{@render button(b)}{/each}</span>
    </div>
  {/if}
  <div class="surface scroll-thin" bind:this={el} data-testid="doc-editor"></div>
</div>

<style>
  .doc-editor { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--surface); }
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 6px; padding: 4px 8px; border-bottom: 1px solid var(--border); background: var(--surface); }
  .table-bar { background: var(--surface-2); }
  .label { font-size: 11.5px; color: var(--muted); }
  .group { display: inline-flex; gap: 1px; }
  .group + .group { padding-left: 6px; border-left: 1px solid var(--border); }
  select { font-size: 12px; padding: 2px 4px; max-width: 128px; }
  button { display: inline-flex; padding: 4px; color: var(--muted); border-radius: 5px; }
  button.on { color: var(--accent); background: var(--accent-soft); }
  button:disabled { opacity: 0.4; }
  .surface { flex: 1; min-height: 0; overflow: auto; }
  .surface :global(.ProseMirror) { min-height: 100%; padding: 10px 16px 40vh; outline: none; font-family: var(--font); caret-color: var(--text); }
  .surface :global(.ProseMirror > :first-child) { margin-top: 0; }
  .surface :global(p.is-editor-empty:first-child::before) { content: attr(data-placeholder); color: var(--muted); float: left; height: 0; pointer-events: none; }
  .surface :global(ul[data-type='taskList']) { list-style: none; padding-left: 0.3em; }
  .surface :global(ul[data-type='taskList'] li) { display: flex; gap: 6px; align-items: flex-start; }
  .surface :global(ul[data-type='taskList'] li > label) { flex: none; margin-top: 0.2em; }
  .surface :global(ul[data-type='taskList'] li > div) { flex: 1; min-width: 0; }
  .surface :global(ul[data-type='taskList'] li[data-checked='true'] > div) { color: var(--muted); text-decoration: line-through; }
  .surface :global(.doc-math) { cursor: pointer; border-radius: 3px; }
  .surface :global(.doc-math:hover) { background: var(--accent-soft); }
  .surface :global(.ProseMirror-selectednode) { outline: 2px solid var(--accent); outline-offset: 1px; }
  .surface :global(table) { table-layout: fixed; width: 100%; }
  .surface :global(td p), .surface :global(th p) { margin: 0; }
  .surface :global(.selectedCell) { background: var(--accent-soft); }
  .surface :global(.doc-img) { max-height: 60vh; }
  :global(.doc-link-menu) { position: fixed; z-index: 1000; }
  :global(.doc-link-menu ul) { margin: 0; padding: 0; list-style: none; overflow-y: auto; }
  :global(.doc-link-menu li) { cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
