import type { RenderTree, SceneBounds } from './data.ts';
import { assertMount, escapeXml as escape, frameMount, MOUNT_INK } from './mount.ts';
import type { Mount } from './mount.ts';

/** Hairline stroke width that hides anti-aliasing seams between touching stem polygons. */
const SEAM = 0.8;

/**
 * Pure view of a completed snapshot: no tree traversal, layout lookup, I/O or subscription.
 * Only laid-out states are renderable; an initialized draft has no coordinates yet.
 */
export function stemSvg(state: RenderTree, bounds: SceneBounds, title: string, mount: Mount = frameMount): string {
  assertMount(mount);
  if (state.phase !== 'laid-out') throw new TypeError('Rendering requires laid-out geometry');
  const { frame, render } = state;
  const round = (n: number) => +n.toFixed(render.decimals);
  const { minX, maxX, minY, maxY } = bounds;
  const byId = new Map(state.nodes.map(n => [n.id, n]));
  const { thickness, fill, texture } = render.stem;
  const paint = texture ? 'url(#stem-texture)' : fill;
  const defs = texture
    ? `<defs><pattern id="stem-texture" patternUnits="userSpaceOnUse" width="${texture.tile}" height="${texture.tile}">`
      + `<image href="${texture.href}" width="${texture.tile}" height="${texture.tile}" preserveAspectRatio="xMidYMid slice"/></pattern></defs>`
    : '';
  // A stem may never be wider than the parent stem where it leaves it: at a fork the parent has
  // already tapered, so an unclamped child would poke a corner out of the trunk.
  const taper = (node: typeof state.nodes[number], t: number) => {
    const total = Math.hypot(node.geometry.to.x - node.geometry.from.x, node.geometry.to.y - node.geometry.from.y) || 1;
    const frameT = Math.min(1, Math.max(0, Math.hypot(node.geometry.center.x - node.geometry.from.x,
      node.geometry.center.y - node.geometry.from.y) / total));
    const ease = (u: number) => u * u * (3 - 2 * u);
    const { start, frame, tip } = node.widths;
    return t <= frameT
      ? start + (frame - start) * (frameT ? ease(t / frameT) : 1)
      : frame + (tip - frame) * ease((t - frameT) / (1 - frameT));
  };
  const parentWidthAtFork = (node: typeof state.nodes[number]) => {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (!parent) return Infinity;
    const dx = parent.geometry.to.x - parent.geometry.from.x, dy = parent.geometry.to.y - parent.geometry.from.y;
    const len = Math.hypot(dx, dy) || 1;
    const t = Math.min(1, Math.max(0, ((node.geometry.from.x - parent.geometry.from.x) * dx
      + (node.geometry.from.y - parent.geometry.from.y) * dy) / (len * len)));
    return taper(parent, t);
  };
  const startWidthOf = new Map(state.nodes.map(n => [n.id, Math.min(n.widths.start, parentWidthAtFork(n))]));

  const body = state.nodes.map(node => {
    const { center, from, to } = node.geometry;
    const { frame: ownerWidth } = node.widths;
    const startWidth = startWidthOf.get(node.id)!;
    // A continued trunk must not step at the joint: end at the child's own start width.
    const child = node.children.length === 1 ? byId.get(node.children[0]!) : undefined;
    const continued = child !== undefined
      && Math.hypot(child.geometry.from.x - to.x, child.geometry.from.y - to.y) < 1e-6;
    const endWidth = continued ? child.widths.start : node.widths.tip;
    const total = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const ux = (to.x - from.x) / total, uy = (to.y - from.y) / total;
    const frameT = Math.min(1, Math.max(0, Math.hypot(center.x - from.x, center.y - from.y) / total));
    const left: string[] = [], right: string[] = [];
    for (let i = 0; i <= render.samples; i++) {
      const t = i / render.samples;
      // Smoothstep between the three widths: keeps the stem full near the frame and thins
      // quickly towards the tip, instead of a constant linear bevel.
      const ease = (u: number) => u * u * (3 - 2 * u);
      // Draw-only thickness: the layout reserved the collision width, the artwork may be bolder.
      const half = (t <= frameT
        ? startWidth + (ownerWidth - startWidth) * (frameT ? ease(t / frameT) : 1)
        : ownerWidth + (endWidth - ownerWidth) * ease((t - frameT) / (1 - frameT))) / 2 * thickness;
      const x = from.x + (to.x - from.x) * t, y = from.y + (to.y - from.y) * t;
      left.push(`${round(x - uy * half)},${round(-y - ux * half)}`);
      right.push(`${round(x + uy * half)},${round(-y + ux * half)}`);
    }
    // No back extension: a stub behind the fork pokes out of a thinner parent stem. The disc
    // drawn at each fork plus the seam stroke close the junction instead.
    right.reverse();
    // A hairline stroke of the same paint hides anti-aliasing seams between touching polygons.
    return `<path d="M ${left.join(' L ')} L ${right.join(' L ')} Z" fill="${paint}" stroke="${paint}" stroke-width="${SEAM}" stroke-linejoin="round"/>`;
  }).join('\n');
  // A filled disc at each fork closes the crotch: two thick branches leave a white V otherwise.
  const forks = state.nodes.filter(n => n.children.length > 0).map(n => {
    const kids = n.children.map(id => byId.get(id)!);
    const at = kids[0]!.geometry.from;
    const radius = Math.max(...kids.map(k => startWidthOf.get(k.id)!)) * thickness / 2;
    return `<circle cx="${round(at.x)}" cy="${round(-at.y)}" r="${round(radius)}" fill="${paint}"/>`;
  }).join('\n');
  const stroke = render.frameStroke === 1 ? '' : ` stroke-width="${render.frameStroke}"`;
  const frames = state.nodes.map(({ id, geometry: { center: p } }) =>
    `<g class="mount" data-id="${escape(id)}" transform="translate(${round(p.x)},${round(-p.y)})">${mount.draw({ id, envelope: frame, render })}</g>`
  ).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" color="${MOUNT_INK}" aria-label="${escape(title)}" viewBox="${minX} ${-maxY} ${maxX - minX} ${maxY - minY}" width="${Math.ceil(maxX - minX)}" height="${Math.ceil(maxY - minY)}"><title>${escape(title)}</title><style>:root{font-family:system-ui}</style>${defs}${body}${forks}${frames}</svg>`;
}

export function sceneBounds(state: RenderTree): SceneBounds {
  if (state.phase !== 'laid-out') throw new TypeError('Bounds require laid-out geometry');
  const { frame, render } = state;
  const points = state.nodes.flatMap(node => [node.geometry.center, node.geometry.from, node.geometry.to]);
  return {
    minX: Math.min(...points.map(p => p.x)) - frame.width / 2 - render.padding,
    maxX: Math.max(...points.map(p => p.x)) + frame.width / 2 + render.padding,
    minY: Math.min(-render.bottomPadding, Math.min(...points.map(p => p.y)) - frame.below),
    maxY: Math.max(...points.map(p => p.y)) + frame.above + render.padding,
  };
}
