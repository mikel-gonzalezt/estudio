import { plainCloze } from '../cloze';
import { splitFrontmatter } from '../frontmatter';
import { parsePageLinks } from '../pagelink';
import {
  annotationTop, KIND_LABEL, type Card, type ColorId, type DocRecord, type StoredAnnotation,
} from '../types';

export interface MarkdownInput {
  doc: Pick<DocRecord, 'title' | 'fileName' | 'pageCount'>;
  annotations: readonly StoredAnnotation[];
  notebook: string;
  cards: readonly Card[];
  meanings: Record<ColorId, string>;
  exportedAt: Date;
}

const tag = (s: string) => `#${s.trim().replace(/[^\p{L}\p{N}_]+/gu, '-').replace(/^-+|-+$/g, '')}`;
const quote = (s: string) => s.trim().split(/\r?\n/).map((l) => `> ${l}`).join('\n');
/** Notebook page links become plain references; `[[p3]]` would create stray notes in Obsidian. */
const unlink = (md: string) => {
  let out = '';
  let at = 0;
  for (const l of parsePageLinks(md)) {
    out += md.slice(at, l.from) + (l.label ? `${l.label} (p. ${l.page})` : `(p. ${l.page})`);
    at = l.to;
  }
  return out + md.slice(at);
};
const yamlString = (s: string) => JSON.stringify(s);

function annotationBlock(a: StoredAnnotation, meanings: Record<ColorId, string>): string {
  const lines: string[] = [];
  const meaning = a.kind === 'ink' ? '' : meanings[a.color];
  const tags = [meaning, ...a.tags].filter(Boolean).map(tag).join(' ');
  switch (a.kind) {
    case 'highlight': case 'underline': case 'strike':
      lines.push(quote(a.text));
      break;
    case 'area':
      lines.push(`*${KIND_LABEL.area} (figure or equation)*`);
      break;
    case 'note':
      lines.push(`*${KIND_LABEL.note}*`);
      break;
    case 'ink':
      lines.push(`*${KIND_LABEL.ink}*`);
      break;
  }
  if (a.kind !== 'ink' && a.note.trim()) lines.push('', a.note.trim());
  if (tags) lines.push('', tags);
  return lines.join('\n');
}

export function exportMarkdown(input: MarkdownInput): string {
  const { doc, meanings } = input;
  const anns = [...input.annotations].sort((a, b) => a.page - b.page || annotationTop(a) - annotationTop(b));
  const out: string[] = [
    '---',
    `title: ${yamlString(doc.title)}`,
    `source: ${yamlString(doc.fileName)}`,
    `pages: ${doc.pageCount}`,
    `exported: ${input.exportedAt.toISOString()}`,
    'tags: [estudio]',
    '---',
    '',
    `# ${doc.title}`,
    '',
  ];

  out.push('## Annotations', '');
  if (anns.length === 0) out.push('_No annotations._', '');
  let page = 0;
  for (const a of anns) {
    if (a.page !== page) {
      page = a.page;
      out.push(`### Page ${page}`, '');
    }
    out.push(annotationBlock(a, meanings), '');
  }

  if (input.notebook.trim()) out.push('## Notebook', '', unlink(input.notebook.trim()), '');

  if (input.cards.length) {
    out.push('## Flashcards', '');
    for (const c of input.cards) {
      const front = plainCloze(c.front).replace(/\s+/g, ' ').trim();
      out.push(c.back.trim() ? `- **Q:** ${front}\n  **A:** ${c.back.replace(/\s+/g, ' ').trim()} (p. ${c.page})` : `- ${front} (p. ${c.page})`);
    }
    out.push('');
  }
  return out.join('\n');
}

/** Just the notebook's own text, readable anywhere: no frontmatter, and page links as `(p. N)`. */
export function exportNotes(notebook: string): string {
  const body = unlink(splitFrontmatter(notebook).body).trim();
  return body ? `${body}\n` : '';
}
