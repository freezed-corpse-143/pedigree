import type { FrameConfig, RenderConfig } from './config.ts';

/** Rendered label box insets and frame corner radius; visual only, never fed back into layout. */
const LABEL_INSET = 3, LABEL_ADVANCE = 0.6, FRAME_RADIUS = 3;
/** Self-contained ink colour: a host page may restyle, but a bare rasteriser must see it. */
export const MOUNT_INK = '#111';

export const escapeXml = (value: unknown) =>
  String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Everything a mount may read. Coordinates are local: (0,0) is the stem attachment point, +y is down. */
export type MountInput = {
  readonly id: string;
  /** Spacing envelope the layout reserved around the attachment point. */
  readonly envelope: FrameConfig;
  readonly render: RenderConfig;
};

/**
 * A mount draws one person's marker on the stem.
 *
 * Contract:
 * - `draw` is pure and deterministic: same input, same string; no I/O, no time, no shared state.
 * - It returns a self-contained SVG fragment. The renderer wraps it in
 *   `<g class="mount" data-id="…">` and translates that group to the attachment point, so the
 *   fragment is drawn in local coordinates around (0,0) with +y pointing down.
 * - The fragment must not contain scripts, external references or event handlers; `assertMount`
 *   rejects those before a scene is rendered.
 * - `envelope` is what the layout spaces the tree with: return a bigger box and every neighbour
 *   moves further away. It must be symmetric around the attachment point, so a mount that hangs
 *   below the stem declares the extra height here rather than overlapping its parent.
 */
export type Mount = {
  readonly name: string;
  envelope(frame: FrameConfig, render: RenderConfig): FrameConfig;
  draw(input: MountInput): string;
};

const FORBIDDEN = /<(script|foreignObject|image|iframe|animate)\b|on[a-z]+\s*=|(href|src|xlink:href)\s*=|url\(|javascript:/i;

/** Fail fast on a mount that would smuggle behaviour or external content into a static image. */
export function assertMount(mount: Mount): Mount {
  if (!mount?.name) throw new TypeError('A mount needs a stable name');
  if (typeof mount.envelope !== 'function' || typeof mount.draw !== 'function') {
    throw new TypeError(`Mount "${mount.name}" must implement envelope() and draw()`);
  }
  const probe: MountInput = { id: 'probe', envelope: { width: 48, above: 21, below: 21, gap: 12 }, render: {
    samples: 32, decimals: 2, padding: 24, bottomPadding: 100, fontSize: 14, textOffset: 5,
    frameStroke: 1, collisionMargin: 0.02,
    width: { min: 1.7, max: 11, scale: 2, parentRatio: 0.55, tipMin: 1.3, tipRatio: 0.28 },
    stem: { thickness: 3, fill: 'currentColor', texture: null },
  } };
  const markup = mount.draw(probe);
  if (typeof markup !== 'string') throw new TypeError(`Mount "${mount.name}" must return a string`);
  if (FORBIDDEN.test(markup)) throw new TypeError(`Mount "${mount.name}" emits forbidden markup`);
  if (mount.draw(probe) !== markup) throw new TypeError(`Mount "${mount.name}" is not deterministic`);
  const box = mount.envelope(probe.envelope, probe.render);
  for (const key of ['width', 'above', 'below', 'gap'] as const) {
    if (!Number.isFinite(box[key]) || box[key] < 0) throw new TypeError(`Mount "${mount.name}" returned an invalid envelope.${key}`);
  }
  return mount;
}

/**
 * Default mount: the axis-aligned frame with a centred label, which is also the spacing envelope.
 * Keeps the pre-mount rendering exactly: rounded rect, frame stroke, label clamped to the interior.
 */
export const frameMount: Mount = {
  name: 'frame',
  envelope: frame => frame,
  draw: ({ id, envelope, render }) => {
    const halfWidth = envelope.width / 2;
    const height = envelope.above + envelope.below;
    const stroke = render.frameStroke === 1 ? '' : ` stroke-width="${render.frameStroke}"`;
    const inner = envelope.width - 2 * LABEL_INSET;
    const label = escapeXml(id);
    const fit = [...id].length * render.fontSize * LABEL_ADVANCE > inner
      ? ` textLength="${+inner.toFixed(render.decimals)}" lengthAdjust="spacingAndGlyphs"`
      : '';
    return `<rect x="${-halfWidth}" y="${-envelope.above}" width="${envelope.width}" height="${height}" rx="${FRAME_RADIUS}" fill="#fff" stroke="currentColor"${stroke}/>`
      + `<text x="0" y="${render.textOffset}" text-anchor="middle" font-size="${render.fontSize}" fill="currentColor"${fit}>${label}</text>`;
  },
};
