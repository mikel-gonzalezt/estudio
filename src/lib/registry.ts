import { chordFromEvent, isTypingTarget, type KeyLike } from './keys';

export interface Command {
  id: string;
  title: string;
  group: string;
  keys?: string[];
  /** Hidden from the palette when false; keybindings are also inert. */
  when?: () => boolean;
  /** Also fires while typing in a text field; otherwise fields keep their own keys (Ctrl+Z, arrows...). */
  global?: boolean;
  run: () => void;
}

export class DuplicateKeyError extends Error {}

export function buildKeymap(commands: readonly Command[]): Map<string, Command> {
  const map = new Map<string, Command>();
  for (const c of commands) {
    for (const k of c.keys ?? []) {
      const prev = map.get(k);
      if (prev) throw new DuplicateKeyError(`${k} bound to both ${prev.id} and ${c.id}`);
      map.set(k, c);
    }
  }
  return map;
}

export function commandForEvent(map: ReadonlyMap<string, Command>, e: KeyLike & { target: EventTarget | null }): Command | undefined {
  const cmd = map.get(chordFromEvent(e));
  if (!cmd || (cmd.when && !cmd.when())) return undefined;
  if (isTypingTarget(e.target) && !cmd.global) return undefined;
  return cmd;
}

export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 1;
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx >= 0) return 100 - idx;
  let ti = 0;
  let score = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return 0;
    score += found === ti ? 2 : 1;
    ti = found + 1;
  }
  return score;
}
