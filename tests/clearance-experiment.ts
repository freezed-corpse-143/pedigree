import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { buildTree, config, sceneConflicts } from './helpers.ts';
import { clearanceFixtures } from './clearance-fixtures.ts';
import { NoPlacementError } from '../src/layout/index.ts';
import { sceneBounds, stemSvg } from '../src/render.ts';

const out = new URL('../output/clearance/', import.meta.url);
await mkdir(out, { recursive: true });
const evidence = JSON.parse(await readFile(new URL('before.json', out), 'utf8'));
const { frame } = config;
const results: Record<string, unknown>[] = [];
for (const { name, root } of clearanceFixtures) {
  for (const stage of ['A', 'B'] as const) {
    const options = stage === 'A'
      ? { maxConnect: 80, maxSideTrials: 0, reserveAncestorCorridor: false, continueSoleChild: false, trunkShare: 0 }
      : { maxSideTrials: 0, reserveAncestorCorridor: false, continueSoleChild: false, trunkShare: 0 };
    try {
      const state = buildTree(root, options);
      const conflicts = sceneConflicts(state);
      assert.deepEqual(conflicts, [], `${stage}/${name} must be collision free`);
      const bounds = sceneBounds(state);
      let minGap = Infinity;
      for (let i = 0; i < state.nodes.length; i++) for (let j = i + 1; j < state.nodes.length; j++) {
        const a = state.nodes[i]!.geometry.center, b = state.nodes[j]!.geometry.center;
        minGap = Math.min(minGap, Math.max(Math.abs(a.x - b.x) - frame.width, Math.abs(a.y - b.y) - (frame.above + frame.below) / 2));
      }
      const connections = state.nodes.filter(n => n.parentId !== null).map(n => ({
        id: n.id,
        length: +Math.hypot(n.geometry.center.x - n.geometry.from.x, n.geometry.center.y - n.geometry.from.y).toFixed(2),
      }));
      results.push({ name, stage, status: 'ok', nodes: state.nodes.length,
        width: Math.ceil(bounds.maxX - bounds.minX), height: Math.ceil(bounds.maxY - bounds.minY),
        minGap: +minGap.toFixed(2), conflicts, maxConnection: Math.max(...connections.map(c => c.length)),
        extendedConnections: connections.filter(c => c.length > 80.01),
      });
      if (stage === 'B' && ['counterexample', 'binary4'].includes(name)) {
        await writeFile(new URL(`B-${name}.svg`, out), stemSvg(state, bounds, `B / ${name}`));
      }
      if (name === 'one-subtree') {
        const markup = stemSvg(state, bounds, 'one-subtree / D · 独占枝轴');
        assert.equal(new Bun.CryptoHasher('sha256').update(markup).digest('hex'), evidence.baselineSha256,
          'Retained six-node SVG must remain byte-identical');
      }
    } catch (error) {
      // Historical modes may legitimately reject; record it instead of hiding it.
      if (!(error instanceof NoPlacementError)) throw error;
      results.push({ name, stage, status: 'rejected', node: error.node, conflict: error.conflict });
    }
  }
}
await writeFile(new URL('results.json', out), JSON.stringify({ frame, connectionCandidates: [80, 104, 128, 176, 272, 464, 848, 1616], results }, null, 2) + '\n');
const sections = ['counterexample', 'binary4'].map(name => `<section><h2>${name}</h2><div class="pair"><figure><figcaption>Before — known collision</figcaption><img src="before-${name}.svg" alt="Before ${name}"></figure><figure><figcaption>B — verified clearance</figcaption><img src="B-${name}.svg" alt="After ${name}"></figure></div></section>`).join('');
await writeFile(new URL('index.html', out), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Stem clearance A to B</title><style>:root{color-scheme:light dark}body{font:16px system-ui;margin:24px;background:Canvas;color:CanvasText}.pair{display:grid;grid-template-columns:1fr 1fr}figure{margin:12px}img{width:100%;height:650px;object-fit:contain}figcaption{margin-bottom:12px}</style><h1>Stem clearance A → B</h1><p>A keeps connection length 80 and rejects both failures. B changes connection length only. Images use independent natural bounds; see results.json for sizes.</p>${sections}</html>`);
console.table(results.map(({ name, stage, status, width, height, minGap, maxConnection }) => ({ name, stage, status, width, height, minGap, maxConnection })));
console.log(`PASS: A/B evidence regenerated; baseline SHA-256 unchanged; ${results.filter(r => r.status === 'ok').length} clear scenes and ${results.filter(r => r.status === 'rejected').length} recorded rejections in the historical modes.`);
