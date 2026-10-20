import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { collect, percentile, THRESHOLDS } from './metrics-lib.ts';
import { readCorpus, replayRoots } from './corpus.ts';

// D3 experiment: does a minimum fork gap buy shape/balance, and at what canvas cost?
const out = new URL('../output/metrics/', import.meta.url);
await mkdir(out, { recursive: true });
const frozen = JSON.parse(await readFile(new URL('metrics.json', out), 'utf8'));
const corpus = await readCorpus(new URL('../output/side-search/before.json', import.meta.url));
const roots = replayRoots(corpus);

const rows = [0, 6, 12, 24].map(connect => {
  const { samples, summary } = collect(roots, { minForkGap: connect });
  return {
    gap: connect, accepted: summary.accepted, rejected: summary.rejected,
    aspectP50: summary.aspect.p50, aspectP95: summary.aspect.p95, aspectMax: summary.aspect.max,
    branchP95: summary.branchMoment.p95,
    widthP50: summary.width.p50, widthMax: summary.width.max,
    heightP95: percentile(samples.map(s => s.height), 0.95),
    baseShare: summary.baseShare.mean,
  };
});

await writeFile(new URL('fork-gap.json', out), JSON.stringify({ thresholds: THRESHOLDS, rows }, null, 2) + '\n');
console.table(rows);

// The disabled default must still reproduce the frozen metrics exactly.
assert.deepEqual(rows[0], {
  gap: 0, accepted: frozen.summary.accepted, rejected: frozen.summary.rejected,
  aspectP50: frozen.summary.aspect.p50, aspectP95: frozen.summary.aspect.p95, aspectMax: frozen.summary.aspect.max,
  branchP95: frozen.summary.branchMoment.p95,
  widthP50: frozen.summary.width.p50, widthMax: frozen.summary.width.max,
  heightP95: percentile(frozen.samples.map((s: { height: number }) => s.height), 0.95),
  baseShare: frozen.summary.baseShare.mean,
}, 'minForkGap 0 must reproduce the frozen corpus');
console.log('PASS: fork-gap sweep measured; the disabled default is byte-for-byte the frozen baseline.');
