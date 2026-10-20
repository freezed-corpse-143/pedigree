import { geometryConflicts } from '../geometry.ts';
import type { Conflict } from '../geometry.ts';
import type { LayoutConfig } from '../config.ts';
import type { InitializedNode, InitializedTree, Placement } from '../data.ts';
import { connectionLadder } from './connection.ts';
import { orderChildren } from './order.ts';
import { preferredSide, withinAngleCap } from './side.ts';
import { firstForkHeight, forkFloor } from './spacing.ts';
import { searchPlacement } from './search.ts';
import type { AcceptedPlacement, BuiltSubtree, LayoutContext } from './types.ts';

export class NoPlacementError extends RangeError {
  readonly code = 'STEM_NO_PLACEMENT';
  constructor(readonly node: string, readonly conflict: Conflict) {
    super(`No collision-free placement for ${node}: ${conflict.kind} ${conflict.owners.join('/')}`);
  }
}

/**
 * D1 + recursion + assembly. Children are taken in D2 order; each child tries its preferred
 * side, then the other side while the shared budget lasts. Accepted placements update the
 * parent stem and the side loads; rejected attempts leave no trace.
 */
function grow(node: InitializedNode, forkOwner: string | null, absoluteAngle: number, depth: number, ctx: LayoutContext): BuiltSubtree {
  const { params, frame } = ctx;
  const geometry: BuiltSubtree = {
    positions: [{ id: node.id, x: 0, y: 0 }],
    segments: [{ owner: node.id, forkOwner, from: { x: 0, y: forkOwner === null ? 0 : -params.connect }, to: { x: 0, y: params.tip } }],
    stems: [{ id: node.id, frame: { x: 0, y: 0 }, fork: forkOwner === null ? null : { x: 0, y: -params.connect }, tip: { x: 0, y: params.tip }, angle: 0 }],
  };
  let maxFork = 0, lastFork: number | null = null, leftLoad = 0, rightLoad = 0;
  const children = orderChildren(node.children, ctx.nodes);
  // A sole child continues the parent stem: natural trees do not tilt a trunk that has no fork.
  const solo = params.continueSoleChild && children.length === 1;
  for (const child of children) {
    const preferred = preferredSide(leftLoad, rightLoad, absoluteAngle, depth, params);
    let accepted: AcceptedPlacement | null = null;
    let selectedSign = preferred;
    let lastError: NoPlacementError | undefined;
    // Documented rollback edge D3 -> D1: a side that cannot be spaced is abandoned, not fixed.
    for (const sign of solo ? [0] : [preferred, -preferred]) {
      const angle = absoluteAngle + sign * params.tilt;
      if (!withinAngleCap(angle, params.maxAngle)) continue;
      // Only a genuine side switch spends budget; continuation is the sole candidate.
      if (sign !== preferred && sign !== 0) {
        if (ctx.budget.remaining === 0) break;
        ctx.budget.remaining--;
      }
      try {
        const childGeo = grow(child, node.id, angle, depth + 1, ctx);
        // The root stem owns the bare trunk under the crown; other nodes start at the frame gap.
        const floor = forkOwner === null
          ? Math.max(ctx.trunkFloor, forkFloor(frame, lastFork, params.minForkGap))
          : forkFloor(frame, lastFork, params.minForkGap);
        const result = searchPlacement(ctx, geometry, childGeo, sign * params.tilt, maxFork, floor, node.id, solo);
        if (!result.accepted) throw new NoPlacementError(child.id, result.conflict);
        accepted = result.accepted;
        selectedSign = sign;
        break;
      } catch (error) {
        if (!(error instanceof NoPlacementError)) throw error;
        lastError = error;
      }
    }
    if (!accepted) throw lastError ?? new Error('No legal side candidate');
    if (selectedSign > 0) leftLoad += child.load; else rightLoad += child.load;
    // Continuation ends the parent stem at the child fork; otherwise the crown protrudes.
    const parentTip = solo ? accepted.candidate.segments[0]!.from : accepted.tip;
    geometry.segments[0]!.to = parentTip;
    geometry.stems[0]!.tip = { x: parentTip.x, y: parentTip.y };
    geometry.positions.push(...accepted.candidate.positions);
    geometry.segments.push(...accepted.candidate.segments);
    geometry.stems.push(...accepted.candidate.stems);
    maxFork = Math.max(maxFork, accepted.reservedHeight);
    lastFork = accepted.height;
  }
  return geometry;
}

/** Public stage entry: initialized relationships in, coordinates out. */
export function layoutStemScene(state: InitializedTree, params: LayoutConfig, stats: { gateCalls: number; skippedSteps: number } = { gateCalls: 0, skippedSteps: 0 }): Placement[] {
  if (state.phase !== 'initialized') throw new TypeError('Layout requires initialized state');
  const ctx: LayoutContext = {
    frame: state.frame,
    render: state.render,
    params,
    nodes: new Map(state.nodes.map(n => [n.id, n])),
    widths: new Map(state.nodes.map(n => [n.id, n.widths])),
    connections: connectionLadder(params),
    budget: { remaining: params.maxSideTrials },
    trunkFloor: firstForkHeight(state.frame),
    stats,
  };
  // The trunk is a share of the final height, so the floor and the height must agree: iterate
  // the whole layout (deterministic) until the root floor stops moving, then measure once.
  const below = state.frame.below;
  const floorOf = (built: BuiltSubtree) => Math.max(firstForkHeight(state.frame),
    Math.min(params.maxHeightSteps * params.step, params.trunkShare * (Math.max(...built.stems.map(s => s.tip.y)) + below) - below));
  const attempt = () => grow(ctx.nodes.get(state.rootId)!, null, 0, 0, ctx);
  let built = attempt();
  for (let pass = 0; pass < 4; pass++) {
    const next = floorOf(built);
    if (Math.abs(next - ctx.trunkFloor) <= 0.5) break;
    ctx.trunkFloor = next;
    ctx.budget.remaining = params.maxSideTrials;
    built = attempt();
  }
  // Re-measure the accepted layout so the reported effort belongs to the final geometry only.
  ctx.budget.remaining = params.maxSideTrials;
  stats.gateCalls = 0;
  stats.skippedSteps = 0;
  built = attempt();
  const conflict = geometryConflicts(built, state.frame, ctx.widths, state.render, true)[0];
  if (conflict) throw new RangeError(`Invalid final scene: ${conflict.kind} ${conflict.owners.join('/')}`);
  return built.stems.map(s => ({ id: s.id, center: s.frame, from: s.fork ?? s.frame, to: s.tip, angle: s.angle }));
}
