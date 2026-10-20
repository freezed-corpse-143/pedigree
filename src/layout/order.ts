import type { InitializedNode } from '../data.ts';

/**
 * D2 — single-side ordering: heavier subtrees are processed first so they can take the
 * lower fork; input order only breaks ties. This is a processing order, not a guarantee
 * that the heavier sibling ends up lower after collision search.
 */
export function orderChildren(children: readonly string[], nodes: ReadonlyMap<string, InitializedNode>): InitializedNode[] {
  return children
    .map((id, index) => ({ node: nodes.get(id)!, index }))
    .sort((a, b) => b.node.load - a.node.load || a.index - b.index)
    .map(({ node }) => node);
}
