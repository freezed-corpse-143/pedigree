import { sceneBounds } from '../src/render.ts';
import { NoPlacementError } from '../src/layout/index.ts';
import { axisMoment, branchMoment } from '../src/layout/centroid.ts';
import { buildTree, config } from './helpers.ts';
import type { LaidOutTree } from '../src/data.ts';

// Frozen acceptance metrics: see docs/design/acceptance-metrics.md.
export const THRESHOLDS = {
  accepted: 200,
  rejected: 0,
  branchMomentP95: 0.9,
  aspectP50: 1.9,
  aspectP95: 3.5,
  aspectMax: 10.4,
  widthP50: 490,
  widthMax: 980,
  heightP50: 900,
  heightMax: 2280,
  baseShare: 0.89,
  baseline: { nodes: 6, aspect: 1.505, axisMoment: 0.503, branchMoment: 0.667 },
};

type Sample = { index: number, nodes: number, width: number, height: number, aspect: number, axisMoment: number, branchMoment: number, maxConnection: number, baseShare: number, gateCalls: number, skippedSteps: number };

export function sample(state: LaidOutTree, index: number, stats = { gateCalls: 0, skippedSteps: 0 }): Sample {
  const bounds = sceneBounds(state);
  const width = bounds.maxX - bounds.minX, height = bounds.maxY - bounds.minY;
  const connections = state.nodes.filter(n => n.parentId !== null).map(n =>
    Math.hypot(n.geometry.center.x - n.geometry.from.x, n.geometry.center.y - n.geometry.from.y));
  return {
    index, nodes: state.nodes.length, width: +width.toFixed(1), height: +height.toFixed(1),
    aspect: +(height / width).toFixed(3), axisMoment: +axisMoment(state).toFixed(3),
    branchMoment: +branchMoment(state).toFixed(3),
    maxConnection: +Math.max(...connections).toFixed(1),
    baseShare: +(connections.filter(l => l <= config.layout.connect + 0.01).length / connections.length).toFixed(3),
    gateCalls: stats.gateCalls, skippedSteps: stats.skippedSteps,
  };
}

export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;
}

export function summarize(samples: Sample[], rejected: number) {
  const column = (key: keyof Sample) => samples.map(s => Number(s[key]));
  return {
    accepted: samples.length, rejected,
    axisMoment: { p50: percentile(column('axisMoment'), 0.5), p95: percentile(column('axisMoment'), 0.95), max: Math.max(...column('axisMoment')) },
    branchMoment: { p50: percentile(column('branchMoment'), 0.5), p95: percentile(column('branchMoment'), 0.95), max: Math.max(...column('branchMoment')) },
    aspect: { p50: percentile(column('aspect'), 0.5), p95: percentile(column('aspect'), 0.95), max: Math.max(...column('aspect')) },
    width: { p50: percentile(column('width'), 0.5), max: Math.max(...column('width')) },
    height: { p50: percentile(column('height'), 0.5), max: Math.max(...column('height')) },
    baseShare: { mean: +(column('baseShare').reduce((a, b) => a + b, 0) / Math.max(1, samples.length)).toFixed(3) },
    effort: {
      gateCalls: column('gateCalls').reduce((a, b) => a + b, 0),
      skippedSteps: column('skippedSteps').reduce((a, b) => a + b, 0),
      medianGateCalls: percentile(column('gateCalls'), 0.5),
    },
  };
}

export function collect(roots: readonly unknown[], overrides = {}) {
  const samples: Sample[] = [];
  let rejected = 0;
  roots.forEach((root, index) => {
    try {
      const stats = { gateCalls: 0, skippedSteps: 0 };
      samples.push(sample(buildTree(root, overrides, stats), index, stats));
    } catch (error) {
      if (!(error instanceof NoPlacementError)) throw error;
      rejected++;
    }
  });
  return { samples, summary: summarize(samples, rejected) };
}
