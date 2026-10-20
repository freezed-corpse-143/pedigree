import type { LayoutConfig, FrameConfig, RenderConfig } from '../config.ts';
import type { InitializedNode, Point, StemWidths } from '../data.ts';
import type { GeometryScene } from '../geometry.ts';

/** Locally built subtree: absolute-ish geometry plus the per-node stem record. */
export type LocalStem = { id: string; frame: Point; fork: Point | null; tip: Point; angle: number };
export type BuiltSubtree = GeometryScene & { stems: LocalStem[] };

/** Shared bookkeeping for one layout run; only the side budget is mutable. */
export type LayoutContext = {
  frame: FrameConfig;
  render: RenderConfig;
  params: LayoutConfig;
  nodes: ReadonlyMap<string, InitializedNode>;
  widths: ReadonlyMap<string, StemWidths>;
  connections: readonly number[];
  /** Global remaining alternate-side trials; recurses with the tree, never reset. */
  budget: { remaining: number };
  /** Root-only fork floor: raised until the bare trunk reaches `trunkShare` of the tree height. */
  trunkFloor: number;
  /** Optional observer for search effort; callers may pass their own counters. */
  stats: { gateCalls: number; skippedSteps: number };
};

export type AcceptedPlacement = { candidate: BuiltSubtree; tip: Point; height: number; reservedHeight: number };
