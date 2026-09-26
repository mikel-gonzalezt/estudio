/**
 * Maths in notes (see docs/NOTES-FORMAT.md): `$x^2$` inline, with no space just inside either
 * `$`, and `\$` for a literal dollar; a block is `$$` on its own line, LaTeX, `$$` on its own line.
 */
export interface MathSpan { from: number; to: number; latex: string; display: boolean }

const INLINE = /^\$(?![\s$])((?:\\.|[^\\$\n])*?[^\s\\])\$(?!\$)/;
const BLOCK = /^\$\$[ \t]*\n([\s\S]*?)\n[ \t]*\$\$[ \t]*(?=\n|$)/;

/** Inline maths starting exactly at the beginning of `src`, for tokenizers. */
export function inlineMathAt(src: string): { raw: string; latex: string } | null {
  const m = INLINE.exec(src);
  return m ? { raw: m[0], latex: m[1]! } : null;
}

/** A maths block starting exactly at the beginning of `src`, which must be the start of a line. */
export function blockMathAt(src: string): { raw: string; latex: string } | null {
  const m = BLOCK.exec(src);
  return m ? { raw: m[0], latex: m[1]! } : null;
}

export const formatInlineMath = (latex: string) => `$${latex.trim()}$`;
export const formatBlockMath = (latex: string) => `$$\n${latex.trim()}\n$$`;

/** Every maths span in `text`, skipping fenced code and inline code. */
export function findMath(text: string): MathSpan[] {
  const out: MathSpan[] = [];
  let fence: string | null = null;
  let at = 0;
  while (at <= text.length) {
    const eol = text.indexOf('\n', at);
    const end = eol === -1 ? text.length : eol;
    const line = text.slice(at, end);
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (fence) {
      if (f && f[1]!.startsWith(fence)) fence = null;
    } else if (f) {
      fence = f[1]!;
    } else if (/^\$\$[ \t]*$/.test(line)) {
      const b = blockMathAt(text.slice(at));
      if (b) {
        out.push({ from: at, to: at + b.raw.length, latex: b.latex, display: true });
        at += b.raw.length + 1;
        continue;
      }
    } else {
      inlineIn(line, at, out);
    }
    if (eol === -1) break;
    at = eol + 1;
  }
  return out;
}

function inlineIn(line: string, offset: number, out: MathSpan[]) {
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\') i++;
    else if (c === '`') {
      const run = /^`+/.exec(line.slice(i))![0];
      const close = line.indexOf(run, i + run.length);
      i = close === -1 ? i + run.length - 1 : close + run.length - 1;
    } else if (c === '$') {
      const m = inlineMathAt(line.slice(i));
      if (m) {
        out.push({ from: offset + i, to: offset + i + m.raw.length, latex: m.latex, display: false });
        i += m.raw.length - 1;
      } else if (line[i + 1] === '$') i++;
    }
  }
}
