import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, StemStyleSchema } from '../src/config.ts';
import { LaidOutTreeSchema } from '../src/data.ts';
import { sceneBounds, stemSvg } from '../src/render.ts';

const state = LaidOutTreeSchema.parse({
  phase: 'laid-out', rootId: 'r',
  frame: { width: 72, above: 18, below: 18, gap: 12 },
  render: {
    samples: 8, decimals: 2, padding: 24, bottomPadding: 100, fontSize: 14, textOffset: 5,
    frameStroke: 1, collisionMargin: 0.02,
    width: { min: 1.7, max: 11, scale: 2, parentRatio: 0.55, tipMin: 1.3, tipRatio: 0.28 },
    stem: { thickness: 3, fill: 'currentColor', texture: null },
  },
  nodes: [{
    id: 'r', parentId: null, children: [], load: 1, widths: { start: 4, frame: 4, tip: 1.3 },
    geometry: { center: { x: 0, y: 0 }, from: { x: 0, y: 0 }, to: { x: 0, y: 90 }, angle: 0 },
  }],
});
const render = (scene: typeof state) => stemSvg(scene, sceneBounds(scene), 'stem');
const withStem = (stem: typeof state.render.stem) =>
  LaidOutTreeSchema.parse({ ...state, render: { ...state.render, stem } });

// Solid paint is a stem-only property: mounts keep their own colours.
const brown = withStem({ thickness: 1, fill: '#5a3a22', texture: null });
assert(render(brown).includes('<path d="M'), 'Stems are still drawn');
assert(render(brown).includes('fill="#5a3a22"'), 'The configured stem colour reaches the paths');
assert(!render(brown).includes('url(#stem-texture)'), 'No texture pattern without a texture');

// A texture tile is embedded as a pattern, never referenced externally.
const textured = withStem({
  thickness: 3, fill: '#5a3a22',
  texture: { href: 'data:image/png;base64,iVBORw0KGgo=', tile: 64 },
});
const texturedSvg = render(textured);
assert(texturedSvg.includes('<pattern id="stem-texture" patternUnits="userSpaceOnUse" width="64" height="64">'), 'The tile becomes a pattern');
assert(texturedSvg.includes('href="data:image/png;base64,'), 'The image is inlined, not linked');
assert(texturedSvg.includes('fill="url(#stem-texture)"'), 'Stems use the pattern');
assert(!/href="(?!data:)/.test(texturedSvg), 'No external references escape');
assert(texturedSvg.indexOf('<defs>') < texturedSvg.indexOf('<path d="M'), 'Patterns are defined before use');

// Draw-only thickness never touches the collision widths stored in the state.
const thick = render(withStem({ thickness: 3, fill: 'currentColor', texture: null }));
const thin = render(withStem({ thickness: 1, fill: 'currentColor', texture: null }));
const span = (svg: string) => {
  const [, first] = svg.match(/<path d="M ([^ ]+)/)!;
  return Math.abs(Number(first!.split(',')[0]));
};
assert(Math.abs(span(thin) - 2) < 1e-9 && Math.abs(span(thick) - 6) < 1e-9, 'Thickness scales the drawing only, 3x wider');

// Schema guards: colour tokens only, embedded images only, positive tile.
assert(StemStyleSchema.safeParse({ thickness: 2, fill: 'red', texture: null }).success, 'Named colours are allowed');
assert(!StemStyleSchema.safeParse({ thickness: 2, fill: 'url(#x)', texture: null }).success, 'No CSS functions');
assert(!StemStyleSchema.safeParse({ thickness: 2, fill: '#fff;stroke:red', texture: null }).success, 'No declaration smuggling');
assert(!StemStyleSchema.safeParse({ thickness: 0, fill: 'red', texture: null }).success, 'Thickness must be positive');
assert(!StemStyleSchema.safeParse({ thickness: 2, fill: 'red', texture: { href: 'https://x/y.png', tile: 8 } }).success,
  'Textures must already be inlined');

// Loading a config resolves a texture path into a data URI, relative to the config folder.
const folder = await mkdtemp(join(tmpdir(), 'pedigree-stem-'));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
await writeFile(join(folder, 'bark.png'), png);
await writeFile(join(folder, 'tree.json'), JSON.stringify({ id: 'r', children: [] }));
const base = {
  input: 'tree.json', output: 'out.svg', title: 'stem', frame: { width: 48, above: 21, below: 21, gap: 12 },
  layout: {
    tiltDegrees: 32, maxAngleDegrees: 70, connect: 80, tip: 44, step: 6, maxConnect: 1616,
    connectionIncrement: 24, maxHeightSteps: 20000, maxSideTrials: 32, minForkGap: 0,
    reserveAncestorCorridor: true, continueSoleChild: true, trunkShare: 0.4,
  },
  render: {
    samples: 32, decimals: 2, padding: 24, bottomPadding: 100, fontSize: 14, textOffset: 5,
    frameStroke: 1, collisionMargin: 0.02,
    width: { min: 1.7, max: 11, scale: 2, parentRatio: 0.55, tipMin: 1.3, tipRatio: 0.28 },
    stem: { thickness: 3, fill: '#5a3a22', texture: { path: 'bark.png', tile: 64 } },
  },
};
await writeFile(join(folder, 'config.json'), JSON.stringify(base));
const loaded = await loadConfig(join(folder, 'config.json'));
assert(loaded.render.stem.texture?.href.startsWith('data:image/png;base64,'), 'A texture path becomes a data URI');
assert.equal(loaded.render.stem.texture?.tile, 64);

await writeFile(join(folder, 'config.svgtex.json'), JSON.stringify({
  ...base, render: { ...base.render, stem: { ...base.render.stem, texture: { path: 'bark.svg', tile: 8 } } },
}));
await assert.rejects(loadConfig(join(folder, 'config.svgtex.json')), /Unsupported stem texture type/);

console.log('PASS: stem paint (solid, texture pattern), draw-only thickness and texture resolution guards.');
