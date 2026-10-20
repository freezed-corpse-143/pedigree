import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.ts';
import { LaidOutTreeSchema } from '../src/data.ts';
import { validateTree } from '../src/validate-tree.ts';
import { initializeTree, applyLayout } from '../src/state.ts';
import { layoutStemScene } from '../src/layout/index.ts';
import { sceneBounds, stemSvg } from '../src/render.ts';
import { run } from '../src/pipeline.ts';

const config = await loadConfig();
const draft = initializeTree(validateTree({ id: 'root', children: [{ id: 'child', children: [] }] }), config);
assert.equal(draft.phase, 'initialized');
assert(draft.nodes.every(n => n.geometry === null), 'Initialization never guesses coordinates');
assert.throws(() => sceneBounds(draft), /laid-out/i, 'Draft state cannot be rendered');
const before = JSON.stringify(draft);
const positions = layoutStemScene(draft, config.layout);
assert.equal(JSON.stringify(draft), before, 'Pure layout leaves state unchanged');
assert.deepEqual(layoutStemScene(draft, config.layout), positions, 'Layout is deterministic');
assert.deepEqual(Object.keys(positions[0]!).sort(), ['angle', 'center', 'from', 'id', 'to'], 'Layout publishes positions only');
const complete = applyLayout(draft, positions);
assert.equal(JSON.stringify(draft), before, 'Application is immutable');
assert.equal(complete.phase, 'laid-out');
assert.throws(() => applyLayout(draft, positions.slice(1)), /Missing/i);
assert.throws(() => applyLayout(draft, [positions[0]!, positions[0]!]), /Duplicate/i);
assert.throws(() => applyLayout(draft, positions.map((p, i) => i === 0 ? { ...p, id: 'unknown' } : p)), /Unknown/i);
assert.throws(() => applyLayout(draft, positions.map((p, i) => i === 0 ? { ...p, center: { x: NaN, y: 0 } } : p)));
const frozen = JSON.stringify(complete);
positions[0]!.center.x = 999;
assert.equal(JSON.stringify(complete), frozen, 'Applied geometry never aliases layout results');
const reparsed = LaidOutTreeSchema.parse(JSON.parse(frozen));
assert.equal(stemSvg(complete, sceneBounds(complete), 'Tree'), stemSvg(reparsed, sceneBounds(reparsed), 'Tree'),
  'Published state is self-contained JSON');

const folder = await mkdtemp(join(tmpdir(), 'pedigree-pipeline-'));
try {
  const raw: Record<string, unknown> = JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8'));
  const file = join(folder, 'config.json');
  const output = join(folder, 'tree.svg');
  await writeFile(join(folder, 'tree.yaml'), 'id: root\nchildren:\n  - id: child\n    children: []\n');
  await writeFile(file, JSON.stringify({ ...raw, input: 'tree.yaml', output: 'tree.svg', title: 'YAML tree' }));
  const result = await run(file);
  const svg = await readFile(output, 'utf8');
  assert(svg.includes('data-id="root"') && svg.includes('data-id="child"'));
  assert.equal(result.state.phase, 'laid-out');
  assert.equal(result.output, output);
  for (const invalid of ['id: [', '- {id: a, children: []}\n- {id: b, children: []}', 'id: root\nchildren: [{id: root, children: []}]']) {
    await writeFile(join(folder, 'tree.yaml'), invalid);
    await assert.rejects(run(file), 'Invalid input must fail the pipeline');
    assert.equal(await readFile(output, 'utf8'), svg, 'Failed input preserves the last successful output');
  }
  await writeFile(join(folder, 'tree.yaml'), 'id: root\nchildren: []\n');
  await writeFile(file, JSON.stringify({ ...raw, input: 'tree.yaml', output: 'tree.svg', frame: { width: 80, above: 30, below: 30, gap: 20 }, title: 'Configured' }));
  await run(file);
  assert((await readFile(output, 'utf8')).includes('width="80" height="60"'), 'Persisted frame drives the artwork');
} finally {
  await rm(folder, { recursive: true, force: true });
}
console.log('PASS: staged transitions, pure layout, immutable application and file-to-SVG failure isolation.');
