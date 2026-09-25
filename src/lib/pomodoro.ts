export type Phase = 'work' | 'break';

export interface Pomodoro {
  phase: Phase;
  /** Remaining ms when paused; ignored while running. */
  remaining: number;
  /** Wall-clock end of the current phase while running, else null. */
  endsAt: number | null;
  completed: number;
}

export interface Durations { workMs: number; breakMs: number }

export const initial = (d: Durations): Pomodoro => ({ phase: 'work', remaining: d.workMs, endsAt: null, completed: 0 });

export const remaining = (p: Pomodoro, now: number) => (p.endsAt === null ? p.remaining : Math.max(0, p.endsAt - now));

export const start = (p: Pomodoro, now: number): Pomodoro => (p.endsAt !== null ? p : { ...p, endsAt: now + p.remaining });

export const pause = (p: Pomodoro, now: number): Pomodoro => (p.endsAt === null ? p : { ...p, remaining: remaining(p, now), endsAt: null });

export const reset = (p: Pomodoro, d: Durations): Pomodoro => ({ ...p, remaining: p.phase === 'work' ? d.workMs : d.breakMs, endsAt: null });

/** Advances past a finished phase. Returns the same object when nothing changed. */
export function tick(p: Pomodoro, now: number, d: Durations): Pomodoro {
  if (p.endsAt === null || now < p.endsAt) return p;
  const phase: Phase = p.phase === 'work' ? 'break' : 'work';
  const length = phase === 'work' ? d.workMs : d.breakMs;
  return {
    phase,
    remaining: length,
    // Breaks start on their own; the next work block waits for the reader.
    endsAt: phase === 'break' ? p.endsAt + length : null,
    completed: p.phase === 'work' ? p.completed + 1 : p.completed,
  };
}

export function formatClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
