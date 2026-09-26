import { describe, expect, it } from 'vitest';
import { pinToShow, type PinSpot } from './pick';

const spot = (id: string, page: number, top = 0.5): PinSpot => ({ id, page, top });

describe('pinToShow', () => {
  it('shows nothing when nothing is pinned', () => {
    expect(pinToShow([], 4)).toBeNull();
  });

  it('prefers a figure on the page being read', () => {
    expect(pinToShow([spot('a', 3), spot('b', 4), spot('c', 5)], 4)).toBe('b');
  });

  it('takes the topmost of several figures on the same page', () => {
    expect(pinToShow([spot('low', 4, 0.7), spot('high', 4, 0.1)], 4)).toBe('high');
  });

  it('prefers the nearest figure ahead within the look-ahead window', () => {
    expect(pinToShow([spot('behind', 9), spot('far', 13), spot('near', 12)], 10)).toBe('near');
  });

  it('prefers a figure a few pages ahead over one just behind', () => {
    expect(pinToShow([spot('behind', 9), spot('ahead', 13)], 10)).toBe('ahead');
  });

  it('falls back to the nearest figure behind once none is close ahead', () => {
    expect(pinToShow([spot('fig1', 3), spot('fig2', 4)], 6)).toBe('fig2');
    expect(pinToShow([spot('behind', 8), spot('ahead', 15)], 10)).toBe('behind');
  });

  it('breaks an equal distance beyond the window in favour of the figure ahead', () => {
    expect(pinToShow([spot('behind', 5), spot('ahead', 15)], 10)).toBe('ahead');
  });

  it('follows the reader through a document', () => {
    const pins = [spot('fig1', 3, 0.1), spot('fig2', 4, 0.2)];
    expect([1, 2, 3, 4, 5, 6].map((p) => pinToShow(pins, p))).toEqual(['fig1', 'fig1', 'fig1', 'fig2', 'fig2', 'fig2']);
  });

  it('honours a custom look-ahead', () => {
    expect(pinToShow([spot('behind', 9), spot('ahead', 13)], 10, 1)).toBe('behind');
  });
});
