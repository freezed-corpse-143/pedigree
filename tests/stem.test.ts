import assert from 'node:assert/strict';
import { buildTree, config } from './helpers.ts';
import { layoutStemScene } from '../src/layout/index.ts';
import { initializeTree } from '../src/state.ts';
import { validateTree } from '../src/validate-tree.ts';
import type { LaidOutTree } from '../src/data.ts';

const node = (id: string, ...children: { id: string, children: unknown[] }[]): { id: string, children: unknown[] } => ({ id, children });
const chain = (n: number): { id: string, children: unknown[] } => n === 1 ? node('leaf') : node(`c${n}`, chain(n - 1));
const fan = (n: number) => node('root', ...Array.from({ length: n }, (_, i) => node(`leaf-${i}`)));
const balanced2 = () => {
  const leaf = (id: string) => node(id);
  const b = (id: string) => node(id, leaf(`${id}-a`), leaf(`${id}-b`));
  return node('root', b('x'), b('y'));
};
const oneSubtree = node('root', node('expanded', node('g1'), node('g2')), node('leaf-b'), node('leaf-c'));
// Ordering: within a shared side, the heavy branch forks below its lighter sibling.
const uneven = node('root', node('a'), node('b'), node('c', node('c1'), node('c2')));
const fixtures = [chain(6), fan(5), balanced2(), oneSubtree, uneven];
const { frame } = config;
const gapOf = (a: { x: number, y: number }, b: { x: number, y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(frame.width + frame.gap, frame.above + frame.below + frame.gap);
const cross = (a: { x: number, y: number }, b: { x: number, y: number }, c: { x: number, y: number }) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const byId = (state: LaidOutTree) => new Map(state.nodes.map(n => [n.id, n]));

let scenarios = 0;
for (const root of fixtures) {
  const before = JSON.stringify(root);
  const scene = buildTree(root);
  assert.equal(JSON.stringify(root), before, 'Input must remain unchanged');
  assert.deepEqual(buildTree(root), scene, 'Layout must be deterministic');
  const nodes = byId(scene);
  const parentOf = new Map<string, string | null>();
  (function walk(n: { id: string, children: unknown[] }) {
    for (const c of n.children as { id: string, children: unknown[] }[]) { parentOf.set(c.id, n.id); walk(c); }
  })(root);
  parentOf.set(root.id, null);
  assert.equal(scene.nodes.length, parentOf.size, 'Every person must be placed once');
  assert.deepEqual(nodes.get(root.id)!.geometry.center, { x: 0, y: 0 });
  for (const [id, nodeScene] of nodes) {
    assert(Math.abs(wrap(nodeScene.geometry.angle)) <= Math.PI * 70 / 180 + 1e-9, 'Every stem must stay clearly upward');
    const clearTip = Math.hypot(nodeScene.geometry.to.x - nodeScene.geometry.center.x,
      nodeScene.geometry.to.y - nodeScene.geometry.center.y);
    assert(clearTip > 0, 'Every stem must protrude beyond its frame');
    const parentId = parentOf.get(id);
    if (parentId) {
      const parent = nodes.get(parentId)!;
      const from = nodeScene.geometry.from;
      const parentLength = Math.hypot(parent.geometry.to.x - parent.geometry.center.x, parent.geometry.to.y - parent.geometry.center.y);
      const along = ((from.x - parent.geometry.center.x) * (parent.geometry.to.x - parent.geometry.center.x)
        + (from.y - parent.geometry.center.y) * (parent.geometry.to.y - parent.geometry.center.y)) / parentLength;
      assert(Math.abs(cross(parent.geometry.center, parent.geometry.to, from)) / parentLength < 1e-6, 'Child fork must lie on the parent stem line');
      const lateral = Math.abs(cross(parent.geometry.center, parent.geometry.to, nodeScene.geometry.center)) / parentLength;
      assert(nodeScene.geometry.center.y > parent.geometry.center.y, 'Children must grow upward');
      if (parent.children.length === 1) {
        // Sole child: the trunk continues instead of forking.
        assert(Math.abs(wrap(nodeScene.geometry.angle - parent.geometry.angle)) < 1e-9, 'A sole child continues the parent stem');
        assert(Math.hypot(from.x - parent.geometry.to.x, from.y - parent.geometry.to.y) < 1e-9, 'A sole child starts exactly at the parent tip');
        assert(lateral < 1e-9, 'A sole child frame sits on the continued axis');
        assert(along === parentLength, 'The continued stem has no free tip beyond the fork');
      } else {
        assert(Math.abs(wrap(nodeScene.geometry.angle - parent.geometry.angle)) > 0.01, 'A child stem must not continue the parent stem');
        assert(along > 0 && along < parentLength, 'Child fork must sit on the parent stem, below its tip');
        assert(lateral >= frame.width / 2 + frame.gap - 1e-6, 'Child frame must stand clear of the parent stem');
        assert(parentLength - along > 1, 'Parent tip must protrude beyond its forks');
      }
    } else {
      assert.equal(nodeScene.geometry.to.x, 0, 'Root stem must be vertical');
      assert.equal(nodeScene.geometry.angle, 0, 'Root stem is unrotated');
    }
    for (const other of scene.nodes) {
      if (other.id === id) continue;
      assert(gapOf(nodeScene.geometry.center, other.geometry.center) >= -1e-8, `Frames ${id} and ${other.id} must keep the centre gap`);
    }
  }
  scenarios++;
}

// A single child continues the trunk instead of branching off.
const single = buildTree(node('root', node('only')));
const singleRoot = byId(single).get('root')!;
const only = byId(single).get('only')!;
assert.equal(only.geometry.center.x, 0, 'A sole child stays on the parent axis');
assert.deepEqual(only.geometry.from, singleRoot.geometry.to, 'A sole child starts exactly at the parent tip');
assert(only.widths.start <= only.widths.frame, 'A continued trunk never widens upward');

// A heavy branch goes to one side; the two small siblings share the other side.
const weighted = byId(buildTree(oneSubtree));
const sideOf = (id: string) => weighted.get(id)!.geometry.center.x;
assert(sideOf('expanded') < 0, 'Expanded subtree should take the first side');
assert(sideOf('leaf-b') > 0 && sideOf('leaf-c') > 0, 'Small siblings should counterweight the heavy branch together');
const relativeAngle = (id: string) => wrap(weighted.get(id)!.geometry.angle - weighted.get('expanded')!.geometry.angle);
assert(relativeAngle('g1') * relativeAngle('g2') < 0, 'Two equal children must sit on opposite sides of their branch');

// Ordering: a heavy branch forks below lighter siblings; input order only breaks ties.
const unevenScene = byId(buildTree(uneven));
const forkHeight = (id: string) => unevenScene.get(id)!.geometry.from.y;
assert(unevenScene.get('c')!.geometry.center.x < 0 && unevenScene.get('a')!.geometry.center.x > 0
  && unevenScene.get('b')!.geometry.center.x > 0, 'Heavy child takes one side, light siblings share the other');
assert(forkHeight('a') < forkHeight('b'), 'Equal light siblings keep input order along the stem');

// Continuation: a chain is a straight trunk and never accumulates lean.
const tie = byId(buildTree(node('root', node('mid', node('tip')))));
assert(Math.abs(wrap(tie.get('mid')!.geometry.angle)) < 1e-9 && Math.abs(wrap(tie.get('tip')!.geometry.angle)) < 1e-9,
  'Every sole child continues the axis');
assert.equal(tie.get('tip')!.geometry.center.x, 0, 'A chain never drifts sideways');

// Structure is rejected before layout, so no coordinates can be inferred from bad input.
const shared = { id: 'leaf', children: [] };
assert.throws(() => validateTree({ id: 'r', children: [shared, shared] }), /shared/i);
assert.throws(() => validateTree({ id: 'r', children: [shared, { ...shared }] }), /unique|Duplicate/i);
const cycle: { id: string, children: unknown[] } = { id: 'cycle', children: [] };
cycle.children.push(cycle);
assert.throws(() => validateTree(cycle), /cycl/i);
// Layout consumes only freshly initialized drafts; policy domains live in the config schema.
const draft = initializeTree(validateTree(node('r')), config);
assert.equal(layoutStemScene(draft, config.layout).length, 1);
// Runtime guard for the same rule; the union types already forbid this call statically.
const published = buildTree(node('r')) as unknown as typeof draft;
assert.throws(() => layoutStemScene(published, config.layout), /initialized/i);
console.log(`PASS: ${scenarios} stem-owned fixtures, exclusive protruding stems, fork placement, tilted children, frame clearance, domain errors.`);
