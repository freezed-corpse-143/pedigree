import type { LayoutConfig } from '../config.ts';

/**
 * D4 — incoming connection lengths. The base length is tried first; longer candidates are
 * only used when every fork height at the current length collides. The ladder is bounded by
 * the configured maximum and doubles the increment.
 */
export function connectionLadder(params: LayoutConfig): number[] {
  const lengths = [params.connect];
  for (let extra = params.connectionIncrement; lengths.at(-1)! < params.maxConnect; extra *= 2) {
    const next = Math.min(params.maxConnect, params.connect + extra);
    if (next === lengths.at(-1)) throw new RangeError('Connection increment is below numeric precision');
    lengths.push(next);
  }
  return lengths;
}
