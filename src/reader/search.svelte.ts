import { pageText, searchPages, type Hit } from '../lib/textsearch';
import type { Reader } from './session.svelte';

export class Search {
  readonly reader: Reader;
  open = $state(false);
  query = $state('');
  hits = $state.raw<Hit[]>([]);
  current = $state(0);
  /** Bumped on every navigation so the page holding the hit scrolls it into view once. */
  nav = $state(0);
  busy = $state(false);
  #texts: Promise<string[]> | null = null;
  #seq = 0;

  constructor(reader: Reader) {
    this.reader = reader;
  }

  byPage = $derived.by(() => {
    const m = new Map<number, Hit[]>();
    for (const h of this.hits) {
      const l = m.get(h.page);
      if (l) l.push(h);
      else m.set(h.page, [h]);
    }
    return m;
  });

  get currentHit(): Hit | undefined {
    return this.hits[this.current];
  }

  texts(): Promise<string[]> {
    this.#texts ??= Promise.all(
      this.reader.info.map((_, i) => this.reader.page(i + 1).then((p) => p.getTextContent()).then((tc) => pageText(tc.items as { str: string; hasEOL?: boolean }[]))),
    );
    return this.#texts;
  }

  async run(query: string) {
    this.query = query;
    const seq = ++this.#seq;
    if (!query.trim()) {
      this.hits = [];
      return;
    }
    this.busy = true;
    const texts = await this.texts();
    if (seq !== this.#seq) return;
    this.busy = false;
    this.hits = searchPages(texts, query);
    const from = this.reader.currentPage;
    const first = this.hits.findIndex((h) => h.page >= from);
    if (this.hits.length) this.go(first < 0 ? 0 : first);
  }

  go(i: number) {
    if (!this.hits.length) return;
    this.current = (i + this.hits.length) % this.hits.length;
    const h = this.hits[this.current]!;
    this.nav++;
    // A rendered page scrolls the exact hit into view itself; otherwise bring the page in so it renders.
    if (!this.reader.pageElement(h.page)?.querySelector('.textLayer span')) this.reader.scrollTo({ page: h.page, y: 0 });
  }

  next() {
    this.go(this.current + 1);
  }

  prev() {
    this.go(this.current - 1);
  }

  show() {
    this.open = true;
    queueMicrotask(() => {
      const el = document.getElementById('search-input') as HTMLInputElement | null;
      el?.focus();
      el?.select();
    });
  }

  close() {
    this.open = false;
    this.hits = [];
    this.#seq++;
  }
}
