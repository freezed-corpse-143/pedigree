# 有限换侧 Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** 只允许失败后有限换侧，减少固定侧布局的拒绝，保持已成功布局不漂移。

**Architecture:** `grow` 按真实已接受负荷选首选侧；首选侧全部长度/高度候选失败后，若角度合法且共享预算允许，再试另一侧并重建子树。几何门禁、角度幅值、长度集合和绘制不变。

**Tech Stack:** Bun、ES modules、node:assert/strict，零新依赖。

---

依据：[设计](../design/side-search.md)。在用户当前目录执行，不新建 worktree。

## 1. 冻结证据与红测试

- 已将种子 19 的 200 个输入及 B 结果保存到 `output/side-search/before.json`，9 节点反例到 `counterexample.json`。
- 新增 `tests/side-search.test.ts`，先要求默认布局对反例成功并无冲突，运行观察旧 B 的 `STEM_NO_PLACEMENT`。
- 不写“忽略错误”或“节点数非零”的伪成功断言。

## 2. 实施单变量

- 修改 `src/layout/`：首选侧逻辑仍使用原角度/负荷/平局规则；从 `assignSides` 拆成一次只选当前孩子侧别。
- `grow` 在孩子安放失败后尝试第二个合法侧；仅捕获 `STEM_NO_PLACEMENT`，不吞其他异常。
- 全树最多 32 次备用侧尝试，0 次可复现固定侧 B；负荷仅在接受后更新。
- 不加入新角度、回溯已放兄弟、轮廓求解器或随机扰动。

## 3. 对照实验与回归

- `tests/clearance-experiment.ts` 和 A 专项断言显式 `maxSideTrials:0`，避免历史 A/B 合同被新变量混入。
- `tests/side-search-experiment.ts` 复用冻结输入，对每个旧成功比较 SVG 摘要，对新成功计算独立碰撞/关系检查、尺寸和最大接入，对剩余拒绝记录错误。
- 六节点基线仍通过原 SHA-256 门禁；7 个固定场景也逐图比较。
- 运行旧结构回归、新几何回归、侧别回归、两轮实验与默认生成。

## 4. 真实渲染与文档

- 生成反例新图、代表性新增成功图及剩余拒绝说明到 `output/side-search/`；拒绝输入不得伪造图片或删节点。
- 浏览器打开结果页，检查 SVG 加载与图中人物、长接入和空间代价；保留截图。
- 写 `docs/experiments/side-search.md`，更新现行设计/导航/变更记录；旧 A/B 历史保留。
- 检查 docs 中只有文档、所有本地链接可解析。

## 执行记录

- 首个 9 节点红测试在 S 后仍失败，未将它包装成修复；保留为显式拒绝边界。
- 固定语料另有 10 个输入由拒绝转成功，从其中第 9 号缩减出 10 节点回归：固定侧 B 失败、S 成功；共享预算不足仍拒绝。
- 200 个冻结输入已逐个重建比对：接受数 150→160、拒绝 50→40，原成功图 0 漂移；7 个固定场景与六节点基线不变。
- 浏览器 3/3 图片加载，拒绝说明与截图保留；详见[实验报告](../experiments/side-search.md)。
