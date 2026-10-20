import type { LaidOutTree } from '../data.ts';

/**
 * C3 — lateral balance metric, the only currently measurable "centre of mass" signal.
 * Zero means the frames' x-coordinates cancel out; it is reported today and is the intended
 * constraint input for the next stage (rollback edge C3 -> D4 in the stage contract).
 */
export function axisMoment(state: LaidOutTree): number {
  const sumAbs = state.nodes.reduce((sum, n) => sum + Math.abs(n.geometry.center.x), 0);
  return sumAbs ? Math.abs(state.nodes.reduce((sum, n) => sum + n.geometry.center.x, 0)) / sumAbs : 0;
}

/**
 * C3b — lateral balance per branching node: mean normalized child offset. Chains and lone
 * roots carry no lateral signal, so they are skipped instead of scoring a meaningless 1.
 */
export function branchMoment(state: LaidOutTree): number {
  const byId = new Map(state.nodes.map(n => [n.id, n]));
  const values: number[] = [];
  for (const node of state.nodes) {
    if (node.children.length < 2) continue;
    const offsets = node.children.map(id => byId.get(id)!.geometry.center.x - node.geometry.center.x);
    const sumAbs = offsets.reduce((sum, value) => sum + Math.abs(value), 0);
    if (sumAbs === 0) continue;
    values.push(Math.abs(offsets.reduce((sum, value) => sum + value, 0)) / sumAbs);
  }
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
