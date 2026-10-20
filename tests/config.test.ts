import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { z } from 'zod';
import { FrameSchema, LayoutConfigSchema, RawConfigSchema, RenderConfigSchema, loadConfig, validateConfig } from '../src/config.ts';

const baselinePath = new URL('../config.json', import.meta.url);
const rawConfig = async (): Promise<z.infer<typeof RawConfigSchema>> =>
  RawConfigSchema.parse(JSON.parse(await readFile(baselinePath, 'utf8')));

// Persisted defaults normalize angles and resolve paths without aliasing the parsed JSON.
{
  const raw = await rawConfig();
  const base = dirname(fileURLToPath(baselinePath));
  const config = validateConfig(raw, base);
  assert.equal(config.input, resolve(base, raw.input));
  assert.equal(config.output, resolve(base, raw.output));
  assert.equal(config.layout.tilt, 32 * Math.PI / 180);
  assert.equal(config.layout.maxAngle, 70 * Math.PI / 180);
  assert(!('tiltDegrees' in config.layout), 'Runtime layout must not keep degrees');
  assert.deepEqual(LayoutConfigSchema.parse(config.layout), config.layout);
  config.frame.width = 999;
  config.render.width.min = 999;
  assert.equal(raw.frame.width, 48);
  assert.equal(raw.render.width.min, 1.7);
  assert.equal((await loadConfig()).frame.width, 48);
}

// A full custom file drives every policy; relative paths follow the config folder, not cwd.
const folder = await mkdtemp(join(tmpdir(), 'pedigree-config-'));
try {
  const raw = await rawConfig();
  raw.input = 'custom-tree.yaml';
  raw.output = 'custom.svg';
  raw.title = 'custom';
  raw.frame = { width: 61, above: 26, below: 27, gap: 3 };
  raw.layout = { tiltDegrees: 21, maxAngleDegrees: 65, connect: 60, tip: 30, step: 3, maxConnect: 900, connectionIncrement: 13, maxHeightSteps: 400, maxSideTrials: 4, minForkGap: 9, reserveAncestorCorridor: true, continueSoleChild: true, trunkShare: 0.4 };
  raw.render = { samples: 17, decimals: 3, padding: 11, bottomPadding: 70, fontSize: 16, textOffset: -3, frameStroke: 2, collisionMargin: 0.003, width: { min: 2, max: 12, scale: 3, parentRatio: 0.6, tipMin: 1.4, tipRatio: 0.3 }, stem: { thickness: 2.5, fill: '#3b2a1a', texture: null } };
  const path = join(folder, 'config.json');
  await writeFile(path, JSON.stringify(raw));
  const config = await loadConfig(path);
  assert.deepEqual(await loadConfig(pathToFileURL(path)), config);
  assert.deepEqual(config, {
    ...raw, input: join(folder, raw.input), output: join(folder, raw.output),
    layout: { connect: 60, tip: 30, step: 3, maxConnect: 900, connectionIncrement: 13, maxHeightSteps: 400, maxSideTrials: 4, minForkGap: 9, reserveAncestorCorridor: true, continueSoleChild: true, trunkShare: 0.4, tilt: 21 * Math.PI / 180, maxAngle: 65 * Math.PI / 180 },
  });

  // Strict schemas: missing fields, typos and out-of-domain values never get defaults.
  for (const value of [{}, { ...raw, title: undefined }, { ...raw, typo: 1 }, { ...raw, frame: { ...raw.frame, typo: 1 } }, { ...raw, input: ' ' }, { ...raw, output: '' }]) {
    assert.throws(() => validateConfig(value, tmpdir()));
  }
  for (const [field, values] of Object.entries({ width: [0, -1, Infinity, NaN], above: [0, -1, Infinity], below: [-1, Infinity], gap: [-1, Infinity] })) {
    for (const value of values) assert.equal(FrameSchema.safeParse({ ...raw.frame, [field]: value }).success, false, `${field}=${value}`);
  }
  assert.equal(FrameSchema.safeParse({ width: Number.MAX_VALUE, above: Number.MAX_VALUE, below: 1, gap: 0 }).success, false);
  const baseRender = (await rawConfig()).render;
  const config2 = validateConfig(raw, tmpdir());
  for (const [field, values] of Object.entries({ tilt: [0, -1, 2], maxAngle: [0, Math.PI / 2], connect: [0, Infinity], tip: [0], step: [0], connectionIncrement: [0], maxConnect: [1], maxHeightSteps: [-1, 0.5], maxSideTrials: [-1, 33, 0.5] })) {
    for (const value of values) assert.equal(LayoutConfigSchema.safeParse({ ...config2.layout, [field]: value }).success, false, `${field}=${value}`);
  }
  for (const [field, values] of Object.entries({ samples: [0, 1.5], decimals: [-1, 7, 1.5], padding: [-1], bottomPadding: [-1], frameStroke: [-1], collisionMargin: [-1, 0.001], fontSize: [0], textOffset: [Infinity, NaN] })) {
    for (const value of values) assert.equal(RenderConfigSchema.safeParse({ ...baseRender, [field]: value }).success, false, `${field}=${value}`);
  }
  for (const field of Object.keys(baseRender.width)) {
    assert.equal(RenderConfigSchema.safeParse({ ...baseRender, width: { ...baseRender.width, [field]: 0 } }).success, false, field);
  }
  assert.equal(RenderConfigSchema.safeParse({ ...baseRender, width: { ...baseRender.width, min: 12 } }).success, false);
  for (const layout of [{ ...raw.layout, tiltDegrees: 0 }, { ...raw.layout, maxAngleDegrees: 90 }, { ...raw.layout, tiltDegrees: 71 }]) {
    assert.equal(RawConfigSchema.safeParse({ ...raw, layout }).success, false);
  }

  // Inclusive limits stay valid; the rounding margin tracks the configured decimals.
  raw.frame.gap = 0;
  raw.layout.tiltDegrees = raw.layout.maxAngleDegrees;
  raw.layout.maxConnect = raw.layout.connect;
  raw.layout.maxHeightSteps = 0;
  raw.layout.maxSideTrials = 0;
  raw.render.samples = 1;
  raw.render.decimals = 0;
  raw.render.padding = 0;
  raw.render.bottomPadding = 0;
  raw.render.frameStroke = 0;
  raw.render.collisionMargin = Math.SQRT2 * 0.5;
  raw.render.width.min = raw.render.width.max;
  assert.doesNotThrow(() => validateConfig(raw, tmpdir()));
  raw.render.collisionMargin -= 0.0001;
  assert.throws(() => validateConfig(raw, tmpdir()), /collisionMargin/);

  // Output can never alias the input or the config file, and config files are JSON only.
  const aliasRaw = await rawConfig();
  assert.throws(() => validateConfig({ ...aliasRaw, output: './data/../data/one-subtree.json' }, folder), /input/i);
  await writeFile(path, JSON.stringify({ ...aliasRaw, output: './config.json' }));
  await assert.rejects(loadConfig(path), /config/i);
  await writeFile(path, 'input: data/tree.json');
  await assert.rejects(loadConfig(path), /config\.json/);
} finally {
  await rm(folder, { recursive: true, force: true });
}

// The persisted baseline still describes the original six-node fixture.
{
  const config = await loadConfig();
  assert.deepEqual(JSON.parse(await readFile(config.input, 'utf8')), {
    id: 'n0', children: [
      { id: 'n1', children: [{ id: 'n2', children: [] }, { id: 'n3', children: [] }] },
      { id: 'n4', children: [] }, { id: 'n5', children: [] },
    ],
  });
}
console.log('PASS: config schema boundaries, custom policies, config-relative paths and baseline fixture.');
