# 算法审计视角 04：分层解耦与依赖健康

> 本视角 agent 在 workflow 中 stall，由主循环亲自完成（分层结构已逐点核验，含 file:line 证据）。
> 只读审计，不改任何 src/ 代码。

## 0. 总体判定

分层**方向**是干净的，架构守卫（tools/architecture-guard.mjs，AST 级）确实在起作用：
domain 层零反向依赖（无 domain→application/infrastructure/adapters/db）。真正的问题不在
层间方向，而在 **domain 层内部**：同一套核心算法存在三份并行实现，且 CI 的证明门禁验错了对象。

## 1. 依赖方向核验（全部通过）

- domain→application/infrastructure/adapters/db：**零反向违规**（grep 确认）。
- infrastructure→domain type（candidateProjection 提供 PaperCandidate 给 tools）：健康的单向。
- bsaaBacktest.ts 已委托 paperTheory.ts（commit 0cf0468 的收敛成果，头部注释 5-10 行明示
  "Core optimization algorithms are delegated to paperTheory.ts, which is the paper-official
  implementation"）——这是仓库里**已经确立的单一源原则的先例**。

## 2. domain 内部三套核心（真问题）

| 文件 | 候选类型 | 自带的算法 | 被谁消费 |
|---|---|---|---|
| bsaaCore.ts | BsaaCandidate | greedySubmodularSelection / bruteForceOptimal / marginalGain / valueIndexOrder | application/optimizePlan.ts（**唯一生产入口**）+ proofVerification.ts |
| paperTheory.ts | PaperCandidate | greedySubmodularOptimization / bruteForceOptimal / marginalGain / setFunctionValue | bsaaBacktest.ts（已委托）+ docs/paper.md 声称验证对象 |
| proofVerification.ts | （复用 bsaaCore 类型） | 第三套 permutations(:80)/allSubsets(:94) 组合枚举 | tools/runProofVerification.ts ← CI `verify:proofs` |

三者不互相引用（各自独立），仅共享 scoring.ts 的 defaultProbabilityBuckets。

## 3. CI 证明门禁验错对象（P0，本视角最严重发现）

三方错位，file:line 坐实：
- **CI 跑的**：ci.yml:47 `npm run verify:proofs` → tools/runProofVerification.ts:8
  `import ... from proofVerification.js` → proofVerification.ts 内部 import 自 **bsaaCore.ts**
  （:13 import 块）+ 自带第三套 permutations/allSubsets 做暴力 oracle。
- **论文声称验证的**：docs/paper.md:325 明写 "Verified implementation: src/domain/paperTheory.ts"。
- **结论**：CI 的 verify:proofs 验证的是 bsaaCore + proofVerification 自带枚举那条链，
  **不是论文声称已验证的 paperTheory**。论文说 paperTheory 被验证，CI 却在验 bsaaCore——
  当前 CI 证明的不是论文声称的那份代码。

## 4. tie-break 分歧的真实形态（修正 02 报告）

主循环独立核验发现 02 报告表述不准：并非"paperTheory 有 tie-break 而 bsaaCore 没有"。
两处都用 id.localeCompare 做 tie-break（bsaaCore.ts:40 byValueDesc、:100 findInsertIndex；
paperTheory.ts:176、:238）。真实分歧是 **EPSILON 阈值差 3 个数量级**：
- bsaaCore.ts:24 `EPSILON = 1e-12`
- paperTheory.ts:75 `EPSILON = 1e-9`
落在 [1e-12, 1e-9] 区间的价值差，两套实现分类不同（bsaaCore 视为"不同值"，paperTheory
视为"等值走字典序"），对边界候选产生不同选择。整改成本因此比 02 所述低：统一一个常数即可，
非补缺失逻辑。

## 5. 整改方向（供裁决，不在本视角执行）

1. 三套核心收敛为单一源（沿用 0cf0468 已确立的"paperTheory 为准"原则，或反向选 bsaaCore
   为地基——需 Oliver 先定 tie-break EPSILON 与冲稳保语义这两个业务/数学决定）。
2. CI verify:proofs 改为验证论文实际引用的那套核心（消除 §3 三方错位）。
3. EPSILON 统一为单一常数（§4）。
4. gates:alg / gates:math 接入 CI（视角 03/05 发现，本视角复核确认 ci.yml 无此步骤）。
