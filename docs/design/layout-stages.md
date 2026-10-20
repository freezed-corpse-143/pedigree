# 布局阶段拆分契约

- 日期：2026-10-20
- 状态：已实施；只做结构拆分，不改变算法、参数与基线图像。
- 代码目录：`src/layout/`。每个阶段一个文件，阶段之间只能通过下表声明的输入输出相连。

## 裸主干比例（`trunkShare`）

裸主干 = 根相框下沿到**最低第一级分叉**的一段；比例以“相框下沿到最高枝梢”为分母：

```
trunkShare = (firstFork + frame.height/2) / (tip + frame.height/2)
```

分叉下限 `F` 与最终高度互相依赖（分叉抬高会拉长整棵树），所以在 `layoutStemScene` 里做固定点迭代：用当前 `F` 布局 → 由结果反算 `trunkShare` 对应的 `F` → 重跑，差值 ≤ 0.5 即停（最多 4 轮），最后再跑一次用正式 stats 记录，保证 effort 指标只属于最终几何。`trunkShare = 0` 等价于旧行为（下限 = `frame.height + gap`），历史 A/B、侧别与走廊实验都传 0。

1. 为什么这样拆

原实现把"分侧、排序、间距、接入长度、树冠高度、碰撞判定"压在一个 `grow` 的顺序搜索里：任何一步出问题都只能整体调试，也无法单独回答"是侧别错、排序错还是间距不够"。

拆分依据是两个区分：

1. **决策（有自由度，需要搜索）**：侧别、次序、间距、接入长度。
2. **约束（要么满足要么失败）**：碰撞、树冠高度、重心。

它们不是单向流水线。当前代码里已经存在两条回退边，另有一条只做了度量没有约束。

## 2. 阶段与模块

| 阶段 | 模块 | 角色 | 输入 | 输出 | 自由度 |
|---|---|---|---|---|---|
| D1 分侧 | `side.ts` | 决策 | 已接受侧负荷、父绝对角、深度、tilt/maxAngle | `+1 / -1` | 每人 1 bit |
| D2 次序 | `order.ts` | 启发式 | 子节点 ID 列表、节点表 | 有序 `InitializedNode[]` | 排列 |
| D3 占用预算 | `contour.ts` | 下界 | 候选框、已放框、中心距 | 最小可行高度 | — |
| D3 走廊预留 | `contour.ts` | 约束 | 候选框、走廊半宽 | 首个越界框或空 | — |
| D3 间距 | `spacing.ts` | 决策 | `frame`、`params`、已放顶部 `top`、候选底部 `bottom`、上次分叉 | 首叉高/下界、步数、抬叉余量 | 每叉 1 个标量 |
| D4 接入长度 | `connection.ts` | 决策 | `connect`、`connectionIncrement`、`maxConnect` | 长度候选数组 | 每枝 1 个标量 |
| 裸主干比例 | `index.ts`（根） | 决策 | `trunkShare`（默认 0.4） | 根的第一级分叉下限 | 见下 |
| 挂载外观 | `mount.ts` | 渲染 | `Mount.envelope/draw` | 间距包络 + SVG 片段 | 不进布局判定，见[挂载契约](mounts.md) |
| C1 碰撞 | `../geometry.ts` | 约束 | 装配后的点/段/宽度/框/渲染参数 | 首个冲突或空 | — |
| C2 树冠 | `crown.ts` | 约束 | 最高分叉、本叉预留高、`tip` | 枝轴末端点 | — |
| C3 重心 | `centroid.ts` | 度量（未约束） | `laid-out` 状态 | `axisMoment`、`branchMoment ∈ [0,1]` | — |

基础设施（不含策略）：

| 模块 | 职责 |
|---|---|
| `types.ts` | `BuiltSubtree`、`LayoutContext`、`AcceptedPlacement` |
| `placement.ts` | 刚性旋转+平移；仅在延长接入时重钉首段与分叉点 |
| `bounds.ts` | 子树的轴对齐占用与最高点 `top` |
| `search.ts` | 单侧求解循环：D4 × D3 → C1；自身不含策略常量 |
| `index.ts` | 递归、侧别预算、父轴延长、全场景复核，导出 `layoutStemScene` |

## 3. 阶段公式（与代码一一对应）

```
首叉高      first   = frame.height + frame.gap
候选底      bottom  = min(candidate.positions.y, candidate.segments.from.y/to.y) - first
搜索窗      maxHeight = max(first, top - bottom + 2*hypot(w+gap, h+gap) + tip)
步数        steps   = min(maxHeightSteps, ceil((maxHeight - first) / step))
抬叉余量    reserved = height + (attempt > 0 ? step : 0)
树冠        tipPoint = { x: 0, y: max(maxFork, reserved) + tip }
接入长度    [connect, min(maxConnect, connect + inc), ...增量翻倍]
```

分侧顺序：已接受负荷较轻侧 → 更接近垂直的一侧 → 深度奇偶；越界则翻面一次，仍越界抛 `RangeError`。
排序：子树人数降序，输入顺序破平局；**处理顺序不等于最终高度**。

## 4. 回退边

| 边 | 含义 | 当前状态 |
|---|---|---|
| D3 → D1 | 首选侧所有长度×高度都放不下 → 放弃该侧，换另一侧 | 已实现（`index.ts`，受全局 `maxSideTrials` 预算限制） |
| C1 → D3 | 本叉冲突 → 抬高分叉重试；仍不行 → 下一个接入长度 | 已实现（`search.ts`） |
| C3 → D4 | 重心超阈值 → 调整接入长度 | **未实现**：只计算 `axisMoment`，不参与求解 |

只有 `NoPlacementError`（`code === 'STEM_NO_PLACEMENT'`）可以触发 D3→D1。参数、输入、最终装配错误一律向上抛，不重试。

## 5. 与"用户视角五步"的对应

用户给出的顺序是 分侧 → 单侧排序 → 单侧间距 → 左右重心 → 树冠相对根。作为**阅读与解耦顺序**成立；作为**求解顺序**不成立，因为：

- 排序与间距共用"分叉高度"这一个自由度；
- 重心与树冠共用"父轴长度"这一个自由度。

因此契约写成"五个决策/约束点 + 三条回退边 + 一个共享输入（`bounds.ts` 的占用）"，而不是五阶段流水线。

## 6. 不变量

1. `layoutStemScene` 是纯函数：不读文件、不写文件、不修改 `InitializedTree`、不依赖时间或随机数。
2. 阶段之间只传值：`connectionLadder` 返回新数组，`placeSubtree` 返回新子树，`search` 不写父几何。
3. 接受后父轴才延长：`segments[0].to = stems[0].tip = accepted.tip`。
4. 侧负荷只统计已接受子树。
5. 全部候选失败时抛 `NoPlacementError`，附带 `node` 与 `conflict`；不返回带冲突的图。
6. 最终仍对整个场景做一次 C1 复核。

## 7. 未实现（下一层自由度）

| 缺口 | 现象 | 计划入口 |
|---|---|---|
| D3 只做了框—框下界 | 扫描仍从预算处逐步试放；200 棵树共 31 123 次门禁调用，预算跳过 1 986 步（6.4%）。输出与拆分前逐字节一致 | 下一步：把**祖先轴走廊**纳入预算 |
| 祖先轴走廊 | **已实现**：附着时要求候选框与父轴保持 `frame.width/2 + gap`，递归后等价于检查每一级祖先轴；9 节点反例与 `mixed` 族都已通过 | 仍需决定性证据说明更深的交叉场景；当前代价是画布 +15% |
| 固定最小间距已否决 | `minForkGap` 160→150 棵，形状仅改善 1.4%，最宽处变大 | 不采用；保留参数默认 0，见[验收指标](acceptance-metrics.md#3-已用这套指标否决的方案固定最小分叉间距) |
| C3 未成为约束 | `axisMoment` 只出现在实验报告（基线 0.503，rescued 0.852） | 把阈值写成断言，再决定是否回退 D4 |
| D4 只在失败后使用 | 正常路径几乎总是 80 | 若 C3 成为约束，让接入长度进入主动搜索 |
| 独子共线 | `layout.continueSoleChild`（默认开）：恰好一个子节点时继承父轴，父枝轴终止于该分叉点 | 历史 A/B 显式关闭以复现存档；树因此更瘦高，见[指标](../design/acceptance-metrics.md#6-重新冻结独子延续父轴2026-10-20) |
| 64° 父枝两子同侧 | 固定 ±32° 与 70° 上限的必然结果 | 需要角度候选，属于新自由度，未纳入 |

## 8. 验收

```sh
bun run typecheck
bun run test
bun run generate
bun run metrics      # 冻结的验收指标
bun run experiments  # A/B、冻结语料、fork-gap 扫描
```

阶段级断言在 `tests/layout-stages.test.ts`：排序的稳定性、分侧的四种规则、长度阶梯（含精度错误）、间距窗口的边界与裁剪、树冠公式、刚性附着的分叉落点与延长重钉、占用包围盒、重心度量。拆分后必须同时满足：六节点 SVG 摘要不变；A/B 固定场景（10 个 fixture）在历史模式下复现，当前模式全部出图；冻结 200 棵树 `accepted 200 / rejected 0`，几何改变 70 棵为有意结果（见[验收指标](acceptance-metrics.md#4-重新冻结祖先轴走廊预留2026-10-20)）。
