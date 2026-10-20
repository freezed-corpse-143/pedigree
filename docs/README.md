# 自然树谱系图设计

本目录于 2026-10-17 在清空旧设计后重新建立。保留六节点基线，依次验证 A/B 完整避让与 S 有限换侧；保留失败证据，不宣称最终形态或任意树完备性。

## 阅读顺序

1. [需求与阶段验收](requirements/natural-tree.md)：什么叫正确、可读、像树。
2. [独占枝轴设计](design/stem-owned.md)：每个节点自己的分叉、笔直枝轴与冒尖。
3. [结构决策](decisions/0002-owned-stems.md)：为什么拒绝“子节点延续父轴”。
4. [单例结果](experiments/stem.md)：输入、指标、可观察结构与限制。
5. [批判与 A/B 设计](design/geometry-clearance.md) · [实施计划](plans/2026-10-18-geometry-clearance.md) · [结果](experiments/clearance.md)：完整避让与有限接入长度搜索。
6. [有限换侧设计](design/side-search.md) · [计划](plans/2026-10-18-side-search.md) · [结果](experiments/side-search.md)：冻结语料接受率改善；当时的父轴反例已由后续[走廊预留](acceptance-metrics.md#4-重新冻结祖先轴走廊预留2026-10-20)解决。
7. [布局阶段拆分](design/layout-stages.md)：分侧、排序、间距、接入长度与约束层的契约、回退边与未实现缺口。
8. [验收指标](design/acceptance-metrics.md)：冻结的接受数、树冠比例、分叉平衡、画布预算与基线形状门槛。
9. [挂载与枝干绘制](design/mounts.md)：挂载图形与间距包络的契约（默认相框），以及枝干的颜色/纹理/粗细设置。

## 代码与证据

- `src/config.ts` + `config.json`：全部策略参数的持久化来源；Zod 校验、角度换算与配置目录相对路径。
- `src/parse.ts`：JSON/YAML 语法解析；`src/validate-tree.ts`：根数量、环、共享子节点、重复 ID 校验。
- `src/data.ts`：Zod schema 与 `z.infer` 类型（输入、`initialized`/`laid-out` 状态、坐标、宽度）。
- `src/layout/`：布局按阶段拆分（`side`/`order`/`spacing`/`connection`/`crown`/`centroid`），`index.ts` 负责递归与装配；见[阶段契约](layout-stages.md)。
- `src/state.ts`：`initializeTree` 与 `applyLayout`；`src/geometry.ts`：保守几何门禁。
- `src/render.ts`：只读 `laid-out` 状态的 SVG 绘制；`src/mount.ts`：挂载接口、契约校验与默认相框；`src/pipeline.ts`：完整阶段编排，可注入自定义挂载。
- `src/generate-one-subtree.ts`：入口，只调用主流程。
- [`output/one-subtree-D.svg`](../output/one-subtree-D.svg)：生成结果，可重复生成，不手工修改。
- [`output/clearance/index.html`](../output/clearance/index.html)：修改前/B 对比及失败证据。
- `tests/input.test.ts`：JSON/YAML 与树结构诊断；`tests/config.test.ts`：配置边界与路径解析。
- `tests/pipeline.test.ts`：状态转换、布局纯函数、不可变写回与失败隔离。
- `tests/layout-stages.test.ts`：逐阶段契约（排序、分侧、长度阶梯、间距窗口、树冠、附着、占用、重心）。
- `tests/metrics.ts`：冻结验收指标与门槛断言；`tests/metrics-lib.ts`：指标计算与门槛常量；`tests/fork-gap-experiment.ts`：最小分叉间距扫描；`tests/corridor-experiment.ts`：走廊预留开关对比。
- `tests/stem.test.ts`：结构断言；`tests/clearance.test.ts`：几何及 B 回归。
- `tests/render-scene.test.ts`：无布局状态直接绘图、JSON 往返、配置驱动和快照隔离。
- `tests/clearance-experiment.ts`：A/B 复现；`tests/side-search-experiment.ts`：逐输入比较 B/S，[结果页](../output/side-search/index.html)含 B→S 新成功图与走廊预留后的解决图。
- `tests/verify-scene.ts`：实验/回归共用的独立几何与关系检查，不参与布局。
- `tests/`：全部断言、固定输入与实验入口；`src/` 不反向依赖测试。

```sh
bun install
bun run generate
bun run typecheck
bun run test
bun run metrics
bun run experiments
```
