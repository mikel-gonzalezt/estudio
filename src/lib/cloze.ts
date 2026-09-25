const CLOZE = /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/g;

export function isCloze(front: string): boolean {
  return new RegExp(CLOZE.source).test(front);
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Renders a cloze card side as HTML. Hidden deletions show `[...]` (or `[hint]`),
 * revealed ones are wrapped in <mark>.
 */
export function renderCloze(front: string, reveal: boolean): string {
  let out = '';
  let last = 0;
  for (const m of front.matchAll(CLOZE)) {
    out += escapeHtml(front.slice(last, m.index));
    const answer = escapeHtml(m[2] ?? '');
    const hint = m[3] ? escapeHtml(m[3]) : '...';
    out += reveal ? `<mark class="cloze">${answer}</mark>` : `<span class="cloze-gap">[${hint}]</span>`;
    last = m.index + m[0].length;
  }
  return out + escapeHtml(front.slice(last));
}

export function nextClozeNumber(front: string): number {
  const nums = [...front.matchAll(CLOZE)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

/** Wraps `text[start, end)` in the next cloze deletion. */
export function wrapCloze(text: string, start: number, end: number): string {
  if (start >= end) return text;
  const n = nextClozeNumber(text);
  return `${text.slice(0, start)}{{c${n}::${text.slice(start, end)}}}${text.slice(end)}`;
}

export function plainCloze(front: string): string {
  return front.replace(CLOZE, (_m, _n, answer: string) => answer);
}
