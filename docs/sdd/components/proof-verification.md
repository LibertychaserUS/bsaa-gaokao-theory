# Component: Proof Verification

## 职责
提供可复现、可审计的定理验证：
- Theorem 3.1（Value-Index）
- Theorem 4.2（Submodularity）
- Theorem 4.3（Greedy approximation `(1 - 1/e)`）

## 接口
- `verifyValueIndexTheorem(candidates)`
- `verifySubmodularity(candidates)`
- `verifyGreedyApproximation(candidates, capacity)`
- `runProofVerificationTrials(config)`
- `runProofVerificationBattery(config)`

## 不变式
- 所有验证使用确定性的 seeded 随机生成器。
- 近似比验证必须满足 `greedyUtility ≥ (1 - 1/e) · optimalUtility - tolerance`。

## 依赖
- `src/bsaaCore.ts`

## 测试
- `tests/proofVerification.test.ts`
- `tools/runProofVerification.ts`（CLI）
