import type { FrameConfig, LayoutConfig } from '../config.ts';

/**
 * D3 — fork spacing along one parent stem. The scan starts one frame gap above the frame
 * and grows in fixed steps; its window is derived from the already placed top, the candidate
 * bottom and a two-frame safety distance. Heights are candidates, so a failing scan means
 * "this (side, connection) has no room", not "the tree is impossible".
 */
/**
 * The fork must clear the whole mount, not just its top half: the stem leaving a mount can be
 * swept by a sibling that sits above it, so the reserved height stays `above + below + gap`.
 * Symmetric mounts therefore keep the pre-asymmetry geometry byte for byte.
 */
export function firstForkHeight(frame: FrameConfig): number {
  return frame.above + frame.below + frame.gap;
}

/** First allowed fork height: the frame gap, raised by the minimum-gap rule when enabled. */
export function forkFloor(frame: FrameConfig, lastFork: number | null, minForkGap: number): number {
  const first = firstForkHeight(frame);
  return lastFork === null || minForkGap <= 0 ? first : Math.max(first, lastFork + minForkGap);
}

export function forkScanSteps(frame: FrameConfig, first: number, params: LayoutConfig, top: number, bottom: number): number {
  const maxHeight = Math.max(first, top - bottom
    + 2 * Math.hypot(frame.width / 2 + frame.gap, frame.above + frame.below + frame.gap) + params.tip);
  return Math.min(params.maxHeightSteps, Math.ceil((maxHeight - first) / params.step));
}

/** The baseline keeps one spare scan step above any raised fork; it is also collision-tested. */
export function reservedForkHeight(height: number, attempt: number, step: number): number {
  return height + (attempt > 0 ? step : 0);
}
