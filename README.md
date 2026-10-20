# Pedigree Tree Layout

给定一棵有根树，把人物关系绘制成自然树形谱系图。每个节点独占笔直枝轴，子节点从父轴分叉；保留六节点基线，用 A/B 完整避让与 S 有限换侧实验逐步验证。

## 生成与验证

```sh
bun install
bun run generate      # config.json -> data/one-subtree.json -> output/one-subtree-D.svg
bun run typecheck     # tsc --noEmit
bun run test          # 全部断言（解析、配置、状态、布局、几何、渲染）
bun run metrics       # 冻结的验收指标（接受数、树冠比例、分叉平衡、画布预算）
bun run experiments   # A/B、200 树冻结语料、最小分叉间距扫描
```

生成结果：[`output/one-subtree-D.svg`](output/one-subtree-D.svg)。

A/B：[设计与建议](docs/design/geometry-clearance.md) · [结果](docs/experiments/clearance.md) · [实际对比页](output/clearance/index.html)。

S 有限换侧：[设计](docs/design/side-search.md) · [结果及限制](docs/experiments/side-search.md) · [实际结果页](output/side-search/index.html)。

## 模块

| 文件 | 职责 |
|---|---|
| `src/config.ts` | 读取并校验 `config.json`；角度换算、配置目录相对路径、禁止覆盖输入/配置 |
| `src/parse.ts` | JSON/YAML 文本 → `unknown`，只做语法解析 |
| `src/validate-tree.ts` | 根数量、环、共享子节点、重复 ID 校验，输出规范化 `TreeNode` |
| `src/data.ts` | Zod schema 与 `z.infer` 类型：输入、状态、坐标、宽度、bounds |
| `src/state.ts` | `initializeTree` 生成无坐标状态；`applyLayout` 原子写回坐标 |
| `src/layout/` | 布局阶段：`side` 分侧、`order` 排序、`spacing` 间距、`connection` 接入长度、`crown` 树冠、`centroid` 重心度量、`search` 求解、`bounds`/`placement` 基础设施；契约见[布局阶段拆分](docs/design/layout-stages.md) |
| `src/geometry.ts` | 保守碰撞门禁（框圆、枝胶囊、合法分叉例外） |
| `src/render.ts` | 只读 `laid-out` 状态绘制 SVG 与计算 bounds |
| `src/pipeline.ts` | 串起配置→解析→校验→初始化→布局→写回→渲染→写文件 |
| `src/generate-one-subtree.ts` | 入口，只调用 `run()`，可传一个配置文件路径 |
| `tests/` | 全部断言、固定输入与实验入口；`src/` 不 import `tests/` |

## 数据契约

类型只来自 Zod schema（`src/data.ts`、`src/config.ts`），不维护第二份接口。

- `TreeNode = {id, children}`：递归关系树，不含坐标；叶子 `children=[]`。
- `RenderTree` 用 `phase` 区分两种状态：
  - `initialized`：规范化人物节点 `{id, parentId, children, load, widths, geometry:null}`，无坐标。
  - `laid-out`：同一结构，`geometry` 为 `{center, from, to, angle}`。
- 绘制只读 `geometry`、`widths`、`frame`、`render` 与 `id`；渲染器拒绝 `initialized`。

```ts
const config = await loadConfig();                       // 持久化配置
const draft = initializeTree(validateTree(await readTreeFile(config.input)), config);
const state = applyLayout(draft, layoutStemScene(draft, config.layout));
await writeFile(config.output, stemSvg(state, sceneBounds(state), config.title));
```

状态更新靠替换快照：`initializeTree` / `applyLayout` 都返回新对象，布局是纯函数，失败不发布半成品。没有自动订阅；调用者决定何时重新计算与重绘。

所有策略参数（角度、接入长度、宽度曲线、画布留白、小数位、输出路径）都在 [`config.json`](config.json)，缺失或拼错字段直接报错，不在代码里静默兜底。

## 文档

- [设计与结果入口](docs/README.md) · [验收指标](docs/design/acceptance-metrics.md)
- [贡献流程](docs/CONTRIBUTING.md) · [变更记录](docs/CHANGELOG.md)
- 视觉参考图保存在本地，不纳入版本控制（`*.example.*`）。
- `Communications-With-ChatGPT.md` 仅保留历史讨论，不作为当前设计依据。
