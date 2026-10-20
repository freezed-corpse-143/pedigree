import { geometryConflicts } from '../geometry.ts';
import type { Conflict, GeometryScene } from '../geometry.ts';
import { crownTip } from './crown.ts';
import { forkScanSteps, reservedForkHeight } from './spacing.ts';
import { placeSubtree } from './placement.ts';
import { occupiedTop } from './bounds.ts';
import { frameBudget, firstCorridorViolation } from './contour.ts';
import type { AcceptedPlacement, BuiltSubtree, LayoutContext } from './types.ts';

export type SearchResult =
  | { accepted: AcceptedPlacement; conflict: null }
  | { accepted: null; conflict: Conflict };

/**
 * Solver for one side of one parent. It owns no policy of its own: lengths come from D4,
 * heights from D3 (floor + occupancy budget), the tip from C2 and the verdict from C1.
 *
 * The budget may only skip heights where a frame pair is already too close to be rescued by
 * raising, so a blind scan would reject them too; the collision gate stays authoritative.
 */
export function searchPlacement(
  ctx: LayoutContext,
  geometry: BuiltSubtree,
  childGeo: BuiltSubtree,
  delta: number,
  maxFork: number,
  floor: number,
  parentId: string,
  continuation = false,
): SearchResult {
  const { frame } = ctx;
  const firstHeight = floor;
  const centerGap = Math.hypot(frame.width + frame.gap, frame.above + frame.below + frame.gap);
  const top = occupiedTop(geometry);
  let conflict: Conflict | null = null;
  for (const connect of ctx.connections) {
    const first = placeSubtree(childGeo, delta, firstHeight, connect, ctx.params.connect);
    const budget = frameBudget(first.positions, geometry.positions, frame);
    const bottom = Math.min(...first.positions.map(p => p.y), ...first.segments.flatMap(s => [s.from.y, s.to.y])) - firstHeight;
    const steps = forkScanSteps(frame, firstHeight, ctx.params, top, bottom);
    const start = Math.min(steps, Math.max(0, Math.ceil((budget - firstHeight) / ctx.params.step)));
    ctx.stats.skippedSteps += start;
    for (let attempt = start; attempt <= steps; attempt++) {
      const height = firstHeight + attempt * ctx.params.step;
      const candidate = placeSubtree(childGeo, delta, height, connect, ctx.params.connect);
      const reservedHeight = reservedForkHeight(height, attempt, ctx.params.step);
      const tip = crownTip(maxFork, reservedHeight, ctx.params.tip);
      // A continuing stem has no sibling to sweep past it later, so its own axis stays usable.
      if (ctx.params.reserveAncestorCorridor && !continuation) {
        const corridor = frame.width / 2 + frame.gap;
        const offender = firstCorridorViolation(candidate.positions, corridor);
        if (offender) {
          conflict = { kind: 'ancestor-corridor', owners: [parentId, offender] };
          continue;
        }
      }
      // A continuing parent stem stops at the child's fork; it must not overlap the child stem.
      const parentTip = continuation ? candidate.segments[0]!.from : tip;
      const assembled: GeometryScene = {
        positions: [...geometry.positions, ...candidate.positions],
        segments: [{ ...geometry.segments[0]!, to: parentTip }, ...geometry.segments.slice(1), ...candidate.segments],
      };
      ctx.stats.gateCalls++;
      conflict = geometryConflicts(assembled, frame, ctx.widths, ctx.render, true)[0] ?? null;
      if (!conflict) return { accepted: { candidate, tip, height, reservedHeight }, conflict: null };
    }
  }
  if (!conflict) throw new Error('Placement search exhausted without a conflict record');
  return { accepted: null, conflict };
}
