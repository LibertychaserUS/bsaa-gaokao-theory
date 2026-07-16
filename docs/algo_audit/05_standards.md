# 05 — 工程规范审计（权威规范视角）

审计范围：`eslint.config.mjs`、`.prettierrc.json`、`tsconfig.json`、`package.json`、
`.github/workflows/ci.yml`、`tools/architecture-guard.mjs`，抽样 `src/domain/*`
（bsaaCore.ts, paperTheory.ts, bsaaBacktest.ts, tier.ts, scoring.ts, proofVerification.ts）。
只读审计，未修改任何代码。

---

## 1. TS 严格性

**基线**：`tsconfig.json` `strict: true` + 逐项显式打开
（`noImplicitAny/strictNullChecks/strictFunctionTypes/strictBindCallApply/
strictPropertyInitialization/noImplicitThis/useUnknownInCatchVariables/alwaysStrict/
noUnusedLocals/noUnusedParameters/noImplicitReturns/noFallthroughCasesInSwitch`）— 这已经
高于多数项目的 `strict: true` 默认基线（显式重复声明说明作者理解每一项的含义，非盲目继承）。

**差距（已用实证核实，非猜测）**：`noUncheckedIndexedAccess: false`（tsconfig.json:22）。
临时把它改成 `true` 重新 `tsc --noEmit` 后产生 **87 处编译错误**，集中在：
- `bsaaCore.ts:96,100,121,125,197,214`（`findInsertIndex`/`incrementalSetUtility`/`permutations`/`combinations`，均是 DP/组合枚举的数组下标访问）
- `paperTheory.ts:81,151,214,263,282,296,331,351,382,403,445,592,605,729,761,762`（贪心/暴力枚举/DP 前置条件校验/长期代理指标的下标访问）
- `bsaaBacktest.ts:117,231`、`tier.ts:28`、`preferenceInference.ts` 多处、`proofVerification.ts:89,100`

这些位置全部是"数组当作确定存在"的隐式假设——例如 `paperTheory.ts:592` 的
`proxyValues[orderIds[0]]` 若 `orderIds` 为空数组，`orderIds[0]` 类型是 `string`（非
`string | undefined`），运行时会拿到 `undefined` 却被类型系统当作合法 key。这类代码正是
DP/组合优化最容易出 off-by-one 或空集边界 bug 的地方，恰恰是 `noUncheckedIndexedAccess`
设计出来防的场景。当前用 `!(rank >= 1 && rank <= totalRanked)` 之类的运行时断言部分弥补了
风险（如 `tier.ts`），但不是全覆盖——`paperTheory.ts` 的多数下标访问没有前置断言，只是"业务上
不会传空数组"的隐含假设。

**结论**：`noUncheckedIndexedAccess: false` 是**必须项**级别的差距。87 处不是"顺手就能开"的量，
说明当初评估过成本后选择关闭，但这与 Oliver 标准"数学实现真实、不用近似冒充精确"的精神冲突——
关掉这个选项意味着类型系统对 DP/组合枚举代码的下标安全性不做静态保证，真实的边界正确性完全靠
人肉审查和测试覆盖，而不是编译器强制。

其它可选严格项均未开：`exactOptionalPropertyTypes`（区分 `{x?: T}` 未赋值 vs 赋值为
`undefined`）、`noPropertyAccessFromIndexSignature`、`noImplicitOverride`——这三项属于
"锦上添花"级别，本项目类结构极少（几乎全函数式），收益有限。

## 2. ESLint 规则集

**基线**：`tseslint.configs["strict-type-checked"]` + `["stylistic-type-checked"]`
（eslint.config.mjs:23-24）——这是 typescript-eslint 官方最高强度预设组合（strict-type-checked
严于 recommended-type-checked），属于业界权威规范里能拿到的最严格档位，而非只用
`recommended`。额外手动加强：`no-explicit-any: error`、`no-floating-promises: error`、
`explicit-function-return-type: error`、`switch-exhaustiveness-check: error`、
`import/no-cycle: error`。这一层达标，甚至超出常见"合格"线。

**关闭的规则核查**：只在 `tests/**` 和 `tools/**` 关闭了 `no-floating-promises`
（eslint.config.mjs:57,63）和 `tools/**` 关闭 `no-console`（eslint.config.mjs:64）——
这两处都是合理的场景性放宽（测试文件的 fire-and-forget、CLI 工具打日志），**没有任何规则
在 `src/domain/**` 算法核心被关闭或降级**。抽样搜索未发现任何 `eslint-disable` 内联注释在
domain 目录。这条达标。

**CI 是否真跑全套**：`.github/workflows/ci.yml` 顺序执行
`db:migrate:deploy → typecheck → lint → format:check → verify:architecture → test → verify:proofs`。
`test` 脚本内部会先 `npm run build`，再跑 `node --test dist/tests/**/*.test.js`。

**关键差距（必须项）**：`package.json` 定义了 `gates:math`（`pipeline/gates/math_gates.sh`，
跑 Lean `lake build` + sorry 审计 + 定理签名审计）和 `gates:alg`（`pipeline/gates/alg_gates.mjs`，
用独立重新实现的 DP/quota-DP 递推去对拍 GSIO 贪心，验证 ALG1/ALG2/ALG4/ALG5/ALG6 门禁）——
**这两个门禁脚本都不在 CI 里被调用**（`ci.yml` 全文搜索，两者均缺席）。也就是说：
- Lean 形式化证明（LEMMAS.md 的 A1-A3/B2/B3，`formal/` 目录）没有被 CI 强制要求 `lake build`
  通过或零 `sorry`——本地跑通不代表 main 分支的每次 push/PR 都验证过。
- 唯一在生产代码路径里对拍精确 DP 与贪心的门禁（`alg_gates.mjs`，其头部注释自己承认
  "src/ 只有 GSIO 贪心生产求解器，精确 DP 只存在于 formal/experiments/ 的独立脚本"）也不在
  CI 强制执行范围内。

这直接对应 Oliver 的核心质疑："声称 DP 精确就必须真的是精确 DP"——即便 `alg_gates.mjs` 里
重新实现了一份"正确"的 DP 去验证，这份验证本身不是 CI 门禁的一部分，跟主线代码质量保证脱钩。
`npm run verify:proofs` 跑的是 `dist/tools/runProofVerification.js`，对应
`src/domain/proofVerification.ts`——这是**另一套**基于 TS 暴力枚举/随机试验的证明验证
（非 Lean、非 alg_gates 里的 DP 对拍），三套验证机制（Lean 形式化 / alg_gates DP 对拍 /
proofVerification TS 随机试验）互相独立、只有第三套接入 CI。

## 3. 错误处理

`paperTheory.ts` 的 `assertValidCandidates`（77-105）与 `assertValidPreference`（107-120）
覆盖：空集合、id 类型与非空、概率范围、prototypeValues 长度一致性、非负性、preference 权重
非负与归一化——覆盖面完整，且在每个公共入口函数（`evaluateSequence`/
`greedySubmodularOptimization`/`bruteForceOptimal`/`verifyValueIndexTheorem` 等）开头都调用了
校验，不是"写了但没接线"的摆设。`bsaaCore.ts` 的 `assertProbability`/`assertNonNegativeValue`
同样在 `expectedUtility`（热路径，每次调用都跑）里执行。

这类校验用**运行时抛错**而非类型收窄，是合理选择而非偷懒——TS 类型系统无法静态表达
"数字 ∈ [0,1]"这类数值范围约束，运行时断言是唯一可行手段，符合业界对"精化类型缺失时用
契约式编程兜底"的规范（对应 Eiffel/DbC 风格，非"用 try/catch 掩盖未处理逻辑"的反模式）。
错误类型统一用 `RangeError`，消息里带上下文（候选 id、实际值）——达标。

**唯一缺口**：`noUncheckedIndexedAccess` 关闭导致的下标访问（见 §1）没有被这套显式校验
覆盖——校验保护的是"数值语义合法性"，没有保护"数组不越界"，两者是不同维度的正确性，后者
目前只能靠隐式假设。

## 4. 命名与文档

`bsaaCore.ts` 的 JSDoc 直接引用定理编号（"Theorem 3.1"、"Lemma 4.1"、"Algorithm 1"）并附带
LaTeX 风格公式注释（如 `U(x; π) = Σ_k v_{x_k}(π) · p_{x_k} · Π_{j<k}(1 - p_{x_j})`），公式里的
符号（v/p/k/π）与函数参数/字段名直接对应（`BsaaCandidate.value`↔v, `.probability`↔p），
锚定关系清晰、可审计。11 个导出函数全部有 JSDoc（覆盖率 100%）。

`paperTheory.ts` 采用中文叙述式文档（18 个导出函数中 5 处有独立 JSDoc block，其余靠模块顶部
总注释覆盖），公式符号同样有锚定（如 `v_c(π) = Σ_k π_k · value_{c,k}` 对应
`valueForPreference` 里的 `prototypeValues`/`pi` 参数名）。

**发现的文档缺口（风格问题，非严重）**：两个模块对同一组定理各写一份文档、用两种语言
（英文数学记号 vs 中文叙述），且互相不引用——`bsaaCore.ts` 完全没有提及 `paperTheory.ts`
的存在或两者关系；只有 `bsaaBacktest.ts` 头部注释（1-8 行）说明它"委托给 paperTheory.ts，
后者是论文官方唯一真源"。但 `bsaaCore.ts` 本身并不委托给 `paperTheory.ts`，是一份完全独立
重新手写的等价实现，且没有任何注释解释"这是历史遗留的第二套实现"还是"这是刻意的独立
校验对照组"。对不熟悉历史的读者，命名相似（`greedySubmodularSelection` vs
`greedySubmodularOptimization`）容易误认为是同一函数的两个版本或调用关系，而实际是完全独立
平行实现——这是文档层面对"双核心"事实的隐瞒（不是编码错误，是文档没有诚实反映架构现状）。

## 5. 测试质量

74 个 `test(...)` 用例（8 个测试文件）。抽查确认测试性质：

- `bsaaCore.test.ts`：不只测 happy path——`greedySubmodularSelection matches brute-force
  optimum on small instances`（74-84 行）是**性质测试**（对 capacity 1..3 遍历核对贪心 ≥ 暴力
  最优，理论上应恒等或贪心≤最优，用 `>= optimal.utility - 1e-6` 容忍浮点误差），
  `marginalGain is non-negative for monotone BSAA set function`（46-51）测子模单调性质而非
  具体数值。
- `proofVerification.test.ts`：`verifySubmodularity confirms diminishing marginal gains`、
  `verifyGreedyApproximation satisfies the (1-1/e) bound`（42-47，显式核验
  `greedyUtility >= optimalUtility * (1-1/e) - 1e-6`，这是把论文的近似比定理直接编码成
  测试断言，而不是只测"跑起来不报错"）——达到"测算法核心性质"的标准。
- `sampleParetoWeights produces valid 3-simplex samples`（75-87）验证单纯形采样点和为 1、
  非负——数学不变量测试。

**没有使用 property-based testing 库**（`fast-check` 等未出现在 `package-lock.json`）。
现有的"性质测试"是作者手写的固定种子 + 少量规模档位（N≤8、capacity 1-4）组合，属于
"手工构造的性质测试"，不是自动生成大量随机反例搜索的 PBT。对于已经有 Lean 形式化证明兜底
（`formal/LEMMAS.md` A1-A3/B2/B3 已证）的定理，这个差距的严重度降低——形式化证明比 PBT
提供更强的保证；但对**尚未纳入 Lean 证明范围、只靠 TS 测试兜底的部分**（例如
`transparentBaselineSelection`/`buildParametricParetoFrontier`/`sampleSimplexWeights` 等
论文附加机制，非 LEMMAS.md 编号定理），缺少 PBT 是真实差距——引入 `fast-check` 属于
"应该做但不紧急"级别。

## 6. 可复现性 / 确定性

所有随机源均可注入种子：`bsaaBacktest.ts` 的 `BsaaBacktestConfig.seed`（63 行）、
`paperTheory.ts` 的 `sampleSimplexWeights(dimension, gridSteps)` 网格步长可控、
`runPaperVerificationSuite({ seed, trials })`、`proofVerification.ts` 的
`createSeededRandom(seed)` 全部暴露为函数参数而非硬编码闭包变量。`probabilityCalibration.ts`
的 `evaluateRealisticAdmissionMetrics(..., seed = 20260711)` 同样可覆盖默认值。这条达标——
没有发现任何"测试不可复现"的随机源。

**发现的重复实现（简洁性问题，非确定性问题本身）**：同一个 LCG 算法
（`state = (1664525 * state + 1013904223) >>> 0`，Numerical Recipes 常数）被**独立复制粘贴
了 5 次**：`bsaaBacktest.ts:131-137`、`paperTheory.ts:473-479` 与 `:703-707`（同文件内两次）、
`proofVerification.ts:143-150`、`probabilityCalibration.ts:173-178`。5 处实现字节级相同，
却没有抽成共享 util。这不影响确定性本身（每处都是确定、可复现的），但违反"简洁/DRY"标准，
且是"多个并行核心各自为政"模式在基础设施层面的又一例证（与 bsaaCore/paperTheory 双核心是
同一类问题的不同表现）。

---

## 达标 / 差距清单（按严重度）

| # | 项目 | 状态 | 严重度 | 类别 |
|---|------|------|--------|------|
| 1 | `noUncheckedIndexedAccess: false`，87 处隐式下标访问未受类型系统保护，集中在 DP/组合枚举代码 | 差距 | **必须** | 类型安全 |
| 2 | `gates:math`（Lean 证明）与 `gates:alg`（DP 对拍）均未接入 CI，形式化证明与生产贪心的对拍验证跟主线质量门禁脱钩 | 差距 | **必须** | CI/工程流程 |
| 3 | `bsaaCore.ts` 与 `paperTheory.ts` 双套等价实现之间无任何注释说明关系/权威归属，文档未反映真实架构 | 差距 | 重要（不算"必须"，但直接影响可维护性与审计难度） | 文档诚实性 |
| 4 | 无 property-based testing 库；未被 Lean 证明覆盖的论文附加机制（parametric Pareto、transparent baseline 等）测试覆盖靠手工固定场景 | 差距 | 锦上添花 | 测试质量 |
| 5 | 同一 LCG 算法在 5 处文件独立复制粘贴，无共享 util | 差距 | 锦上添花 | 简洁性/DRY |
| 6 | ESLint 用 `strict-type-checked`+`stylistic-type-checked` 顶格预设，domain 目录零内联 disable | 达标 | — | 规则权威性 |
| 7 | `assertValidCandidates`/`assertValidPreference`/`assertProbability` 等运行时契约校验完整、接线到所有公共入口 | 达标 | — | 错误处理 |
| 8 | 所有随机源（backtest/Pareto sampling/proof trials/calibration）均可注入种子，可复现 | 达标 | — | 确定性 |
| 9 | `bsaaCore.ts` 公式注释与代码变量锚定清晰（v/p/k/π 对应字段名），11/11 导出函数有 JSDoc | 达标 | — | 命名/文档 |

**总体判断**：工程规范层面地基确实好（ESLint/Prettier/tsconfig 严格项/AST 架构守卫/契约式
错误处理均达到或超过常见权威规范），但存在两条"必须"级差距：一是关闭
`noUncheckedIndexedAccess` 让类型系统对 DP/组合代码的下标安全性失明，二是把 Lean 形式化证明
和 DP-vs-贪心对拍门禁排除在 CI 之外，导致"数学实现真实性"的验证机制存在但不是强制的、
可能随代码演进而悄悄失效却无人察觉。这两条与其余已知的"双核心并行实现"问题（bsaaCore vs
paperTheory）共享同一根因：缺乏把"唯一真源"这个原则从文档承诺（bsaaBacktest.ts 头注释）
落实到工具链强制层面（编译器 + CI）的机制。
