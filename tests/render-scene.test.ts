import assert from 'node:assert/strict';
import { LaidOutTreeSchema, InitializedTreeSchema } from '../src/data.ts';
import type { RenderTree } from '../src/data.ts';
import { stemSvg, sceneBounds } from '../src/render.ts';

// Render from plain serialized state: no input tree, layout, Map or hidden defaults.
const raw = {
  phase: 'laid-out',
  rootId: 'A<&',
  frame: { width: 72, above: 18, below: 18, gap: 12 },
  render: {
    samples: 32, decimals: 2, padding: 24, bottomPadding: 100, fontSize: 14, textOffset: 5,
    frameStroke: 1, collisionMargin: 0.02,
    width: { min: 1.7, max: 11, scale: 2, parentRatio: 0.55, tipMin: 1.3, tipRatio: 0.28 },
    stem: { thickness: 3, fill: 'currentColor', texture: null },
  },
  nodes: [{
    id: 'A<&', parentId: null, children: [], load: 1, widths: { start: 4, frame: 4, tip: 1.3 },
    geometry: { center: { x: 10, y: 20 }, from: { x: 10, y: 20 }, to: { x: 10, y: 90 }, angle: 0 },
  }],
};
const state = LaidOutTreeSchema.parse(raw);
const render = (scene: RenderTree) => stemSvg(scene, sceneBounds(scene), 'State <tree>');
const before = JSON.stringify(state);
const first = render(state);
assert(first.includes('<g class="mount" data-id="A&lt;&amp;" transform="translate(10,-20)">'), 'The mount group is translated to the anchor');
assert(first.includes('<rect x="-36" y="-18" width="72" height="36"'), 'Use frame size from state in mount-local coordinates');
assert(first.includes('data-id="A&lt;&amp;"'), 'Escape state content');
assert.equal(JSON.stringify(state), before, 'Rendering does not mutate the snapshot');
assert.equal(render(LaidOutTreeSchema.parse(JSON.parse(before))), first, 'JSON round trip retains rendering');
const wider = LaidOutTreeSchema.parse({ ...state, frame: { ...state.frame, width: 100 } });
assert(render(wider).includes('<rect x="-50" y="-18" width="100" height="36"'), 'Replacement state changes the rendered frame');
assert(first.includes('<rect x="-36"'), 'Prior snapshot stays renderable');
const draft = InitializedTreeSchema.parse({
  phase: 'initialized', rootId: 'A<&', frame: state.frame, render: state.render,
  nodes: [{ id: 'A<&', parentId: null, children: [], load: 1, widths: { start: 4, frame: 4, tip: 1.3 }, geometry: null }],
});
assert.throws(() => render(draft), /laid-out/i, 'Incomplete state cannot be rendered');
assert.throws(() => LaidOutTreeSchema.parse({ ...state, nodes: [] }), 'Empty published state is rejected at the boundary');

// Render configuration is part of the state, not baked into the renderer.
const base = state.nodes[0]!;
const fractional = LaidOutTreeSchema.parse({
  ...state,
  nodes: [{ ...base, geometry: { ...base.geometry, center: { x: 10.456, y: 20 } } }],
});
assert(render(fractional).includes('translate(10.46,-20)'), 'Decimals control coordinate rounding');
assert(render(LaidOutTreeSchema.parse({ ...fractional, render: { ...state.render, decimals: 0, collisionMargin: 0.71 } })).includes('translate(10,-20)'),
  'Decimals also require a matching collision margin');
const stroked = LaidOutTreeSchema.parse({ ...state, render: { ...state.render, frameStroke: 2 } });
assert(stroked && render(stroked).includes('stroke-width="2"'), 'A non-default frame stroke becomes explicit');
assert(!first.includes('stroke-width="1"'), 'The default frame stroke stays implicit (stems keep their seam stroke)');
const coarse = LaidOutTreeSchema.parse({ ...state, render: { ...state.render, samples: 4 } });
assert(render(coarse).split(' L ').length < first.split(' L ').length, 'Samples control path resolution');
console.log('PASS: standalone render state, JSON round trip, frame sizing, escaping and snapshot immutability.');

// Aesthetic contract: self-contained colours, label fit and seamless fork caps.
const two = LaidOutTreeSchema.parse({ ...state, nodes: [
  { ...base, widths: { start: 4, frame: 4, tip: 1.3 }, geometry: { center: { x: 10, y: 20 }, from: { x: 10, y: 20 }, to: { x: 10, y: 90 }, angle: 0 } },
  { id: 'kid', parentId: 'A<&', children: [], load: 1, widths: { start: 2, frame: 2, tip: 1.3 },
    geometry: { center: { x: 0, y: 10 }, from: { x: 0, y: 0 }, to: { x: 0, y: 20 }, angle: 0 } },
] });
const twoSvg = render(two);
assert(!twoSvg.includes('M -3,3 L'), 'Child stems start exactly at the fork; no stub pokes out of the parent');
assert(!twoSvg.includes('fill="var('), 'No unresolved var() in presentation attributes');
assert(twoSvg.includes('color="#111"'), 'Ink colour is explicit so bare rasterisers resolve currentColor');
assert((twoSvg.match(/fill="#fff"/g) ?? []).length === 2, 'Every mount carries a concrete fallback fill');

const eased = LaidOutTreeSchema.parse({ ...state, render: { ...state.render, samples: 4 } });
// Thickness 3 scales the drawn half-width: 10 - 1.789 * 3 = 4.63 (a straight bevel would be 5.01).
assert(render(eased).includes('4.63,'), 'Width follows a smoothstep and the draw-only thickness');
assert(render(LaidOutTreeSchema.parse({ ...eased, render: { ...eased.render, stem: { ...eased.render.stem, thickness: 1 } } })).includes('8.21,'),
  'Thickness 1 reproduces the collision width exactly');

const longName = LaidOutTreeSchema.parse({ ...state, nodes: [{ ...base, id: 'a-very-long-person-name' }] });
const longSvg = render(longName);
assert(longSvg.includes('textLength="66" lengthAdjust="spacingAndGlyphs"'), 'Long labels are clamped to the frame interior');
assert(!first.includes('textLength'), 'Labels that fit are left alone');
// Forks are patched so two thick branches cannot leave a white crotch, and stems carry a
// hairline stroke of their own paint so touching polygons do not show an anti-aliasing seam.
const branching = LaidOutTreeSchema.parse({ ...state, nodes: [
  { ...base, children: ['l', 'r'], load: 3, widths: { start: 10, frame: 10, tip: 4 }, geometry: { center: { x: 0, y: 0 }, from: { x: 0, y: 0 }, to: { x: 0, y: 120 }, angle: 0 } },
  { id: 'l', parentId: 'A<&', children: [], load: 1, widths: { start: 7, frame: 7, tip: 3 },
    geometry: { center: { x: -30, y: 60 }, from: { x: 0, y: 40 }, to: { x: -60, y: 90 }, angle: -0.5 } },
  { id: 'r', parentId: 'A<&', children: [], load: 1, widths: { start: 7, frame: 7, tip: 3 },
    geometry: { center: { x: 30, y: 60 }, from: { x: 0, y: 40 }, to: { x: 60, y: 90 }, angle: 0.5 } },
] });
const branchingSvg = render(branching);
assert(branchingSvg.includes('<circle cx="0" cy="-40"'), 'A disc patches each fork');
assert(branchingSvg.includes('stroke-width="0.8"'), 'Stem polygons carry a seam-hiding stroke');
assert(branchingSvg.includes('stroke-linejoin="round"'), 'Stem joins are rounded');
// A branch may not be drawn wider than the stem it leaves: the parent has tapered by then.
const tapered = LaidOutTreeSchema.parse({ ...state, nodes: [
  { ...base, children: ['c'], load: 2, widths: { start: 10, frame: 10, tip: 2 },
    geometry: { center: { x: 0, y: 20 }, from: { x: 0, y: 0 }, to: { x: 0, y: 100 }, angle: 0 } },
  { id: 'c', parentId: 'A<&', children: [], load: 1, widths: { start: 8, frame: 8, tip: 3 },
    geometry: { center: { x: 40, y: 80 }, from: { x: 0, y: 60 }, to: { x: 0, y: 100 }, angle: 0 } },
] });
const taperedSvg = render(LaidOutTreeSchema.parse({ ...tapered, render: { ...tapered.render, stem: { ...tapered.render.stem, thickness: 1 } } }));
// Parent width at the fork (t = 0.6) is 6, so the child starts at 6 instead of its own 8.
const childPath = taperedSvg.match(/<path d="M (-?[\d.]+),(?:-?[\d.]+) L [^"]*"/g)!.pop()!;
assert(childPath.includes('M -3,-60'), 'A child stem is clamped to the parent width at the fork');
console.log('PASS: parent-width clamp, fork patches, seam stroke, frame colours, smoothstep and labels.');
