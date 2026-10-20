import assert from 'node:assert/strict';
import { buildTree, config } from './helpers.ts';
import { initializeTree } from '../src/state.ts';
import { validateTree } from '../src/validate-tree.ts';
import { sceneBounds, stemSvg } from '../src/render.ts';
import { assertMount, escapeXml, frameMount, MOUNT_INK } from '../src/mount.ts';
import type { Mount } from '../src/mount.ts';

const tree = { id: 'root', children: [{ id: 'a', children: [] }, { id: '<b&>', children: [] }] };

// The default mount is the documented default: opaque envelope, frame drawing, no behaviour.
assert.equal(frameMount.name, 'frame');
assert.deepEqual(frameMount.envelope(config.frame, config.render), config.frame, 'Default mount keeps the configured envelope');
assert.equal(assertMount(frameMount), frameMount, 'The default mount satisfies its own contract');

const state = buildTree(tree);
const bounds = sceneBounds(state);
const base = stemSvg(state, bounds, 'mount default');
assert.equal(base, stemSvg(state, bounds, 'mount default', frameMount), 'Omitting the mount renders the default');
assert.equal(base, stemSvg(state, bounds, 'mount default'), 'Rendering is deterministic');
assert(base.includes(`<g class="mount" data-id="a" transform="translate(`), 'Each mount group is translated to its anchor');
assert(base.includes(`data-id="${escapeXml('<b&>')}"`), 'Mount ids are escaped once, by the renderer');
assert(base.includes(MOUNT_INK), 'The document still declares its own ink colour');

// A custom mount owns its drawing *and* the envelope the layout spaces the tree with.
const tag: Mount = {
  name: 'tag',
  envelope: frame => ({ ...frame, width: frame.width * 2, above: frame.above * 2, below: frame.below * 2 }),
  draw: ({ id, envelope }) =>
    `<rect x="${-envelope.width / 2}" y="${-envelope.above}" width="${envelope.width}" height="${envelope.above + envelope.below}" fill="#fff" stroke="currentColor"/>`
    + `<text x="0" y="0" text-anchor="middle" font-size="14" fill="currentColor">${escapeXml(id)}</text>`,
};
const tagged = initializeTree(validateTree(tree), config, tag);
assert.deepEqual(tagged.frame, { ...config.frame, width: config.frame.width * 2, above: config.frame.above * 2, below: config.frame.below * 2 },
  'The mount envelope replaces the spacing frame before layout');
const taggedState = buildTree(tree, {}, undefined, tag);
assert(taggedState.nodes.some(n => n.geometry.center.x !== state.nodes.find(m => m.id === n.id)!.geometry.center.x),
  'A larger envelope actually moves the layout');
const taggedSvg = stemSvg(taggedState, sceneBounds(taggedState), 'tag', tag);
assert(taggedSvg.includes('width="96" height="84"'), 'The custom mount draws its own shape');
assert(!taggedSvg.includes('rx="3"'), 'The default frame drawing is replaced, not appended');

// Contract violations are rejected before a scene is rendered.
const bad = (draw: Mount['draw']): Mount => ({ name: 'bad', envelope: frame => frame, draw });
assert.throws(() => stemSvg(state, bounds, 'x', bad(() => '<script>alert(1)</script>')), /forbidden markup/);
assert.throws(() => stemSvg(state, bounds, 'x', bad(() => '<rect onload="alert(1)"/>')), /forbidden markup/);
assert.throws(() => stemSvg(state, bounds, 'x', bad(() => '<image href="http://x/y.png"/>')), /forbidden markup/);
assert.throws(() => stemSvg(state, bounds, 'x', bad(() => '<rect fill="url(#x)"/>')), /forbidden markup/);
let calls = 0;
assert.throws(() => stemSvg(state, bounds, 'x', bad(() => `<rect x="${calls++}"/>`)), /not deterministic/);
assert.throws(() => stemSvg(state, bounds, 'x', { name: 'nan', envelope: () => ({ width: NaN, above: 1, below: 1, gap: 0 }), draw: () => '' }),
  /invalid envelope/);
assert.throws(() => stemSvg(state, bounds, 'x', { name: '', envelope: frame => frame, draw: () => '' }), /stable name/);
assert.throws(() => (stemSvg as unknown as (a: unknown) => string)({ phase: 'initialized' }), /laid-out/i);

// Asymmetric envelope: the mount point moves along the stem, and spacing follows the offset.
const hang: Mount = {
  name: 'hang',
  envelope: frame => ({ ...frame, above: 10, below: 50 }),
  draw: ({ envelope }) =>
    `<rect x="${-envelope.width / 2}" y="${-envelope.above}" width="${envelope.width}" height="${envelope.above + envelope.below}" fill="#fff" stroke="currentColor"/>`,
};
const chain = { id: 'r', children: [{ id: 'c', children: [] }] };
const hangState = buildTree(chain, {}, undefined, hang);
assert.deepEqual(hangState.frame, { ...config.frame, above: 10, below: 50 }, 'Asymmetric extents reach the state');
const r = hangState.nodes.find(n => n.id === 'r')!, c = hangState.nodes.find(n => n.id === 'c')!;
const shift = (10 - 50) / 2;
const gap = Math.hypot(hangState.frame.width + hangState.frame.gap, 10 + 50 + hangState.frame.gap);
assert(Math.hypot(r.geometry.center.x - c.geometry.center.x,
  (r.geometry.center.y + shift) - (c.geometry.center.y + shift)) >= gap - 1e-6,
  'Spacing uses the centre shifted by the asymmetry, not the anchor');
const hangBounds = sceneBounds(hangState);
const ys = hangState.nodes.flatMap(n => [n.geometry.center.y, n.geometry.from.y, n.geometry.to.y]);
assert.equal(hangBounds.maxY, Math.max(...ys) + 10 + config.render.padding, 'Above extent sizes the top of the canvas');
assert.equal(hangBounds.minY, Math.min(-config.render.bottomPadding, Math.min(...ys) - 50), 'Below extent sizes the bottom of the canvas');

console.log('PASS: default mount, custom envelope reshaping the layout, and contract rejections.');
