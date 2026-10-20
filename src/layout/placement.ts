import type { Point } from '../data.ts';
import type { BuiltSubtree } from './types.ts';

/**
 * Rigid attachment of an already built child subtree: rotate by the child's relative tilt,
 * then translate so the fork lands exactly on the parent stem. Only the incoming stem is
 * extended when the connection length differs from the base one.
 */
export function placeSubtree(
  geo: BuiltSubtree,
  delta: number,
  height: number,
  connect: number,
  baseConnect: number,
): BuiltSubtree {
  const cos = Math.cos(delta), sin = Math.sin(delta);
  const tx = -connect * sin, ty = height + connect * cos;
  const move = (p: Point): Point => ({ x: p.x * cos - p.y * sin + tx, y: p.x * sin + p.y * cos + ty });
  const result: BuiltSubtree = {
    positions: geo.positions.map(p => ({ id: p.id, ...move(p) })),
    segments: geo.segments.map(s => ({ owner: s.owner, forkOwner: s.forkOwner, from: move(s.from), to: move(s.to) })),
    stems: geo.stems.map(s => ({ id: s.id, frame: move(s.frame), fork: s.fork && move(s.fork), tip: move(s.tip), angle: s.angle + delta })),
  };
  if (connect !== baseConnect) {
    result.segments[0]!.from = { x: 0, y: height };
    result.stems[0]!.fork = { x: 0, y: height };
  }
  return result;
}
