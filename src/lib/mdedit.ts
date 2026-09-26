/** A replacement in the text: offsets into the text before the edit. */
export interface Edit { from: number; to: number; insert: string }

/** Edits plus where the selection ends up, in offsets of the text after the edits. */
export interface Wrapped { changes: Edit[]; anchor: number; head: number }

const runOf = (text: string, at: number, ch: string, dir: 1 | -1) => {
  let n = 0;
  for (let i = dir > 0 ? at : at - 1; i >= 0 && i < text.length && text[i] === ch; i += dir) n++;
  return n;
};

/**
 * Whether runs of `before` and `after` marker characters close around a span as `mark`. A lone
 * `*` counts inside `***` but not inside `**`, so Ctrl+I on bold text adds italics instead of
 * breaking the bold.
 */
function encloses(mark: string, before: number, after: number): boolean {
  const n = Math.min(before, after);
  if (n < mark.length) return false;
  return mark.length > 1 || n !== 2;
}

/**
 * Toggles `mark` (`**`, `*`, `~~`, `` ` ``, `==`) around the selection `from..to`: removes it when
 * the selection is already wrapped, from outside or from inside, otherwise adds it. An empty
 * selection gets an empty pair with the cursor in the middle.
 */
export function toggleWrap(text: string, from: number, to: number, mark: string): Wrapped {
  const ch = mark[0]!;
  const L = mark.length;
  if (encloses(mark, runOf(text, from, ch, -1), runOf(text, to, ch, 1))) {
    return { changes: [{ from: from - L, to: from, insert: '' }, { from: to, to: to + L, insert: '' }], anchor: from - L, head: to - L };
  }
  if (to - from >= 2 * L && encloses(mark, runOf(text, from, ch, 1), runOf(text, to, ch, -1)) && runOf(text, from, ch, 1) < to - from) {
    return { changes: [{ from, to: from + L, insert: '' }, { from: to - L, to, insert: '' }], anchor: from, head: to - 2 * L };
  }
  return { changes: [{ from, to: from, insert: mark }, { from: to, to, insert: mark }], anchor: from + L, head: to + L };
}

const TASK = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/;
const ITEM = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)/;
const LEAD = /^(\s*(?:>\s*)*)/;

export const isListItem = (line: string) => ITEM.test(line);

/**
 * The edit, in offsets within `line`, that toggles its checkbox: `[ ]` and `[x]` flip, a list item
 * gains `[ ] `, and any other line becomes an unchecked task.
 */
export function checkboxEdit(line: string): Edit {
  const task = TASK.exec(line);
  if (task) {
    const at = task[1]!.length + 1;
    return { from: at, to: at + 1, insert: task[2] === ' ' ? 'x' : ' ' };
  }
  const item = ITEM.exec(line);
  if (item) return { from: item[1]!.length, to: item[1]!.length, insert: '[ ] ' };
  const lead = LEAD.exec(line)![1]!.length;
  return { from: lead, to: lead, insert: '- [ ] ' };
}

const EMPTY_ITEM = /^(\s*(?:>\s*)*)(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]*)?$/;

/** For a list item with nothing after its marker, the edit that removes the marker (and checkbox). */
export function emptyItemEdit(line: string): Edit | null {
  const m = EMPTY_ITEM.exec(line);
  return m ? { from: m[1]!.length, to: line.length, insert: '' } : null;
}
