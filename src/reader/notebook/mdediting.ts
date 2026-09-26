import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { indentLess, indentMore, insertTab } from '@codemirror/commands';
import { deleteMarkupBackward, insertNewlineContinueMarkupCommand, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, indentUnit, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { EditorSelection, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, keymap, MatchDecorator, ViewPlugin, type Command, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { checkboxEdit, emptyItemEdit, isListItem, toggleWrap } from '../../lib/mdedit';

/** Enter on an empty item ends the list instead of loosening it. */
export const continueMarkup = insertNewlineContinueMarkupCommand({ nonTightLists: false });

const format = (mark: string): Command => (view) => {
  const text = view.state.doc.toString();
  view.dispatch(view.state.changeByRange((r) => {
    const w = toggleWrap(text, r.from, r.to, mark);
    return { changes: w.changes, range: EditorSelection.range(w.anchor, w.head) };
  }), { userEvent: 'input.format', scrollIntoView: true });
  return true;
};

function toggleTasks(state: EditorState, lines: Iterable<number>) {
  return [...new Set(lines)].map((n) => {
    const line = state.doc.line(n);
    const e = checkboxEdit(line.text);
    return { from: line.from + e.from, to: line.from + e.to, insert: e.insert };
  });
}

const toggleCheckbox: Command = (view) => {
  const { state } = view;
  const lines = state.selection.ranges.flatMap((r) => {
    const a = state.doc.lineAt(r.from).number;
    const b = state.doc.lineAt(r.to).number;
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  });
  view.dispatch({ changes: toggleTasks(state, lines), userEvent: 'input.format' });
  return true;
};

/** Tab indents list items and selected lines; elsewhere it types a tab. */
const indentTab: Command = (view) => {
  const { state } = view;
  const list = state.selection.ranges.some((r) => !r.empty || isListItem(state.doc.lineAt(r.head).text));
  return list ? indentMore(view) : insertTab(view);
};

/** Backspace right after the marker of an empty item removes the whole marker at once. */
const deleteEmptyMarker: Command = (view) => {
  const { state } = view;
  const r = state.selection.main;
  if (!r.empty || state.selection.ranges.length > 1) return false;
  const line = state.doc.lineAt(r.head);
  const e = r.head === line.to ? emptyItemEdit(line.text) : null;
  if (!e) return false;
  view.dispatch({ changes: { from: line.from + e.from, to: line.from + e.to }, userEvent: 'delete.backward' });
  return true;
};

const WRAP_ONLY = ['*', '_', '`'];

/** Typing `*`, `_` or `` ` `` over a selection wraps it rather than replacing it. */
const wrapSelection = EditorView.inputHandler.of((view, _from, _to, text) => {
  if (!WRAP_ONLY.includes(text) || view.state.selection.ranges.every((r) => r.empty)) return false;
  view.dispatch(view.state.changeByRange((r) => r.empty
    ? { changes: { from: r.from, insert: text }, range: EditorSelection.cursor(r.from + 1) }
    : { changes: [{ from: r.from, insert: text }, { from: r.to, insert: text }], range: EditorSelection.range(r.from + 1, r.to + 1) }),
  { userEvent: 'input.type' });
  return true;
});

const CODE = new Set(['InlineCode', 'CodeText', 'FencedCode', 'CodeBlock']);

const highlightMarks = new MatchDecorator({
  regexp: /==(?=[^=\s])([^=\n]*?[^=\s])==/g,
  decorate(add, from, to, _m, view) {
    if (CODE.has(syntaxTree(view.state).resolveInner(from, 1).name)) return;
    add(from, from + 2, Decoration.mark({ class: 'cm-md-mark' }));
    add(from + 2, to - 2, Decoration.mark({ class: 'cm-md-hl' }));
    add(to - 2, to, Decoration.mark({ class: 'cm-md-mark' }));
  },
});

const highlights = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) {
    this.decorations = highlightMarks.createDeco(view);
  }
  update(u: ViewUpdate) {
    this.decorations = highlightMarks.updateDeco(u, this.decorations);
  }
}, { decorations: (v) => v.decorations });

/** Light live preview: styles only, every character stays where it is. */
const livePreview = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.55em', fontWeight: '700', lineHeight: '1.4' },
  { tag: t.heading2, fontSize: '1.3em', fontWeight: '700', lineHeight: '1.4' },
  { tag: t.heading3, fontSize: '1.15em', fontWeight: '700' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.monospace, class: 'cm-md-code' },
  { tag: [t.processingInstruction, t.contentSeparator, t.comment], class: 'cm-md-mark' },
  { tag: [t.link, t.url], class: 'cm-md-link' },
  { tag: t.quote, class: 'cm-md-quote' },
  { tag: t.atom, class: 'cm-md-task' },
]);

const taskClicks = EditorView.domEventHandlers({
  mousedown(e, view) {
    if (e.button !== 0 || !(e.target as HTMLElement).closest('.cm-md-task')) return false;
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos === null) return false;
    const tree = syntaxTree(view.state);
    if (![tree.resolveInner(pos, 1), tree.resolveInner(pos, -1)].some((n) => n.name === 'TaskMarker')) return false;
    e.preventDefault();
    view.dispatch({ changes: toggleTasks(view.state, [view.state.doc.lineAt(pos).number]), userEvent: 'input.format' });
    return true;
  },
});

/**
 * Obsidian-style Markdown editing: paired brackets and quotes, list continuation and indentation,
 * toggling format shortcuts, clickable checkboxes and styled (never hidden) syntax.
 * Enter is bound by the editor itself, which adds auto page links around `continueMarkup`.
 */
export function markdownEditing(): Extension[] {
  return [
    indentUnit.of('    '),
    markdownLanguage.data.of({ closeBrackets: { brackets: ['(', '[', '{', '"'] } }),
    closeBrackets(),
    wrapSelection,
    syntaxHighlighting(livePreview),
    highlights,
    taskClicks,
    keymap.of([
      { key: 'Mod-b', run: format('**'), preventDefault: true },
      { key: 'Mod-i', run: format('*'), preventDefault: true },
      { key: 'Mod-Shift-x', run: format('~~'), preventDefault: true },
      { key: 'Mod-e', run: format('`'), preventDefault: true },
      { key: 'Mod-Shift-h', run: format('=='), preventDefault: true },
      { key: 'Mod-Enter', run: toggleCheckbox, preventDefault: true },
      { key: 'Tab', run: indentTab },
      { key: 'Shift-Tab', run: indentLess },
      { key: 'Backspace', run: deleteEmptyMarker },
      { key: 'Backspace', run: deleteMarkupBackward },
      ...closeBracketsKeymap,
    ]),
  ];
}
