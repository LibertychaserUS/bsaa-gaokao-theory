# Component: BSAA Core

## 职责
实现 BSAA/GSIO 核心理论：
- 序贯吸收期望效用 `U(x; π)`
- Value-Index 最优排序（Theorem 3.1）
- 子模集函数 `f_π(S)`（Theorem 4.2）
- GSIO 贪心选择（Algorithm 1）与 `(1 - 1/e)` 近似保证
- 暴力最优 oracle（小实例验证用）

## 接口
- `expectedUtility(order)`
- `valueIndexOrder(candidates)`
- `evaluateSetFunction(candidates)`
- `marginalGain(set, element)`
- `incrementalSetUtility(sortedSet, element)`
- `greedySubmodularSelection(candidates, capacity)`
- `bruteForceOptimal(candidates, capacity)`
- `admissionSafety(order)`
- `neutralQuality(order, qualityOf)`

## 不变式
- 所有 `probability` ∈ [0, 1]。
- 所有 `value` ≥ 0。
- `greedySubmodularSelection` 内部 `selected` 始终保持 `value` 降序。

## 依赖
- 无外部依赖。

## 测试
- `tests/bsaaCore.test.ts`
