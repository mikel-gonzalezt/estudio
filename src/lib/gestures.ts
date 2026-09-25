export const TAP_WINDOW_MS = 250;
export const TAP_SLOP_PX = 12;
const TAP_MAX_MS = 400;

interface Touch { x: number; y: number }

/**
 * Recognises a two-finger tap: exactly two touches landing within `TAP_WINDOW_MS`, neither travelling
 * more than `TAP_SLOP_PX`, and both lifted within `TAP_MAX_MS`. `up` returns true on the lift that completes one.
 */
export class TwoFingerTap {
  #touches = new Map<number, Touch>();
  #start = 0;
  #count = 0;
  #spoiled = false;

  down(id: number, x: number, y: number, t: number) {
    if (this.#touches.size === 0) {
      this.#start = t;
      this.#count = 0;
      this.#spoiled = false;
    }
    this.#count += 1;
    if (this.#count > 2 || t - this.#start > TAP_WINDOW_MS) this.#spoiled = true;
    this.#touches.set(id, { x, y });
  }

  move(id: number, x: number, y: number) {
    const p = this.#touches.get(id);
    if (p && Math.hypot(x - p.x, y - p.y) > TAP_SLOP_PX) this.#spoiled = true;
  }

  up(id: number, t: number): boolean {
    if (!this.#touches.delete(id) || this.#touches.size > 0) return false;
    return !this.#spoiled && this.#count === 2 && t - this.#start <= TAP_MAX_MS;
  }

  cancel(id: number) {
    this.#spoiled = true;
    this.#touches.delete(id);
  }
}
