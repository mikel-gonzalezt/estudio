import { mount, unmount } from 'svelte';
import { app } from '../../lib/app.svelte';
import type { AnnId, PinPanelLayout, StoredAnnotation } from '../../lib/types';
import type { Reader } from '../session.svelte';
import { pinToShow } from './pick';
import PinPanel from './PinPanel.svelte';

export type PinnedFigure = Extract<StoredAnnotation, { kind: 'area' }>;

/** A document's pinned figures: which area clips are pinned, which one the panel shows, and where the panel lives. */
export class Pins {
  readonly reader: Reader;
  /** Chosen with previous / next; it holds until following the reader would pick a different figure. */
  #manual = $state.raw<{ id: AnnId; over: AnnId | null } | null>(null);
  poppedOut = $state(false);
  #window: Window | null = null;
  #closeWindow: (() => void) | null = null;

  constructor(reader: Reader) {
    this.reader = reader;
  }

  get enabled(): boolean {
    return app.settings.pinnedFigures;
  }

  get layout(): PinPanelLayout {
    return app.settings.pinPanel;
  }

  /** Pinned area clips still in the document, in reading order; a deleted clip drops out (and comes back with undo). */
  figures = $derived.by((): PinnedFigure[] => {
    const items = this.reader.ann.items;
    return (this.reader.doc.pins ?? [])
      .map((id) => items.get(id))
      .filter((a): a is PinnedFigure => a?.kind === 'area')
      .sort((a, b) => a.page - b.page || a.rect.y - b.rect.y);
  });

  #auto = $derived.by(() => pinToShow(this.figures.map((f) => ({ id: f.id, page: f.page, top: f.rect.y })), this.reader.currentPage));

  shown = $derived.by((): PinnedFigure | null => {
    const list = this.figures;
    const m = this.#manual;
    const manual = m && (!this.layout.follow || m.over === this.#auto) ? list.find((f) => f.id === m.id) : undefined;
    if (manual) return manual;
    return (this.layout.follow ? list.find((f) => f.id === this.#auto) : undefined) ?? list[0] ?? null;
  });

  visible = $derived(this.enabled && !this.layout.hidden && this.figures.length > 0);

  isPinned(id: AnnId): boolean {
    return this.figures.some((f) => f.id === id);
  }

  #store(ids: AnnId[]) {
    this.reader.doc.pins = ids;
    this.reader.scheduleSave();
  }

  pin(id: AnnId) {
    if (!this.isPinned(id)) this.#store([...this.figures.map((f) => f.id), id]);
    this.#manual = { id, over: this.#auto };
    this.setLayout({ hidden: false, collapsed: false });
  }

  unpin(id: AnnId) {
    this.#store(this.figures.map((f) => f.id).filter((x) => x !== id));
  }

  toggle(id: AnnId) {
    if (this.isPinned(id)) this.unpin(id);
    else this.pin(id);
  }

  step(dir: 1 | -1) {
    const list = this.figures;
    const i = list.findIndex((f) => f.id === this.shown?.id);
    const next = list[(i + dir + list.length) % list.length];
    if (next) this.#manual = { id: next.id, over: this.#auto };
  }

  setLayout(patch: Partial<PinPanelLayout>) {
    app.settings.pinPanel = { ...this.layout, ...patch };
    app.saveSettings();
  }

  togglePanel() {
    this.setLayout({ hidden: !this.layout.hidden, collapsed: false });
  }

  setEnabled(on: boolean) {
    app.settings.pinnedFigures = on;
    app.saveSettings();
    if (!on) this.bringBack();
  }

  /** Brings a figure's page into view, as any other jump does, so Alt+Left returns. */
  jumpTo(f: PinnedFigure) {
    this.reader.jump(this.reader.targetAt(f.page, { x: f.rect.x, y: f.rect.y }));
  }

  /**
   * Moves the panel into its own window. The window is a blank page this window draws into, with
   * a copy of its styles, so it shares the open document, its renderer and the reading position.
   */
  popOut(): boolean {
    const w = window.open('', `estudio-figures-${this.reader.doc.id}`, 'popup,width=440,height=400');
    if (!w) return false;
    this.#closeWindow?.();
    const d = w.document;
    d.title = `Figures · ${this.reader.doc.title}`;
    d.head.replaceChildren(...[...document.querySelectorAll<HTMLElement>('link[rel="stylesheet"], style')].map((n) => {
      const c = n.cloneNode(true) as HTMLElement;
      if (c instanceof HTMLLinkElement) c.href = (n as HTMLLinkElement).href;
      return c;
    }));
    const target = d.createElement('div');
    target.style.height = '100%';
    d.body.replaceChildren(target);
    const panel = mount(PinPanel, { target, props: { pins: this, windowed: true } });
    const poll = setInterval(() => w.closed && close(), 1000);
    const close = () => {
      if (this.#window !== w) return;
      clearInterval(poll);
      w.removeEventListener('pagehide', close);
      void unmount(panel);
      this.#window = null;
      this.#closeWindow = null;
      this.poppedOut = false;
    };
    w.addEventListener('pagehide', close);
    this.#window = w;
    this.#closeWindow = close;
    this.poppedOut = true;
    w.focus();
    return true;
  }

  bringBack() {
    const w = this.#window;
    this.#closeWindow?.();
    w?.close();
  }
}

const all = new WeakMap<Reader, Pins>();

export function pinsFor(reader: Reader): Pins {
  let p = all.get(reader);
  if (!p) {
    p = new Pins(reader);
    all.set(reader, p);
  }
  return p;
}
