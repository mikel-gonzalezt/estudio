/**
 * Backslash-escapes only the characters of a plain text run that Markdown would otherwise read as
 * markup, so an edited paragraph keeps "a_b", "2 * 3", "[x]" and "5 $" as the user typed them.
 * `lineStart` is true when the run begins a paragraph, where `#`, `>` and list markers are markup.
 */
export function escapeText(text: string, lineStart = false): string {
  const dollars = (text.match(/(?<!\\)\$/g) ?? []).length;
  const tildes = (text.match(/~/g) ?? []).length;
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    const prev = text[i - 1];
    const next = text[i + 1];
    const space = (ch: string | undefined) => ch !== undefined && /\s/.test(ch);
    const word = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
    let esc = false;
    switch (c) {
      case '\\': esc = next !== undefined && /[!-/:-@[-`{-~]/.test(next); break;
      case '`': esc = true; break;
      case '*': esc = !(space(prev) && space(next)); break;
      case '_': esc = !(word(prev) && word(next)); break;
      case '~': esc = tildes > 1; break;
      case '[': esc = next === '['; break;
      case ']': esc = next === '(' || next === '['; break;
      case '=': esc = next === '=' && prev !== '='; break;
      case '$': esc = dollars > 1; break;
      case '<': esc = next !== undefined && /[A-Za-z/!?]/.test(next); break;
      case '!': esc = next === '['; break;
    }
    if (c === '<' && esc) out += '&lt;';
    else out += esc ? `\\${c}` : c;
  }
  if (lineStart) {
    const n = /^(\d+)([.)])(?=\s)/.exec(out);
    if (n) out = `${n[1]}\\${n[2]}${out.slice(n[0].length)}`;
    else if (/^(#{1,6}(?=\s|$)|>|[-+](?=\s))/.test(out)) out = `\\${out}`;
  }
  return out;
}
