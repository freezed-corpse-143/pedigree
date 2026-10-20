# 枝轴几何避让 A → B Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** 保持独占直枝结构，先完整检测冲突，再仅通过接入长度自由度解决已知多层树反例。

**Architecture:** `src/layout/` 复用一个保守几何判定器，在每次装配时连同延长父轴一起检查。A 固定接入长度，B 只增加有限的接入长度候选；共享渲染宽度规则，有限搜索失败显式报错。

**Tech Stack:** Bun、ES modules、node:assert/strict，无第三方依赖。

---

设计与具体合同：[批判及设计](../design/geometry-clearance.md)。用户已授权在当前目录执行，不创建已被清除的 worktree。

## 1. 保存基线、缩减失败输入

- 读取 `src/layout/`、`src/generate-one-subtree.ts`、`tests/stem.test.ts` 和全部调用点。
- 使用内存中的原算法与独立精确线段—矩形检查器，删除满二叉树中的子树直到没有单次删除仍保持穿框。
- 保存输入、原图和基线指标到 `output/clearance/`。不再生成旧 A/B/C 路线。
- 在 `tests/clearance.test.ts` 添加几何约束测试，运行 `bun tests/clearance.test.ts`，观察原布局违反枝—框约束的失败。

## 2. 实施 A

- 创建 `src/geometry.ts`：宽度、线段距离、合法分叉、完整冲突判定；保守轮廓需覆盖渲染。
- 修改 `src/layout/`：组装父轴与候选后统一判定，固定 connect=80，有限高度搜索；错误包含当前节点与失败类别。
- 先验证几何手工反例，再运行本轮反例；记录 A 是成功还是失败及其占用代价，不先调整角度或权重。

## 3. 实施 B

- 在同一布局函数增加有界接入长度候选，原长度优先；`maxConnect=connect` 重现 A。
- 更新候选子树根接入段的起点，使伸长后仍从父轴精确分叉；再次检查整个装配场景。
- 回归断言：固定长度可失败，B 必须对保留反例和 binary4 返回无冲突几何；确定性、输入不变、父子关系与分叉结构保持。

## 4. 生成与验收

- 从当前生成器提取实际复用的 SVG 渲染到 `src/render.ts`；保留原默认命令和输出，六节点图字节不变。
- `tests/clearance-experiment.ts` 重现 A/B，写入 `output/clearance/`，输出尺寸/间距/最大接入长度/冲突指标，不生成伪成功图。
- 运行：`bun tests/stem.test.ts`、`bun tests/clearance.test.ts`、`bun run generate`、`bun run experiments`。
- 用独立判据核对生成场景，打开真实 SVG 检查可读性及浏览器错误，截图失败则明确报告视觉证据限制。
- 更新 `docs/experiments/clearance.md`、需求/设计/导航和 `../CHANGELOG.md`；检查本地链接及 docs 中无非文档产物。

## 范围止点

不改变固定角度与两侧退化、不强制重枝分叉高度单调、不增加宽度权重或轮廓求解器；这些不是本轮 A/B 的隐藏附加项。
