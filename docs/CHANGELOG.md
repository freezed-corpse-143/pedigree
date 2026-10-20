# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versioned releases should follow [Semantic Versioning](https://semver.org/).

## 2026-10-20 — stem paint and draw-only thickness

- `render.stem = { thickness, fill, texture }` decouples the trunk/branch paint from the person mount: `fill` is a validated CSS colour token, `texture` is a file resolved relative to the config folder and inlined as a data URI at load time (png/jpeg/webp/gif, ≤512 KB), rendered as `<pattern>` + `<image>`. Scenes stay self-contained.
- `thickness` is draw-only: collision keeps using `render.width`, so the frozen corpus stays 200/0 and no metric moves. Thicker artwork can make unrelated stems touch in dense trees: measured 0 pairs at ×2, 7 at ×3, 25 at ×6.7 across the 200-tree corpus. Default is ×6.7 (the approved “heavy × 3” look: a 6-node trunk is ~33 units on a 345-wide canvas).
- Markup changed again (paint attribute, optional `<defs>`); the six-node hash and the 150 corpus hashes were re-frozen with bounds assertions unchanged.

## 2026-10-20 — mount module

- Rendering a person is now a pluggable `Mount` (`src/mount.ts`): `envelope(frame, render)` declares the spacing box the layout uses, `draw(input)` returns a static SVG fragment in local coordinates around the stem attachment point. `assertMount` rejects scripts, external references, event handlers, `url(`, non-deterministic output and invalid envelopes before anything is drawn.
- `frameMount` is the default and keeps the previous look; `stemSvg(..., mount)` and `run(path, { mount })` accept another implementation.
- The envelope replaces `state.frame` during `initializeTree`, so a custom shape spaces the tree instead of overlapping it.
- Stem silhouette fixes: the child polygon no longer backs off behind the fork (a stub poked out of a thinner parent), child stems are clamped to the parent's width *at the fork* (a tapering parent is narrower than its frame), touching polygons carry a 0.8 hairline stroke of their own paint, and a filled disc at every fork closes the crotch that two thick branches leave.
- Envelopes are asymmetric: `frame` is now `{ width, above, below, gap }` and a mount may shift its content along the stem. Spacing uses the circumscribed circle of the shifted box, so a symmetric envelope reproduces the previous geometry exactly (an axis-aligned box test was measured and rejected: subtrees are composed by rotation, so a rotated subtree failed its own clearance check).
- Markup only: mounts are wrapped in `<g class="mount" transform="translate(…)">` and drawn in local coordinates. Node count, bounds and stems are unchanged (asserted per corpus case); the six-node hash and the 150 corpus hashes were re-frozen, previous values kept in `baselineSha256History` / `svgSha256V1`.

## 2026-10-20 — proportional bare trunk

- `layout.trunkShare` (default 0.4) replaces an absolute first-fork height: the bare trunk from the root frame bottom to the lowest first-level fork is a share of the whole visible tree. Because the fork raises the tree it sits in, the layout iterates the whole recursion to a fixed point (≤4 passes, 0.5 slack) and re-measures the final pass so the effort metric belongs to the accepted geometry.
- All root children respect that floor; previously only the first child did, which is why an absolute `trunk` knob failed to lengthen the trunk.
- Re-frozen after the change: baseline 436.6→517.9 high (aspect 1.269→1.505), aspect p50 1.377→1.833, p95 3.365→3.439, max 7.552→10.35, height p50 665→895, max 1499→2271, width unchanged. Recorded in `docs/design/acceptance-metrics.md` §7.
- Historical experiments pass `trunkShare: 0`, so the archived A/B hashes and 160/40 corridor evidence still reproduce.

## 2026-10-20 — sole children continue the trunk

- A node with exactly one child now inherits the parent axis (`layout.continueSoleChild`, default on): the parent stem ends at that fork, the two segments share one width, and the corridor rule is skipped because no sibling can sweep that axis later. The collision gate still rejects collinear *overlaps*; only an end-to-end joint is legal.
- Historical evidence stays reproducible: the A/B, side-search and corridor experiments pass `continueSoleChild: false`, exactly like `reserveAncestorCorridor: false`.
- Shape re-frozen after the rule: axisMoment p50 0.513→0.344, branchMoment p95 0.845→0.778, baseShare 0.911→0.961 (fewer stretched connections), but trees are slimmer: aspect p95 2.208→3.365, max 2.673→7.552, height max 1396.7→1499.1. Thresholds and the reason are recorded in `docs/design/acceptance-metrics.md` §6.
- New fixture `single-child` (root with one child, that child a 4-way fan) covers the extreme case.

## 2026-10-20 — rendering pass (S4 first slice)

- Frames were unreadable outside a themed host: `fill="var(--surface)"` is not a valid presentation attribute, so bare rasterisers fell back to black, and `color:CanvasText` left dark text on it. Frames now carry `fill="#fff"` and the root `color="#111"`; a host page can still restyle them through CSS.
- Child stems back off the fork by half their start width, so the parent's flat cap can no longer read as a notch; frames get `rx=3`.
- Stem width now follows a smoothstep between start/frame/tip instead of a straight bevel, which keeps the stem full near the frame and thins quickly towards the tip.
- Labels wider than the frame interior are clamped with `textLength` + `lengthAdjust` instead of overflowing.
- Render-only: no layout change. `bun run metrics` still reports 1.572 / 2.208 / 2.673 aspect, 447.5 width p50, 0.911 baseShare. The archived six-node markup hash and the 150 corpus marker hashes were re-frozen (`svgSha256V1` keeps the pre-change values; every case's bounds were asserted identical first).

## [Unreleased]

### Changed

- Reset the previous documentation and withdraw the layered-DAG / `d3-dag` architecture as the current design basis.
- Define the current scope as a rooted-tree input; no production layout algorithm is selected yet.
- Adopt owned stems: every node owns a straight, protruding stem; children fork from the parent stem and never continue it, with a 70° absolute tilt cap and a rotation-invariant frame gap.
- Process children by subtree size (input order breaks ties), prefer the lighter side, and bend load ties toward vertical. Processing order does not guarantee monotone fork heights after collision search.
- Keep the six-node baseline under `output/`, source under `src/`, and documents only under `docs/`.
- Add A/B geometry clearance: conservative frame circles and branch capsules include extended parent axes; fixed-length A explicitly rejects two counterexamples, while B changes one incoming length from 80 to 272 in each.
- Preserve the baseline SVG byte-for-byte, including the original spare scan step at raised forks. A 12-node failure changes from 461×996 to 546×715; binary4 changes from 1275×1194 to 1376×913.
- Add boundary regressions, independent frame/intersection checks, seven deterministic fixtures, shared rendering and reproducible before/B evidence under `output/clearance/`.
- Stress-check 200 random trees (seed 19, 2–19 nodes): 150 clear accepted scenes, 50 explicit rejections, no other errors; accepted scenes pass independent centerline clearance/crossing checks.
- Add finite alternate-side search after preferred-side failure, with a shared 32-trial ceiling and unchanged angle/length candidates. Side loads reflect accepted placements; invalid input errors are not retried.
- On the same frozen 200 trees, S accepts 160 and rejects 40; all 150 formerly successful SVGs and seven fixed fixtures are unchanged. A/B replay explicitly sets `maxSideTrials: 0`.
- Preserve the failed nine-node hypothesis as a rejection boundary. A different ten-node reduced tree is rescued with unchanged 80-unit connections; evidence and browser verification are under `output/side-search/`.
- Move every assertion, independent verifier, fixture and experiment driver from `src/` to `tests/`; `src/` now holds only the layout, geometry gate, renderer and baseline generator, and never imports `tests/`. No behavior change: the baseline SVG digest and all A/B/S results are identical.
- Define recursive input, layout-result and minimal render-state contracts in `src/data.ts`. Project successful layouts into detached JSON-compatible snapshots; the renderer consumes only node geometry, explicit widths and frame dimensions. Move the default frame configuration out of the renderer and migrate every rendering caller.
- Verify snapshot isolation, JSON round trips, escaped IDs and frame-size state replacement. Existing baseline and frozen-corpus SVG digests remain unchanged; no reactive framework or automatic subscriptions are introduced.
- Split the program into persisted configuration, JSON/YAML parsing, structural validation, an initialized geometry-free tree, pure spatial layout, immutable coordinate application, rendering and orchestration; the entry file only calls `run()`.
- Move every policy number (angles, connection lengths and increments, height-search bound, side-trial budget, width curve, canvas padding, decimals, fonts, input/output paths) into `config.json`; the layout and renderer no longer carry embedded defaults, and typos or missing fields fail instead of falling back.
- Accept JSON or YAML tree files; reject zero or multiple roots, cycles, shared child objects, duplicate IDs and malformed nodes before any coordinate exists. Output is written only after every earlier stage succeeds.
- Migrate all source and tests to TypeScript with strict checking and Zod schemas as the single source of runtime validation and types; verify with `bun run typecheck` and `bun run test`.
- Split the layout into one module per stage under `src/layout/`: side choice, child ordering, fork spacing, connection ladder, crown height, balance metric, placement solver and recursion, with the contract, rollback edges and unimplemented gaps in `docs/design/layout-stages.md`. Baseline and frozen-corpus digests are unchanged.
- Add per-stage assertions for ordering stability, all four side rules, the length ladder (including the precision guard), the spacing window bounds and clipping, the crown formula, rigid attachment with exact fork landing and extended re-pin, occupancy bounds and the balance metric; make the placement search result a discriminated union so callers cannot read an absent conflict.
- Freeze acceptance metrics in `docs/design/acceptance-metrics.md` and `tests/metrics.ts`: accepted count, crown aspect ratio, per-branch balance, canvas budgets, base-connection share and the exact baseline shape. The corpus-wide metrics are written to `output/metrics/` on every run.
- Complete the S2 fixture families: add comb, skewed and mixed shapes, give every fixture an explicit `expected` status, and record the mixed family as a rejection boundary (`branch-frame`, root axis blocked by an already placed descendant) instead of hiding it.
- Add the second D3 form: `reserveAncestorCorridor` rejects placements whose frames enter an ancestor stem corridor. It fixes every previously rejected tree — the nine-node counterexample and the mixed family now layout — so the frozen corpus reaches 200 accepted, 0 rejected, at the cost of a 15% wider and 11% taller canvas and a base-connection share of 0.911. Re-freeze `docs/design/acceptance-metrics.md` accordingly; historical A/B replays pin the rule off.
- Implement the first form of D3 occupancy budgeting in `src/layout/contour.ts`: compute the smallest height that clears every overlapping-column frame pair, start the scan there, and keep the collision gate authoritative. Output is unchanged (baseline digest, 160/40 corpus, zero drift); the budget skips 1 986 of 33 109 candidate heights.
- Add `layout.minForkGap` (default 0, disabled) and measure it on the frozen corpus: shape improves 1.4% while ten trees stop laying out and the widest canvas grows. Keep the default at 0 and record the negative result instead of adopting it.

### Removed

- Remove the old layered/dominant-axis/sector route comparison and unrelated studies. The new clearance experiment builds only on the retained owned-stem algorithm; no old algorithm fallback is restored.
