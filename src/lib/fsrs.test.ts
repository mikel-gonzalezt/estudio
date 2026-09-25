import { describe, expect, it } from 'vitest';
import { formatInterval, intervalDays, newSrs, preview, Rating, retrievability, schedule, W } from './fsrs';

const DAY = 86_400_000;
const t0 = Date.UTC(2026, 0, 1);

describe('FSRS primitives', () => {
  it('retrievability is 1 at t=0, 0.9 after one stability interval, and decays', () => {
    expect(retrievability(0, 5)).toBe(1);
    expect(retrievability(5, 5)).toBeCloseTo(0.9, 5);
    expect(retrievability(50, 5)).toBeLessThan(retrievability(10, 5));
  });

  it('at 90% retention the interval equals the stability', () => {
    expect(intervalDays(10)).toBe(10);
    expect(intervalDays(0.01)).toBe(1);
    expect(intervalDays(1e9)).toBe(36500);
  });
});

describe('schedule', () => {
  it('first review seeds stability from the default weights', () => {
    const good = schedule(newSrs(t0), Rating.Good, t0);
    expect(good.stability).toBeCloseTo(W[2]);
    expect(good.state).toBe('learning');
    expect(good.due - t0).toBe(10 * 60_000);
    expect(good.reps).toBe(1);
  });

  it('easy on a new card graduates straight to review with a multi-day interval', () => {
    const easy = schedule(newSrs(t0), Rating.Easy, t0);
    expect(easy.state).toBe('review');
    expect(easy.due - t0).toBe(16 * DAY);
  });

  it('difficulty stays within [1,10] and easier grades lower it', () => {
    const again = schedule(newSrs(t0), Rating.Again, t0);
    const easy = schedule(newSrs(t0), Rating.Easy, t0);
    expect(again.difficulty).toBeLessThanOrEqual(10);
    expect(easy.difficulty).toBeGreaterThanOrEqual(1);
    expect(again.difficulty).toBeGreaterThan(easy.difficulty);
  });

  it('learning -> review on Good, and review intervals grow on successive Goods', () => {
    let s = schedule(newSrs(t0), Rating.Good, t0);
    let now = s.due;
    s = schedule(s, Rating.Good, now);
    expect(s.state).toBe('review');
    const first = s.due - now;
    now = s.due;
    s = schedule(s, Rating.Good, now);
    expect(s.due - now).toBeGreaterThan(first);
  });

  it('Again on a review card is a lapse that drops stability and relearns', () => {
    const review = schedule(newSrs(t0), Rating.Easy, t0);
    const lapsed = schedule(review, Rating.Again, review.due);
    expect(lapsed.state).toBe('relearning');
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.stability).toBeLessThan(review.stability);
    expect(lapsed.due - review.due).toBe(5 * 60_000);
  });

  it('review intervals are ordered hard <= good < easy', () => {
    const review = schedule(newSrs(t0), Rating.Easy, t0);
    const p = preview(review, review.due);
    expect(p[2].due).toBeLessThanOrEqual(p[3].due);
    expect(p[3].due).toBeLessThan(p[4].due);
  });

  it('is pure: the input is not mutated', () => {
    const s = newSrs(t0);
    const copy = { ...s };
    schedule(s, Rating.Good, t0);
    expect(s).toEqual(copy);
  });
});

describe('formatInterval', () => {
  it('formats minutes, hours, days and months', () => {
    expect(formatInterval(10 * 60_000)).toBe('10m');
    expect(formatInterval(3 * 3_600_000)).toBe('3h');
    expect(formatInterval(4 * DAY)).toBe('4d');
    expect(formatInterval(90 * DAY)).toBe('3mo');
  });
});
