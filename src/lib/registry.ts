import { chordFromEvent, isTypingTarget, type KeyLike } from './keys';

export interface Command {
  id: string;
  title: string;
  group: string;
  keys?: string[];
  /** Hidden from the palette when false; keybindings are also inert. */
  when?: () => boolean;
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

/** Plain keys stay live while typing only if they carry a modifier or are Escape. */
export function commandForEvent(map: ReadonlyMap<string, Command>, e: KeyLike & { target: EventTarget | null }): Command | undefined {
  const chord = chordFromEvent(e);
  const typing = isTypingTarget(e.target);
  if (typing && !chord.includes('Ctrl+') && !chord.includes('Alt+') && chord !== 'Escape') return undefined;
  const cmd = map.get(chord);
  if (!cmd || (cmd.when && !cmd.when())) return undefined;
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
