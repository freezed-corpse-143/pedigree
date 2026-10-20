import assert from 'node:assert/strict';
import type { LaidOutTree } from '../src/data.ts';

// Independent slab clipping and line intersection, not the layout's circle/capsule gate.
function hitsFrame(a: { x: number, y: number }, b: { x: number, y: number }, p: { x: number, y: number },
  frame: { width: number, above: number, below: number }) {
  // The mount rect is asymmetric around the anchor: recentre it, then run a symmetric slab test.
  const half = { x: frame.width / 2, y: (frame.above + frame.below) / 2 };
  const centre = { x: p.x, y: p.y + (frame.above - frame.below) / 2 };
  let enter = 0, leave = 1;
  for (const axis of ['x', 'y'] as const) {
    const d = b[axis] - a[axis];
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(a[axis] - centre[axis]) > half[axis]) return false;
    } else {
      let t1 = (centre[axis] - half[axis] - a[axis]) / d, t2 = (centre[axis] + half[axis] - a[axis]) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      enter = Math.max(enter, t1); leave = Math.min(leave, t2);
      if (enter > leave) return false;
    }
  }
  return enter <= leave;
}

function crosses(a: { from: { x: number, y: number }, to: { x: number, y: number } }, b: { from: { x: number, y: number }, to: { x: number, y: number } }) {
  const rx = a.to.x - a.from.x, ry = a.to.y - a.from.y;
  const sx = b.to.x - b.from.x, sy = b.to.y - b.from.y;
  const qx = b.from.x - a.from.x, qy = b.from.y - a.from.y, det = rx * sy - ry * sx;
  if (Math.abs(det) < 1e-8) return false;
  const t = (qx * sy - qy * sx) / det, u = (qx * ry - qy * rx) / det;
  return t > 1e-7 && t < 1 - 1e-7 && u > 1e-7 && u < 1 - 1e-7;
}

/** Independent verification of a published state; uses only the state, never the layout. */
export function verifyScene(state: LaidOutTree): void {
  const { frame, nodes } = state;
  const parentOf = new Map(nodes.map(n => [n.id, n.parentId]));
  const expected = [...parentOf.keys()].sort();
  assert.deepEqual(nodes.map(n => n.id).sort(), expected, 'No lost or duplicate people');
  assert.equal(new Set(nodes.map(n => n.id)).size, nodes.length, 'Every person appears once');
  const byId = new Map(nodes.map(n => [n.id, n]));
  for (const node of nodes) {
    for (const child of node.children) assert.equal(parentOf.get(child), node.id, 'Child links match parentId');
    for (const key of ['center', 'from', 'to'] as const) {
      assert(Number.isFinite(node.geometry[key].x) && Number.isFinite(node.geometry[key].y), 'Finite coordinates');
    }
    for (const other of nodes) {
      if (other.id === node.id) continue;
      const a = node.geometry.center, b = other.geometry.center;
      const shift = (frame.above - frame.below) / 2;
      const required = Math.hypot(frame.width + frame.gap, frame.above + frame.below + frame.gap);
      assert(Math.hypot(a.x - b.x, (a.y + shift) - (b.y + shift)) >= required - 1e-6,
        'Independent frame clearance');
    }
  }
  for (const seg of nodes) {
    assert.equal(seg.parentId, parentOf.get(seg.id), 'No invented parent');
    for (const other of nodes) {
      if (other.id !== seg.id) assert(!hitsFrame(seg.geometry.from, seg.geometry.to, other.geometry.center, frame), `${seg.id} passes through ${other.id}`);
    }
    for (const other of nodes) {
      if (other.id === seg.id) continue;
      assert(!crosses({ from: seg.geometry.from, to: seg.geometry.to }, { from: other.geometry.from, to: other.geometry.to }), `Crossing ${seg.id}/${other.id}`);
    }
    assert(Math.abs(seg.geometry.angle) <= Math.PI * 70 / 180 + 1e-8, 'Absolute tilt cap');
    if (seg.parentId === null) {
      assert.equal(seg.geometry.center.x, 0); assert.equal(seg.geometry.center.y, 0);
      assert.equal(seg.geometry.angle, 0);
      continue;
    }
    const parent = byId.get(seg.parentId)!;
    const relative = seg.geometry.angle - parent.geometry.angle;
    // A collinear sole child is a continuation and must attach at the tip; otherwise the
    // standard fixed-tilt fork applies. Both modes are verifiable, so history stays checkable.
    const continued = parent.children.length === 1 && Math.abs(relative) < 1e-8;
    if (!continued) assert(Math.abs(Math.abs(relative) - Math.PI * 32 / 180) < 1e-8, 'Side changes preserve angle magnitude');
    assert(seg.geometry.center.y > parent.geometry.center.y, 'Children remain above parents');
    const dx = parent.geometry.to.x - parent.geometry.center.x, dy = parent.geometry.to.y - parent.geometry.center.y;
    const px = seg.geometry.from.x - parent.geometry.center.x, py = seg.geometry.from.y - parent.geometry.center.y;
    assert(Math.abs(dx * py - dy * px) < 1e-6, 'Fork remains on parent axis');
    const length = Math.hypot(dx, dy), projection = (px * dx + py * dy) / length;
    assert(projection > 0, 'Fork sits above the parent frame');
    if (continued) assert(Math.abs(length - projection) < 1e-7, 'The continued stem ends at its sole fork');
    else assert(length - projection >= 44 - 1e-7, 'Parent protrudes beyond each fork');
    const connection = Math.hypot(seg.geometry.center.x - seg.geometry.from.x, seg.geometry.center.y - seg.geometry.from.y);
    assert(connection >= 80 - 1e-7 && connection <= 1616 + 1e-7, 'Bounded incoming connection');
  }
}
