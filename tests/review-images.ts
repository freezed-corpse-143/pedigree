import { buildTree } from './helpers.ts';
import { clearanceFixtures } from './clearance-fixtures.ts';
import { sceneBounds, stemSvg } from '../src/render.ts';
import { escapeXml, frameMount } from '../src/mount.ts';
import type { Mount } from '../src/mount.ts';

/**
 * Regenerates the review artwork under output/review/. Not part of the test suite: it writes
 * files and exists so the screenshots quoted in the docs can be rebuilt from source.
 */
const out = new URL('../output/review/', import.meta.url);
const write = (name: string, svg: string) => Bun.write(new URL(name, out), svg);

const badge: Mount = {
  name: 'badge',
  envelope: frame => frame,
  draw: ({ id, envelope, render }) =>
    `<circle r="${envelope.above}" cx="0" cy="0" fill="#fff" stroke="currentColor" stroke-width="2"/>`
    + `<text x="0" y="${render.textOffset - 1}" text-anchor="middle" font-size="${render.fontSize}" fill="currentColor">${escapeXml(id.slice(-2))}</text>`,
};

const tag: Mount = {
  name: 'tag',
  envelope: frame => ({ ...frame, above: 8, below: 56 }),
  draw: ({ id, envelope, render }) =>
    `<line x1="0" y1="0" x2="0" y2="${envelope.below - 34}" stroke="currentColor"/>`
    + `<rect x="${-envelope.width / 2 + 6}" y="${envelope.below - 34}" width="${envelope.width - 12}" height="34" rx="6" fill="#fff" stroke="currentColor"/>`
    + `<text x="0" y="${envelope.below - 12}" text-anchor="middle" font-size="${render.fontSize}" fill="currentColor">${escapeXml(id)}</text>`,
};

for (const name of ['one-subtree', 'binary4', 'mixed', 'single-child']) {
  const state = buildTree(clearanceFixtures.find(f => f.name === name)!.root);
  await write(`${name}.svg`, stemSvg(state, sceneBounds(state), `${name} · current default`));
}

const root = clearanceFixtures.find(f => f.name === 'one-subtree')!.root;
for (const [name, mount] of [['frame', frameMount], ['badge', badge], ['tag', tag]] as [string, Mount][]) {
  const state = buildTree(root, {}, undefined, mount);
  await write(`mount-${name}.svg`, stemSvg(state, sceneBounds(state), `mount ${name}`, mount));
}
console.log('review artwork written to output/review/');
