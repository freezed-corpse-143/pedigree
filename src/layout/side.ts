import type { LayoutConfig } from '../config.ts';

/**
 * D1 — side preference. Uses the loads already accepted on each side, prefers the lighter
 * one, bends ties toward vertical, alternates by depth, and flips once when the preferred
 * direction would exceed the absolute tilt cap. A flip is a preference override, not a
 * balance guarantee.
 */
export function preferredSide(
  leftLoad: number,
  rightLoad: number,
  parentAngle: number,
  depth: number,
  params: LayoutConfig,
): number {
  let sign = leftLoad <= rightLoad ? 1 : -1;
  if (leftLoad === rightLoad) {
    const left = Math.abs(parentAngle + params.tilt);
    const right = Math.abs(parentAngle - params.tilt);
    if (left > right) sign = -1;
    else if (right > left) sign = 1;
    else sign = depth % 2 ? -1 : 1;
  }
  if (Math.abs(parentAngle + sign * params.tilt) > params.maxAngle + 1e-9) sign = -sign;
  if (Math.abs(parentAngle + sign * params.tilt) > params.maxAngle + 1e-9) {
    throw new RangeError('Cannot keep the stem upward within the maximum angle');
  }
  return sign;
}

/** Absolute direction is only legal inside the configured cap. */
export function withinAngleCap(angle: number, maxAngle: number): boolean {
  return Math.abs(angle) <= maxAngle + 1e-9;
}
