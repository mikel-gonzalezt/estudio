/** A pinned figure's place in the document: its page and the normalised top of its clip. */
export interface PinSpot<Id = string> { id: Id; page: number; top: number }

/** How far ahead of the page being read a figure still counts as "coming up". */
export const LOOK_AHEAD_PAGES = 3;

/**
 * The pinned figure to show while `page` is being read. A figure on that page wins, then the
 * nearest one ahead within `ahead` pages (text usually refers to a figure before it appears),
 * then the nearest one in either direction, ahead winning a tie. Figures on the same page are
 * taken top to bottom.
 */
export function pinToShow<Id>(pins: readonly PinSpot<Id>[], page: number, ahead = LOOK_AHEAD_PAGES): Id | null {
  let best: PinSpot<Id> | null = null;
  let bestRank = Infinity;
  for (const p of pins) {
    const d = p.page - page;
    const rank = d === 0 ? 0 : d > 0 && d <= ahead ? d : ahead + 2 * Math.abs(d) - (d > 0 ? 1 : 0);
    if (rank < bestRank || (rank === bestRank && best && p.top < best.top)) {
      best = p;
      bestRank = rank;
    }
  }
  return best?.id ?? null;
}
