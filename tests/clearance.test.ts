import assert from 'node:assert/strict';
import { buildTree, config, sceneConflicts } from './helpers.ts';
import { clearanceFixtures } from './clearance-fixtures.ts';
import { geometryConflicts } from '../src/geometry.ts';
import { NoPlacementError } from '../src/layout/index.ts';
import type { Segment } from '../src/geometry.ts';
import type { StemWidths } from '../src/data.ts';
import { verifyScene } from './verify-scene.ts';

const { frame, render } = config;
const widths: ReadonlyMap<string, StemWidths> = new Map(['a', 'b', 'parent', 'person'].map(id => [id, { start: 2, frame: 2, tip: 2 }]));
const segment = (owner: string, from: [number, number], to: [number, number], forkOwner: string | null = null): Segment =>
  ({ owner, forkOwner, from: { x: from[0], y: from[1] }, to: { x: to[0], y: to[1] } });
const pairConflicts = (a: Segment, b: Segment) =>
  geometryConflicts({ positions: [], segments: [a, b] }, frame, widths, render);
const a = segment('a', [0, 0], [0, 100]);
assert.equal(pairConflicts(a, segment('b', [-10, 50], [10, 50])).length, 1, 'Unrelated crossing');
assert.equal(pairConflicts(a, segment('b', [1.9, 0], [1.9, 100])).length, 1, 'Thick parallel branches touch without a centerline crossing');
assert.equal(pairConflicts(a, segment('b', [3, 0], [3, 100])).length, 0, 'Separated parallel branches');
assert.equal(pairConflicts(a, segment('b', [0, 20], [0, 80])).length, 1, 'Collinear overlap');
assert.equal(pairConflicts(a, segment('b', [0, 50], [50, 100], 'a')).length, 0, 'Parent-child fork must remain connected');
assert.equal(pairConflicts(segment('a', [0, 0], [-50, 50], 'parent'), segment('b', [0, 0], [50, 50], 'parent')).length, 0, 'Shared fork, different directions');
assert.equal(pairConflicts(segment('a', [0, 0], [50, 50], 'parent'), segment('b', [0, 0], [100, 100], 'parent')).length, 1, 'Shared fork cannot excuse collinear overlap');
assert.equal(pairConflicts(segment('a', [0, 0], [50, 100], 'parent'), segment('b', [0, 50], [100, 50], 'parent')).length, 1, 'Siblings with distinct forks cannot be exempted');
assert.equal(geometryConflicts({ positions: [{ id: 'person', x: 0, y: 50 }], segments: [a] }, frame, widths, render)[0]!.kind,
  'branch-frame', 'Full parent axis must be checked');
assert.equal(geometryConflicts({ positions: [{ id: 'a', x: 0, y: 50 }], segments: [a] }, frame, widths, render).length, 0,
  'Stem may pass through its own frame');

for (const name of ['counterexample', 'binary4']) {
  const root = clearanceFixtures.find(f => f.name === name)!.root;
  assert.throws(() => buildTree(root, { maxConnect: 80, maxSideTrials: 0, reserveAncestorCorridor: false, continueSoleChild: false, trunkShare: 0 }),
    (error: unknown) => error instanceof NoPlacementError && error.conflict.kind === 'branch-frame',
    'A must reject rather than return an obstructed layout');
}

let accepted = 0;
for (const { name, root } of clearanceFixtures) {
  const before = JSON.stringify(root);
  const state = buildTree(root);
  verifyScene(state);
  assert.deepEqual(sceneConflicts(state), [], `${name}: conservative geometry gate`);
  assert.equal(JSON.stringify(root), before, 'Layout must not mutate the input');
  assert.deepEqual(buildTree(root), state, 'Layout must be deterministic');
  accepted++;
}
// Corridor reservation is the reason the mixed family now lays out; keep that visible.
assert.doesNotThrow(() => buildTree(clearanceFixtures.find(f => f.name === 'mixed')!.root),
  'Ancestor-corridor reservation must keep the mixed family layoutable');
assert.throws(() => buildTree(clearanceFixtures.find(f => f.name === 'mixed')!.root, { reserveAncestorCorridor: false }),
  (error: unknown) => error instanceof NoPlacementError && error.conflict.kind === 'branch-frame',
  'Without corridor reservation the mixed family stays an explicit boundary');
console.log(`PASS: geometry boundaries, fixed-length rejection, independent clearance and B structure on ${accepted} fixtures.`);
