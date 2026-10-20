type Shape = { children: Shape[] };
const node = (...children: Shape[]): Shape => ({ children });
const chain = (count: number): Shape => count === 1 ? node() : node(chain(count - 1));
const binary = (depth: number): Shape => depth === 0 ? node() : node(binary(depth - 1), binary(depth - 1));
const fan = (count: number): Shape => node(...Array.from({ length: count }, () => node()));
/** Comb: every spine node also carries a leaf, so both sides stay occupied the whole way up. */
const comb = (count: number): Shape => count === 0 ? node() : node(node(), comb(count - 1));
const identify = (root: Shape): { id: string, children: { id: string, children: unknown[] }[] } => {
  let next = 0;
  const visit = (n: Shape): { id: string, children: { id: string, children: unknown[] }[] } =>
    ({ id: `n${next++}`, children: n.children.map(visit) });
  return visit(root);
};

/** All entries must lay out under the current defaults; historical stage A is checked separately. */
export type ClearanceFixture = {
  name: string;
  root: { id: string, children: { id: string, children: unknown[] }[] };
};

export const clearanceFixtures: ClearanceFixture[] = ([
  ['one-subtree', node(node(node(), node()), node(), node())],
  // Deletion-minimal within binary4: no single subtree removal preserves the old frame hit.
  ['counterexample', node(chain(3), node(binary(2)))],
  ['binary4', binary(4)],
  ['binary3', binary(3)],
  ['chain20', chain(20)],
  ['fan30', fan(30)],
  ['two-fans', node(fan(5), fan(5))],
  ['comb6', comb(6)],
  ['skewed', node(chain(5), node())],
  // Extreme: the root owns a single first-level child, so the first fork can only happen one level up.
  ['single-child', node(node(node(), node(), node(), node()))],
  // Mixed family used to block the root axis; corridor reservation is what makes it layout.
  ['mixed', node(fan(3), chain(5), node(node(node(), node()), node()), node())],
] as [string, Shape][]).map(([name, root]) => ({ name, root: identify(root) }));
