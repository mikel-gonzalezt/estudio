import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, insertNewlineAndIndent } from '@codemirror/commands';
import { deleteMarkupBackward, insertNewlineContinueMarkup, markdownLanguage } from '@codemirror/lang-markdown';
import { defaultHighlightStyle, LanguageSupport, syntaxHighlighting } from '@codemirror/language';
import { EditorState, Prec, RangeSetBuilder, StateField, Transaction, type Text } from '@codemirror/state';
import {
  Decoration, EditorView, WidgetType, drawSelection, keymap, placeholder, type Command, type DecorationSet,
} from '@codemirror/view';
import { quoteBlock, QUOTE_MIME, type QuoteDrag } from '../../lib/notebook';
import {
  autoLinkInsert, blockInsertion, chipText, formatPageLink, isFirstKeystroke, parsePageLinks, startsParagraph,
} from '../../lib/pagelink';
import type { NotebookHost } from './host.svelte';

export interface EditorHooks {
  host: NotebookHost;
  autoLinks: () => boolean;
  onChange: (text: string) => void;
  onBlur: () => void;
}

export interface NotebookEditor {
  /** Replaces the text with one that changed elsewhere, keeping the cursor where the texts agree. */
  setText(text: string): void;
  focus(): void;
  destroy(): void;
}

class ChipWidget extends WidgetType {
  constructor(readonly page: number, readonly text: string) {
    super();
  }

  override eq(o: ChipWidget) {
    return o.page === this.page && o.text === this.text;
  }

  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-plink';
    el.dataset.page = String(this.page);
    el.textContent = this.text;
    el.title = `Page ${this.page}: click to open`;
    return el;
  }

  override ignoreEvent() {
    return false;
  }
}

function chipDecorations(doc: Text): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  for (const l of parsePageLinks(doc.toString())) {
    b.add(l.from, l.to, Decoration.replace({ widget: new ChipWidget(l.page, chipText(l)) }));
  }
  return b.finish();
}

const chips = StateField.define<DecorationSet>({
  create: (s) => chipDecorations(s.doc),
  update: (d, tr) => (tr.docChanged ? chipDecorations(tr.state.doc) : d),
  provide: (f) => [EditorView.decorations.from(f), EditorView.atomicRanges.of((v) => v.state.field(f))],
});

const excerpt = (s: string, max = 70) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** Replaces `[[query` (and a `]]` right after the cursor) with the finished link. */
const applyLink = (page: number, label?: string) => (view: EditorView, _c: Completion, from: number, to: number) => {
  const end = view.state.sliceDoc(to, to + 2) === ']]' ? to + 2 : to;
  const insert = formatPageLink(page, label);
  view.dispatch({ changes: { from, to: end, insert }, selection: { anchor: from + insert.length }, userEvent: 'input.complete' });
};

const GROUPS = {
  page: { name: 'Page', rank: 0 },
  section: { name: 'Sections', rank: 1 },
  annotation: { name: 'Annotations', rank: 2 },
};

function linkCompletions(host: NotebookHost) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const m = ctx.matchBefore(/\[\[[^[\]|\n]*/);
    if (!m) return null;
    const q = m.text.slice(2).trim().toLowerCase();
    const { page, sections, annotations } = host.context;
    const matches = (s: string) => !q || s.toLowerCase().includes(q);
    const options: Completion[] = [
      { label: `Current page (p. ${page})`, apply: applyLink(page), section: GROUPS.page, type: 'page' },
      ...sections.filter((s) => matches(s.title)).slice(0, 40).map((s): Completion => ({
        label: `${'  '.repeat(Math.min(s.depth, 3))}${s.title}`, detail: `p. ${s.page}`,
        apply: applyLink(s.page, s.title), section: GROUPS.section, type: 'section',
      })),
      ...annotations.filter((a) => a.text && matches(a.text)).slice(0, 30).map((a): Completion => ({
        label: excerpt(a.text), detail: `p. ${a.page}`,
        apply: applyLink(a.page, excerpt(a.text, 50)), section: GROUPS.annotation, type: 'annotation',
      })),
    ];
    return { from: m.from, options, filter: false };
  };
}

function linkAt(doc: Text, pos: number) {
  const line = doc.lineAt(pos);
  return parsePageLinks(line.text, line.from).find((l) => pos >= l.from && pos <= l.to) ?? null;
}

export function createEditor(parent: HTMLElement, text: string, hooks: EditorHooks): NotebookEditor {
  const { host } = hooks;

  const insertCurrentLink: Command = (view) => {
    const { from } = view.state.selection.main;
    const prev = view.state.sliceDoc(from - 1, from);
    const insert = `${prev && !/\s/.test(prev) ? ' ' : ''}${formatPageLink(host.context.page)} `;
    view.dispatch(view.state.update(view.state.replaceSelection(insert), { userEvent: 'input' }));
    return true;
  };

  const enterWithLink: Command = (view) => {
    const sel = view.state.selection.main;
    const line = view.state.doc.lineAt(sel.head);
    const fire = hooks.autoLinks() && sel.empty && startsParagraph(line.text, sel.head === line.to);
    if (!insertNewlineContinueMarkup(view)) insertNewlineAndIndent(view);
    if (!fire) return true;
    const pos = view.state.selection.main.head;
    const insert = autoLinkInsert(view.state.doc.toString(), pos, host.context.page);
    if (insert) view.dispatch({ changes: { from: pos, insert }, selection: { anchor: pos + insert.length }, userEvent: 'input.autolink' });
    return true;
  };

  const firstKeystrokeLink = EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged || !hooks.autoLinks() || !isFirstKeystroke(tr.startState.doc.length, tr.annotation(Transaction.userEvent))) return tr;
    return [tr, { changes: { from: 0, insert: autoLinkInsert('', 0, host.context.page)! }, sequential: true }];
  });

  const events = EditorView.domEventHandlers({
    mousedown(e, view) {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('.cm-plink');
      const page = chip ? Number(chip.dataset.page) : null;
      if (page) {
        e.preventDefault();
        host.jump(page);
        return true;
      }
      if (!(e.ctrlKey || e.metaKey)) return false;
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      const l = pos === null ? null : linkAt(view.state.doc, pos);
      if (!l) return false;
      e.preventDefault();
      host.jump(l.page);
      return true;
    },
    dragover(e) {
      if (!e.dataTransfer?.types.includes(QUOTE_MIME)) return false;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      return true;
    },
    drop(e, view) {
      const raw = e.dataTransfer?.getData(QUOTE_MIME);
      if (!raw) return false;
      e.preventDefault();
      const q = JSON.parse(raw) as QuoteDrag;
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.doc.length;
      const { from, insert } = blockInsertion(view.state.doc.toString(), pos, quoteBlock(q.text, q.page));
      view.dispatch({ changes: { from, insert }, selection: { anchor: from + insert.length }, userEvent: 'input.drop', scrollIntoView: true });
      view.focus();
      return true;
    },
    blur() {
      hooks.onBlur();
      return false;
    },
  });

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        new LanguageSupport(markdownLanguage),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        placeholder('# Notes\n\nWrite in Markdown. [[ links a page, Ctrl+L links the page you are reading.'),
        chips,
        autocompletion({ override: [linkCompletions(host)], icons: false }),
        Prec.high(keymap.of([
          { key: 'Enter', run: enterWithLink },
          { key: 'Mod-l', run: insertCurrentLink, preventDefault: true },
          { key: 'Backspace', run: deleteMarkupBackward },
        ])),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        firstKeystrokeLink,
        events,
        EditorView.contentAttributes.of({ 'aria-label': 'Notebook', spellcheck: 'true' }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !u.transactions.some((t) => t.annotation(Transaction.remote))) hooks.onChange(u.state.doc.toString());
        }),
      ],
    }),
  });

  return {
    setText(next) {
      const cur = view.state.doc.toString();
      if (next === cur) return;
      let start = 0;
      while (start < cur.length && start < next.length && cur[start] === next[start]) start++;
      let end = 0;
      while (end < cur.length - start && end < next.length - start && cur[cur.length - 1 - end] === next[next.length - 1 - end]) end++;
      view.dispatch({
        changes: { from: start, to: cur.length - end, insert: next.slice(start, next.length - end) },
        annotations: [Transaction.remote.of(true), Transaction.addToHistory.of(false)],
      });
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
