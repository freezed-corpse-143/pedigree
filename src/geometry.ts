import type { FrameConfig, RenderConfig } from './config.ts';
import type { Point, StemWidths } from './data.ts';

export type Segment = { owner: string; forkOwner: string | null; from: Point; to: Point };
export type GeometryScene = { positions: (Point & { id: string })[]; segments: Segment[] };
/** `ancestor-corridor` is produced by the layout policy (D3), not by this geometry gate. */
export type Conflict = { kind: 'frame-frame' | 'branch-frame' | 'branch-branch' | 'ancestor-corridor'; owners: [string, string] };
const EPS = 1e-8;

// Initialized widths and the rendered frame stroke share the same envelope.
const radius = (seg: Segment, widths: ReadonlyMap<string, StemWidths>, render: RenderConfig) => {
  const w = widths.get(seg.owner)!;
  return Math.max(w.start, w.frame, w.tip) / 2 + render.collisionMargin;
};

function pointDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function segmentDistance(a: Segment, b: Segment): number {
  const rx = a.to.x - a.from.x, ry = a.to.y - a.from.y;
  const sx = b.to.x - b.from.x, sy = b.to.y - b.from.y;
  const qx = b.from.x - a.from.x, qy = b.from.y - a.from.y;
  const det = rx * sy - ry * sx;
  if (Math.abs(det) > EPS) {
    const t = (qx * sy - qy * sx) / det, u = (qx * ry - qy * rx) / det;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(pointDistance(a.from, b.from, b.to), pointDistance(a.to, b.from, b.to),
    pointDistance(b.from, a.from, a.to), pointDistance(b.to, a.from, a.to));
}

/**
 * Frames are spaced as circumscribed circles around an effective centre. The centre is shifted
 * by (above - below) / 2 so an asymmetric mount reserves its own space, and the radius is the
 * half-diagonal. A distance test is required, not an axis-aligned box: subtrees are composed by
 * rotating them, so an axis-aligned test would reject a subtree that was legal before rotating.
 */
const effectiveCentre = (p: Point, frame: FrameConfig) => ({ x: p.x, y: p.y + (frame.above - frame.below) / 2 });
const centreGap = (frame: FrameConfig) => Math.hypot(frame.width + frame.gap, frame.above + frame.below + frame.gap);

function legalJunction(a: Segment, b: Segment): boolean {
  const ax = a.to.x - a.from.x, ay = a.to.y - a.from.y;
  const bx = b.to.x - b.from.x, by = b.to.y - b.from.y;
  const sin = Math.abs(ax * by - ay * bx) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
  if (a.owner === b.forkOwner || b.owner === a.forkOwner) {
    const [parent, child] = a.owner === b.forkOwner ? [a, b] : [b, a];
    if (sin <= EPS) {
      // Collinear stems are legal only end to end: a sole child continues the parent stem and
      // starts exactly where it ends. Overlapping mid-span stays a conflict.
      return Math.hypot(child.from.x - parent.to.x, child.from.y - parent.to.y) < EPS;
    }
    // Noncollinear straight stems meet once; their local fork overlap is intentional.
    return pointDistance(child.from, parent.from, parent.to) < EPS;
  }
  return a.forkOwner !== null && a.forkOwner === b.forkOwner
    && Math.hypot(a.from.x - b.from.x, a.from.y - b.from.y) < EPS
    && (sin > EPS || ax * bx + ay * by < 0);
}

export function geometryConflicts(scene: GeometryScene, frame: FrameConfig,
  widths: ReadonlyMap<string, StemWidths>, render: RenderConfig, firstOnly = false): Conflict[] {
  const { positions: points, segments } = scene;
  const conflicts: Conflict[] = [];
  const gap = centreGap(frame);
  const frameRadius = Math.hypot(frame.width + render.frameStroke, frame.above + frame.below + render.frameStroke) / 2;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = effectiveCentre(points[i]!, frame), b = effectiveCentre(points[j]!, frame);
      if (Math.hypot(a.x - b.x, a.y - b.y) < gap - EPS) {
        conflicts.push({ kind: 'frame-frame', owners: [points[i]!.id, points[j]!.id] });
        if (firstOnly) return conflicts;
      }
    }
  }
  for (const seg of segments) {
    const r = radius(seg, widths, render);
    for (const p of points) {
      if (p.id === seg.owner) continue;
      const c = effectiveCentre(p, frame);
      if (pointDistance(c, seg.from, seg.to) < frameRadius + r - EPS) {
        conflicts.push({ kind: 'branch-frame', owners: [seg.owner, p.id] });
        if (firstOnly) return conflicts;
      }
    }
  }
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const a = segments[i]!, b = segments[j]!;
    if (!legalJunction(a, b) && segmentDistance(a, b) < radius(a, widths, render) + radius(b, widths, render) - EPS) {
      conflicts.push({ kind: 'branch-branch', owners: [a.owner, b.owner] });
      if (firstOnly) return conflicts;
    }
  }
  return conflicts;
}
