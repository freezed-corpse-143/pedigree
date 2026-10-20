# 挂载模块：接口与契约（2026-10-20）

- 状态：已实现；默认实现保持此前的相框外观。
- 代码：`src/mount.ts`（接口 + 默认实现 + 校验）、`src/render.ts`（调用）、`src/state.ts`（envelope 参与间距）、`src/pipeline.ts`（注入）。
- 验证：`tests/mount.test.ts`。

## 1. 为什么要拆

此前“每个人长什么样”硬编码在 `render.ts` 里：一个 `<rect>` 加一个 `<text>`，并且间距用的 `frame` 是 `config.json` 里写死的 48×42。想换成圆形徽章、挂牌、照片框时，只能改渲染器，而且新形状的间距不会被布局感知——改完就可能重叠。

拆开之后有两件事同时解耦：

- **画什么**（挂载图形）由挂载实现决定；
- **占多大**（间距包络）也由挂载实现声明，布局在初始化时就用它，而不是先按矩形排完再硬塞。

## 2. 接口

```ts
export type MountInput = {
  readonly id: string;             // 人物 id，已由渲染器转义后交给挂载
  readonly envelope: FrameConfig;  // 布局预留的间距包络：width / above / below / gap
  readonly render: RenderConfig;   // 字号、小数位、描边宽度等既有渲染参数
};

export type Mount = {
  readonly name: string;                                   // 稳定名字，出现在错误信息与测试里
  envelope(frame: FrameConfig, render: RenderConfig): FrameConfig;  // 间距包络，对称于挂载点
  draw(input: MountInput): string;                          // 局部坐标中的 SVG 片段
};
```

## 3. 契约

1. **坐标系**：`(0,0)` 是枝轴与挂载内容的挂载点（默认相框为相框中心，自定义挂载可把内容挂在交点下方），`+y` 向下。渲染器把 `draw` 的返回值放进 `<g class="mount" data-id="…" transform="translate(x,y)">`，因此挂载不需要知道自己在画布上的绝对位置。
2. **纯函数 + 确定性**：同一输入必须得到同一字符串，不读时间、不读环境、不写文件。`assertMount` 会用固定探针调用两次并比较。
3. **静态安全**：片段中不得出现 `<script>`、`<foreignObject>`、`<image>`、`<iframe>`、`<animate>`、事件处理属性（`on*=`）、外部引用（`href`/`src`/`xlink:href`）、`url(` 或 `javascript:`。命中即抛错，不生成画面。
4. **envelope 参与布局**：`envelope()` 的返回值在 `initializeTree` 阶段替换 `state.frame`（`width`、`above`、`below`、`gap`），所以更大的挂载会自动得到更大的间距；反过来，`draw` 画出超过 envelope 的图形不会被布局补救，可能压到邻居。
5. **挂载点沿枝轴可配置**：`above` 是挂载内容在交点以上的高度，`below` 是交点以下的高度；两者不等即表示挂载内容相对枝轴偏移。判定用外接圆表达偏移：圆心 = 交点 + `(above − below)/2`，半径 = 半对角线，圆心距下限 = `hypot(width + gap, above + below + gap)`。默认相框 `above = below = 21`，公式退化为历史值，因此对称包络逐字节不变。
6. **envelope 必须有限且非负**，`name` 不能为空；违反时在渲染前抛 `TypeError`。
7. **不进入布局判定**：挂载只影响渲染与间距包络，不改变枝轴、接入长度或几何门禁；`LaidOutTree` 里没有挂载字段，替换挂载不会让同一棵树重新排布（除非 envelope 变化）。

## 4. 默认实现

`frameMount`：圆角矩形（`rx = 3`）+ 居中标签。

- `envelope: frame => frame` —— 与历史行为完全一致，`config.json` 的 `frame`（`width/above/below/gap`）仍然是间距来源。
- 标签超出框内宽时输出 `textLength` + `lengthAdjust`；短标签不加属性（见[验收指标](acceptance-metrics.md#渲染层不变量几何指标之外)）。
- 框带 `fill="#fff"` 与根节点 `color="#111"`，不依赖 CSS 变量，裸栅格器也能显示。

## 5. 自定义示例

```ts
import { run } from './src/pipeline.ts';
import { escapeXml } from './src/mount.ts';
import type { Mount } from './src/mount.ts';

// 挂牌：内容挂在挂载点下方，above=8 / below=56 让布局按偏移预留空间。
export const tagMount: Mount = {
  name: 'tag',
  envelope: frame => ({ ...frame, above: 8, below: frame.below + 40 }),
  draw: ({ id, envelope, render }) =>
    `<rect x="${-envelope.width / 2}" y="8" width="${envelope.width}" height="${envelope.below}" rx="3" fill="#fff" stroke="currentColor"/>`
    + `<text x="0" y="${30}" text-anchor="middle" font-size="${render.fontSize}" fill="currentColor">${escapeXml(id)}</text>`,
};

await run(process.argv[2], { mount: tagMount });
```

要点：`draw` 用局部坐标、自己转义文本、由 `envelope` 声明占位。挂载可以是任意静态 SVG（圆、照片占位框、带编号的徽章），只要满足第 3 节契约。

## 6. 枝干绘制（与挂载解耦）

挂载负责“人物标记”，枝干有自己的样式，两者颜色互不影响：

```json
"render": {
  "stem": { "thickness": 6.7, "fill": "currentColor", "texture": null }
}
```

- **`fill`**：CSS 颜色（十六进制、`rgb()`、命名色、`currentColor`）。经 schema 白名单校验，`url(`、分号等会被拒绝，避免把声明塞进属性。
- **`texture`**：`{ "path": "data/textures/bark.png", "tile": 48 }`。`loadConfig` 把文件按配置目录解析并**内联成 data URI**（只允许 png/jpeg/webp/gif，≤512 KB），渲染时生成 `<pattern id="stem-texture">` + `<image>`，`path` 改 `fill="url(#stem-texture)"`。场景文件因此仍是自包含的静态 SVG，不引用外部资源。
- **枝干轮廓**：子枝宽度在下笔时被夹到“父枝在该分叉处的高度”——父枝到分叉点已经收细，不夹会让子枝从主干侧面顶出一个角；相邻多边形之间画 0.8 的同色细描边消除抗锯齿白缝；每个分叉点补一个实心圆盘填掉两枝之间的白色 V 形腋部。
- **`thickness`**：**只影响绘制**的倍数。碰撞半径仍用 `render.width` 算出的宽度，所以变粗不会挤掉任何一棵树（冻结语料仍 200/0）。代价是画得比预留宽时，密集树里非关联枝可能视觉相接：实测 thickness 2 = 0 对相接、3 = 7 对、6.7 = 25 对（200 棵树统计）；`mixed` 族在 3 时已有 1 处、6.7 时 2 处。

当前默认 `thickness = 6.7` 对应“heavy × 3”的观感（6 节点树主干约 33 单位，画布宽 345）。想更保守就把它降到 2–3；这不会改变布局、指标或任何冻结数字。

## 7. 已知边界

- 间距用外接圆表达偏移：判定比矩形保守（尤其对角方向），所以“刚好贴边”的紧凑排布可能被拒绝。改成矩形判定在旋转组合下不成立，已实测否决，见 `../CHANGELOG.md`。
- 挂载不能改变枝轴、接入长度或门禁，只能通过 envelope 影响间距；把内容画到 envelope 之外仍会与邻居相撞。
- 偏置极大（`below` 远大于 `above`）时，外接圆会同时向上预留空间，视觉上表现为相框之间距离变大。
- 尚未提供非 SVG 输出（PNG/Canvas）的挂载适配层。
- 验证只覆盖静态片段：`animate` 等动画元素被直接禁止，而不是做白名单。
