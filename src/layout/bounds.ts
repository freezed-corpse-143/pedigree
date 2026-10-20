import type { BuiltSubtree } from './types.ts';

/** Axis-aligned occupancy of a built subtree, in the same local coordinate space. */
export function subtreeBounds(geo: BuiltSubtree) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const visit = (x: number, y: number) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  };
  for (const p of geo.positions) visit(p.x, p.y);
  for (const s of geo.segments) { visit(s.from.x, s.from.y); visit(s.to.x, s.to.y); }
  return { minX, maxX, minY, maxY };
}

/** Highest occupied point: the spacing scan must clear this line. Allocation-free hot path. */
export function occupiedTop(geo: BuiltSubtree): number {
  let top = -Infinity;
  for (const p of geo.positions) top = Math.max(top, p.y);
  for (const s of geo.segments) top = Math.max(top, s.from.y, s.to.y);
  return top;
}
