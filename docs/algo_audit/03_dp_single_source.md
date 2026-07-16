# 03. DP/递推的权威单一源审计

**审计对象**：team-lead grep 命中的 8 处 "survival-normalization DP recurrence"
`g(i,k) = max(g(i+1,k), p·v + (1-p)·g(i+1,k-1))` 疑似实现。

**基线文档**：`formal/LEMMAS.md` A3（DP 精确性定理）、`docs/research_directions_2026-07-15.md` §2（已验证算法事实）。

**审计原则**：所有判断均标注 file:line 证据；区分"真实缺陷"与"纯风格差异"。

---

## 1. 8 处逐一核查 + 一致性对照表

### 1.0 结论先行

8 处 grep 命中中，**只有 4 处真正包含 DP 递推**，另外 4 处是 grep 假阳性（不同功能的函数，因关键词碰撞被匹配）。

| # | 文件 | 是否含 DP 递推 | 说明 |
|---|------|--------------|------|
| 1 | `src/infrastructure/probabilityCalibration.ts` | ❌ 假阳性 | 概率**校准**（逻辑回归拟合），非序贯**优化** |
| 2 | `src/domain/bsaaCore.ts` | ❌ 假阳性 | 只有 GSIO 贪心 + 暴力枚举，无 `Math.max(g...)` 递推 |
| 3 | `src/domain/bsaaBacktest.ts` | ❌ 假阳性 | 只有直线式 Horner 求值（`buildPlan`），委托贪心/暴力给 paperTheory |
| 4 | `src/domain/paperTheory.ts` | ❌ 假阳性 | 只有 GSIO 贪心（"Algorithm 1"）+ 暴力枚举 |
| 5 | `formal/experiments/dp_vs_gsio_real.mjs` | ✅ 真实 DP | 真实数据验证脚本，含重构选中集逻辑 |
| 6 | `formal/experiments/verify_dp_quota.mjs` | ✅ 真实 DP（配额变体） | |
| 7 | `formal/experiments/verify_dp_exact.mjs` | ✅ 真实 DP | |
| 8 | `pipeline/gates/alg_gates.mjs` | ✅ 真实 DP + 配额 DP | CI 门禁脚本，含两种 DP |

### 1.1 假阳性逐一核实

**`src/infrastructure/probabilityCalibration.ts`**（552 行）
- 文件头注释（1-15 行）明确说明这是"由历史门槛残差估计生存函数 S(rankDelta)，再用两参数逻辑回归拟合 P(admit|rankDelta)"，与序贯选择问题无关。
- grep 命中的 `(1-p)`-类模式实际是梯度下降的对数损失导数，例如第 316 行：
  ```ts
  const dLdz = 2 * error * (outputRange[1] - outputRange[0]) * pRaw * (1 - pRaw);
  ```
- 对全文件搜索 `DP|dp[A-Z]|Dp\b|quota|Quota` 零命中。
- **结论**：这是 team-lead 任务描述中特别提醒要核查的"grep 误配"案例，确认为真——概率校准函数与序贯优化 DP 是完全不同的数学对象，不应计入"8 处递推"。

**`src/domain/bsaaCore.ts`**（358 行）
- 全文件包含：`expectedUtility`（对给定顺序的直线式生存加权求值，非 DP）、`valueIndexOrder`、`evaluateSetFunction`、`marginalGain`、`incrementalSetUtility`、`greedySubmodularSelection`（GSIO 贪心，139-186 行）、`bruteForceOptimal`（227-266 行）、`probabilityTierBaseline`（冲稳保基准，333-358 行）。
- 搜索 `DP|dp[A-Z]|Dp\b|quota|Quota` 零命中；搜索 `Math.max(g\|g\[i` 零命中。
- **结论**：不含 DP 递推，也不含配额约束逻辑。

**`src/domain/bsaaBacktest.ts`**（546 行）
- 288-316 行：`baselineReachSteadySafe`——第三种冲稳保基准实现（与 bsaaCore/paperTheory 的另外两种语义不同）。
- 318-341 行：`buildPlan(order)`——单次正向循环的直线式求值：
  ```ts
  function buildPlan(order: readonly BsaaScoredCandidate[]): BsaaPlan {
    let survival = 1;
    ...
    for (const c of order) {
      const contribution = c.p * survival;
      pathUtility += c.v * contribution;
      ...
      survival *= 1 - c.p;
    }
    ...
  }
  ```
  这是对**给定固定顺序**的评估，没有 `Math.max` 分支决策，不是 DP。
- 280-286 行、350-361 行、363-379 行：全部委托给 `paperTheory` 的对应函数（GSIO 贪心、暴力枚举、Value-Index/submodularity 验证）。
- 搜索 `Math.max(g\|g\[i\|g(i\|dp\|DP\|Quota\|quota` 零命中。
- **结论**：不含 DP 递推，是纯粹的委托层 + 第三种冲稳保基准。

**`src/domain/paperTheory.ts`**（767 行）
- 包含 `setFunctionValue`、`marginalGain`、`greedySubmodularOptimization`（注释明确写"GSIO 贪心算法（Algorithm 1）。时间复杂度 O(n²·N)"，208-254 行）、`bruteForceOptimal`（257-317+ 行）。
- 搜索 `DP|dp[A-Z]|Dp\b|quota|Quota` 零命中。
- **结论**：不含 DP 递推，只有贪心与暴力枚举。

**关键发现**：这 4 个文件共同确认——**生产代码 `src/*` 中不存在任何 DP 递推实现**，也不存在配额约束（`≥q` 硬约束）选择逻辑。生产侧唯一的序贯优化算法是 GSIO 贪心（在配额约束场景下并非保证精确，见 `docs/research_directions_2026-07-15.md` §2-3/§2-4）。

### 1.2 真实 DP 实现逐一对照

**`pipeline/gates/alg_gates.mjs`**（541 行）—— `dpExact`（73-86 行）：
```js
function dpExact(N, n, v, p) {
  const idx = [...Array(N).keys()].sort((a, b) => v[b] - v[a]);
  const cap = Math.min(n, N);
  const g = Array.from({ length: N + 1 }, () => new Float64Array(cap + 1));
  for (let i = N - 1; i >= 0; i--) {
    const c = idx[i];
    for (let k = 0; k <= cap; k++) {
      const skip = g[i + 1][k];
      const take = k >= 1 ? p[c] * v[c] + (1 - p[c]) * g[i + 1][k - 1] : -Infinity;
      g[i][k] = Math.max(skip, take);
    }
  }
  return { value: g[0][cap], g };
}
```
`dpQuota`（100-128 行，配额变体，加状态维 `s`，`NEG=-1e18` 不可行哨兵）。

**`formal/experiments/verify_dp_exact.mjs`**（119 行）—— `dpExact`（39-53 行）：
```js
function dpExact(N, n, v, p) {
  const idx = [...Array(N).keys()].sort((a, b) => v[b] - v[a]);
  const cap = Math.min(n, N);
  const g = Array.from({ length: N + 1 }, () => new Float64Array(cap + 1));
  for (let i = N - 1; i >= 0; i--) {
    const c = idx[i];
    for (let k = 0; k <= cap; k++) {
      const skip = g[i + 1][k];
      const take = k >= 1 ? p[c] * v[c] + (1 - p[c]) * g[i + 1][k - 1] : -Infinity;
      g[i][k] = Math.max(skip, take);
    }
  }
  return g[0][cap];
}
```
与 `alg_gates.mjs` 的 `dpExact` **逐字符一致**（唯一区别：返回 `g[0][cap]` 标量而非 `{value, g}` 对象，属于调用接口差异，非算法差异）。

**`formal/experiments/verify_dp_quota.mjs`**（50 行）—— `dpQuota`（14-39 行）：状态结构（`(k,s)`）、`NEG` 哨兵、base case 与 `alg_gates.mjs` 的 `dpQuota` 一致，但内部有一处死代码/注释残留（见第 4 节 P0-b）。

**`formal/experiments/dp_vs_gsio_real.mjs`**（56 行）—— 内联 DP（33-42 行）：
```js
let next = new Float64Array(cap + 1);
const take = Array.from({ length: N }, () => new Uint8Array(cap + 1));
for (let i = N - 1; i >= 0; i--) {
  const cur = new Float64Array(cap + 1);
  const { p, v } = scored[i];
  for (let k = 0; k <= cap; k++) {
    const skip = next[k];
    const tk = k >= 1 ? p * v + (1 - p) * next[k - 1] : -Infinity;
    if (tk > skip + 1e-15) { cur[k] = tk; take[i][k] = 1; } else cur[k] = skip;
  }
  next = cur;
}
```
排序（26 行）：`scored.sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));`——**带次级 tie-break key**，与其余 3 处的裸 `sort((a,b)=>v[b]-v[a])` 不同（见第 4 节 P0-a）。

### 1.3 一致性对照表

| 维度 | alg_gates.dpExact | verify_dp_exact.dpExact | verify_dp_quota.dpQuota | dp_vs_gsio_real 内联DP |
|------|------|------|------|------|
| 核心递推公式 | `max(skip, p·v+(1-p)·g)` | 同左（逐字符一致） | 同结构（加状态 s） | `max(skip, p·v+(1-p)·next)` 同结构 |
| 排序键 | `v` 降序，无次级 key | 同左 | 同左 | `v` 降序 **+ `id.localeCompare` 次级 key** |
| k=0 边界 | `take=-Infinity`（k<1 时不可取） | 同左 | 同左（另加 s 维） | 同左 |
| i=N 边界 | `g[N][*]=0`（Float64Array 默认初值） | 同左 | `next[k][q]=0` 基线 | `next` 初始为全 0 |
| 生存归一化 | 隐含于 `(1-p)` 项 | 同左 | 同左 | 同左 |
| tie 判定阈值 | 无（裸 `Math.max`） | 无（裸 `Math.max`） | 无（裸 `Math.max`，走 if/bestv） | **`> skip + 1e-15`** |
| 是否重构选中集 | 否（`dpQuotaReconstruct` 是独立函数） | 否 | 否 | 是（本函数内联完成） |
| 配额/硬约束支持 | 有（`dpQuota`） | 无 | 有 | 无 |

**回答 team-lead 的具体问题**："probabilityCalibration.ts 中 grep 命中的是否是同一个优化 DP，还是被 grep 误配的不同功能函数" —— **确认是误配**。该文件实现的是历史门槛残差的生存函数估计与逻辑回归校准，与序贯选择 DP 在数学对象、输入输出、使用场景上均无关联，只是变量命名/表达式形态（如 `(1-p)`、`p*(1-p)`）恰好被关键词 grep 捕获。

---

## 2. 生产代码 vs 验证脚本判断

### 2.1 核心事实

生产代码 `src/*` **完全不包含**任何 DP 递推实现（1.1 节已逐一确认 4 个文件）。生产侧唯一的序贯优化路径是 GSIO 贪心（`bsaaCore.greedySubmodularSelection` / `paperTheory.greedySubmodularOptimization`），且 GSIO 贪心在配额约束场景下**不保证精确**（`docs/research_directions_2026-07-15.md` §2-3/§2-4 已记录）。

这意味着：论文引用的 DP 精确性理论结果（`formal/LEMMAS.md` A3，以及 `research_directions.md` §2 中"DP 比 GSIO 快 2000 倍且精确"的实证结论）**目前只存在于验证脚本层，从未被产品化进入 `src/`**。

同时，生产代码也不存在任何配额约束（`≥q` 硬约束）选择功能——搜索 `src/*.ts` 中的 quota/冲稳保/hard constraint 相关模式，只找到 `probabilityTierBaseline` / `transparentBaselineSelection` / `baselineReachSteadySafe` 三种基于分桶阈值的**启发式**基准，均不是通过状态增维的 DP 强制满足硬约束。

### 2.2 判断："再实现"是良性交叉验证，还是危险重复？

team-lead 的问题框架是：验证脚本重新实现生产递推，是"独立复现避免自证"的合法交叉验证，还是"两边共享同一个潜在 bug"的危险重复。

**但审计发现改变了这个问题的前提**：由于生产代码里根本没有 DP 递推可供"复现"，4 处验证脚本的 DP 实现之间，事实上是在**互相验证彼此**，而不是在验证任何生产实现。

这产生两层含义：

1. **相对暴力枚举（`bruteForce`/`bfQuota`）而言，DP 与暴力枚举是真正独立的交叉验证**——两者算法路径完全不同（暴力枚举穷举组合+排列，DP 走状态转移），`alg_gates.mjs` 的 `runAlg1` 用暴力枚举核验 DP 达 8000+ 组随机/对抗实例零失配，这是有效的正确性证据。

2. **4 处 DP 实现之间的"一致性"不构成独立证据**——`alg_gates.dpExact` 与 `verify_dp_exact.dpExact` 逐字符相同（1.2 节已确认），这不是"两次独立推导得出相同结论"，而更接近"复制粘贴后各自维护"。如果这段递推逻辑本身有一个共同的潜在错误（例如未来某次需求变更引入的浮点比较、越界条件等），四处会**同步出错且互相"验证通过"**，形成虚假的信心来源。当前审计没有发现这类共同缺陷（核心递推公式确实正确，已通过暴力枚举验证），但这是一个结构性风险，不依赖于当前是否已经犯错。

### 2.3 这是产品就绪度问题还是合理的"验证先行"？

站在"验证脚本先于产品化"的角度看，这本身并非坏实践——很多团队会先用验证脚本证明算法可行，再决定是否产品化。但当前状态有两个值得关注的具体问题：

- **论文对外声称的核心优势（DP 精确 + 快 2000 倍）没有对应的生产实现**。如果产品未来要在配额约束场景（"冲稳保各至少 N 个"）下真正获得 DP 保证的精确解，现在的三种启发式基准都不满足这个要求——需要从零把配额 DP 产品化，而不是简单地把验证脚本挪进 `src/`（验证脚本没有考虑生产环境的输入校验、错误处理、类型对齐等工程要求）。
- **CI 门禁 `gates:alg` 未接入自动化流水线**（见 2.4 节），这意味着即便验证脚本本身写得对，也没有机制保证它在代码变更后持续被执行验证。

### 2.4 新发现：CI 未接入 gates:alg（新证据，本轮确认）

`package.json:23` 定义了 `"gates:alg": "node pipeline/gates/alg_gates.mjs"`，但读取 `.github/workflows/ci.yml`（唯一存在的工作流文件，46 行）逐条核对其 `steps`：

```yaml
steps:
  - Checkout
  - Setup Node.js
  - Install dependencies (npm ci)
  - Apply database migrations
  - Type check
  - Lint
  - Check formatting
  - Architecture guard (verify:architecture)
  - Test (npm test)
  - Proof verification (verify:proofs)
```

**`gates:alg` / `gates:math` 均不在这个列表中**——`npm run gates:alg` 只能被手动调用，不会在 push/PR 时自动执行。

这与 `02_dual_core_dry.md` 已记录的"`verify:proofs` 验证的是未被实际使用的 `bsaaCore.*` 而非 `paperTheory.*`"是同一类风险模式的第二个实例：**"验证脚本存在"不等于"验证脚本在把关"**。当前审计新确认的这一条（`gates:alg` 完全没有被任何 CI 触发路径覆盖，连"验证错了对象"的问题都还没到——是"根本没被自动验证"）比 `verify:proofs` 的问题更基础。

---

## 3. 单一源模块建议

### 3.1 两个不同层面的"单一源"，不应混为一谈

team-lead 的任务描述把这个问题框定为"该不该建 `src/domain/dpCore.ts`"，但审计发现表明这里实际上是**两个独立决策**：

**决策 A：验证脚本层内部去重**（4 处 DP 实现互相重复，2.2 节已论证这是结构性风险而非独立交叉验证）
**决策 B：是否需要把 DP 产品化进 `src/`**（当前完全没有，2.1/2.3 节已论证生产侧存在配额约束场景下的精确性缺口）

这两个决策的紧迫程度和风险性质不同，建议分开处理，不要用一次"提取 dpCore.ts"的重构笼统解决。

### 3.2 决策 A 的建议：合并验证脚本侧的 4 处 DP 为一个共享模块

**建议**：新建 `formal/experiments/lib/dpShared.mjs`（或类似路径，遵循 `formal/experiments/` 现有目录习惯），导出 `dpExact(N,n,v,p)` 与 `dpQuota(N,n,q,v,p)` 两个函数，供 `verify_dp_exact.mjs`、`verify_dp_quota.mjs`、`dp_vs_gsio_real.mjs`、`alg_gates.mjs` 统一 import。

**理由**：
- `alg_gates.dpExact` 与 `verify_dp_exact.dpExact` 已经逐字符相同，合并没有任何语义损失，纯粹消除维护两份副本的风险（2.2 节已论证的"同步犯错"风险）。
- `verify_dp_quota.mjs` 与 `alg_gates.mjs` 的 `dpQuota` 结构一致但有细节差异（4 节 P0-b 的死代码），合并时应以 `alg_gates.mjs` 的更干净版本为准。
- `dp_vs_gsio_real.mjs` 的内联 DP 因为需要在同一循环内做选中集重构（`take[i][k]` 追踪），不能直接套用返回标量/表格的 `dpExact`；但可以让共享模块的 `dpExact` 始终返回 `{value, g}`（`alg_gates.mjs` 已经这样做），由调用方基于 `g` 表自行重构选中集（`alg_gates.mjs` 的 `dpQuotaReconstruct` 已经是这种模式，可以补一个 `dpExactReconstruct` 类比函数纳入共享模块），从而把 1e-15 epsilon 决策规则也统一到一处，而不是让 `dp_vs_gsio_real.mjs` 自己维护一份不同的判定逻辑。
- **必须保留 `bruteForce`/`bfQuota`（暴力枚举）作为独立实现，不参与合并**——这是唯一提供真实交叉验证价值的部分（2.2 节已论证），合并会摧毁其作为独立oracle的价值。

### 3.3 决策 B 的建议：暂不提取生产 `dpCore.ts`，但需明确记录这个缺口

**不建议现在就在 `src/domain/` 下新建 `dpCore.ts`**，理由：
- 当前没有任何产品需求驱动这个模块的存在——`src/*` 里没有调用点会用到它，提取一个无人调用的模块是过早抽象。
- 验证脚本（`formal/experiments/*.mjs`）用的是宽松的 JS 脚本环境（无类型检查、无生产环境错误处理约定），如果直接把这些实现"提升"成 `src/domain/dpCore.ts`，还需要补充 TypeScript 类型、边界输入校验、与 `bsaaCore.ts`/`paperTheory.ts` 现有的领域类型（如 `BsaaScoredCandidate`）对齐——这是一次完整的工程投入，不是简单文件移动。

**但建议做的是**：在 `docs/research_directions_2026-07-15.md` 或等价的路线图文档中，明确记录"配额约束场景下的精确解（DP）尚未产品化，当前生产侧的冲稳保基准是启发式、非精确"这一事实，避免论文/文档对外表述的精确性优势被误认为已经体现在产品行为中。如果/当产品需要"保证至少 N 个安全档"这类硬约束功能，此时才是提取 `dpCore.ts` 的合适时机，直接以决策 A 整理后的共享验证模块为起点转正。

### 3.4 CI 接入建议（伴随决策 A）

建议将 `gates:alg`（以及 `gates:math`，同样未接入 CI）加入 `.github/workflows/ci.yml` 的 `steps`，作为 `Proof verification` 步骤之后（或之前）的一步。这项改动风险低（只是新增一个已存在、可独立运行的 npm script 调用），但需要用户确认后才实施，因为这属于修改 CI 配置文件，超出本审计"只读评估"的授权范围。

---

## 4. P0 级分歧发现

### P0-a：`dp_vs_gsio_real.mjs` 的 1e-15 tie-break epsilon，与其余 3 处的裸 `Math.max` 不一致

**位置**：`formal/experiments/dp_vs_gsio_real.mjs:39`
```js
if (tk > skip + 1e-15) { cur[k] = tk; take[i][k] = 1; } else cur[k] = skip;
```
对比 `formal/experiments/verify_dp_exact.mjs:82` 与 `pipeline/gates/alg_gates.mjs:82`：
```js
g[i][k] = Math.max(skip, take);
```

**性质**：这是本次审计中唯一一处触及 team-lead 明确要求核查的"1e-15 阈值 tie-handling"的真实分歧。

**根因**：`dp_vs_gsio_real.mjs` 需要在同一次 DP 扫描内追踪"选还是不选"以重构具体选中集（`take[i][k]`），因此需要一个决策规则；而 `verify_dp_exact.mjs`/`alg_gates.mjs` 的 `dpExact` 只返回最优值本身（`g[0][cap]`），`Math.max` 不需要区分"选了哪个"，因为 `Math.max(a,a)=a` 在数学上无差别。

**后果评估**：
- 对**最优值** `g[0][cap]` / `next[cap]` 本身没有影响——无论 tie 时选哪一支，取到的最大值相同。
- 对**重构出的选中集**（`chosen` 数组）有影响——在数值几乎打平（差距 < 1e-15）时，`dp_vs_gsio_real.mjs` 会倾向于保留"skip"分支（因为条件是 `tk > skip + 1e-15` 才切换到 take，非严格大于皆算 skip），这与 `verify_dp_exact.mjs` 里 `Math.max` 在完全相等时 JS 语义上仍返回第一个参数（`skip`）方向一致，但阈值宽度不同（严格相等 vs 相差小于 1e-15 都算相等）。
- 这与 `docs/research_directions_2026-07-15.md` §2-5 已经记录的实证发现吻合并可以互相解释：真实数据实例中"DP 与 GSIO 解集仅重叠 26/45，但效用同至 9 位小数"——这正是"存在大量近优/精确并列的候选，选择哪一个进最终集合是退化自由度"的表现，1e-15 阈值只是这个已知平台期现象在实现层面的一个具体表现，不是新的独立错误来源。
- **结论：性质上确认为分歧，但风险等级评估为"良性"（benign）**——不影响任何已发表的数值结论（论文引用的是最优值，不是具体选中集合的逐一取值）。仍按 team-lead 协议要求列为 P0 级发现（因为涉及"正确性相关的 tie-handling"），但附带此风险评估结论。

**建议修复方向**（不在本审计执行范围内，仅供参考）：若纳入 3.2 节的共享模块重构，应统一到"返回 `{value, g}`，由独立的 reconstruct 函数负责选中集判定"的模式（`alg_gates.mjs` 已示范此模式），并把 1e-15 阈值集中定义一次（例如导出为 `TIE_EPSILON` 常量），避免各脚本各自决定阈值大小。

### P0-b（性质澄清为风格问题，非数值分歧）：`verify_dp_quota.mjs` 死代码残留

**位置**：`formal/experiments/verify_dp_quota.mjs:29-31`
```js
if(cont>NEG/2){ const tk=p[c]*v[c]+(1-p[c])*cont + p[c]*0; // careful: absorption means tail contributes only via survival
  // Actually utility decomposition: take -> p*v + (1-p)*g(tail); but constraint counting must be on CHOSEN set regardless of absorption.
  if(tk>bestv) bestv=tk;
}
```
对比 `pipeline/gates/alg_gates.mjs:117`：
```js
const tk = p[c] * v[c] + (1 - p[c]) * cont;
```

**分析**：`+ p[c]*0` 在数值上恒等于加零，不改变任何计算结果——`verify_dp_quota.mjs` 与 `alg_gates.mjs` 在数值行为上**完全等价**，这不是正确性分歧。判断为开发过程中的自我校验草稿注释遗留（作者在验证"吸收态下尾部只通过生存概率贡献"这一性质时留下的推导痕迹），未清理。

**风险**：不是当前 bug，但存在"未来维护者误读注释、误把 `+p[c]*0` 改成非零项"的可维护性风险。建议在 3.2 节的合并中一并清除。

### 次要发现（低优先级，供记录）：排序次级 tie-break key 不一致

`dp_vs_gsio_real.mjs:26` 使用 `scored.sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));`（带次级 key），其余 3 处均为裸 `sort((a,b)=>v[b]-v[a])`（无次级 key，排序结果依赖 JS 引擎对相等元素的排序稳定性）。

根据 `formal/LEMMAS.md` A2（Value-Index 定理，v 降序排列的最优值与联合分布无关），v 相等时次级排序顺序**不影响最优值**，只可能影响 tie 情况下的具体选中集/顺序展示。判定为低优先级，不要求立即修复，但若纳入 3.2 节共享模块重构，建议统一加上次级 key（如 `id.localeCompare`）以保证跨脚本行为可复现、可比对。
