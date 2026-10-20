import type { FrameConfig } from '../config.ts';
import type { Point } from '../data.ts';

type Frame = Point & { id: string };

/**
 * D3 — occupancy budget for the frame–frame constraint.
 *
 * `candidate` frames are given at the reference placement height and `placed` frames are the
 * ones already on the canvas. Returns the smallest *absolute* height at which every candidate
 * frame is separated from every overlapping-column placed frame by at least `centerGap`.
 *
 * Pairs that are already separated (above or below) impose nothing: raising a subtree can
 * never restore a violated pair, so only pairs closer than the required vertical gap push the
 * answer up. Frames whose columns differ by `centerGap` or more can never collide.
 *
 * This is a lower bound used to skip hopeless scan steps, not a verdict: branch capsules and
 * branch–frame overlaps are still judged by the collision gate.
 */
export function frameBudget(candidate: readonly Point[], placed: readonly Point[], frame: FrameConfig): number {
  const gap = Math.hypot(frame.width + frame.gap, frame.above + frame.below + frame.gap);
  const shift = (frame.above - frame.below) / 2;
  let required = 0;
  for (const p of candidate) {
    for (const q of placed) {
      const dx = Math.abs(p.x - q.x);
      if (dx >= gap) continue;
      const vertical = Math.sqrt(gap * gap - dx * dx);
      const dy = (p.y + shift) - (q.y + shift);
      // Already clear above or below; only the "too close" band constrains the height.
      if (Math.abs(dy) >= vertical) continue;
      const needed = q.y + vertical - p.y;
      if (needed > required) required = needed;
    }
  }
  return required;
}

/**
 * Ancestor-axis reservation. A parent stem is a straight vertical corridor in its own local
 * frame; any frame of a candidate subtree that sits inside it blocks every future fork that
 * has to grow past that height, which no amount of raising the candidate can repair.
 *
 * The check is deliberately unbounded in height: a frame above the current tip is exactly the
 * one a later sibling would sweep when it raises the stem, so limiting the lookahead to the
 * current crown removes the rule's only benefit (measured: identical to disabling it).
 *
 * Returns the first offending frame id, or null when the corridor is clear.
 */
export function firstCorridorViolation(frames: readonly Frame[], corridor: number): string | null {
  for (const frame of frames) if (Math.abs(frame.x) < corridor - 1e-9) return frame.id;
  return null;
}
