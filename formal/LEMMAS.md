# BSAA × 不确定性理论 混合模型 — Lean 4 形式化规格 (v1, 2026-07-15)

目标：为"录取端=概率（频率数据），价值端=不确定变量（专家信度）"的混合志愿模型，
形式化证明其核心引理链。**全部限定在有限支撑上，纯代数（任意 LinearOrderedField 或 ℚ），
不使用实分析/测度论**，以保证 Lean 4 可行性。

约定：候选集 `Fin N`；值 `v : Fin N → K`（`0 ≤ v`）；概率 `p : Fin N → K`（`0 ≤ p i ≤ 1`）。
方案 = 无重复列表 `x : List (Fin N)`。效用
`U(x) = Σ_k v(x_k) · p(x_k) · Π_{j<k} (1 - p(x_j))`。

## Part A — 确定性核

**A1（首次成功分布）** 定义有限乘积概率空间 Ω = (Fin N → Bool) 带独立 Bernoulli(p_i) 权重
`w(ω) = Π_i (if ω i then p i else 1 - p i)`。定义 `firstAdmitted x ω : Option (Fin N)` 为 x 中第一个
被 ω 录取的元素。证明：
(a) `Σ_ω w ω = 1`；
(b) `Pr[firstAdmitted x ω = some (x k)] = p (x k) · Π_{j<k} (1 - p (x j))`；
(c) `U(x) = Σ_ω w ω · payoff x ω`，其中 `payoff x ω = v c`（若 firstAdmitted = some c）否则 0。

**A2（逐点排序定理，distribution-free Value-Index）** 对任意固定 ω 与底集相同的两个列表：
(a) `payoff x ω ≤ maxOver (S ∩ admitted ω) v`（空集时 = 0）；
(b) 若 x 按 v 降序，则取等。
推论（关键）：对**任意** ω 上的权重分布（不要求独立、不要求乘积形式），
v 降序排列在同底集的所有排列中最大化期望 payoff。

**A3（DP 精确性）** 设全体候选按 v 降序排成列表 L。定义
`g : ℕ → ℕ → K`，`g i k = 0`（i ≥ N 或 k = 0），否则
`g i k = max (g (i+1) k) (p (L i) * v (L i) + (1 - p (L i)) * g (i+1) (k-1))`。
证明：`g 0 n = max { U(S 按 v 降序) : S ⊆ 候选, |S| ≤ n }`。
（对 i 逆向归纳；需要引理：v 降序前缀下 U 的 Horner 分解
`U(c :: rest) = p c * v c + (1 - p c) * U rest`。）

**A4（Fréchet 安全界，选做）** 对任意有限联合分布（边缘为 p，不要求独立）：
(a) `Pr[至少一个录取] ≥ max_{j∈S} p j`（单调性一行）；
(b) 可达性：构造共单调耦合（单一均匀公共因子 U，录取 j ⟺ U ≤ p j 的有限栅格版）使 (a) 取等。

## Part B — 不确定性侧（Liu 公理，有限版）

**B0（结构）** `structure UncertainSpace (Γ : Type) [Fintype Γ] (K)` 携带
`M : Finset Γ → K` 满足：`M univ = 1`；`M ∅ = 0`；对偶 `M A + M Aᶜ = 1`；
单调 `A ⊆ B → M A ≤ M B`；次可加 `M (A ∪ B) ≤ M A + M B`。
（B5 之前不需要乘积公理。）

**B1（有限 Choquet 期望）** 对 `τ : Γ → K`，`0 ≤ τ`，取值 `t₁ > t₂ > … > t_r ≥ 0`：
`E[τ] := Σ_i (t_i - t_{i+1}) · M {γ : τ γ ≥ t_i}`（约定 t_{r+1} = 0）。
证明：(a) `E[const c] = c`；(b) `E[a • τ] = a * E[τ]`（a ≥ 0）；(c) 单调：`τ ≤ σ → E[τ] ≤ E[σ]`。

**B2（混合归约主引理 ★）** 设 (Ω, w) 为有限概率空间，`sel : Ω → Option (Fin N)`，
每个候选的价值为不确定变量 `V : Fin N → Γ → K`（≥0，有限支撑）。
定义混合支付 `Y ω γ = V c γ`（若 sel ω = some c）否则 0，
以及 chance 期望 `E_ch[Y] := Σ_ω w ω · E[Y ω ·]`。证明：
`E_ch[Y] = Σ_c Pr[sel = some c] · E[V c]`。
**注意：不需要 V c 之间的任何独立性假设**（每个 ω 只有单个不确定变量兑付，
证明是按 sel 取值划分 Ω 的有限重排）。

**B3（优化转移）** 组合 A1+A2+A3+B2：令 `v̂ c := E[V c]`。则
(a) 方案 x 的 chance 期望 = 确定性 `U(x)` 取 `v = v̂`；
(b) chance 期望最优的 (S, σ) = 确定性 BSAA 在 v̂ 下的最优，
排序按 v̂ 降序、选择由 A3 的 DP 精确给出。

**B4（共单调可加性，选做但重要）** 若 `τ σ : Γ → K` 共单调
（`∀ γ γ', (τ γ - τ γ') * (σ γ - σ γ') ≥ 0`），则 `E[τ + σ] = E[τ] + E[σ]`
对任意满足 B0 的 M 成立（有限 Choquet 的经典共单调可加性）。
用途：多原型线性价值 `V c = Σ_m π_m · U_{c,m}`，专家分共单调时线性折叠仍成立。

**B5（独立线性性，stretch）** 在带乘积公理的乘积不确定空间上，
独立 τ, σ 且 a,b ≥ 0 ⟹ `E[a•τ + b•σ] = a E[τ] + b E[σ]`。（可延后。）

## 验收标准
- `lake build` 通过，A1–A3、B0–B3 **零 sorry**（必须）；A4、B4 尽力（时间允许）；B5 可留 sorry+注释。
- 每条定理名与本文件编号对应（如 `theorem A2_pointwise_ordering`）。
- 若 Mathlib 下载/工具链受阻：允许退化为不依赖 Mathlib 的独立工程
  （K 用 ℚ，自备 List/Finset 小引理），正确性优先于库的优雅。
