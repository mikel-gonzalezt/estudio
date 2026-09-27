export interface KeyLike { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }

/**
 * Normalises a key event to a chord string such as `j`, `J`, `Ctrl+K`, `Alt+ArrowLeft`.
 * Printable characters keep their case and carry Shift implicitly, so `J` means Shift+j
 * and `Ctrl++` works on layouts where + needs Shift.
 */
export function chordFromEvent(e: KeyLike): string {
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  let key = e.key === ' ' ? 'Space' : e.key;
  const printable = key.length === 1;
  if (printable && mods.length > 0 && /[a-z]/i.test(key)) {
    if (e.shiftKey) mods.push('Shift');
    key = key.toUpperCase();
  } else if (!printable && e.shiftKey) {
    mods.push('Shift');
  }
  return [...mods, key].join('+');
}

const PRETTY: Record<string, string> = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  PageDown: 'PgDn', PageUp: 'PgUp', Escape: 'Esc',
};

export function formatChord(chord: string): string {
  if (chord.endsWith('++')) return `${formatChord(chord.slice(0, -2))}++`.replace(/^\+/, '');
  return chord.split('+').map((k) => PRETTY[k] ?? k).join('+');
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as Partial<HTMLInputElement> | null;
  if (!el?.tagName) return false;
  return el.isContentEditable === true || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' ||
    (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'range', 'color'].includes(el.type ?? ''));
}

/** Ctrl+click or a middle click: the gesture that opens a document in a new window. */
export function newWindowClick(e: Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey'>): boolean {
  return e.button === 1 || (e.button === 0 && (e.ctrlKey || e.metaKey));
}
