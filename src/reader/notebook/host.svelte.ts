import type { AnnRef, NotebookContext, Section } from '../../lib/notebooksync';
import { annotationNote, annotationText, KIND_LABEL, type StoredAnnotation } from '../../lib/types';
import { outline, resolveDest, type OutlineNode } from '../pdf';
import type { Reader } from '../session.svelte';

/** What the notebook editor reads from wherever the document is being read, in this window or another. */
export interface NotebookHost {
  readonly context: NotebookContext;
  jump(page: number): void;
}

export const annotationQuote = (a: StoredAnnotation) => annotationText(a) || annotationNote(a) || KIND_LABEL[a.kind];

async function sectionsOf(reader: Reader): Promise<Section[]> {
  const out: Section[] = [];
  const walk = async (nodes: OutlineNode[], depth: number) => {
    for (const n of nodes) {
      const t = await resolveDest(reader.pdf, n.dest, (p) => reader.info[p - 1]).catch(() => null);
      if (t) out.push({ title: n.title.trim(), page: t.page, depth });
      await walk(n.items, depth + 1);
    }
  };
  await walk(await outline(reader.pdf).catch(() => []), 0);
  return out;
}

export class ReaderHost implements NotebookHost {
  readonly #reader: Reader;
  #sections = $state.raw<Section[]>([]);

  constructor(reader: Reader) {
    this.#reader = reader;
    void sectionsOf(reader).then((s) => (this.#sections = s));
  }

  #annotations = $derived.by((): AnnRef[] =>
    this.#reader.ann.sorted
      .filter((a) => a.kind !== 'ink')
      .map((a) => ({ id: a.id, page: a.page, text: annotationQuote(a).replace(/\s+/g, ' ').trim() })),
  );

  context = $derived.by((): NotebookContext => ({
    title: this.#reader.doc.title,
    page: this.#reader.currentPage,
    sections: this.#sections,
    annotations: this.#annotations,
  }));

  jump(page: number) {
    this.#reader.jump({ page, y: 0 });
  }
}
