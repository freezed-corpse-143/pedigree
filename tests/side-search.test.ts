import assert from 'node:assert/strict';
import { buildTree, sceneConflicts } from './helpers.ts';
import { NoPlacementError } from '../src/layout/index.ts';
import { validateTree } from '../src/validate-tree.ts';
import { verifyScene } from './verify-scene.ts';

type Input = { id: string, children: Input[] };
const node = (id: string, ...children: Input[]): Input => ({ id, children });
// The first nine-node counterexample remains an explicit rejection boundary.
const blocked = node('n0', node('n1', node('n3', node('n6'), node('n9'))),
  node('n2'), node('n4'), node('n5', node('n8')));
// A genuinely rescued tree, deletion-minimized from corpus case 9.
const root = node('n0', node('n1', node('n2', node('n8', node('n12'))),
  node('n3', node('n7', node('n9'), node('n10'))), node('n6')));
const input = JSON.stringify(root);
const state = buildTree(root);
assert.equal(JSON.stringify(root), input, 'Layout must not mutate the input');
assert.deepEqual(sceneConflicts(state), []);
verifyScene(state);
assert.deepEqual(buildTree(root), state, 'Deterministic output');
// Historical B reproduction: fixed sides and no corridor reservation, as stored in the corpus.
assert.throws(() => buildTree(root, { maxSideTrials: 0, reserveAncestorCorridor: false, continueSoleChild: false, trunkShare: 0 }),
  (error: unknown) => error instanceof NoPlacementError && error.code === 'STEM_NO_PLACEMENT',
  'Fixed-side B remains explicitly reproducible');
assert.throws(() => buildTree(root, { maxSideTrials: 1, reserveAncestorCorridor: false, continueSoleChild: false, trunkShare: 0 }),
  (error: unknown) => error instanceof NoPlacementError && error.code === 'STEM_NO_PLACEMENT',
  'Alternate-side budget is shared across recursion');
// Corridor reservation is what closes the historical parent-axis obstruction.
const blockedState = buildTree(blocked);
assert.equal(blockedState.nodes.length, 9);
assert.deepEqual(sceneConflicts(blockedState), []);
verifyScene(blockedState);
assert.throws(() => buildTree(blocked, { reserveAncestorCorridor: false, continueSoleChild: false, trunkShare: 0 }),
  (error: unknown) => error instanceof NoPlacementError && error.conflict.kind === 'branch-frame',
  'Without corridor reservation the parent-axis obstruction stays explicit');
const invalid = node('same', node('same'));
assert.throws(() => validateTree(invalid), /Duplicate/i, 'Side search must not swallow invalid input');
console.log('PASS: rescued subtree, shared budget, corridor-solved obstruction and invalid-input propagation.');
