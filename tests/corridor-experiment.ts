import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { collect, percentile } from './metrics-lib.ts';
import { readCorpus, replayRoots } from './corpus.ts';
import { buildTree } from './helpers.ts';
import { clearanceFixtures } from './clearance-fixtures.ts';
import { NoPlacementError } from '../src/layout/index.ts';

// D3 experiment: does reserving the ancestor stem corridor fix blocked-axis trees, and at what cost?
const out = new URL('../output/metrics/', import.meta.url);
await mkdir(out, { recursive: true });
const frozen = JSON.parse(await readFile(new URL('metrics.json', out), 'utf8'));
const corpus = await readCorpus(new URL('../output/side-search/before.json', import.meta.url));
const roots = replayRoots(corpus);

// Three rows: the archived contract, the corridor alone (both newer freedoms off/on), and today.
const configurations = [
  { reserveAncestorCorridor: false, continueSoleChild: false, trunkShare: 0 },
  { reserveAncestorCorridor: true, continueSoleChild: false, trunkShare: 0 },
  { reserveAncestorCorridor: true, continueSoleChild: true, trunkShare: 0.4 },
];
const rows = configurations.map(configuration => {
  const { samples, summary } = collect(roots, configuration);
  return {
    ...configuration, accepted: summary.accepted, rejected: summary.rejected,
    aspectP50: summary.aspect.p50, aspectP95: summary.aspect.p95,
    widthP50: summary.width.p50, widthMax: summary.width.max,
    heightP95: percentile(samples.map(s => s.height), 0.95),
    baseShare: summary.baseShare.mean,
    gateCalls: summary.effort.gateCalls,
  };
});

const fixtures = clearanceFixtures.map(({ name, root }) => {
  const status = (reserveAncestorCorridor: boolean) => {
    try {
      buildTree(root, { reserveAncestorCorridor });
      return 'ok';
    } catch (error) {
      if (!(error instanceof NoPlacementError)) throw error;
      return `rejected:${error.conflict.kind}`;
    }
  };
  return { name, corridorOff: status(false), corridorOn: status(true) };
});

await writeFile(new URL('corridor.json', out), JSON.stringify({ rows, fixtures }, null, 2) + '\n');
console.table(rows);
console.table(fixtures);

// Corridor-off must reproduce the historical contract (160/40).
assert.equal(rows[0]!.accepted, 160, 'Corridor-off reproduces the historical acceptance');
assert.equal(rows[0]!.rejected, 40);
assert.equal(rows[1]!.accepted, 200, 'Corridor alone keeps every tree layoutable');
assert.deepEqual(rows[2], {
  reserveAncestorCorridor: true, continueSoleChild: true, trunkShare: 0.4, accepted: frozen.summary.accepted, rejected: frozen.summary.rejected,
  aspectP50: frozen.summary.aspect.p50, aspectP95: frozen.summary.aspect.p95,
  widthP50: frozen.summary.width.p50, widthMax: frozen.summary.width.max,
  heightP95: percentile(frozen.samples.map((s: { height: number }) => s.height), 0.95),
  baseShare: frozen.summary.baseShare.mean,
  gateCalls: frozen.summary.effort.gateCalls,
}, 'The current default must reproduce the frozen metrics');
console.log('PASS: ancestor-corridor swept; current default matches the freeze, corridor-off reproduces the historical 160/40.');
