import { writeAnnotations } from '../lib/db';
import { apply, EditLog, writes, type AnnMap, type Edit } from '../lib/editlog';
import { hitTest, boundingRect } from '../lib/geometry';
import {
  annotationTop, newId, type AnnId, type Annotation, type ColorId, type DocId, type FileAnnotation, type StoredAnnotation, type TextMarkupKind,
} from '../lib/types';
import { IDLE, type Interaction } from './interaction';
import { captureSelection, type SelectionPart } from './selection';
import type { Reader } from './session.svelte';
import { TOOLS, type PointerCtx, type Tool, type ToolId } from './tools';

export interface SelectionMenu { x: number; y: number; parts: SelectionPart[] }

export class Annotator {
  readonly reader: Reader;
  readonly docId: DocId;
  readonly log: EditLog;

  tool = $state<ToolId>('select');
  color = $state<ColorId>('yellow');
  interaction = $state.raw<Interaction>(IDLE);
  items = $state.raw<AnnMap>(new Map());
  selected = $state<AnnId | null>(null);
  menu = $state.raw<SelectionMenu | null>(null);
  #version = $state(0);

  constructor(reader: Reader, docId: DocId, initial: StoredAnnotation[]) {
    this.reader = reader;
    this.docId = docId;
    this.items = new Map(initial.map((a) => [a.id, a]));
    this.log = new EditLog((e) => this.#sink(e));
    this.log.onChange = () => this.#version++;
  }

  #sink(e: Edit) {
    this.items = apply(this.items, e);
    const { put, del } = writes(e);
    void writeAnnotations(put, del);
    if (this.selected && !this.items.has(this.selected)) this.selected = null;
    this.reader.sync?.touch();
  }

  /** Changes read from the PDF file; they are not the reader's own edits, so they skip the undo history. */
  applyExternal(put: FileAnnotation[], del: AnnId[]) {
    if (!put.length && !del.length) return;
    const stored = put.map((a): StoredAnnotation => ({ ...a, docId: this.docId }));
    const next = new Map(this.items);
    for (const id of del) next.delete(id);
    for (const a of stored) next.set(a.id, a);
    this.items = next;
    void writeAnnotations(stored, del);
    if (this.selected && !next.has(this.selected)) this.selected = null;
  }

  byPage = $derived.by(() => {
    const m = new Map<number, StoredAnnotation[]>();
    for (const a of this.items.values()) {
      const list = m.get(a.page);
      if (list) list.push(a);
      else m.set(a.page, [a]);
    }
    return m;
  });

  sorted = $derived([...this.items.values()].sort((a, b) => a.page - b.page || annotationTop(a) - annotationTop(b)));

  canUndo = $derived.by(() => (this.#version, this.log.canUndo));
  canRedo = $derived.by(() => (this.#version, this.log.canRedo));

  onPage(n: number): StoredAnnotation[] {
    return this.byPage.get(n) ?? [];
  }

  setTool(id: ToolId) {
    this.tool = id;
    this.interaction = IDLE;
    this.menu = null;
    this.selected = null;
    if (TOOLS[id].captures) window.getSelection()?.removeAllRanges();
  }

  pointer(phase: 'down' | 'move' | 'up', c: PointerCtx) {
    const t: Tool = TOOLS[this.tool];
    const handler = t[phase];
    if (handler) this.interaction = handler(c, this.interaction);
  }

  add(a: Annotation): StoredAnnotation {
    const now = Date.now();
    const stored = { ...a, id: newId<AnnId>(), docId: this.docId, tags: [], createdAt: now, updatedAt: now } as StoredAnnotation;
    this.log.do({ op: 'add', ann: stored });
    return stored;
  }

  update(id: AnnId, change: (a: StoredAnnotation) => StoredAnnotation) {
    const before = this.items.get(id);
    if (!before) return;
    const after = { ...change(before), updatedAt: Date.now() };
    if (JSON.stringify({ ...after, updatedAt: 0 }) === JSON.stringify({ ...before, updatedAt: 0 })) return;
    this.log.do({ op: 'update', before, after });
  }

  removeMany(ids: AnnId[]) {
    const anns = ids.map((id) => this.items.get(id)).filter((a): a is StoredAnnotation => !!a);
    if (anns.length === 1) this.log.do({ op: 'delete', ann: anns[0]! });
    else this.log.do({ op: 'batch', edits: anns.map((ann) => ({ op: 'delete', ann })) });
  }

  remove(id: AnnId) {
    this.removeMany([id]);
  }

  select(id: AnnId | null) {
    this.selected = id;
    if (id) this.menu = null;
  }

  selection(): SelectionPart[] {
    return this.reader.scroller ? captureSelection(this.reader.scroller, this.reader.info) : [];
  }

  markParts(kind: TextMarkupKind, parts: SelectionPart[]) {
    const now = Date.now();
    const edits: Edit[] = parts.map((p) => ({
      op: 'add',
      ann: { kind, page: p.page, rects: p.rects, text: p.text, color: this.color, note: '', id: newId<AnnId>(), docId: this.docId, tags: [], createdAt: now, updatedAt: now },
    }));
    this.log.do(edits.length === 1 ? edits[0]! : { op: 'batch', edits });
    window.getSelection()?.removeAllRanges();
    this.menu = null;
  }

  markSelection(kind: TextMarkupKind) {
    const parts = this.selection();
    if (parts.length) this.markParts(kind, parts);
  }

  afterSelect(c: PointerCtx) {
    const parts = this.selection();
    if (parts.length) {
      const range = window.getSelection()?.getRangeAt(0);
      const rects = range ? [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0) : [];
      const last = rects.at(-1);
      this.selected = null;
      this.menu = last ? { x: last.right, y: last.bottom, parts } : null;
      return;
    }
    this.menu = null;
    const hit = this.onPage(c.page).findLast((a) => hitTest(a, c.at, c.size, 2));
    this.selected = hit?.id ?? null;
  }

  /** Scrolls an annotation into view and opens it. */
  reveal(a: StoredAnnotation) {
    const top = a.kind === 'highlight' || a.kind === 'underline' || a.kind === 'strike'
      ? boundingRect(a.rects)
      : { x: 0, y: annotationTop(a) };
    this.reader.jump(this.reader.targetAt(a.page, { x: top.x, y: top.y }));
    this.selected = a.id;
  }

  undo() {
    this.log.undo();
  }

  redo() {
    this.log.redo();
  }

  /** Esc peels one layer: an open editor, then a selection, then the active tool. */
  escape() {
    if (this.interaction.kind !== 'idle') this.interaction = IDLE;
    else if (this.selected) this.selected = null;
    else if (this.menu) {
      this.menu = null;
      window.getSelection()?.removeAllRanges();
    } else this.setTool('select');
  }
}
