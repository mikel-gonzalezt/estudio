import { describe, expect, it } from 'vitest';
import { formatClock, initial, pause, remaining, reset, start, tick } from './pomodoro';
import { findMatches, pageText, searchPages, snippet } from './textsearch';

describe('text search', () => {
  it('joins items with a space at line ends, matching the text layer DOM', () => {
    expect(pageText([{ str: 'Atten', hasEOL: false }, { str: 'tion is', hasEOL: true }, { str: 'all' }])).toBe('Attention is all');
  });

  it('finds case-insensitive, non-overlapping matches', () => {
    expect(findMatches('aaaa', 'aa')).toEqual([[0, 2], [2, 4]]);
    expect(findMatches('The Transformer, the model', 'the')).toEqual([[0, 3], [17, 20]]);
    expect(findMatches('abc', '  ')).toEqual([]);
  });

  it('numbers hits per page', () => {
    const hits = searchPages(['x a x', 'none', 'x'], 'x');
    expect(hits.map((h) => [h.page, h.index])).toEqual([[1, 0], [1, 1], [3, 0]]);
  });

  it('builds a snippet around a hit', () => {
    expect(snippet('0123456789abcdef', 8, 9, 2)).toBe('…6789a…');
  });
});

describe('pomodoro', () => {
  const d = { workMs: 25 * 60_000, breakMs: 5 * 60_000 };

  it('counts down only while running', () => {
    let p = start(initial(d), 0);
    expect(remaining(p, 60_000)).toBe(24 * 60_000);
    p = pause(p, 60_000);
    expect(remaining(p, 10 * 60_000)).toBe(24 * 60_000);
    p = start(p, 10 * 60_000);
    expect(remaining(p, 11 * 60_000)).toBe(23 * 60_000);
  });

  it('rolls into an automatic break, then waits before the next work block', () => {
    let p = start(initial(d), 0);
    expect(tick(p, 1000, d)).toBe(p);
    p = tick(p, d.workMs, d);
    expect(p.phase).toBe('break');
    expect(p.completed).toBe(1);
    expect(remaining(p, d.workMs + 60_000)).toBe(4 * 60_000);
    p = tick(p, d.workMs + d.breakMs, d);
    expect(p.phase).toBe('work');
    expect(p.endsAt).toBeNull();
    expect(p.remaining).toBe(d.workMs);
  });

  it('reset restores the current phase length', () => {
    const p = reset(pause(start(initial(d), 0), 5000), d);
    expect(p.remaining).toBe(d.workMs);
  });

  it('formats a clock', () => {
    expect(formatClock(25 * 60_000)).toBe('25:00');
    expect(formatClock(61_001)).toBe('1:02');
  });
});
