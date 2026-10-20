import type { Point } from '../data.ts';

/**
 * C2 — crown height. A parent stem must protrude at least `tip` above its highest fork, so
 * the stem tip is derived from the accepted fork height, never guessed independently.
 */
export function crownTip(maxFork: number, reservedHeight: number, tip: number): Point {
  return { x: 0, y: Math.max(maxFork, reservedHeight) + tip };
}
