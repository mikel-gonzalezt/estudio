import type { Srs } from './types';

/** FSRS-5 with default parameters and 90% desired retention. */
export const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
] as const;

export const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 } as const;
export type Grade = (typeof Rating)[keyof typeof Rating];
export const GRADES: Grade[] = [1, 2, 3, 4];

const DECAY = -0.5;
const FACTOR = 19 / 81;
const RETENTION = 0.9;
const MAX_INTERVAL_DAYS = 36500;
const MINUTE = 60_000;
const DAY = 86_400_000;

const w = (i: number) => W[i]!;
const clampD = (d: number) => Math.min(10, Math.max(1, d));

export function newSrs(now: number): Srs {
  return { due: now, stability: 0, difficulty: 0, reps: 0, lapses: 0, state: 'new' };
}

export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}

export function intervalDays(stability: number): number {
  const raw = (stability / FACTOR) * (Math.pow(RETENTION, 1 / DECAY) - 1);
  return Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(raw)));
}

const initStability = (g: Grade) => Math.max(0.1, w(g - 1));
const initDifficulty = (g: Grade) => clampD(w(4) - Math.exp(w(5) * (g - 1)) + 1);

function nextDifficulty(d: number, g: Grade): number {
  const delta = -w(6) * (g - 3);
  const damped = d + (delta * (10 - d)) / 9;
  return clampD(w(7) * initDifficulty(Rating.Easy) + (1 - w(7)) * damped);
}

function recallStability(d: number, s: number, r: number, g: Grade): number {
  const hard = g === Rating.Hard ? w(15) : 1;
  const easy = g === Rating.Easy ? w(16) : 1;
  return s * (1 + Math.exp(w(8)) * (11 - d) * Math.pow(s, -w(9)) * (Math.exp(w(10) * (1 - r)) - 1) * hard * easy);
}

function forgetStability(d: number, s: number, r: number): number {
  const f = w(11) * Math.pow(d, -w(12)) * (Math.pow(s + 1, w(13)) - 1) * Math.exp(w(14) * (1 - r));
  return Math.min(f, s / Math.exp(w(17) * w(18)));
}

function shortTermStability(s: number, g: Grade): number {
  return s * Math.exp(w(17) * (g - 3 + w(18)));
}

const inMinutes = (now: number, m: number) => now + m * MINUTE;
const inDays = (now: number, d: number) => now + d * DAY;

export function schedule(srs: Srs, g: Grade, now: number): Srs {
  const base = { reps: srs.reps + 1, lapses: srs.lapses, last: now };

  if (srs.state === 'new') {
    const stability = initStability(g);
    const difficulty = initDifficulty(g);
    if (g === Rating.Easy) return { ...base, stability, difficulty, state: 'review', due: inDays(now, intervalDays(stability)) };
    const wait = g === Rating.Again ? 1 : g === Rating.Hard ? 5 : 10;
    return { ...base, stability, difficulty, state: 'learning', due: inMinutes(now, wait) };
  }

  const difficulty = nextDifficulty(srs.difficulty, g);

  if (srs.state === 'learning' || srs.state === 'relearning') {
    const stability = shortTermStability(srs.stability, g);
    if (g === Rating.Again) return { ...base, stability, difficulty, state: srs.state, due: inMinutes(now, 5) };
    if (g === Rating.Hard) return { ...base, stability, difficulty, state: srs.state, due: inMinutes(now, 10) };
    const good = intervalDays(stability);
    const days = g === Rating.Easy ? Math.max(good + 1, intervalDays(shortTermStability(srs.stability, Rating.Easy))) : good;
    return { ...base, stability, difficulty, state: 'review', due: inDays(now, days) };
  }

  const elapsed = srs.last === undefined ? 0 : (now - srs.last) / DAY;
  const r = retrievability(elapsed, srs.stability);
  if (g === Rating.Again) {
    return { ...base, lapses: srs.lapses + 1, stability: forgetStability(difficulty, srs.stability, r), difficulty, state: 'relearning', due: inMinutes(now, 5) };
  }
  const intervals = ([Rating.Hard, Rating.Good, Rating.Easy] as const).map((x) =>
    intervalDays(recallStability(nextDifficulty(srs.difficulty, x), srs.stability, r, x)),
  );
  let [hard, good, easy] = intervals as [number, number, number];
  hard = Math.min(hard, good);
  good = Math.max(good, hard + 1);
  easy = Math.max(easy, good + 1);
  const days = g === Rating.Hard ? hard : g === Rating.Good ? good : easy;
  return { ...base, stability: recallStability(difficulty, srs.stability, r, g), difficulty, state: 'review', due: inDays(now, days) };
}

export function preview(srs: Srs, now: number): Record<Grade, Srs> {
  return { 1: schedule(srs, 1, now), 2: schedule(srs, 2, now), 3: schedule(srs, 3, now), 4: schedule(srs, 4, now) };
}

export function formatInterval(ms: number): string {
  const m = Math.round(ms / MINUTE);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(ms / DAY);
  if (d < 31) return `${d}d`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}

export const isDue = (srs: Srs, now: number) => srs.due <= now;
