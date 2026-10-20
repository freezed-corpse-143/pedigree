import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const positive = z.number().finite().positive();
const nonnegative = z.number().finite().nonnegative();
const pathSchema = z.string().refine(value => value.trim().length > 0 && !value.includes('\0'), 'Expected a nonempty filesystem path');

export const FrameSchema = z.strictObject({
  width: positive,
  /** Extent above the stem attachment point (towards the tip). */
  above: positive,
  /** Extent below the attachment point (towards the fork). */
  below: positive,
  gap: nonnegative,
}).refine(frame => Number.isFinite(frame.width + frame.above + frame.below + frame.gap), 'Frame extents and gap must have finite sums');

const layoutShape = {
  connect: positive,
  tip: positive,
  step: positive,
  maxConnect: positive,
  connectionIncrement: positive,
  maxHeightSteps: z.number().int().nonnegative(),
  maxSideTrials: z.number().int().min(0).max(32),
  /** Minimum axis distance between consecutive forks on one parent; 0 disables the rule. */
  minForkGap: nonnegative,
  /** Reject placements whose frames enter an ancestor's stem corridor. */
  reserveAncestorCorridor: z.boolean(),
  /** A sole child continues the parent axis instead of tilting off it. */
  continueSoleChild: z.boolean(),
  /** Bare trunk as a fraction of the whole visible tree height (root frame bottom to tip). */
  trunkShare: z.number().min(0).max(0.9),
};

export const LayoutConfigSchema = z.strictObject({
  ...layoutShape,
  tilt: positive,
  maxAngle: positive.lt(Math.PI / 2),
}).refine(layout => layout.tilt <= layout.maxAngle, { message: 'tilt must not exceed maxAngle', path: ['tilt'] })
  .refine(layout => layout.maxConnect >= layout.connect, { message: 'maxConnect must be at least connect', path: ['maxConnect'] });

const RawLayoutConfigSchema = z.strictObject({
  ...layoutShape,
  tiltDegrees: positive,
  maxAngleDegrees: positive.lt(90),
}).refine(layout => layout.tiltDegrees <= layout.maxAngleDegrees, { message: 'tiltDegrees must not exceed maxAngleDegrees', path: ['tiltDegrees'] })
  .refine(layout => layout.maxConnect >= layout.connect, { message: 'maxConnect must be at least connect', path: ['maxConnect'] });

const COLOUR = /^(currentColor|#[0-9a-fA-F]{3,8}|[a-zA-Z]+|rgba?\([^)]*\)|hsla?\([^)]*\))$/;
const colour = z.string().regex(COLOUR, 'Expected a CSS colour token');

/** Stem paint: a solid colour, or an embedded texture tile. Resolved textures carry a data URI. */
export const StemStyleSchema = z.strictObject({
  /** Draw-only multiplier: stems look thicker without reserving more collision space. */
  thickness: positive,
  fill: colour,
  texture: z.strictObject({ href: z.string().startsWith('data:image/'), tile: positive }).nullable(),
});

export const RenderConfigSchema = z.strictObject({
  samples: z.number().int().min(1),
  decimals: z.number().int().min(0).max(6),
  padding: nonnegative,
  bottomPadding: nonnegative,
  fontSize: positive,
  textOffset: z.number().finite(),
  frameStroke: nonnegative,
  collisionMargin: nonnegative,
  width: z.strictObject({
    min: positive,
    max: positive,
    scale: positive,
    parentRatio: positive,
    tipMin: positive,
    tipRatio: positive,
  }).refine(width => width.min <= width.max, { message: 'width.min must not exceed width.max', path: ['min'] }),
  stem: StemStyleSchema,
}).refine(render => render.collisionMargin >= Math.SQRT2 * 0.5 * 10 ** (-render.decimals), {
  message: 'collisionMargin must cover coordinate rounding at the configured decimals',
  path: ['collisionMargin'],
});

const configShape = {
  input: pathSchema,
  output: pathSchema,
  title: z.string(),
  frame: FrameSchema,
  render: RenderConfigSchema,
};

export const RawConfigSchema = z.strictObject({ ...configShape, layout: RawLayoutConfigSchema });
const AppConfigSchema = z.strictObject({ ...configShape, layout: LayoutConfigSchema });

export type FrameConfig = z.infer<typeof FrameSchema>;
export type LayoutConfig = z.infer<typeof LayoutConfigSchema>;
export type RenderConfig = z.infer<typeof RenderConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

export function validateConfig(value: unknown, baseDir: string): AppConfig {
  const raw = RawConfigSchema.parse(value);
  const input = resolve(baseDir, raw.input);
  const output = resolve(baseDir, raw.output);
  if (samePath(input, output)) throw new Error('Config output must not overwrite the input file');
  const { tiltDegrees, maxAngleDegrees, ...layout } = raw.layout;
  return {
    ...raw,
    input,
    output,
    layout: LayoutConfigSchema.parse({ ...layout, tilt: tiltDegrees * Math.PI / 180, maxAngle: maxAngleDegrees * Math.PI / 180 }),
  };
}

const TEXTURE_MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
};
const TEXTURE_LIMIT = 512 * 1024;

/** Inline the stem texture so a rendered scene never references an external file. */
async function inlineTexture(raw: any, baseDir: string): Promise<void> {
  const texture = raw?.render?.stem?.texture;
  if (!texture) return;
  const file = resolve(baseDir, texture.path);
  const mime = TEXTURE_MIME[extname(file).toLowerCase()];
  if (!mime) throw new Error(`Unsupported stem texture type: ${file}`);
  const bytes = await readFile(file);
  if (bytes.byteLength > TEXTURE_LIMIT) throw new Error(`Stem texture exceeds ${TEXTURE_LIMIT} bytes: ${file}`);
  raw.render.stem.texture = { href: `data:${mime};base64,${bytes.toString('base64')}`, tile: texture.tile };
}

export async function loadConfig(path: string | URL = new URL('../config.json', import.meta.url)): Promise<AppConfig> {
  const configPath = resolve(path instanceof URL ? fileURLToPath(path) : path);
  try {
    const text = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
    await inlineTexture(parsed, dirname(configPath));
    const config = validateConfig(parsed, dirname(configPath));
    if (samePath(config.output, configPath)) throw new Error('Config output must not overwrite the config file');
    return config;
  } catch (cause) {
    throw new Error(`Failed to load config ${configPath}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
}
