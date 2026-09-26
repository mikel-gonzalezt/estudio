import { EditorSelection, StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { Decoration, EditorView, WidgetType, type Command, type DecorationSet } from '@codemirror/view';
import { imageRefs, type NoteFiles } from '../../lib/attachments';
import { showNoteImage } from '../../lib/hydrate';
import { renderMath } from '../../lib/katex';
import { findMath, formatBlockMath, formatInlineMath, type MathSpan } from '../../lib/mathsyntax';
import { formatTable, tableAround } from '../../lib/mdtable';
import { blockInsertion } from '../../lib/pagelink';
import { formula } from './formula.svelte';

class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly files: () => NoteFiles) {
    super();
  }

  override eq(o: ImageWidget) {
    return o.src === this.src;
  }

  toDOM() {
    const box = document.createElement('div');
    box.className = 'cm-md-image';
    const img = document.createElement('img');
    img.alt = '';
    box.append(img);
    void showNoteImage(img, this.src, this.files()).then((shown) => {
      if (!shown) box.textContent = `Image not found: ${this.src}`;
    });
    return box;
  }
}

class MathWidget extends WidgetType {
  constructor(readonly latex: string, readonly display: boolean, readonly from: number) {
    super();
  }

  override eq(o: MathWidget) {
    return o.latex === this.latex && o.display === this.display && o.from === this.from;
  }

  toDOM(view: EditorView) {
    const el = document.createElement(this.display ? 'div' : 'span');
    el.className = this.display ? 'cm-md-math cm-md-math-block' : 'cm-md-math';
    el.title = 'Click to edit the LaTeX';
    void renderMath(el, this.latex, this.display);
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      view.dispatch({ selection: { anchor: this.from + (this.display ? 3 : 1) } });
      view.focus();
    });
    return el;
  }

  override ignoreEvent() {
    return true;
  }
}

const touches = (state: EditorState, from: number, to: number) => state.selection.ranges.some((r) => r.from <= to && r.to >= from);

function widgets(state: EditorState, files: () => NoteFiles): DecorationSet {
  const text = state.doc.toString();
  const out: Range<Decoration>[] = [];
  for (const m of findMath(text)) {
    if (touches(state, m.from, m.to)) continue;
    out.push(Decoration.replace({ widget: new MathWidget(m.latex, m.display, m.from), block: m.display }).range(m.from, m.to));
  }
  for (const r of imageRefs(text)) {
    const end = state.doc.lineAt(r.to).to;
    out.push(Decoration.widget({ widget: new ImageWidget(r.src, files), block: true, side: 1 }).range(end));
  }
  return Decoration.set(out, true);
}

/** Images shown below their line, and maths typeset while the cursor is elsewhere. */
export function noteWidgets(files: () => NoteFiles): Extension {
  return StateField.define<DecorationSet>({
    create: (s) => widgets(s, files),
    update: (d, tr) => (tr.docChanged || tr.selection ? widgets(tr.state, files) : d),
    provide: (f) => EditorView.decorations.from(f),
  });
}

/** Lines up the pipes of the table around the cursor. */
export const formatTableCommand: Command = (view) => {
  const { state } = view;
  const at = state.doc.lineAt(state.selection.main.head).number - 1;
  const lines = state.doc.toString().split('\n');
  const range = tableAround(lines, at);
  if (!range) return false;
  const from = state.doc.line(range[0] + 1).from;
  const to = state.doc.line(range[1] + 1).to;
  const insert = formatTable(lines.slice(range[0], range[1] + 1)).join('\n');
  if (insert !== state.sliceDoc(from, to)) view.dispatch({ changes: { from, to, insert }, userEvent: 'input.format' });
  return true;
};

/** Whether the cursor is in a GFM table, where Format table applies. */
export function cursorInTable(state: EditorState): boolean {
  const head = state.selection.main.head;
  const tree = syntaxTree(state);
  return ([-1, 1] as const).some((side) => {
    for (let n: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(head, side); n; n = n.parent) {
      if (n.name === 'Table') return true;
    }
    return false;
  });
}

const mathAtCursor = (state: EditorState): MathSpan | null => {
  const head = state.selection.main.head;
  return findMath(state.doc.toString()).find((m) => head >= m.from && head <= m.to) ?? null;
};

/** Opens the visual formula editor on the formula at the cursor, or on the selection, and writes back LaTeX. */
export const formulaCommand: Command = (view) => {
  const at = mathAtCursor(view.state);
  const sel = view.state.selection.main;
  const init = at ? { latex: at.latex, display: at.display } : { latex: view.state.sliceDoc(sel.from, sel.to), display: false };
  void formula.edit(init).then((f) => {
    if (!f) return view.focus();
    const text = view.state.doc.toString();
    if (at) {
      const insert = f.display ? formatBlockMath(f.latex) : formatInlineMath(f.latex);
      if (f.display === at.display) {
        view.dispatch({ changes: { from: at.from, to: at.to, insert }, userEvent: 'input.format' });
        return view.focus();
      }
    }
    const cut = at ?? sel;
    if (f.display) {
      const base = text.slice(0, cut.from) + text.slice(cut.to);
      const { from, insert } = blockInsertion(base, cut.from, formatBlockMath(f.latex));
      const shift = from >= cut.from ? cut.to - cut.from : 0;
      view.dispatch({
        changes: [{ from: cut.from, to: cut.to }, { from: from + shift, insert }],
        selection: { anchor: from + insert.length },
        userEvent: 'input.format',
      });
    } else {
      const insert = formatInlineMath(f.latex);
      view.dispatch({ changes: { from: cut.from, to: cut.to, insert }, selection: EditorSelection.cursor(cut.from + insert.length), userEvent: 'input.format' });
    }
    view.focus();
  });
  return true;
};
