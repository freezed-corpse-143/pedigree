import { z } from 'zod';
import { InitializedTreeSchema, LaidOutTreeSchema, PlacementSchema } from './data.ts';
import type { InitializedNode, InitializedTree, LaidOutTree, Placement, TreeNode } from './data.ts';
import type { AppConfig } from './config.ts';
import { assertMount, frameMount } from './mount.ts';
import type { Mount } from './mount.ts';

/**
 * Validated relationships -> explicit geometry-free tree. No input references retained.
 * The mount owns the spacing envelope, so a custom shape spaces the tree before layout runs.
 */
export function initializeTree(root: TreeNode, config: AppConfig, mount: Mount = frameMount): InitializedTree {
  const frame = assertMount(mount).envelope(config.frame, config.render);
  const nodes: InitializedNode[] = [];
  const visit = (node: TreeNode, parentId: string | null): number => {
    const record: InitializedNode = {
      id: node.id, parentId, children: node.children.map(c => c.id), load: 1,
      widths: { start: 1, frame: 1, tip: 1 }, geometry: null,
    };
    nodes.push(record);
    for (const child of node.children) record.load += visit(child, node.id);
    return record.load;
  };
  visit(root, null);
  const policy = config.render.width;
  const ownWidths = new Map(nodes.map(n => [n.id, Math.max(policy.min, Math.min(policy.max, Math.sqrt(n.load) * policy.scale))]));
  for (const node of nodes) {
    const width = ownWidths.get(node.id)!;
    node.widths = {
      start: node.parentId === null ? width : ownWidths.get(node.parentId)! * policy.parentRatio,
      frame: width, tip: Math.max(policy.tipMin, width * policy.tipRatio),
    };
  }
  // A continued trunk never widens upward: a sole child starts at most as wide as its own frame.
  if (config.layout.continueSoleChild) {
    for (const node of nodes) {
      if (node.children.length !== 1) continue;
      const child = nodes.find(n => n.id === node.children[0])!;
      child.widths.start = Math.min(child.widths.start, child.widths.frame);
    }
  }
  return InitializedTreeSchema.parse({phase:'initialized',rootId:root.id,frame,render:config.render,nodes});
}

/** Apply a complete coordinate set atomically. Never publish partial geometry. */
export function applyLayout(state: InitializedTree, placements: readonly Placement[]): LaidOutTree {
  const draft = InitializedTreeSchema.parse(state);
  const parsed = z.array(PlacementSchema).parse(placements);
  const byId = new Map(draft.nodes.map(n => [n.id, n]));
  const seen = new Set<string>();
  for (const p of parsed) {
    if (seen.has(p.id)) throw new Error(`Duplicate placement: ${p.id}`);
    if (!byId.has(p.id)) throw new Error(`Unknown placement: ${p.id}`);
    seen.add(p.id);
  }
  if (seen.size !== byId.size) throw new Error('Missing placements: incomplete node coverage');
  return LaidOutTreeSchema.parse({
    ...draft, phase: 'laid-out',
    nodes: parsed.map(({id,...geometry}) => ({...byId.get(id)!,geometry})),
  });
}
