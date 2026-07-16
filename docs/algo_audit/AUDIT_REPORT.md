# 算法审计综合报告 — 给 Oliver 的评估与整改方案

审计角色：综合（只读评估，未改动任何代码）。日期：2026-07-16。
输入：`01_math_fidelity.md`（数学真实性）、`02_dual_core_dry.md`（双核心重复）、
`03_dp_single_source.md`（DP 单一源）、`04_layering.md`（分层解耦）、`05_standards.md`（工程规范）。
本文件额外核对：`docs/paper.md`（论文实际声称的内容，用于区分"论文虚假宣称"与"设计文档超前承诺"）。

**内部纠偏核验说明**：`04_layering.md` 提出 `02_dual_core_dry.md` 的 tie-break 判定"表述不准"，
理由是 `bsaaCore.ts:40,100` 也用了 `id.localeCompare`。本报告逐行核验代码后**驳回**这一纠偏——
`bsaaCore.ts:40`（`byValueDesc`）与 `:100`（`findInsertIndex`）只用于把已选中的候选排入最终输出顺序
（Theorem 3.1 的排序步骤），不参与贪心循环"该挑哪个候选"的决策；`bsaaCore.ts:155-177` 的候选选择
循环确实没有平局分支。因此 `02` 的原判——"paperTheory 候选选择环节有显式 tie-break、bsaaCore
没有"——成立，`04` 的纠偏不采纳。同时确认 `04` 指出的另一事实为真且是叠加证据：两侧 EPSILON
阈值相差 3 个数量级（`bsaaCore.ts:24` 的 `1e-12` vs `paperTheory.ts:75` 的 `1e-9`）。详见下方
S1-2 条目。

**主循环追加纠错声明（2026-07-16）**：本报告 §S1-2 的 tie-break 判定完全正确。主循环在审阅时曾一度认同 `04` 的纠偏（误以为两处排序都用 localeCompare 即无分歧），随后亲自逐行核验 `bsaaCore.ts:155-177` 与 `paperTheory.ts:236-239` 两个**候选选择循环**（非排序函数），坐实 `bsaaCore` 选择循环确无平局分支、`paperTheory` 有显式 `localeCompare` 分支——即主循环自己的纠偏是错的，本报告与 `audit-dp-source`/`audit-layering` 两个独立 agent 的判定成立。记录此事以留痕：主循环的独立核验也会出错，最终由多方逐行复核收敛到正确结论。

**已修复项状态更新（2026-07-16，本报告写于修复前）**：
- **S1-1（CI 验错对象）已修复** — commit 54a66e1：新增 `tools/runPaperVerification.ts` + `verify:paper` script，CI 现验证论文引用的 `paperTheory` 验证套件（3/3 PASS）。原 `verify:proofs`（验 bsaaCore/proofVerification）保留为叠加而非替换。
- **S1-4（gates 未接入 CI）已修复** — commit 54a66e1：`gates:math`、`gates:alg`、`verify:paper` 三步已加入 `.github/workflows/ci.yml`，本地全绿验证通过。
- 其余 S1-2 / S1-3 / S2-* / S3-* 维持本报告结论，按下方优先级矩阵等 Oliver 裁决（多数需先定权威语义再动承重代码，冻结后处理）。

---

## 1. 总体判定

**健康度：中等——地基扎实、核心定理对应基本诚实，但被"双核心重复"与"验证对象错位"两条系统性根因反复拖累，外加两处必须级 CI/类型安全差距。不是"金玉其外"，但也不是可以直接对外宣称"完全严丝合缝"的状态。**

| 标准 | 打分 | 依据 |
|---|---|---|
| **真实**（不用近似冒充精确） | 中 | 生产核心（GSIO 贪心、子模性、value-index 排序）与定理真实对应，无近似陷阱（`01`§2-3）。但三处真实性缺口：①`docs/acceptance_gates_v1.md:47-48`"上线优化器只用 DP"是**设计目标**，从未落地为代码事实（`optimizePlan.ts` 只调贪心，`src/` 无 DP 无配额）——注意 `docs/paper.md:325`（论文本身）诚实写的是"Verified implementation: paperTheory.ts 的 GSIO"，**没有**声称 DP 已上线，造假主体是内部验收文档的超前承诺，不是论文对外宣称；②CI 的 `verify:proofs` 门禁验证 `bsaaCore.*`（几乎无人使用），而非论文/生产实际引用的 `paperTheory.*`（`01`§1、`02`§3）；③论文引用的 AUC=0.998 已被项目自己诊断为"构造性伪影"但正文未加注，生产默认配置（`paper-sample.json` 的拍脑袋 sigmoid）与论文实际用的 calibrated 模型不是同一条复现路径（`01`§4）。 |
| **优雅** | 中 | Lean 机器证明 + TS 契约式校验体系本身设计优雅；但贪心候选选择环节的 tie-break 规则在两套实现里不统一——`paperTheory.ts:236-239` 有显式 `id.localeCompare` 平局分支，`bsaaCore.ts:155-177` 无此分支（依赖 Map 迭代顺序），且两者的 `EPSILON` 判平阈值相差 3 个数量级（`bsaaCore.ts:24` 的 `1e-12` vs `paperTheory.ts:75` 的 `1e-9`），两层分歧叠加，导致"哪个是权威答案"没有单一答案，直接违反优雅性要求的一致性（`02`§4-1，`04`§4 补充 EPSILON 证据，详见 S1-2）。 |
| **简洁** | 差 | 本次审计最集中的缺口。`bsaaCore.ts`（358 行）与 `paperTheory.ts`（767 行）平行实现同一套排序/子模/贪心/暴力枚举算法两次；"冲稳保"基准独立实现 3 份、语义互不相同；验证套件（`permutations`/`combinations`/`allSubsets`）独立维护 3+ 处；同一 LCG 算法复制 5 处；`pathGain` 逐字重复（`02` 全篇、`05`§6）。 |
| **分层解耦** | 中 | 六边形架构（domain/ports/application/adapters）分层清晰，AST 架构守卫（`tools/architecture-guard.mjs`）强制执行分层规则，这条本身达标。但"分层"承诺在算法核心处**没有真正执行**：`ADR-004`（`docs/sdd/decisions/004-unified-core-model.md`）裁决"paperTheory 为权威源、bsaaCore 降级为薄壳"，代码现状正好相反——生产唯一入口 `optimizePlan.ts:5` 调用的是 `bsaaCore`，且这个入口本身**无任何真实调用方**（只在 `tests/integration.test.ts` 出现），论文/回测这条主线完全绕开了这套"分层"基础设施。 |
| **权威工程规范** | 良好，但两处必须级差距 | ESLint（`strict-type-checked`+`stylistic-type-checked` 顶格预设，domain 目录零内联 disable）、Prettier、tsconfig 严格项、契约式错误处理、可复现随机种子——均达标或超出常见规范（`05`§2-6）。两处必须级差距：①`noUncheckedIndexedAccess: false`，87 处隐式下标访问集中在 DP/组合枚举代码，恰好是最容易出边界 bug 的地方；②`gates:math`（Lean 回归）与 `gates:alg`（DP-vs-贪心对拍）均未接入 `.github/workflows/ci.yml`，只能手动调用（`03`§2-4、`05`§1-2，两份审计独立交叉确认同一发现）。 |

---

## 2. 真缺陷清单（按严重度排序）

### 严重（S1）

**S1-1｜CI 证明门禁验证的不是被使用的代码**
证据：`.github/workflows/ci.yml:46-47` 的 `Proof verification` 步骤跑 `npm run verify:proofs` → `dist/tools/runProofVerification.js` → `src/domain/proofVerification.ts` → 只调用 `bsaaCore.*`（`01`§1 判定表第1行、`02`§3）。而 `docs/paper.md:325` 明确写"Verified implementation" 指向 `paperTheory.greedySubmodularOptimization`，`bsaaCore` 除测试外无真实调用方。
影响：CI 绿灯给出的是"论文没有引用、生产没有使用的平行实现是对的"这个证明，对 Oliver 的"数学实现真实"标准而言是名实不符——门禁的名字承诺验证核心算法，实际验证的是错的那一半。
根因：`ADR-004` 裁决"paperTheory 为权威源"从未落地，`proofVerification.ts` 独立复刻验证逻辑而非委托 `paperTheory.ts` 内置的 `verifyValueIndexTheorem`/`verifySubmodularity`/`verifyApproximationRatio`。

**S1-2｜tie-break 分歧是活的行为差异，不是假设**
证据：`paperTheory.ts:236-239` 的 `greedySubmodularOptimization` 候选选择循环对 marginal gain 打平显式用 `id.localeCompare` 分支（`gain > bestGain + EPSILON || (|gain-bestGain| <= EPSILON && id.localeCompare(...) < 0)`）；`bsaaCore.ts:162` 的 `greedySubmodularSelection` 候选选择循环只有 `if (gain > bestGain + EPSILON)` 严格大于、无平局分支，打平结果依赖 `remaining`（`Map`）迭代顺序即原始候选数组顺序（本报告主循环逐行核验代码坐实，`02`§1、§4-1）。
**注意与本次综合审计的一处内部纠偏**：`04_layering.md` 曾提出这条判定"表述不准"，理由是 `bsaaCore.ts:40`（`byValueDesc`，用于 `valueIndexOrder`）与 `:100`（`findInsertIndex`）也用了 `id.localeCompare`。经主循环逐行复核，这一"纠偏"本身不成立——`byValueDesc`/`findInsertIndex` 只负责把**已经选中**的候选按 v 降序排入最终输出顺序（Theorem 3.1 的排序步骤），不参与贪心循环里"当前该挑哪个候选"这个决策；`bsaaCore.ts:155-177` 的候选选择循环里确实没有任何平局分支。因此"paperTheory 的候选选择环节有显式 tie-break、bsaaCore 没有"这一判定成立，`04` 的表述纠偏是误判，不采纳。
**04 发现的另一点是真实的叠加证据，予以采纳**：两处 `EPSILON` 常量本身相差三个数量级——`bsaaCore.ts:24`：`EPSILON = 1e-12`；`paperTheory.ts:75`：`EPSILON = 1e-9`。这意味着落在 `[1e-12, 1e-9]` 区间的 marginal gain 差异，两套实现对"是否算平局"的判定本身就不同（bsaaCore 视为不同值走严格大于比较，paperTheory 视为相等值走字典序），与"有没有平局分支"是两层独立的分歧点，同时存在、互相叠加，而非互相替代。
影响：同一批候选、同样 v/p，两套实现在 marginal gain 打平的边界情况下可能选出不同候选集合，且没有任何测试做跨实现比对。这直接命中 Oliver 举的例子："若 v1.5 要统一 tie-break 规则，必须记得改两处"——目前甚至没有"哪处是权威"的答案，且需要同时统一"打平判据"（EPSILON 量级）与"打平后选谁"（是否有 `id.localeCompare` 分支）两件事。

**S1-3｜"冲稳保基准"三份实现语义不同，威胁论文数字有效性**
证据：`bsaaCore.probabilityTierBaseline`（`bsaaCore.ts:333-358`）、`paperTheory.transparentBaselineSelection`（`paperTheory.ts:618-667`）、`bsaaBacktest.baselineReachSteadySafe`（`bsaaBacktest.ts:288-316`）是同一业务概念的三次独立实现，规则真的不一样（是否按 tier 排序、每桶是否限额 capacity/3、剩余名额怎么补，`02`§1、§4-2）。
影响：`docs/paper.md` §8.1 引用的"GSIO vs 冲稳保基准提升 21.4%"用的是特定一份实现；如果有人为修 edge case 改了其中一份，其余两份不会同步变化，论文正文引用的基准与实际跑图表用的基准可能悄悄不一致，且没有任何一致性测试能发现。

**S1-4｜gates:math / gates:alg 未接入 CI**
证据：`package.json:23` 定义了 `gates:math`、`gates:alg`，但 `.github/workflows/ci.yml`（全文 47 行）逐条核对其 `steps` 不包含两者（`03`§2-4、`05`§2，两份独立审计交叉确认）。
影响：Lean 形式化证明（`formal/` 目录 A1-A3/B2/B3 已零 sorry）与 DP-vs-贪心对拍验证（`alg_gates.mjs` 5000+3000 随机/对抗实例）目前只能靠人手动跑，代码演进后可能悄悄失效而无人察觉，跟主线质量门禁脱钩。

### 中等（S2）

**S2-1｜双核心重复：bsaaCore.ts 与 paperTheory.ts 平行实现同一套算法**
证据：`02`§1 函数对应表——`expectedUtility`/`evaluateSequence`、`valueIndexOrder`/`optimalOrderForSet`、`marginalGain`（两处）、`greedySubmodularSelection`/`greedySubmodularOptimization`、`bruteForceOptimal`（两处）全部逻辑等价但物理独立；`pathGain`（`bsaaCore.ts:309-314` vs `paperTheory.ts:578-583`）逐字重复。且这不是历史演化残留——两者在 `d1fff77`（初始提交）就同时诞生，中间 `0cf0468` 已示范过正确的收敛先例（`bsaaBacktest.ts` 改为委托 `paperTheory.ts`），但没有推广到 `bsaaCore.ts`/`proofVerification.ts`。
影响：维护成本翻倍，任何算法层调整（tie-break、性能优化）都要同步改两处，且没有交叉测试保证同步生效（S1-2/S1-3 是这条的具体表现）。
根因：`ADR-004` 决议"paperTheory 为权威源、bsaaCore 降级为薄壳"标注"Accepted — implementation in progress"，是已知未完成的技术债，但截至审计时点尚未落地。

**S2-2｜性能优化未传导到生产热路径**
证据：`bsaaCore.ts:112-128` 的 `incrementalSetUtility`（O(\|S\|) 有序插入）是唯一的性能优化点；`paperTheory.ts` 的 `marginalGain`/`setFunctionValue` 每次调用都重新排序+重算效用，无增量优化（`02`§1、§4-3）。真实黑龙江实例（N=1957，capacity 45）GSIO 耗时 2347ms，理论上可降到 O(n·N) 量级。
影响：可量化性能损失，且随生产数据规模增长会更明显（当前 `candidateProjection.ts` SQL `LIMIT 2000`）。

**S2-3｜概率校准：生产默认配置与论文复现路径不一致**
证据：`config/paper-sample.json` 的 `probabilityModel` 是手调常数（`offset=2500, scale=6500`，无拟合来源说明），且 `candidateProjection.ts:224-232` 对 `sigmoid` 分支的实现其实是线性 clamp（函数命名与实现不符）；论文数字用的是 `config/calibrated-probability-model.json` 的两参数 logistic 拟合（`01`§4）。直接跑 `npx tsx tools/generatePaperFigures.ts` 不带 `--probabilityModel` 参数会用回拍脑袋配置，产出数字不等于论文报告的数字。
影响：复现性缺口——仓库默认状态无法复现论文结果，需要知道隐藏的命令行参数。

**S2-4｜论文引用的 AUC 已知为构造性伪影，正文未加注**
证据：`config/calibrated-probability-model.json` 的 `realistic.auc=0.998`，`docs/paper.md:196` 引为校准质量支撑证据；而 `docs/research_directions_2026-07-15.md:55`（同一项目 2026-07-15 的研究结论）明确写"弃用 AUC（两个 AUC 皆构造伪影）"（`01`§4）。
影响：诚实性缺口——已知缺陷未同步进论文措辞，不是数字造假但读者会被误导。

**S2-5｜验证套件重复维护**
证据：`paperTheory.ts` 内置 4 个验证函数 + `proofVerification.ts` 独立实现 3 个几乎同名函数，各自维护 `permutations`/`combinations`/`allSubsets` 生成器；`formal/experiments/verify_dp_exact.mjs` 还有第四份几乎逐字相同的拷贝（`02`§1 附注、`03`§1.2）。
影响：任一生成器实现有 bug，另一处不会自动继承修复。

### 轻微（S3）

**S3-1**：`noUncheckedIndexedAccess: false`，87 处隐式下标访问未受类型系统保护，集中在 DP/组合枚举代码（`bsaaCore.ts:96,100,121,125,197,214`；`paperTheory.ts` 15+ 处；`bsaaBacktest.ts`/`tier.ts`/`proofVerification.ts` 多处，`05`§1）。
**S3-2**：`dp_vs_gsio_real.mjs:39` 用 `1e-15` tie-break epsilon，与其余 3 处验证脚本裸 `Math.max` 不一致；已评估为**良性**——不影响最优值，只影响 tie 时具体选中集合重构，是已知"近优平台期"现象的表现（`03`§4，P0 标记但结论良性）。
**S3-3**：`verify_dp_quota.mjs:29-31` 死代码残留（`+p[c]*0` 恒等于零，草稿推导痕迹未清理），数值上与 `alg_gates.mjs` 完全等价，非 bug（`03`§4）。
**S3-4**：同一 LCG 算法在 5 处文件独立复制粘贴（`bsaaBacktest.ts`/`paperTheory.ts`×2/`proofVerification.ts`/`probabilityCalibration.ts`），不影响确定性，违反 DRY（`05`§6）。
**S3-5**：文档层面对"双核心"事实的隐瞒——`bsaaCore.ts` 完全没有注释说明与 `paperTheory.ts` 的关系，命名相似（`greedySubmodularSelection` vs `greedySubmodularOptimization`）容易误认为调用关系（`05`§4）。
**S3-6**：无 property-based testing 库，论文附加机制（`transparentBaselineSelection`/`buildParametricParetoFrontier`）只靠手工固定场景测试覆盖（`05`§5）。
**S3-7**：子模性定理无 Lean 形式化，只有 TS 穷举验证（N≤8）——不在 `LEMMAS.md` 范围内的定理，非隐瞒，但论文 sketch 呈现方式可能让读者误以为与 Lean 定理同等级（`01`§3）。

---

## 3. 整改方案

| # | 缺陷 | 修法 | 工作量 | 风险 | 影响门禁/测试 | 触碰承重代码需 Oliver 拍板？ |
|---|---|---|---|---|---|---|
| S1-1 | CI 验证对象错位 | `proofVerification.ts` 改为委托 `paperTheory.ts` 内置验证函数（经适配器），或直接把 `verify:proofs` 改为调用 `paperTheory` 的验证套件；决定后同步更新 CI 步骤名以准确反映验证对象 | 小-中 | 低（测试逻辑不变，只换验证对象） | 需重跑 `verify:proofs`，74 个现有测试不受影响 | **是**——"改变 CI 验证范围"按 `docs/acceptance_gates_v1.md` L5 越权清单精神需问 Oliver |
| S1-2 | tie-break 分歧 | 统一到一套规则（建议 `id.localeCompare` 次级 key，因为 `paperTheory` 已用且更确定），两处同步改 | 小 | 中——会改变边界候选的具体选中结果（EPSILON 级），已提交的图表/backtest 数字可能漂移 | 需重跑 `generatePaperFigures.ts`，`bsaaCore.test.ts`/`paperTheory.test.ts` 里断言具体候选 id 的用例需同步更新 | **是**——这是数学/业务决定，不是纯技术重构 |
| S1-3 | 冲稳保基准三份实现 | 先裁决权威语义（是否按 tier 排序、每桶限额规则），再收敛为一份实现，其余两处改为委托 | 中 | 中——直接影响论文 Table 1 的对比基准数字，需重新生成图表 | 影响 `docs/paper.md`§8.1 引用数字，需重新审阅 | **是**——业务语义决定 |
| S1-4 | gates:math/gates:alg 未接入 CI | 在 `.github/workflows/ci.yml` 增加两步（`Proof verification` 前后均可） | 小 | 低（新增已存在、可独立运行的 npm script 调用） | 不影响现有 74 个测试；会让 CI 变慢（Lean `lake build` 耗时） | **是**——修改 CI 配置文件需用户确认（safety_guardrails：medium-risk 配置修改） |
| S2-1 | 双核心重复 | 方向：paperTheory 的算法函数内部投影为 `BsaaCandidate` 后委托 `bsaaCore`（`02`§5 已给出具体步骤和 `toPaperCandidate`/`orderFromPaperIds` 适配器模式） | 中-大 | 中——即使数学等价，EPSILON 级差异可能让已提交产物漂移，需全量重跑 `generatePaperFigures.ts` 并重新审阅 | 两个测试文件（124+189 行）签名不变应继续通过，但断言具体顺序的用例需同步 | **是**——先决于 S1-2/S1-3 的裁决，属于本次审计最大的一次性架构决定 |
| S2-2 | 性能未传导 | 随 S2-1 合并自动解决（`paperTheory` 委托 `bsaaCore` 后自然继承 `incrementalSetUtility`） | 并入 S2-1 | 并入 S2-1 | — | 并入 S2-1 |
| S2-3 | 校准复现性缺口 | `paper-sample.json` 默认 `probabilityModel` 指向 calibrated 模型，或至少在 README/文档标注"默认配置非论文复现路径" | 小 | 低 | 不影响测试；可能改变 `generatePaperFigures.ts` 不带参数时的默认输出 | 否——纯配置/文档修正，不改算法逻辑 |
| S2-4 | AUC 伪影未加注 | `docs/paper.md:196` 附加免责声明，引用 `research_directions_2026-07-15.md` 的伪影诊断 | 极小 | 无 | 无 | 否——纯文档 |
| S2-5 | 验证套件重复维护 | 随 S1-1 解决（委托后自然消除重复生成器） | 并入 S1-1 | 并入 S1-1 | — | 并入 S1-1 |
| S3-1 | noUncheckedIndexedAccess | 打开后逐一修复 87 处（多数需要显式非空断言或前置校验） | 中-大（87 处，非一次性小改） | 低-中——修复过程可能揭示真实的空数组边界 bug，也可能只是加断言噪音 | 不影响运行时行为（若修复正确），但改动面广，需全量测试通过 | 是——工作量较大，建议 Oliver 决定优先级和时间窗口 |
| S3-2/S3-3 | epsilon 不一致/死代码 | 随验证脚本层合并（3.2 节方案）一并清理：统一到共享模块 `formal/experiments/lib/dpShared.mjs`，暴力枚举保持独立 | 小 | 低 | 不影响生产代码 | 否——纯验证脚本内部整理 |
| S3-4 | LCG 复制 5 处 | 抽取共享 util（如 `src/domain/seededRandom.ts` 或 `formal/experiments/lib/`） | 小 | 低 | 无 | 否 |
| S3-5 | 文档未反映架构现状 | 在 `bsaaCore.ts` 头部加注释说明与 `paperTheory.ts` 的关系（哪个是权威源，当前状态） | 极小 | 无 | 无 | 否——纯文档，但内容依赖 S2-1 的裁决结果 |
| S3-6 | 无 PBT | 引入 `fast-check`，为未被 Lean 覆盖的机制补充随机化测试 | 中 | 低 | 增加测试覆盖，不改变现有测试 | 否 |
| S3-7 | 子模性无 Lean 证明 | 登记为已知范围外事项，论文措辞澄清子模性证明层级（sketch vs 机器验证） | 极小 | 无 | 无 | 否——文档措辞 |

---

## 4. 优先级矩阵

**背景说明**：7/22 冻结线（`theory-gates` 备忘）针对的是**数据轨**（山东位次预测），理论轨（本审计对象：BSAA 论文算法核心）与数据轨仅在未来"组合实验"阶段（校准 p + 已验证求解器）汇合。因此本审计发现的缺陷**不直接卡在 7/22 冻结门禁上**，但如果理论轨要在冻结后接入组合实验，S1 级问题必须先解决——否则"已验证求解器"这个前提本身是假的。

**P0（阻塞/正确性风险，建议在任何论文定稿或组合实验接入前处理）**：
- S1-1 CI 验证对象错位（低风险、小工作量，无理由拖延）
- S1-4 gates:math/gates:alg 接入 CI（低风险、小工作量，需 Oliver 批准改 CI 配置）
- S1-2 tie-break 权威规则裁决（需 Oliver 先拍板语义，再执行修复）

**P1（真实性 + 解耦，影响论文措辞诚实性与长期可维护性，建议在双核心真正合并前处理，可与 7/22 冻结线并行推进，不阻塞冻结）**：
- S1-3 冲稳保基准语义裁决
- S2-1/S2-2 双核心合并（需先有 S1-2/S1-3 的裁决结果作为前提，是本次审计最大的一次性工作量）
- S2-3 校准复现性缺口修正
- S2-4 AUC 伪影加注

**P2（规范锦上添花，可缓，不影响当前正确性或论文诚实性）**：
- S3-1 noUncheckedIndexedAccess（工作量大，建议单独排期而非塞进本轮）
- S3-2/S3-3/S3-4 验证脚本层整理与 LCG 去重
- S3-5 文档补注
- S3-6 PBT 引入
- S3-7 子模性证明层级措辞澄清

---

## 5. 不改的理由（看似问题，实为合理设计）

- **暴力枚举（`bruteForce`/`bfQuota`）在验证脚本各处独立实现**——这是唯一提供真实交叉验证价值的部分（DP 与暴力枚举是算法路径完全不同的独立 oracle），`03`§2-2/§3-2 已论证：合并这部分会摧毁其作为独立验证的意义，不应并入"DP 共享模块"重构。
- **`verifyValueIndexTheorem`/`verifySubmodularity` 系列 N≤8 的规模上限**——不是设计缺陷，是组合爆炸的性能约束；更高层 `alg_gates.mjs` 已用 5000+3000 随机/对抗实例覆盖正确性验证，规模瓶颈已在更高层被正确方式解决（`01`§5）。
- **子模性定理没有 Lean 形式化**——`formal/LEMMAS.md` 的七条定理清单本就不包含子模性，这是范围外事项，不是"声称精确却验证不足"（`01`§3）。
- **`BsaaCandidate` 与 `PaperCandidate` 两种类型并存**——这是"投影前/投影后"的合理层次差异（原始多维匹配度向量 vs 投影后的标量 value），不是无意义的重复类型（`02`§2）。真正的重复是排在它们之下的那层纯算法代码，不是这两个类型本身。
- **概率校准的经验生存函数 + 梯度下降拟合**——是真实优化过程（收敛判据、损失记录全程可查），不是"永远返回固定值"的占位函数，即便简化于设计文档 §4 描述的"顺序统计量+结构化异方差"目标，这是能力缺口而非虚假宣称（文档自己承认未完成）。

---

## 6. 待 Oliver 裁决的开放问题

1. **双核心合并方向**：`ADR-004` 已裁决"paperTheory 为权威源、bsaaCore 降级为薄壳"，但代码现状相反（生产入口走 bsaaCore）。是否维持 ADR-004 方向，还是反过来以 bsaaCore 为地基（`02`§5 给出的备选方案，理由是类型更简单+已有性能优化）？
2. **tie-break 权威规则**：`id.localeCompare` 次级 key，还是其他规则？这个决定会让某一侧现有输出发生 EPSILON 级变化，进而影响已发表的图表数字。
3. **"冲稳保基准"权威语义**：三份实现选哪个，还是重新设计一份？直接影响论文 Table 1 的对比数字有效性。
4. **精确 DP 是否要产品化进 `src/`**：当前只在验证脚本层，配额约束场景（"冲稳保各至少 N 个"）下贪心不保证精确。如果产品需要这类硬约束功能，现在是决定是否投入的时机；否则建议维持现状，只在文档中明确记录这个能力缺口。
5. **`noUncheckedIndexedAccess` 是否打开**：87 处修复量，是否值得在当前阶段做全量修复，还是分批处理？
6. **`gates:math`/`gates:alg` 是否接入 CI**：改动 CI 配置文件，按 git_safety 规范需明确批准。
7. **`verify:proofs` 门禁改验证哪套实现**：委托给合并后的唯一核心，还是维持现状但改名以准确反映验证范围？
8. **论文文本层面的两处诚实性缺口**（不在本审计整改范围，只登记待裁决）：AUC=0.998 构造性伪影是否需要在 `docs/paper.md` 正文加注；`docs/acceptance_gates_v1.md:47-48` 的"上线优化器只用 DP"表述是否需要更新为准确反映当前设计阶段（而非已落地状态）。
