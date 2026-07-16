# 02 — 双核心重复审计：bsaaCore.ts vs paperTheory.ts

审计范围：`src/domain/bsaaCore.ts`（358 行）、`src/domain/paperTheory.ts`（767 行），
以及两者的全部调用方（`src/application/optimizePlan.ts`、`src/domain/proofVerification.ts`、
`src/domain/bsaaBacktest.ts`、`src/infrastructure/candidateProjection.ts`、
`tools/ingestGaokaoSample.ts`、`tools/generatePaperFigures.ts`、`tools/runRealMonteCarloBacktest.ts`）。

结论先行：**坐实**。两个模块并行实现了同一套 GSIO/子模/暴力枚举核心算法，且这不是"历史演化残留"——
两者在 `d1fff77`（初始提交）就同时诞生。更严重的是：仓库里已经有一次"收敛到单一源"的正确先例
（`0cf0468` commit 把 `bsaaBacktest.ts` 里重复的贪心/暴力/验证逻辑删掉、改为委托 `paperTheory.ts`），
但这次收敛**没有推广到 `bsaaCore.ts` 和 `proofVerification.ts`**，导致"single source of truth"的
承诺（该 commit message 原话）只兑现了一半。

---

## 1. 函数对应表

| bsaaCore.ts (行号) | paperTheory.ts (行号) | 关系 |
|---|---|---|
| `expectedUtility` L49-60 | `evaluateSequence` L144-162 | **逻辑等价**。同一 Horner 展开 `U=Σv·p·Π(1-p)`。签名不同：bsaaCore 直接吃已排序候选数组；paperTheory 吃 id 列表+候选池+π，多一层 `candidateById` 查找与 π 投影。 |
| `valueIndexOrder` L68-70 | `optimalOrderForSet` L165-180 | **逻辑等价**（Theorem 3.1，按 v 降序）。tie-break 都用 `id.localeCompare`，一致。 |
| `evaluateSetFunction` L78-81 | `setFunctionValue` L183-191 | **逻辑等价**：排序后求效用。 |
| `marginalGain` L88-91 | `marginalGain` L194-205 | **逻辑等价**（公式相同），**性能路径不同**：bsaaCore 的贪心主循环用 `incrementalSetUtility`（O(\|S\|) 有序插入）避免每步重排序；paperTheory 的 `marginalGain`/`setFunctionValue` 每次调用都重新 `optimalOrderForSet`（排序）+ `evaluateSequence`，无增量优化。 |
| `incrementalSetUtility` L112-128 | 无对应 | **仅 bsaaCore 有**。这是唯一的性能优化点，且从未被 paperTheory 复用。 |
| `greedySubmodularSelection` L139-186 | `greedySubmodularOptimization` L208-254 | **逻辑等价**（Algorithm 1 GSIO），但两处**真实行为分歧**：<br>①tie-break：paperTheory 显式按 `candidate.id.localeCompare` 打破平局（L237-239）；bsaaCore **没有 id tie-break**，相同 gain 时谁先在 `remaining.values()` 迭代顺序中出现就赢（L162，`gain > bestGain + EPSILON` 严格大于，无平局分支）。若两个候选 marginal gain 相差 <EPSILON，两套实现可能选出不同候选。<br>②capacity≥N 分支：paperTheory 显式提前返回全选（L221-227）；bsaaCore 靠 `effectiveCapacity = min(capacity, N)` 自然收尾，无显式分支——同一场景两种代码路径。 |
| `bruteForceOptimal` L227-266 | `bruteForceOptimal` L257-317 | **逻辑等价**，但 `combinations`/`permutations` 生成器各自独立实现一份（近乎逐字重复的递归生成器代码）。 |
| （无） | `verifyValueIndexTheorem` L320-373 | **仅 paperTheory 有**，对 PaperCandidate+π 做穷举验证。 |
| （无） | `verifySubmodularity` L376-435 | **仅 paperTheory 有**。 |
| （无） | `verifyApproximationRatio` L438-464 | **仅 paperTheory 有**。 |
| （无） | `runPaperVerificationSuite` L467-546 | **仅 paperTheory 有**，随机实例批量验证。 |
| `admissionSafety` L274-281 | `safetyProbability` L549-558 | **逻辑等价**（`1-Π(1-p)`），仅签名不同（数组 vs id 列表+池）。 |
| `neutralQuality` L289-301 | `neutralQuality` L561-575 | **逻辑等价**，签名不同：bsaaCore 用回调 `qualityOf`；paperTheory 用 `qualityScore` 字段+缺省回退到 `valueForPreference`。 |
| `pathGain` L309-314 | `pathGain` L578-583 | **逐字重复**（literal duplicate）。公式、容差、分支结构完全一致，仅 `Infinity` vs `Number.POSITIVE_INFINITY` 的写法差异。这个函数根本不依赖候选类型（只吃两个 number），没有任何理由存在两份。 |
| `probabilityTierBaseline` L333-358 | `transparentBaselineSelection` L618-667 | **有实质差异，非同物异名**（详见第 2.5 节）：bsaaCore 版本不看 tier，每桶内只按概率+id 排序，桶间直接拼接后按 capacity 截断；paperTheory 版本先按 `tierScore` 全局排序，每桶限额 `capacity/3`，round-robin 式从三桶各取，最后从剩余候选补齐。**同名"冲稳保基准"，两套不同的选择语义。** |
| 无 | `valueForPreference` L138-141 | 仅 paperTheory 有：π 向量投影，bsaaCore 的候选已经是投影后的标量 `value`，不需要这一步。 |
| 无 | `sampleSimplexWeights` / `buildParametricParetoFrontier` / `unitVector` L669-767 | 仅 paperTheory 有：多目标 Pareto 前沿，bsaaCore（单目标标量）没有对应概念。 |

第三处独立实现（不在本次对比范围但佐证"重复"是系统性问题）：`src/domain/proofVerification.ts`
又**第三次**重新实现了 `permutations`（L80-92）、`allSubsets`（L94-105）生成器，以及
`verifyValueIndexTheorem`/`verifySubmodularity`/`verifyGreedyApproximation`——这套验证逻辑和
paperTheory 内置的验证函数做的是同一件事（对同一组定理做穷举验证），只是作用在 `BsaaCandidate`
（经 bsaaCore）而不是 `PaperCandidate`（经 paperTheory）上。`combinations`/`permutations` 生成器
在 `formal/experiments/verify_dp_exact.mjs` 里还有第四份几乎逐字相同的拷贝。

---

## 2. BsaaCandidate vs PaperCandidate：本质不同还是同物异名？

```ts
// bsaaCore.ts（借道 src/schemas.ts 的 bsaaCandidateSchema）
{ id: string; value: number; probability: number }

// paperTheory.ts
{
  id: string;
  probability: number;
  prototypeValues: readonly number[];  // 多原型向量
  qualityScore?: number;
  tierScore?: number;
}
```

**本质不同，但差异是"投影前/投影后"的层次差异，不是无意义的重复类型。**

- `PaperCandidate.prototypeValues` 是原始多维匹配度向量；`valueForPreference(candidate, π)` 把它
  和偏好向量 π 做点积，压成一个标量 `v_c(π)`。
- `BsaaCandidate.value` 就是这个已经投影好的标量——bsaaCore 天生是"单目标、value 已知"的通用
  GSIO 求解器，不关心 value 是怎么算出来的，也不关心 π 是什么。

这个分层本身是合理的设计意图：bsaaCore 可以是一个跟高考论文语境完全无关的通用子模选择库；
paperTheory 是这个库之上叠加"高考论文专属语义"（π 偏好分布、多原型、qualityScore/tierScore、
Pareto 前沿）的领域层。

**但实现方式选错了方向。** 如果分层意图是真的，正确做法应该是 paperTheory 的算法函数
（`optimalOrderForSet`/`setFunctionValue`/`marginalGain`/`greedySubmodularOptimization`/
`bruteForceOptimal`）在内部把 `PaperCandidate` 投影成 `BsaaCandidate`（`{id, value: valueForPreference(c,π), probability}`），
调用 bsaaCore 的对应函数，再把结果 id 映射回来——这正是 `bsaaBacktest.ts` 已经验证过的模式
（`toPaperCandidate`/`orderFromPaperIds` 适配器，反方向）。现状是 paperTheory **完全没有 import bsaaCore**，
从零手写了一遍相同的排序/子模/贪心/暴力算法，只是把 value 换成了 `valueForPreference(candidate, pi)`
的求值结果。这就是"同一层抽象、两份实现"的重复，而不是"分层"。

`qualityScore`/`tierScore` 是 paperTheory 独有的合理扩展字段，`prototypeValues`+π 是合理的领域扩展，
这些不是重复。重复的是排在它们之下的那层纯算法代码。

---

## 3. 谁用谁：应用层 vs 回测层的分裂

```
src/application/optimizePlan.ts   → bsaaCore.greedySubmodularSelection
src/domain/proofVerification.ts   → bsaaCore.*（独立验证套件，CI 门禁 verify:proofs 走这条路径）
src/domain/bsaaBacktest.ts        → paperTheory.*（0cf0468 已重构为委托）
src/infrastructure/candidateProjection.ts → paperTheory.PaperCandidate（生产候选生成器）
tools/ingestGaokaoSample.ts       → paperTheory.transparentBaselineSelection
tools/generatePaperFigures.ts     → paperTheory.* 全套（含验证函数）
tools/runRealMonteCarloBacktest.ts → paperTheory.valueForPreference
```

**关键发现：`optimizePlan.ts`（唯一使用 bsaaCore 的"应用层用例"）没有被任何真实入口调用。**
全仓搜索 `optimizePlan` 只在 `tests/integration.test.ts` 里出现；没有 HTTP 路由、没有 CLI 入口、
没有 adapter 挂载它。它演示的是一套六边形架构（ports/adapters/Prisma 持久化）骨架，
用合成候选跑通闭环，但从未接上真实高考数据管道。

反过来，真正产出论文图表、跑真实回测、写进 `docs/paper.md`"Verified implementation"引用的，
全部走 `paperTheory.ts` + `candidateProjection.ts` 这条线，且完全不经过
`src/application`/`src/ports`/`src/adapters` 这套持久化基础设施。

**为什么会分裂？不是"历史演化残留"，是两条并行赛道从第一天就没打通：**
`d1fff77`（初始提交）同时引入 `bsaaCore.ts`+`schemas.ts` 的极简 `{id,value,probability}` 类型
（六边形架构 demo 用）和 `paperTheory.ts`+论文专属类型（论文数据管道用）。中间 `0cf0468` 把
`bsaaBacktest.ts` 从"自己重写一遍"收敛到"委托 paperTheory"，说明团队已经确立了"paperTheory 是
core algorithm 的 single source of truth"这个原则——但这个原则从未反向应用到 `bsaaCore.ts`/
`proofVerification.ts` 身上，二者仍然是独立的第三条实现。

**比"分裂成两套"更严重的问题：CI 门禁验证的是"错的"那一套。**
`package.json` 的 `verify:proofs` 脚本（CI 中 `Proof verification` 步骤，见 `.github/workflows/*.yml`）
运行 `tools/runProofVerification.ts` → `src/domain/proofVerification.ts` →
`bsaaCore.*`。也就是说，CI 用来证明"Value-Index 定理/子模性/GSIO (1-1/e) 近似比在代码里成立"
的门禁，验证的是**几乎无人使用的 bsaaCore 实现**，而不是 `docs/paper.md` L325 明确写"Verified
implementation" 指向的 `paperTheory.greedySubmodularOptimization`——那套实现的定理验证
（`paperTheory.ts` 内置的 `verifyValueIndexTheorem`/`verifySubmodularity`/`verifyApproximationRatio`）
只在 `tests/paperTheory.test.ts`（`npm test` 的一部分）里被跑到，从未被专门的"证明验证"门禁调用。
对 Oliver 的"数学实现真实"标准而言，这是名实不符：门禁的名字承诺验证论文核心算法，实际验证的是
论文没有引用、没有生产调用的平行实现。

---

## 4. 重复的代价：已发生的具体风险

1. **tie-break 分歧已经是活的 bug，不是假设。** `greedySubmodularOptimization`（paperTheory）
   对 marginal gain 打平用 `id.localeCompare`；`greedySubmodularSelection`（bsaaCore）没有这个
   分支，打平靠 Map 迭代顺序（即输入候选数组顺序）。同一批候选、同样的 v/p，两套实现在
   marginal gain 打平的边界情况下可能选出不同的候选集合——而"哪套是权威结果"取决于你调用的
   是哪个文件，没有单一答案。若 v1.5 要统一 tie-break 规则（prompt 里举的例子），必须记得改
   两处；漏改一处就是两套实现继续分岔，且没有任何测试会失败提醒你（两个测试文件各自只测自己
   的实现内部一致性，不做交叉比对）。

2. **"冲稳保基准"三份实现，语义互不相同，威胁论文对比数字的有效性。**
   `bsaaCore.probabilityTierBaseline`、`paperTheory.transparentBaselineSelection`、
   `bsaaBacktest.baselineReachSteadySafe` 是同一个业务概念的三次独立实现，
   且规则真的不一样（是否按 tier 排序、每桶是否限额 capacity/3、剩余名额怎么补）。
   `docs/paper.md` §8.1 引用的"GSIO vs 冲稳保基准提升 X%"这类论文数字，用的是
   `bsaaBacktest.ts`/`generatePaperFigures.ts` 调的那一版；如果有人为了修一个 edge case
   改了 `paperTheory.transparentBaselineSelection`，`bsaaBacktest.baselineReachSteadySafe`
   不会跟着变，论文正文引用的基准和实际跑图表用的基准就可能悄悄不一致，而没有任何门禁能
   发现——三份实现之间没有任何一致性测试。

3. **性能优化的成果没有传导到真实数据规模。**
   `candidateProjection.ts` 的 SQL 查询 `LIMIT 2000`，真实黑龙江实例 N=1957（见
   `docs/research_directions_2026-07-15.md` §2-2）。paperTheory 的 `marginalGain`/
   `setFunctionValue` 每次调用都重新排序+重新算效用（无增量），文档记录的真实耗时是
   GSIO 2347ms（N=1957, capacity 45）。bsaaCore 的 `incrementalSetUtility` 是 O(\|S\|)
   有序插入，专门解决这个问题——但因为 paperTheory 是从零重写而不是委托 bsaaCore，
   这个优化从未用到生产管道最耗时的路径上。这是"重复实现两次"直接造成的可量化性能损失
   （数量级：paperTheory 贪心整体 ~O(n²·N)，bsaaCore 版本理论上 ~O(n·N)）。

4. **验证套件重复维护。** `paperTheory.ts` 内置 4 个验证函数 + `proofVerification.ts`
   独立实现 3 个几乎同名的验证函数，各自维护自己的 `permutations`/`combinations`/`allSubsets`
   生成器。任何一处生成器实现有 bug（比如遗漏某个子集、越界），另一处不会自动继承修复。

---

## 5. 合并方案草案

**方向：以 bsaaCore.ts 为算法地基，paperTheory.ts 收缩为薄适配层 + 论文专属扩展。**
理由：bsaaCore 类型更简单（Zod schema 已是 single source of truth）、有性能优化
（`incrementalSetUtility`）、且是被"0cf0468 先例"证明过的正确重构方向的延伸（bsaaBacktest 已经
证明"领域特定类型 → 薄适配层 → 委托核心算法"这个模式在这个仓库里可行）。

具体步骤：

1. **核心算法函数改为委托**：paperTheory 的 `optimalOrderForSet`/`setFunctionValue`/
   `marginalGain`/`greedySubmodularOptimization`/`bruteForceOptimal` 内部改为：
   `candidates.map(c => ({id: c.id, value: valueForPreference(c, pi), probability: c.probability}))`
   → 调 bsaaCore 对应函数 → 用 id 映射回 `PaperCandidate`（沿用 `bsaaBacktest.ts` 已经写好的
   `toPaperCandidate`/`orderFromPaperIds` 模式，方向倒过来）。
2. **在合并之前，先由 Oliver 裁决 tie-break 规则和"冲稳保"语义**：这两处不是纯技术重构，
   是要先选一个"哪个是对的"的业务/数学决定，否则合并后必然改变某一侧现有输出（哪怕只是
   EPSILON 级/边界候选级的变化），进而改变已经写进论文的图表数字。
3. **`pathGain` 直接删掉 paperTheory 的那份**，改成从 bsaaCore（或抽到一个不依赖候选类型的
   `metrics.ts`）导入——这是零风险的纯重复删除，不涉及任何行为决定。
4. **验证套件二选一**：让 `proofVerification.ts` 直接复用 paperTheory 的
   `verifyValueIndexTheorem`/`verifySubmodularity`/`verifyApproximationRatio`（经适配器），
   删除 `proofVerification.ts` 里第二套 `permutations`/`allSubsets`；同时决定 CI 的
   `verify:proofs` 到底应该验证哪套实现——鉴于 `docs/paper.md` 引用的是 paperTheory，
   这个门禁应该改为验证 paperTheory（或验证合并后唯一的核心实现）。这是本次审计发现的
   最高优先级问题：**当前 CI 证明的不是论文声称已验证的那份代码**。

**合并风险**：

- `tests/bsaaCore.test.ts`（124 行）与 `tests/paperTheory.test.ts`（189 行）都是直接测算法内部
  行为的单测，合并后两者都应该继续通过（公开 API 签名不变），但如果 tie-break/冲稳保语义按
  第 2 步的裁决发生了改变，两个测试文件里断言具体候选 id/顺序的用例会需要同步更新。
- `docs/figures/*.svg`、`docs/figures/*_data.json`、`data/monte-carlo-backtest.json`、
  `docs/paper.md`/`docs/paper.zh.md` 里的具体数字（Table 4 校准回测结果、Fig2/3/4 各图）都是
  用当前 paperTheory 实现跑出来的；合并算法实现后即使数学上等价，EPSILON 级 tie-break 差异
  也可能让这些已提交产物出现微小漂移，需要重新跑 `generatePaperFigures.ts` 全套并重新生成、
  重新审阅这些产物——这是非纯代码重构的额外工作量，需要 Oliver 决定是否值得在当前阶段做。
- `tools/architecture-guard.mjs` 的分层规则允许 `src/domain` 内部互相 import（domain→domain
  合法），所以 paperTheory import bsaaCore 不会触发架构门禁，这一点没有风险。
- 改变 `verify:proofs` 门禁指向哪套实现，属于"改变 CI 验证范围"的决策，按
  `docs/acceptance_gates_v1.md` 的 L5 越权清单精神（"放宽任何门/改变实验范围"需问 Oliver），
  这一步本身需要 Oliver 明确批准，不能在合并 PR 里悄悄带过。
