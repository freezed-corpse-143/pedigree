import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { collect, sample, THRESHOLDS } from './metrics-lib.ts';
import { readCorpus, replayRoots } from './corpus.ts';
import { buildTree, config } from './helpers.ts';

const out = new URL('../output/metrics/', import.meta.url);
await mkdir(out, { recursive: true });

// Six-node baseline: the frozen reference image and its shape.
const baselineTree = JSON.parse(await readFile(config.input, 'utf8'));
const baseline = sample(buildTree(baselineTree), -1);

const corpus = await readCorpus(new URL('../data/corpus.json', import.meta.url));
const { samples, summary } = collect(replayRoots(corpus));
await writeFile(new URL('metrics.json', out), JSON.stringify({ thresholds: THRESHOLDS, baseline, summary, samples }, null, 2) + '\n');

console.log('baseline', baseline);
console.log('effort', summary.effort);
console.table({ axisMoment: summary.axisMoment, branchMoment: summary.branchMoment, aspect: summary.aspect, width: summary.width, height: summary.height, baseShare: summary.baseShare });
assert(summary.accepted >= THRESHOLDS.accepted, `Accepted count regressed: ${summary.accepted}`);
assert(summary.rejected <= THRESHOLDS.rejected, `Rejected count grew: ${summary.rejected}`);
assert.equal(baseline.nodes, THRESHOLDS.baseline.nodes);
assert.equal(baseline.aspect, THRESHOLDS.baseline.aspect, 'Frozen baseline crown ratio drifted');
assert.equal(baseline.axisMoment, THRESHOLDS.baseline.axisMoment, 'Frozen baseline moment drifted');
assert.equal(baseline.branchMoment, THRESHOLDS.baseline.branchMoment, 'Frozen baseline branching balance drifted');
assert(summary.branchMoment.p95 <= THRESHOLDS.branchMomentP95, `branchMoment p95 ${summary.branchMoment.p95} > ${THRESHOLDS.branchMomentP95}`);
assert(summary.aspect.p50 <= THRESHOLDS.aspectP50, `aspect p50 ${summary.aspect.p50} > ${THRESHOLDS.aspectP50}`);
assert(summary.aspect.p95 <= THRESHOLDS.aspectP95, `aspect p95 ${summary.aspect.p95} > ${THRESHOLDS.aspectP95}`);
assert(summary.aspect.max <= THRESHOLDS.aspectMax, `aspect max ${summary.aspect.max} > ${THRESHOLDS.aspectMax}`);
assert(summary.width.p50 <= THRESHOLDS.widthP50 && summary.width.max <= THRESHOLDS.widthMax,
  `Canvas width budget exceeded: p50 ${summary.width.p50} max ${summary.width.max}`);
assert(summary.height.p50 <= THRESHOLDS.heightP50 && summary.height.max <= THRESHOLDS.heightMax,
  `Canvas height budget exceeded: p50 ${summary.height.p50} max ${summary.height.max}`);
assert(summary.baseShare.mean >= THRESHOLDS.baseShare, `Base connection share dropped to ${summary.baseShare.mean}`);
console.log('PASS: accepted corpus, frozen baseline shape and all metric gates hold.');
