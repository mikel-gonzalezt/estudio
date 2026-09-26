import { Editor, Extension } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { quoteBlock, QUOTE_MIME, type QuoteDrag } from '../../../lib/notebook';
import { formatPageLink, isFirstKeystroke, pageLinkAtStart } from '../../../lib/pagelink';
import { formula, type Formula } from '../formula.svelte';
import { GROUP_NAMES, imageFiles, LINK_QUERY, linkOptions, type EditorHooks, type LinkOption, type NotebookEditor } from '../links';
import { DocMarkdown, type Parsed } from './markdown';
import { docExtensions, type DocViews } from './schema';

export interface DocEditor extends NotebookEditor {
  readonly editor: Editor;
  insertPageLink(): boolean;
  insertImages(files: File[]): Promise<void>;
  insertFormula(): void;
  toggleTask(): boolean;
}

const REMOTE = 'estudio-remote';

/** The page link node attributes for a new link, written by the one link writer so both modes agree. */
function linkAttrs(page: number, label: string | undefined, pdfName: string | undefined) {
  const l = pageLinkAtStart(formatPageLink(page, label, pdfName))!;
  return { page: l.page, file: l.file, label: l.label };
}

/** Page of the last page link before `pos`, as `pageAbove` reads Markdown. */
function pageAbove(doc: PMNode, pos: number): number | null {
  let page: number | null = null;
  doc.nodesBetween(0, pos, (n) => {
    if (n.type.name === 'pageLink') page = n.attrs.page as number;
  });
  return page;
}

const inQuote = ($pos: ResolvedPos) => {
  for (let d = $pos.depth; d > 0; d--) if ($pos.node(d).type.name === 'blockquote') return true;
  return false;
};

const cellDepth = ($pos: ResolvedPos) => {
  for (let d = $pos.depth; d > 0; d--) if (/^table(Cell|Header)$/.test($pos.node(d).type.name)) return d;
  return -1;
};

/** The popup of `[[` link suggestions, drawn over the page like CodeMirror's. */
class LinkMenu {
  readonly el = document.createElement('div');
  options: LinkOption[] = [];
  active = 0;
  from = 0;
  dismissedAt = -1;

  constructor(readonly pick: (o: LinkOption) => void) {
    this.el.className = 'cm-tooltip cm-tooltip-autocomplete doc-link-menu';
    this.el.hidden = true;
    this.el.addEventListener('mousedown', (e) => {
      const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-i]');
      if (!li) return;
      e.preventDefault();
      this.pick(this.options[Number(li.dataset.i)]!);
    });
    document.body.append(this.el);
  }

  get open() {
    return !this.el.hidden;
  }

  show(view: EditorView, from: number, options: LinkOption[]) {
    if (!options.length) return this.hide();
    const same = this.open && this.from === from && options.length === this.options.length;
    this.from = from;
    this.options = options;
    if (!same) this.active = 0;
    this.render();
    const at = view.coordsAtPos(view.state.selection.from);
    this.el.hidden = false;
    this.el.style.left = `${Math.min(at.left, window.innerWidth - this.el.offsetWidth - 8)}px`;
    this.el.style.top = `${at.bottom + 4}px`;
  }

  render() {
    let group = '';
    const items: string[] = [];
    this.options.forEach((o, i) => {
      if (o.group !== group) {
        group = o.group;
        items.push(`<completion-section>${GROUP_NAMES[o.group]}</completion-section>`);
      }
      const label = o.label.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`);
      items.push(`<li data-i="${i}"${i === this.active ? ' aria-selected="true"' : ''}><span class="cm-completionLabel">${label}</span>${o.detail ? `<span class="cm-completionDetail">${o.detail}</span>` : ''}</li>`);
    });
    this.el.innerHTML = `<ul role="listbox">${items.join('')}</ul>`;
    this.el.querySelector('[aria-selected]')?.scrollIntoView({ block: 'nearest' });
  }

  move(d: number) {
    this.active = (this.active + d + this.options.length) % this.options.length;
    this.render();
  }

  hide() {
    this.el.hidden = true;
  }

  destroy() {
    this.el.remove();
  }
}

export function createDocEditor(parent: HTMLElement, text: string, hooks: EditorHooks): DocEditor {
  const { host } = hooks;
  let editor!: Editor;
  let md!: DocMarkdown;
  let parsed!: Parsed;
  let current = text;

  const views: DocViews = {
    files: hooks.files,
    follow: (t) => host.follow(t),
    editMath: (pos) => void editMathAt(pos),
  };

  const linkNode = (page: number, label?: string) =>
    editor.schema.nodes.pageLink!.create(linkAttrs(page, label, hooks.pdfName()));

  const menu = new LinkMenu((o) => applyLink(o));

  function linkQuery(state: EditorState): { from: number; text: string } | null {
    const { $from, empty } = state.selection;
    if (!empty || !$from.parent.isTextblock) return null;
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
    const m = LINK_QUERY.exec(before);
    return m ? { from: $from.pos - m[0].length, text: m[0].slice(2) } : null;
  }

  function applyLink(o: LinkOption) {
    const { state } = editor;
    const q = linkQuery(state);
    if (!q) return menu.hide();
    const to = state.selection.from;
    const end = state.doc.textBetween(to, Math.min(to + 2, state.doc.content.size), undefined, '￼') === ']]' ? to + 2 : to;
    editor.view.dispatch(state.tr.replaceWith(q.from, end, linkNode(o.page, o.linkLabel)).scrollIntoView());
    menu.hide();
    editor.view.focus();
  }

  function refreshMenu(view: EditorView) {
    const q = linkQuery(view.state);
    if (!q || q.from === menu.dismissedAt) return menu.hide();
    menu.show(view, q.from, linkOptions(host.context, q.text));
  }

  function insertPageLink(): boolean {
    const { page } = host.context;
    if (page === null) return false;
    const { state } = editor;
    const { $from } = state.selection;
    const prev = $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset, undefined, '￼');
    const nodes = [...(prev && !/\s/.test(prev) ? [state.schema.text(' ')] : []), linkNode(page), state.schema.text(' ')];
    const tr = state.tr.deleteSelection();
    editor.view.dispatch(tr.insert(tr.selection.from, nodes).scrollIntoView());
    return true;
  }

  function enterWithLink(): boolean {
    const { state } = editor;
    const { $from, empty } = state.selection;
    const page = host.context.page;
    const atEnd = $from.parentOffset === $from.parent.content.size;
    const fire = page !== null && hooks.autoLinks() && empty && $from.parent.isTextblock && $from.parent.content.size > 0 && atEnd
      && !inQuote($from) && cellDepth($from) === -1 && $from.parent.type.name !== 'codeBlock';
    if (!fire) return false;
    const ok = editor.commands.first(({ commands }) => [
      () => commands.splitListItem('taskItem'),
      () => commands.splitListItem('listItem'),
      () => commands.splitBlock(),
    ]);
    if (!ok) return false;
    const s = editor.state;
    if (pageAbove(s.doc, s.selection.from) !== page) {
      editor.view.dispatch(s.tr.insert(s.selection.from, [linkNode(page), s.schema.text(' ')]).setMeta('autolink', true));
    }
    return true;
  }

  function enterInTable(): boolean {
    const { state } = editor;
    const $from = state.selection.$from;
    const d = cellDepth($from);
    if (d === -1) return false;
    const col = $from.index(d - 1);
    const row = $from.index(d - 2);
    const tablePos = $from.before(d - 2);
    if (row === $from.node(d - 2).childCount - 1) editor.commands.addRowAfter();
    const table = editor.state.doc.nodeAt(tablePos)!;
    let pos = tablePos + 1;
    for (let r = 0; r <= row; r++) pos += table.child(r).nodeSize;
    const next = table.child(row + 1);
    pos += 1;
    for (let c = 0; c < Math.min(col, next.childCount - 1); c++) pos += next.child(c).nodeSize;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(pos + 2))).scrollIntoView());
    return true;
  }

  function toggleTask(): boolean {
    const { $from } = editor.state.selection;
    for (let d = $from.depth; d > 0; d--) {
      const n = $from.node(d);
      if (n.type.name === 'taskItem') {
        editor.view.dispatch(editor.state.tr.setNodeMarkup($from.before(d), undefined, { ...n.attrs, checked: !n.attrs.checked }));
        return true;
      }
    }
    return editor.chain().focus().toggleTaskList().run();
  }

  async function insertImages(files: File[], at?: number) {
    try {
      const refs = await Promise.all(files.map((f) => hooks.files().save(f)));
      const { state } = editor;
      const nodes = refs.map((src) => state.schema.nodes.image!.create({ src, alt: '' }));
      const tr = state.tr;
      if (at === undefined) tr.deleteSelection();
      editor.view.dispatch(tr.insert(at ?? tr.selection.from, nodes).scrollIntoView());
      editor.view.focus();
    } catch (err) {
      alert(`The image could not be saved: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function editMathAt(pos: number) {
    const node = editor.state.doc.nodeAt(pos);
    if (!node || !/^(inline|block)Math$/.test(node.type.name)) return;
    const f = await formula.edit({ latex: node.attrs.latex as string, display: node.type.name === 'blockMath' });
    if (f) replaceMath(pos, node, f);
    editor.view.focus();
  }

  function replaceMath(pos: number, node: PMNode | null, f: Formula) {
    const { state } = editor;
    const type = f.display ? state.schema.nodes.blockMath! : state.schema.nodes.inlineMath!;
    const math = type.create({ latex: f.latex });
    if (node && node.type === type) {
      editor.view.dispatch(state.tr.setNodeMarkup(pos, undefined, { latex: f.latex }));
      return;
    }
    const tr = node ? state.tr.delete(pos, pos + node.nodeSize) : state.tr.deleteSelection();
    if (f.display) {
      const $at = tr.doc.resolve(tr.mapping.map(node ? pos : state.selection.from));
      const blockEnd = $at.depth ? $at.after(1) : $at.pos;
      tr.insert(blockEnd, math);
    } else tr.replaceSelectionWith(math, false);
    editor.view.dispatch(tr.scrollIntoView());
  }

  function insertFormula() {
    const { state } = editor;
    const sel = state.selection;
    const latex = state.doc.textBetween(sel.from, sel.to, ' ');
    void formula.edit({ latex, display: false }).then((f) => {
      if (f) replaceMath(sel.from, null, f);
      editor.view.focus();
    });
  }

  const keys = Extension.create({
    name: 'estudioKeys',
    priority: 1000,
    addKeyboardShortcuts: () => ({
      Enter: () => {
        if (menu.open) {
          applyLink(menu.options[menu.active]!);
          return true;
        }
        return enterInTable() || enterWithLink();
      },
      Tab: () => {
        if (!menu.open) return false;
        applyLink(menu.options[menu.active]!);
        return true;
      },
      ArrowDown: () => (menu.open ? (menu.move(1), true) : false),
      ArrowUp: () => (menu.open ? (menu.move(-1), true) : false),
      Escape: () => {
        if (!menu.open) return false;
        menu.dismissedAt = menu.from;
        menu.hide();
        return true;
      },
      'Mod-l': () => insertPageLink(),
      'Mod-Shift-x': () => editor.commands.toggleStrike(),
      'Mod-Enter': () => toggleTask(),
      'Mod-m': () => (insertFormula(), true),
    }),
    addProseMirrorPlugins: () => [
      new Plugin({
        key: new PluginKey('estudioLinkMenu'),
        view: () => ({ update: (view) => refreshMenu(view), destroy: () => menu.destroy() }),
      }),
    ],
  });

  const extensions = [
    ...docExtensions(views),
    Placeholder.configure({
      placeholder: host.context.page === null
        ? 'Write your notes here. Type [[ to link a page of a PDF in the vault.'
        : 'Write your notes here. Type [[ to link a page, or press Ctrl+L to link the page you are reading.',
    }),
    keys,
  ];

  editor = new Editor({
    element: parent,
    extensions,
    editorProps: {
      attributes: { class: 'notes-html doc-content', 'aria-label': 'Notebook', spellcheck: 'true' },
      handleTextInput(view, from, to, typed) {
        const { page } = host.context;
        const { doc } = view.state;
        const empty = doc.childCount === 1 && doc.firstChild!.type.name === 'paragraph' && doc.firstChild!.content.size === 0;
        if (page === null || !hooks.autoLinks() || !empty || !isFirstKeystroke(0, 'input.type', typed)) return false;
        view.dispatch(view.state.tr.replaceWith(from, to, [linkNode(page), view.state.schema.text(` ${typed}`)]));
        return true;
      },
      handlePaste(_view, e) {
        const files = imageFiles(e.clipboardData);
        if (!files.length) return false;
        e.preventDefault();
        void insertImages(files);
        return true;
      },
      handleDrop(view, e) {
        const dt = (e as DragEvent).dataTransfer;
        const at = view.posAtCoords({ left: (e as DragEvent).clientX, top: (e as DragEvent).clientY })?.pos ?? view.state.doc.content.size;
        const files = imageFiles(dt);
        if (files.length) {
          e.preventDefault();
          void insertImages(files, at);
          return true;
        }
        const raw = dt?.getData(QUOTE_MIME);
        if (!raw) return false;
        e.preventDefault();
        const q = JSON.parse(raw) as QuoteDrag;
        const $at = view.state.doc.resolve(at);
        const blockAt = $at.depth ? ($at.parentOffset === 0 && $at.depth === 1 ? $at.before(1) : $at.after(1)) : at;
        view.dispatch(view.state.tr.insert(blockAt, md.fragment(quoteBlock(q.text, q.page, hooks.pdfName()))).scrollIntoView());
        view.focus();
        return true;
      },
      handleDOMEvents: {
        dragover(_view, e) {
          if (!e.dataTransfer?.types.includes(QUOTE_MIME) && !e.dataTransfer?.types.includes('Files')) return false;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          return true;
        },
      },
    },
  });

  md = new DocMarkdown(editor.extensionManager.extensions, editor.schema);
  parsed = md.parse(text);
  editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, parsed.doc.content).setMeta('addToHistory', false).setMeta(REMOTE, true));

  editor.on('update', ({ transaction }) => {
    if (transaction.getMeta(REMOTE)) return;
    const out = md.serialize(editor.state.doc, parsed);
    if (out === current) return;
    current = out;
    hooks.onChange(out);
  });
  editor.on('blur', () => {
    menu.hide();
    hooks.onBlur();
  });

  return {
    editor,
    setText(next) {
      if (next === current) return;
      current = next;
      parsed = md.parse(next);
      const { state } = editor;
      const at = state.selection.from;
      const tr = state.tr.replaceWith(0, state.doc.content.size, parsed.doc.content).setMeta('addToHistory', false).setMeta(REMOTE, true);
      tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(at, tr.doc.content.size))));
      editor.view.dispatch(tr);
    },
    focus: () => editor.commands.focus(),
    destroy: () => {
      menu.destroy();
      editor.destroy();
    },
    insertPageLink,
    insertImages: (files) => insertImages(files),
    insertFormula,
    toggleTask,
  };
}
