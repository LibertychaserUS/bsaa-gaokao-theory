# 算法审计 01：数学实现真实性（对照 formal/LEMMAS.md 七定理）

审计人：算法审计 agent（只读，不改代码）。日期：2026-07-16。
方法：逐条读 src/domain/{bsaaCore.ts, paperTheory.ts}、src/domain/proofVerification.ts、
src/infrastructure/probabilityCalibration.ts、formal/experiments/verify_*.mjs、
formal/Bsaa/{DP,Ordering,Chance}.lean、pipeline/gates/alg_gates.mjs、docs/acceptance_gates_v1.md、
docs/sdd/decisions/004-unified-core-model.md、git log。全部结论基于实读代码，引 file:line。

---

## 结论摘要（先给判决，后给证据）

| # | 定理 | 生产代码是否真实实现 | 判定 |
|---|------|----------------------|------|
| 1 | A3 DP 精确最优 | **否**——生产只有贪心 | 声明与实现不符（严重） |
| 2 | A2 value-index 排序 | 是，但两套并行实现 | 真实对应 + 重复实现（中等） |
| 3 | 子模性/边际增益 | 是，两处自洽且与 Lean 不完全对齐 | 真实对应（轻微文档缺口） |
| 4 | 概率 p_i 校准 | 部分真实——校准管线存在，但生产默认配置仍是拍脑袋 sigmoid；且非§4设计的阶序统计量法 | 声明与实现部分不符（中等-严重） |
| 5 | 自证函数 verifyXxxTheorem | 真验证，非走过场，但有规模上限(N≤8) | 真实（轻微：覆盖面非正确性问题） |

---

## 1. A3（DP 精确性）——生产代码里"精确最优"是假的承诺

**定理原文**（formal/LEMMAS.md:26-31）：DP 递推 `g(i,k)=max(g(i+1,k), p_i·v_i+(1-p_i)·g(i+1,k-1))`
在 v 降序列表上给出长度 ≤k 子序列的**精确**最大效用。Lean 证明见
`formal/Bsaa/DP.lean:101` `theorem A3_dp_exact`（零 sorry，已验证）。

**生产代码现状**：

- `src/domain/bsaaCore.ts:139` `greedySubmodularSelection` —— GSIO **贪心**，每步选边际增益最大候选，
  不是 DP。
- `src/domain/paperTheory.ts:208` `greedySubmodularOptimization` —— 同样是贪心（"Algorithm 1"注释自称
  "(1-1/e) 近似保证"，`paperTheory.ts:8`）。
- `src/application/optimizePlan.ts:5,25` —— **唯一生产入口**，直接调用 `bsaaCore.ts` 的贪心函数。
  全仓库对 `src/` 做 grep（见审计过程日志），**没有任何一处从 `src/` 导出或调用精确 DP**。
- 精确 DP 只存在于三处，全部在生产边界之外：
  - `formal/experiments/verify_dp_exact.mjs`、`verify_dp_quota.mjs`（验证脚本，不被 src/ 导入）；
  - `pipeline/gates/alg_gates.mjs:36-58` `dpExact()` —— 门禁脚本内**复刻**的 DP，脚本头部注释
    （`alg_gates.mjs:5-11`）自己承认："exact DP solver... exist only as standalone verification
    scripts under formal/experiments/... they are not modularized into src/"。
  - `docs/acceptance_gates_v1.md:47-48` 明文写着："贪心精确性是猜想 ⇒ 上线优化器只用 DP（A3 已 Lean 证），
    贪心仅作性能对照"——**这是设计文档对现状的陈述性错误**：上线优化器（optimizePlan.ts）实际用的
    是贪心，不是 DP。文档描述的目标状态与代码现状不一致。

**判定：真实性问题，严重。** LEMMAS.md/acceptance_gates_v1.md 声称"精确最优"数学成果已经落地为
"上线优化器"，但 `optimizePlan.ts` 唯一调用的求解器是贪心。已证明的精确定理（A3）**没有一行生产代码
实现它**。这不是"用近似冒充精确"的算法层面造假（贪心确实标注为贪心，未伪称精确），而是**工程层面的
"证明-部署"断层**：论文/门禁文档宣称的"精确 DP 已上线"与代码事实矛盾。

**贪心与精确的差距（近似比）如何界定**：
- `formal/experiments/dp_vs_gsio_real.mjs`（真实黑龙江实例，`docs/research_directions_2026-07-15.md:20-22`
  引用其结果）：DP=0.9145673886 vs GSIO=0.9145673870，差 1.67e-9，接近 GSIO 自身
  `EPSILON = 1e-9`（`paperTheory.ts:75`）量级；但**选中集合仅重叠 26/45**——效用几乎相等不代表
  选择相同，这是"近优平台期"现象，已被诚实记录（同文件 §2 第4条）。
- 理论上界 `(1-1/e)≈0.632`（`verifyApproximationRatio`，`paperTheory.ts:438-464`）是贪心相对**最优**的
  worst-case 保证；但 Chade-Smith 结果本身已证：**无约束/常数配额下贪心=精确最优**
  （`docs/research_directions_2026-07-15.md:24-26`）。docs 自己也承认"⚠️ 配额约束下贪心精确性不保证，
  配额场景用 DP"（同文件 §2 第4条），而**配额（冲稳保硬约束）在 src/ 里完全不存在**
  ——grep 全仓库 `Quota` 只在 `pipeline/gates/alg_gates.mjs` 和 `formal/experiments/verify_dp_quota.mjs`
  出现，`src/` 零匹配。也就是说：文档承认"配额场景必须用 DP"，但 src/ 既没有 DP 也没有配额建模，
  两者都停留在验证脚本层。

**严重度：高。** 这是本次审计发现的最大数学实现真实性缺口——"精确 DP"是仓库最重要的数学卖点
（Lean 机器验证、比贪心快 2000 倍），却完全没有进入生产路径，生产用户实际拿到的是**未标注近似比
上限的贪心结果**（配额场景下贪心甚至无理论保证）。

---

## 2. A2（value-index 排序）——两套实现，逐点比对一致但物理上重复

**定理原文**：`formal/Bsaa/Ordering.lean` `theorem A2_pointwise_ordering`（约第90行附近，见文件头
docstring 摘要，`Ordering.lean:1-12`）——对**任意**录取实现分布（不要求独立）逐点成立：v 降序排列
支付 ≤ 被录取者最大价值，取等条件=v降序。Lean 证明依赖 `payoff_eq_maxAdm_of_sorted`
（`Ordering.lean` 第 ~62-75 行，见审计读取）零 sorry。

**代码实现对照**：

- `src/domain/bsaaCore.ts:38-41,68-70`：
  ```ts
  function byValueDesc(left, right) { ... right.value - left.value ... }
  export function valueIndexOrder(candidates) {
    return [...candidates].sort(byValueDesc);
  }
  ```
  纯按 `value` 字段降序，tie-break 用 id 字典序（`bsaaCore.ts:40`）。**distribution-free**——排序函数
  不接收、不使用 `probability` 参数，与定理"排序独立于 p"的核心断言完全吻合。

- `src/domain/paperTheory.ts:164-180` `optimalOrderForSet`：
  ```ts
  return [...setIds].sort((leftId, rightId) => {
    const leftValue = valueForPreference(left, pi);
    const rightValue = valueForPreference(right, pi);
    if (Math.abs(leftValue - rightValue) <= EPSILON) return leftId.localeCompare(rightId);
    return rightValue - leftValue;
  });
  ```
  同样按 `v_c(π)`（`valueForPreference`, `paperTheory.ts:138-141`，即 `Σ_k π_k · prototypeValues[k]`）
  降序，不使用 `probability`。逻辑与 bsaaCore 一致，唯一区别是 value 从单标量换成
  "原型加权和"，且 tie-break 阈值用 `EPSILON=1e-9` 而非精确相等（bsaaCore 用精确 `!==`，
  `bsaaCore.ts:39`）。**两处 tie-break 语义不同**（一个是精确浮点比较，一个是 ε-容差比较）——
  在极端浮点边界下可能给出不同的排序结果，是潜在的不一致源，但对定理本身（v 降序最优）无影响。

- Lean 层与 TS 层的对应关系：Lean 定理是关于任意分布（甚至非独立）的逐点断言；两处 TS 实现只是
  "按数值降序排序"这一具体操作，本身不携带"为什么这样排是最优"的证明——**证明责任在 Lean，
  TS 只需要行为正确**。行为核验：`tests/paperTheory.test.ts:81-84`
  `verifyValueIndexTheorem` 用穷举置换验证（N≤8），`tests/bsaaCore.test.ts`（未展开读，但
  `src/domain/proofVerification.ts:201-235` `verifyValueIndexTheorem` 同样穷举置换比对
  `valueIndexOrder` 与真实最优）。两侧测试都实际跑穷举验证，非空跑。

**判定：真实对应。** 排序规则严格是 distribution-free 的 value 降序，两个实现语义一致（除
tie-break 容差差异），且有真实穷举测试覆盖，不是近似替代。

**severity：轻微**——不是正确性问题，是 `docs/sdd/decisions/004-unified-core-model.md`
（ADR-004）里已经承认的架构问题："当前仓库存在三套重叠 BSAA/GSIO 实现"（ADR-004 Context 段），
决议是"paperTheory.ts 为唯一权威源，bsaaCore.ts 降级为薄兼容层"（ADR-004 Decision 第1-2条），
但 **`bsaaCore.ts` 并未实际"委托给 paperTheory.ts"**——它是完全独立的第二套实现
（自己的 `expectedUtility`/`valueIndexOrder`/`evaluateSetFunction`/`marginalGain`/
`greedySubmodularSelection`/`bruteForceOptimal`，`bsaaCore.ts` 全文 358 行），且是
**生产唯一入口 `optimizePlan.ts` 实际使用的那一套**（`optimizePlan.ts:5`），与 ADR-004
"paperTheory 为权威源、bsaaCore 只是薄壳"的决议正好**相反**。ADR 状态标注"Accepted —
implementation in progress"（ADR-004 Status 段），说明这是已知未完成的技术债，不是隐藏缺陷，
但截至审计时点（2026-07-16），ADR-004 的决议尚未落地，生产代码走的是"非权威"的那一套实现。

---

## 3. 子模性 / 边际增益——两处自洽，无捷径近似

**定理原文**：`docs/theory_framework.md:160-217` §6（子模性定理 4.2 + 贪心 4.3），Lean 侧
子模性未见独立 `.lean` 定理文件（`formal/Bsaa/` 目录只有 `DP.lean`/`Ordering.lean`/`Chance.lean`/
`Expect.lean`/`Prelude.lean`——**子模性没有被 Lean 形式化**，只有 TS 侧的穷举数值验证）。

**代码实现**：

- `bsaaCore.ts:88-91`：
  ```ts
  export function marginalGain(set, element) {
    const augmented = [...set, element];
    return evaluateSetFunction(augmented) - evaluateSetFunction(set);
  }
  ```
  直接是定义式 `Δ(e|S) = f(S∪{e}) - f(S)`，`evaluateSetFunction`（`bsaaCore.ts:78-81`）
  = `expectedUtility(valueIndexOrder(candidates))`——即"重新排序整个增广集合再算效用"，
  **没有用任何增量捷径**，是最朴素、最忠实的定义式实现。贪心内循环
  （`greedySubmodularSelection`, `bsaaCore.ts:139-186`）为性能改用 `incrementalSetUtility`
  （`bsaaCore.ts:112-128`，O(|S|) 插入而非重新排序+O(|S|log|S|)），但这只是**同一数学量的
  等价快速路径**（因为 `selected` 始终保持有序，插入新元素后局部重算效用等价于整体重排后重算），
  不是近似捷径。

- `paperTheory.ts:194-205`：
  ```ts
  export function marginalGain(setIds, candidateId, candidates, pi) {
    if (setIds.includes(candidateId)) return 0;
    return setFunctionValue([...setIds, candidateId], ...) - setFunctionValue(setIds, ...);
  }
  ```
  同样是定义式，`setFunctionValue`（`paperTheory.ts:183-191`）内部调用 `optimalOrderForSet` 后
  `evaluateSequence`——两处实现（bsaaCore vs paperTheory）在"边际增益=重排后效用差"这一点上
  **语义完全一致**，只是 candidate 数据结构不同（`{value,probability}` vs
  `{probability,prototypeValues[]}` + `π`）。

**自洽性验证**：`verifySubmodularity`（`paperTheory.ts:376-435`，及 `proofVerification.ts:245-273`）
对所有 `A⊆B, e∉B` 穷举检查 `gain(A,e) ≥ gain(B,e)`（N≤8），真实计算 `marginalGain` 而非公式代入，
若违反会返回带反例的 `ok:false`（`paperTheory.ts:423-429` 明确构造 counterExample）。

**判定：真实对应，无捷径近似。** 边际增益定义式在两套实现里都是老实的"重算差值"，性能优化
（`incrementalSetUtility`）经过检验与朴素版本等价，不构成近似。

**严重度：轻微**——唯一缺口是子模性定理本身**没有 Lean 机器证明**，只靠 TS 穷举验证覆盖到
N≤8；`formal/LEMMAS.md` 的七条定理清单（A1/A2/A3/B0-B4）里确实**不包含子模性**，说明这是
LEMMAS.md 范围外的定理，不算"声明精确却验证不足"，但如果论文（`docs/paper.md:116`）把子模性
证明 sketch 当作和 Lean 定理同等级的"已证"呈现，读者可能误以为子模性也过了机器验证——这是
呈现层面的潜在混淆，非代码缺陷，建议澄清但不打高严重度。

---

## 4. 概率 p_i 校准——真实校准管线存在，但生产默认值是拍脑袋，且非设计文档的顺序统计量法

**设计文档目标**（`docs/research_directions_2026-07-15.md:49-52` §4）：
> 范式：估录取概率 → 估**阈值预测分布** G_p，p = 1−G_p(R)。
> 结构地基：阈值 = 报考者位次分布第 m_p 顺序统计量，Var ≈ p(1−p)/[N·f²(x_p)]
> （f 由一分一段表直接给出）⇒ 结构化异方差。

**代码实现现状**（`src/infrastructure/probabilityCalibration.ts`）：

- **实际方法**：不是"阶序统计量+方差结构"模型，是**经验生存函数 + 两参数 logistic 拟合**：
  1. `buildResiduals`（`probabilityCalibration.ts:92-127`）：从 SQLite 真实历史数据
     （`min_rank_2022/2023/2024` vs `estimated_rank_2025`）算残差——**数据来源真实**，不是伪造。
  2. `empiricalSurvival`（`:243-250`）：经验生存函数 `P(residual ≥ δ)`——真实统计量，非拍脑袋。
  3. `fitLogisticToSurvival`（`:268-354`）：真实梯度下降拟合（`beta0/beta1` 迭代更新，
     L2 正则，收敛判据 `convergenceEpsilon`，`lossHistory` 全程记录）——是真优化过程，
     不是"永远返回固定值"的占位函数。产出的 `calibrated-probability-model.json`
     （`config/calibrated-probability-model.json`）里 `beta0=-0.159955, beta1=-4.878828`
     与 `docs/paper.md:188-190` 描述的论文数字**完全一致**——说明论文确实引用了这条真实
     拟合管线的产出，不是虚构数字。

  **但这不是设计文档 §4 描述的方法**：§4 要的是"阈值=顺序统计量+由一分一段表算方差的
  结构化异方差模型"（能解释为什么不同分数段/不同计划数的程序应该有不同的不确定性宽度），
  代码实现的是"对残差做经验生存函数+全局两参数 logistic"——**全局单一 β0/β1，不区分计划数、
  层次、密度等结构协变量**，是设计目标的**简化版本**，不是"简化成拍脑袋"（因为拟合过程是真实
  优化的），但确实**没有实现"顺序统计量"和"结构化异方差"这两个设计文档强调的核心创新点**。
  `research_directions_2026-07-15.md:56-59` 自己把这列为"短期(1-2周)"和"中期"的**未完成**
  工作项（GAMLSS/分层贝叶斯/conformal 覆盖层），所以这是**已知未完成，非虚假宣称**——
  文档没有声称当前代码已经是顺序统计量模型。

- **生产默认配置的真问题**：`config/paper-sample.json` 的 `probabilityModel` 字段
  （审计读取内容）是：
  ```json
  "probabilityModel": { "kind": "sigmoid", "offset": 2500, "scale": 6500,
                         "outputRange": [0.05, 0.95] }
  ```
  **这是纯手调常数**（offset=2500, scale=6500 无任何拟合来源说明），且
  `src/infrastructure/candidateProjection.ts:224-232` `admissionProbability` 对 `sigmoid` 分支
  的实现是：
  ```ts
  raw = clamp01(1 - clamp01((rankDelta + model.offset) / model.scale));
  ```
  是**线性截断**而非真正 sigmoid 曲线（函数名与实现不符——`sigmoidProbabilityModelSchema`
  声称是 sigmoid，实际是分段线性 clamp）。这是**该配置分支的命名与实现不一致**，
  且是**默认配置文件里唯一激活的概率模型**——除非调用方显式传 `--probabilityModel
  config/calibrated-probability-model.json`（`tools/generatePaperFigures.ts:59-67`,
  `tools/calibrateProbabilityModel.ts` 用法注释）。是否论文最终数字用了 calibrated 版本，
  从 `docs/paper.md:179-197`（§5.3 明确写着两参数 logistic 拟合与 calibrated 模型的具体数字）
  可以确认**论文用的是 calibrated logistic**，但 `config/paper-sample.json`（**仓库里的默认/
  可复现配置**）没有更新指向 calibrated 模型——**复现性缺口**：直接跑
  `npx tsx tools/generatePaperFigures.ts`（不带 `--probabilityModel` 参数）会用回
  拍脑袋 sigmoid/线性 clamp，产出的图表数字**不等于论文里报告的数字**。

- **AUC 指标已被项目自己诊断为构造性伪影，但论文仍引用它作为校准证据**：
  `config/calibrated-probability-model.json` 的 `realistic.auc = 0.9981449040941882`，
  `docs/paper.md:196` 用它作为"satisfying the practical calibration requirements"的证据之一；
  而 `docs/research_directions_2026-07-15.md:55` 明确写："弃用 AUC（两个 AUC 皆构造伪影：
  伪配对≈0.5 按构造不可分；随机配对≈0.998 被远阈值样本淹没）"——这是**同一天（2026-07-15）
  项目自己的研究结论**，诊断出 `evaluateRealisticAdmissionMetrics` 里的伪样本构造方式
  （`probabilityCalibration.ts:196-241`，`weightedSample` 配对一个随机位次+随机 program）
  产生的 AUC=0.998 是**采样构造的数字假象**（远阈值样本天然可分，撑高 AUC），不是真实判别力。
  但 `paper.md:196` 仍然把这个数字写进论文正文当作校准质量的支撑证据，**没有加注这是已知伪影**。

**判定：部分真实、部分不符。**
1. 校准的核心统计量（经验生存函数、梯度下降拟合）是真实计算，非占位/拍脑袋——**这部分真实**。
2. 但生产默认配置（`paper-sample.json`）用的是未标注来源的手调 sigmoid（且实现是线性而非
   sigmoid，命名与代码不一致）——**复现路径与论文路径不是同一套**，是复现性/真实性风险。
3. 论文引用的 AUC=0.998 已被项目自己的后续研究判定为"构造性伪影"，但论文正文未加此免责声明
   ——**已知缺陷未同步进论文措辞**，是诚实性缺口。
4. 设计文档 §4 描述的"顺序统计量+结构化异方差"模型**完全没有实现**，当前只是全局 logistic——
   这是能力缺口而非虚假宣称（文档自己承认是未完成项）。

**严重度：中等-高。** 不是"伪造数字"，是"校准方法论比论文描述的更弱（全局 logistic vs
顺序统计量结构模型），且论文引用的一个关键指标（AUC）已被项目自己诊断为伪影却未更正论文文本，
外加默认配置无法复现论文数字"——三者叠加构成真实性风险，建议 Oliver 在论文定稿前处理
（不属于本审计的整改范围，只登记）。

---

## 5. 自证函数（verifyValueIndexTheorem / verifySubmodularity / verifyApproximationRatio）——真验证，非走过场

逐一核验是否可能"永远返回 true"：

- **`verifyValueIndexTheorem`**（`paperTheory.ts:320-373`，另一份在
  `proofVerification.ts:201-235`）：真实穷举全排列（`permutations(allIds)`,
  `paperTheory.ts:343-354`），逐个算 `evaluateSequence` 并与 sorted 效用比较，
  若存在 `utility > sortedUtility + tolerance` 立即返回 `{ok:false, counterExample}`
  （`:358-369`）。**不是恒真函数**——若把 `optimalOrderForSet` 故意改错（比如改成升序），
  这个函数会在 N≥2 时必然抓到反例返回 false。已用代码推理验证其判假路径可达，非走过场。
  上限：`candidates.length > 8` 时直接返回 `{ok:false, message:"Too many..."}`（`:332-337`），
  **注意这是"拒绝验证"不是"假装通过"**——对超出规模的输入诚实报告"未验证"而非默认 true，
  这是好的失败处理设计。

- **`verifySubmodularity`**（`paperTheory.ts:376-435`）：穷举所有 `A⊆B⊆ids` 及 `e∉B`
  （`subsets` 生成器，`:392-407`），真实调用 `marginalGain` 两次比较，违反即返回带三元组
  `{A,B,e,gainA,gainB}` 的反例（`:423-429`）。规模上限 `candidates.length > 8`
  （`:383-388`，同样诚实拒绝而非默认真）。

- **`verifyApproximationRatio`**（`paperTheory.ts:438-464`）：真实运行 `greedySubmodularOptimization`
  和 `bruteForceOptimal`，算 `ratio = greedy/optimal`，与 `bound = 1-1/e` 比较，
  `ratio + tolerance < bound` 才判否（`:451-457`）——数值可能失败的判据是真实存在的，
  不是 `return {ok:true}` 硬编码。

- 三者共同的规模瓶颈（N≤8）来自 `bruteForceOptimal`/全排列的组合爆炸，是**性能约束**导致的
  验证覆盖面上限，不是刻意让验证"必然通过"的设计。`proofVerification.ts` 里的等价版本
  （`runProofVerificationTrials`, `:316-391`）用固定种子 LCG 生成不同规模的随机实例
  （N=2..7 for value_index, N=2..6 for submodularity, 四组 approximation 配置），
  这些是**跑真实穷举/暴力**的复合验证批次，非"跑一次固定必过的样例"。

**判定：真验证，非走过场。**

**严重度：轻微**（覆盖面限制 N≤8 是已知且合理的工程约束，非正确性缺陷；
`docs/acceptance_gates_v1.md:57-59` 已经把"oracle 规模底线 ≥5000 实例含对抗族"列为
MATH5/ALG1 门禁标准，且 `alg_gates.mjs` 确实用 5000+3000 随机+对抗实例跑 DP vs 暴力对拍
——**门禁层的验证规模已经远超 verifyXxx 系列的 N≤8 单元测试**，说明规模瓶颈已经在更高层
被正确的方式解决，verifyXxx 系列只是单元测试粒度的"小实例穷举复核"，定位准确，不是唯一
验证手段）。

---

## 附录：额外发现（未在 Oliver 五问范围内，但审计中确认，供参考）

- **配额（冲稳保硬约束）DP 完全不在 src/**：全仓库 grep `Quota` 只出现在
  `pipeline/gates/alg_gates.mjs` 和 `formal/experiments/verify_dp_quota.mjs`。
  `docs/acceptance_gates_v1.md:90` 描述的"ALG7 内核纯净性门"（求解器签名只收
  `(候选列表, k, 冲稳保配额)`）目前**没有任何生产代码实现这个签名**——`optimizePlan.ts`
  的 `greedySubmodularSelection(candidates, capacity)` 不接受配额参数。
- **ALG 门禁自曝的覆盖缺口**（`docs/acceptance_gates_v1.md:178-189`，主循环 2026-07-16 自己
  记录）：`alg_gates.mjs` 的 ALG1 验证的是"脚本内复刻 DP 递推实现对"，**不是**验证
  `src/domain/paperTheory.ts` 生产 GSIO 贪心。这与本报告第1条结论一致且互相印证：
  门禁体系本身已经意识到"验证的东西"和"生产跑的东西"是两个不同的代码路径，只是尚未
  修复（登记为"ALG 门增强项"，不阻塞当前门禁）。
