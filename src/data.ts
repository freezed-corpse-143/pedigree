import { z } from 'zod';
import { FrameSchema, RenderConfigSchema } from './config.ts';

// Schema 是运行时合同，也是 TypeScript 类型的唯一来源。
export const IdSchema = z.string().refine(id => id.trim().length > 0, 'Expected nonempty ID');
export const TreeNodeShallowSchema = z.object({
  id: IdSchema,
  children: z.array(z.unknown()),
});
export const TreeNodeSchema = z.object({
  id: IdSchema,
  get children() { return z.array(TreeNodeSchema); },
});
export type TreeNode = z.infer<typeof TreeNodeSchema>;

// 全局模型坐标：x 向右、y 向上；渲染器独自转换 SVG 的 y 方向。
export const PointSchema = z.strictObject({ x: z.number().finite(), y: z.number().finite() });
export type Point = z.infer<typeof PointSchema>;
export const StemWidthsSchema = z.strictObject({
  start: z.number().positive(),
  frame: z.number().positive(),
  tip: z.number().positive(),
});
export type StemWidths = z.infer<typeof StemWidthsSchema>;

// 布局只发布空间结果，不发布人数、样式、配置或搜索状态。
export const NodeGeometrySchema = z.strictObject({
  center: PointSchema,
  from: PointSchema,
  to: PointSchema,
  angle: z.number().finite(),
});
export const PlacementSchema = NodeGeometrySchema.extend({ id: IdSchema });
export type Placement = z.infer<typeof PlacementSchema>;

const NodeProperties = {
  id: IdSchema,
  parentId: IdSchema.nullable(),
  children: z.array(IdSchema),
  load: z.number().int().positive(),
  widths: StemWidthsSchema,
};
export const InitializedNodeSchema = z.strictObject({
  ...NodeProperties, geometry: z.null(),
});
export const LaidOutNodeSchema = z.strictObject({
  ...NodeProperties, geometry: NodeGeometrySchema,
});
const TreeProperties = {
  rootId: IdSchema,
  frame: FrameSchema,
  render: RenderConfigSchema,
};
export const InitializedTreeSchema = z.strictObject({
  ...TreeProperties,
  phase: z.literal('initialized'),
  nodes: z.array(InitializedNodeSchema).nonempty(),
});
export const LaidOutTreeSchema = z.strictObject({
  ...TreeProperties,
  phase: z.literal('laid-out'),
  nodes: z.array(LaidOutNodeSchema).nonempty(),
});
export const RenderTreeSchema = z.discriminatedUnion('phase', [
  InitializedTreeSchema, LaidOutTreeSchema,
]);
export type InitializedTree = z.infer<typeof InitializedTreeSchema>;
export type LaidOutTree = z.infer<typeof LaidOutTreeSchema>;
export type RenderTree = z.infer<typeof RenderTreeSchema>;
export type InitializedNode = z.infer<typeof InitializedNodeSchema>;

// nodes 是规范化树：parentId/children 只存 ID，不产生对象环。
// initialized 的 geometry 必须为 null；laid-out 必须全部有坐标，禁止半成品。
// 初始化/应用返回独立快照；状态更新靠替换，不隐式订阅或修改旧快照。
// 渲染只读取 geometry/widths/frame/render/id；其余关系信息服务后续更新。
export const SceneBoundsSchema = z.strictObject({
  minX: z.number().finite(), maxX: z.number().finite(),
  minY: z.number().finite(), maxY: z.number().finite(),
});
export type SceneBounds = z.infer<typeof SceneBoundsSchema>;
