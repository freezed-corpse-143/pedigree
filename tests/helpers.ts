import { loadConfig, LayoutConfigSchema } from '../src/config.ts';
import type { LayoutConfig } from '../src/config.ts';
import type { Mount } from '../src/mount.ts';
import type { LaidOutTree, TreeNode } from '../src/data.ts';
import { validateTree } from '../src/validate-tree.ts';
import { initializeTree, applyLayout } from '../src/state.ts';
import { layoutStemScene } from '../src/layout/index.ts';
import { geometryConflicts } from '../src/geometry.ts';

export const config = await loadConfig();

/** One full pipeline pass for tests: validate -> initialize -> layout -> apply. */
export function buildTree(input: unknown, overrides: Partial<LayoutConfig> = {},
  stats?: { gateCalls: number, skippedSteps: number }, mount?: Mount): LaidOutTree {
  const draft = initializeTree(validateTree(input) as TreeNode, config, mount);
  return applyLayout(draft, layoutStemScene(draft, LayoutConfigSchema.parse({ ...config.layout, ...overrides }), stats));
}

/** Gate inputs for a published state; keeps tests on the same width/frame policy as layout. */
export function sceneConflicts(state: LaidOutTree) {
  return geometryConflicts({
    positions: state.nodes.map(n => ({ id: n.id, ...n.geometry.center })),
    segments: state.nodes.map(n => ({ owner: n.id, forkOwner: n.parentId, from: n.geometry.from, to: n.geometry.to })),
  }, state.frame, new Map(state.nodes.map(n => [n.id, n.widths])), state.render);
}
