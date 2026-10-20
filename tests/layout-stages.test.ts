import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.ts';
import type { InitializedNode } from '../src/data.ts';
import { orderChildren } from '../src/layout/order.ts';
import { preferredSide, withinAngleCap } from '../src/layout/side.ts';
import { connectionLadder } from '../src/layout/connection.ts';
import { firstForkHeight, forkFloor, forkScanSteps, reservedForkHeight } from '../src/layout/spacing.ts';
import { crownTip } from '../src/layout/crown.ts';
import { frameBudget } from '../src/layout/contour.ts';
import { placeSubtree } from '../src/layout/placement.ts';
import { subtreeBounds, occupiedTop } from '../src/layout/bounds.ts';
import { axisMoment } from '../src/layout/centroid.ts';
import type { BuiltSubtree } from '../src/layout/types.ts';
import { buildTree } from './helpers.ts';

const config = await loadConfig();
const { frame } = config;
const params = config.layout;
const tilt = params.tilt;

// D2 — heavier children first, input order breaks ties, caller's array is untouched.
const person = (id: string, load: number): InitializedNode =>
  ({ id, parentId: null, children: [], load, widths: { start: 1, frame: 1, tip: 1 }, geometry: null });
const table = new Map(['leaf', 'mid', 'heavy'].map((id, i) => [id, person(id, [1, 2, 3][i]!)]));
const children = ['leaf', 'heavy', 'mid'];
assert.deepEqual(orderChildren(children, table).map(n => n.id), ['heavy', 'mid', 'leaf']);
const tied = new Map(['a', 'b'].map(id => [id, person(id, 1)]));
assert.deepEqual(orderChildren(['b', 'a'], tied).map(n => n.id), ['b', 'a'], 'Equal loads keep input order');
assert.deepEqual(children, ['leaf', 'heavy', 'mid'], 'Ordering does not mutate the input list');

// D1 — lighter side first, ties bend toward vertical, depth alternates, cap flips the side.
assert.equal(preferredSide(0, 0, 0, 0, params), 1, 'Tie at even depth takes +1');
assert.equal(preferredSide(0, 0, 0, 1, params), -1, 'Tie at odd depth alternates');
assert.equal(preferredSide(5, 0, 0, 0, params), -1, 'Lighter side wins over the tie rule');
assert.equal(preferredSide(0, 0, tilt, 0, params), -1, 'A tie on a tilted stem bends back toward vertical');
assert.equal(preferredSide(0, 0, 0.8, 0, params), -1, 'Preferred side exceeding the cap flips');
assert.equal(withinAngleCap(params.maxAngle, params.maxAngle), true);
assert.equal(withinAngleCap(params.maxAngle + 0.01, params.maxAngle), false);

// D4 — base length first, doubling increments, bounded and precision-checked.
assert.deepEqual(connectionLadder(params), [80, 104, 128, 176, 272, 464, 848, 1616]);
assert.deepEqual(connectionLadder({ ...params, maxConnect: params.connect }), [params.connect]);
assert.throws(() => connectionLadder({ ...params, connect: 1e300, connectionIncrement: 24, maxConnect: 1e301 }),
  /precision/i, 'An increment below numeric precision is an error, not an endless ladder');

// D3 — the scan starts one frame gap above the frame, stays bounded and grows with the placed top.
const first = firstForkHeight(frame);
assert.equal(first, frame.above + frame.below + frame.gap);
const baseSteps = forkScanSteps(frame, first, params, 0, 0);
assert(baseSteps > 0, 'The base case still scans above the frame');
assert(forkScanSteps(frame, first, params, 0, -1000) > baseSteps, 'A subtree hanging lower widens the window');
assert.equal(forkScanSteps(frame, first, params, 0, 1000), 0, 'A subtree already above needs no extra scan');
assert.equal(forkScanSteps(frame, first, params, 1e9, 0), params.maxHeightSteps, 'Window is clipped by the configured bound');
assert.equal(forkScanSteps(frame, first, { ...params, maxHeightSteps: 0 }, 0, 0), 0, 'Zero steps means base height only');
assert.equal(forkFloor(frame, null, 0), first, 'The first fork starts at the frame gap');
assert.equal(forkFloor(frame, 500, 0), first, 'A zero gap disables the rule');
assert.equal(forkFloor(frame, 500, 24), 524, 'An enabled gap lifts the floor above the previous fork');
assert.equal(reservedForkHeight(60, 0, params.step), 60, 'No spare step at the base height');
assert.equal(reservedForkHeight(60, 1, params.step), 60 + params.step, 'Raised forks reserve one spare step');
assert.equal(reservedForkHeight(60, 9, params.step), 60 + params.step);

// C2 — the crown is the higher of the last fork and the reserved fork, plus the tip length.
assert.deepEqual(crownTip(0, 54, params.tip), { x: 0, y: 54 + params.tip });
assert.deepEqual(crownTip(200, 54, params.tip), { x: 0, y: 200 + params.tip });

// Placement — rotation, exact fork landing, extended connection re-pin, no aliasing.
// Fixture mirrors a grown subtree: the attached node owns index 0, its fork sits one base
// connection below the frame, and its tip protrudes above it.
const built = (): BuiltSubtree => ({
  positions: [{ id: 'kid', x: 0, y: 0 }],
  segments: [{ owner: 'kid', forkOwner: 'root', from: { x: 0, y: -params.connect }, to: { x: 0, y: 44 } }],
  stems: [{ id: 'kid', frame: { x: 0, y: 0 }, fork: { x: 0, y: -params.connect }, tip: { x: 0, y: 44 }, angle: 0 }],
});
const source = built();
const sourceJson = JSON.stringify(source);
const upright = placeSubtree(source, 0, 0, params.connect, params.connect);
assert.deepEqual(upright.segments[0]!.from, { x: 0, y: 0 }, 'At delta 0 the fork lands on the parent axis');
assert.equal(upright.stems[0]!.frame.y, params.connect, 'Base connection puts the frame one length above the fork');
const rotated = placeSubtree(source, tilt, 120, params.connect, params.connect);
const fork = rotated.segments[0]!.from;
assert(Math.abs(fork.x) < 1e-9 && Math.abs(fork.y - 120) < 1e-9, 'Rotation keeps the fork on the axis');
assert.equal(rotated.stems[0]!.angle, tilt, 'Child angle accumulates the relative tilt');
assert(Math.abs(Math.hypot(rotated.stems[0]!.frame.x - fork.x, rotated.stems[0]!.frame.y - fork.y) - params.connect) < 1e-9,
  'Connection length is preserved under rotation');
const extendedLength = params.connect + 24;
const extended = placeSubtree(source, tilt, 120, extendedLength, params.connect);
assert.deepEqual(extended.segments[0]!.from, { x: 0, y: 120 }, 'Extended connection re-pins the first segment exactly');
assert.deepEqual(extended.stems[0]!.fork, { x: 0, y: 120 });
assert(Math.abs(Math.hypot(extended.stems[0]!.frame.x, extended.stems[0]!.frame.y - 120) - extendedLength) < 1e-9,
  'Extended connection still lands the frame at its own length');
assert.equal(JSON.stringify(source), sourceJson, 'Placement never mutates the built subtree');
const detached = placeSubtree(source, 0, 0, params.connect, params.connect);
detached.positions[0]!.x = 999;
assert.equal(source.positions[0]!.x, 0, 'Placed points never alias the source');

// D3 budget — only the "too close" band lifts the required height; separated pairs never do.
const pts = (...pairs: [number, number][]) => pairs.map(([x, y]) => ({ x, y }));
// The budget uses the same circumscribed-centre distance as the gate.
const centreGap = Math.hypot(frame.width + frame.gap, frame.above + frame.below + frame.gap);
assert.equal(frameBudget(pts([0, 0]), [], frame), 0, 'Empty canvas needs no budget');
assert.equal(frameBudget(pts([0, 0]), pts([0, 200]), frame), 0, 'A frame already clear above imposes nothing');
assert.equal(frameBudget(pts([0, 0]), pts([0, -200]), frame), 0, 'A frame already clear below imposes nothing');
assert(Math.abs(frameBudget(pts([0, 0]), pts([0, 40]), frame) - (40 + centreGap)) < 1e-9, 'A close frame above pushes the candidate over it');
assert(Math.abs(frameBudget(pts([0, 0]), pts([0, -40]), frame) - (centreGap - 40)) < 1e-9, 'A close frame below must be cleared upward too');
assert.equal(frameBudget(pts([0, 0]), pts([centreGap, 0]), frame), 0, 'Separated columns can never collide');

// Occupancy — bounds cover positions and segment endpoints; the top ignores the parent frame.
assert.deepEqual(subtreeBounds(source), { minX: 0, maxX: 0, minY: -params.connect, maxY: 44 });
assert.equal(occupiedTop(source), 44);
assert.equal(occupiedTop(rotated), Math.max(...rotated.positions.map(p => p.y), ...rotated.segments.map(s => s.to.y)),
  'Occupied top is the highest published point');

// C3 — balance metric: symmetric tree cancels, one-sided tree is fully lopsided.
const symmetric = buildTree({ id: 'r', children: [{ id: 'a', children: [] }, { id: 'b', children: [] }] });
assert(axisMoment(symmetric) < 1e-9, 'Mirrored children cancel out');
assert.equal(axisMoment(buildTree({ id: 'r', children: [{ id: 'only', children: [] }] })), 0, 'A sole child continues the axis, so the tree carries no lean');
assert.equal(axisMoment(buildTree({ id: 'solo', children: [] })), 0, 'A lone root has nothing to balance');
// Enabling a minimum gap stacks forks instead of letting them share heights.
const fan = buildTree({ id: 'r', children: [{ id: 'a', children: [] }, { id: 'b', children: [] }, { id: 'c', children: [] }] }, { minForkGap: 30 });
const forkYs = fan.nodes.filter(n => n.parentId !== null).map(n => n.geometry.from.y).sort((a, b) => a - b);
for (let i = 1; i < forkYs.length; i++) assert(forkYs[i]! - forkYs[i - 1]! >= 30 - 1e-9, 'Consecutive forks respect the minimum gap');
assert.deepEqual(buildTree({ id: 'r', children: [{ id: 'a', children: [] }, { id: 'b', children: [] }] }, { minForkGap: 0 }),
  buildTree({ id: 'r', children: [{ id: 'a', children: [] }, { id: 'b', children: [] }] }), 'The disabled gap changes nothing');
console.log('PASS: stage-level order, side, length, spacing, crown, placement, bounds and balance contracts.');
