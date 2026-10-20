import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { buildTree, sceneConflicts } from './helpers.ts';
import { readCorpus, replayRoots } from './corpus.ts';
import { verifyScene } from './verify-scene.ts';
import { clearanceFixtures } from './clearance-fixtures.ts';
import { NoPlacementError } from '../src/layout/index.ts';
import { axisMoment } from '../src/layout/centroid.ts';
import { sceneBounds, stemSvg } from '../src/render.ts';
import type { LayoutConfig } from '../src/config.ts';
import type { Conflict } from '../src/geometry.ts';

type Report = { status: 'ok', nodes: number, width: number, height: number, maxConnection: number, axisMoment: number, svgSha256: string }
  | { status: 'rejected', node: string, conflict: Conflict };
type Corpus = { seed: number, cases: ({ index: number, root: unknown } & ({ status: 'ok', svgSha256: string } | { status: 'rejected', node: string, conflict: Conflict }))[] };

const out = new URL('../output/side-search/', import.meta.url);
await mkdir(out, { recursive: true });
const before = await readCorpus(new URL('../data/corpus.json', import.meta.url));
const blocked: { root: unknown } = JSON.parse(await readFile(new URL('counterexample.json', out), 'utf8'));
const rescued: { root: unknown } = JSON.parse(await readFile(new URL('rescued-input.json', out), 'utf8'));
const hash = (svg: string) => new Bun.CryptoHasher('sha256').update(svg).digest('hex');

function run(root: unknown, options: Partial<LayoutConfig>, title: string): { svg?: string, report: Report } {
  const input = JSON.stringify(root);
  try {
    const state = buildTree(root, options);
    verifyScene(state);
    assert.deepEqual(sceneConflicts(state), []);
    assert.deepEqual(buildTree(root, options), state, 'Deterministic output');
    const bounds = sceneBounds(state), svg = stemSvg(state, bounds, title);
    const connections = state.nodes.filter(n => n.parentId !== null).map(n =>
      Math.hypot(n.geometry.center.x - n.geometry.from.x, n.geometry.center.y - n.geometry.from.y));
    return { svg, report: { status: 'ok', nodes: state.nodes.length,
      width: Math.ceil(bounds.maxX - bounds.minX), height: Math.ceil(bounds.maxY - bounds.minY),
      maxConnection: +Math.max(...connections).toFixed(2),
      axisMoment: +axisMoment(state).toFixed(3),
      svgSha256: hash(svg),
    } };
  } catch (error) {
    if (!(error instanceof NoPlacementError)) throw error;
    return { report: { status: 'rejected', node: error.node, conflict: error.conflict } };
  } finally {
    assert.equal(JSON.stringify(root), input, 'Input is unchanged even on rejected searches');
  }
}

// Reconstruct the previous random generator and compare inputs, not just aggregate counts.
const roots = replayRoots(before);
const results: (Report & { index: number, before: string })[] = [];
const newlyAccepted: number[] = [], remaining: number[] = [], drifted: number[] = [];
let unchanged = 0;
for (const [position, c] of before.cases.entries()) {
  const root = roots[position]!;
  const title = `seed19/${c.index}`;
  // Historical B contract: fixed side and no corridor reservation.
  const b = run(root, { maxSideTrials: 0, reserveAncestorCorridor: false, continueSoleChild: false, trunkShare: 0 }, title).report;
  assert.equal(b.status, c.status, 'Fixed-side mode must reproduce B');
  if (c.status === 'ok' && b.status === 'ok') assert.equal(b.svgSha256, c.svgSha256, 'Refactor must preserve B geometry');
  else if (c.status === 'rejected' && b.status === 'rejected') assert.deepEqual({ node: b.node, conflict: b.conflict }, { node: c.node, conflict: c.conflict });
  const s = run(root, {}, title);
  if (c.status === 'ok') {
    assert.equal(s.report.status, 'ok', 'No accepted-to-rejected regression');
    if (s.report.status === 'ok' && s.report.svgSha256 !== c.svgSha256) drifted.push(c.index);
  } else if (s.report.status === 'ok') {
    newlyAccepted.push(c.index);
    if (newlyAccepted.length <= 2 && s.svg) await writeFile(new URL(`case-${c.index}.svg`, out), s.svg);
  } else remaining.push(c.index);
  results.push({ index: c.index, before: c.status, ...s.report });
}

for (const { name, root } of clearanceFixtures) {
  const title = `fixed/${name}`;
  const current = run(root, {}, title).report;
  const historical = run(root, { maxSideTrials: 0, reserveAncestorCorridor: false, continueSoleChild: false, trunkShare: 0 }, title).report;
  assert.equal(current.status, 'ok', `Fixed fixture ${name} must lay out under current defaults`);
  if (historical.status === 'ok' && current.status === 'ok') {
    if (historical.svgSha256 === current.svgSha256) unchanged++;
  }
}
const reducedB = run(rescued.root, { maxSideTrials: 0, reserveAncestorCorridor: false, continueSoleChild: false, trunkShare: 0 }, 'Reduced / rescued');
const reducedS = run(rescued.root, {}, 'Reduced / rescued');
assert.equal(reducedB.report.status, 'rejected');
assert.equal(reducedS.report.status, 'ok');
assert(reducedS.svg);
await writeFile(new URL('rescued.svg', out), reducedS.svg);
const blockedS = run(blocked.root, { reserveAncestorCorridor: false, continueSoleChild: false, trunkShare: 0 }, 'Unsolved / parent-axis obstruction').report;
assert.equal(blockedS.status, 'rejected', 'Without corridor reservation the original hypothesis still fails');
const blockedSolved = run(blocked.root, {}, 'Solved / parent-axis obstruction');
const blockedCurrent = blockedSolved.report;
assert.equal(blockedCurrent.status, 'ok', 'Corridor reservation must solve the nine-node parent-axis obstruction');
assert(blockedSolved.svg);
await writeFile(new URL('solved.svg', out), blockedSolved.svg);

const summary = { seed: before.seed, count: results.length, beforeAccepted: before.cases.filter(c => c.status === 'ok').length,
  accepted: results.filter(c => c.status === 'ok').length, rejected: remaining.length, newlyAccepted, remaining,
  regressed: 0, drifted: drifted.length, driftedIndexes: drifted, fixedUnchanged: unchanged,
  reduced: reducedS.report, unsolved: blockedS, unsolvedNow: blockedCurrent };
await writeFile(new URL('results.json', out), JSON.stringify({ summary, results }, null, 2) + '\n');
const examples = [`<figure><figcaption>9 nodes: historical modes reject; current default lays out</figcaption><img src="solved.svg" alt="Nine-node solved tree"></figure>`,
  `<figure><figcaption>10 nodes: fixed-side B rejects; side search alone succeeds</figcaption><img src="rescued.svg" alt="Ten-node rescued tree"></figure>`,
  ...newlyAccepted.slice(0, 2).map(index => `<figure><figcaption>Corpus ${index}: B rejects; S succeeds</figcaption><img src="case-${index}.svg" alt="Rescued corpus case ${index}"></figure>`)].join('');
await writeFile(new URL('index.html', out), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Side search and corridor reservation</title><style>:root{color-scheme:light dark}body{font:16px system-ui;margin:24px;background:Canvas;color:CanvasText}figure{margin:24px 0}img{display:block;max-width:100%;height:auto}p{max-width:900px;line-height:1.5}</style><h1>Side search and corridor reservation</h1><p>Frozen corpus: ${summary.beforeAccepted} of ${summary.count} laid out before side search; the current default lays out ${summary.accepted} of ${summary.count}. ${summary.drifted} previously accepted trees changed geometry on purpose (corridor reservation), ${summary.fixedUnchanged} of ${clearanceFixtures.length} fixed fixtures stayed byte-identical. Angles remain ±32°.</p><h2>Former rejection boundary: nine-node parent-axis obstruction</h2><p>The historical modes (fixed sides, no corridor reservation) still reject it exactly as recorded. The current default keeps every frame out of each ancestor stem corridor, so the same input now lays out without relaxing the collision gate.</p>${examples}`);
console.log(JSON.stringify(summary, null, 2));
console.log(`PASS: frozen corpus ${summary.accepted}/${summary.count} accepted, ${summary.drifted} intentional geometry changes, historical B reproduced, nine-node case now solved.`);
