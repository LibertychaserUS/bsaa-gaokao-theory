# 论文新颖性措辞修订建议（供 Oliver 评审，未改 paper.md）

> 依据：`docs/literature/BIBLIOGRAPHY_ANNOTATED.md` 综合出的三处新颖性风险。
> 原则：不夸大、划清边界、正面引用最强对手。改的是**声明口径**，不是删成果。
> 现状诊断：paper.md 仍是"旧世界观"——把 Value-Index/子模性/(1-1/e) 当核心贡献，
> Related Work 只提 Nemhauser 子模优化，**完全没有 Pandora's Box / Chade-Smith /
> committing policy 谱系**。三处风险都源于此。

---

## 风险一【严重】：模型与三条定理的"首创"暗示

**现状**（Abstract + §1 Contributions）：把 BSAA 模型、Theorem 3.1（Value-Index）、
4.2（子模性）、4.3（(1-1/e)）并列为"our contributions"，无一处说明它们与已有文献的关系。

**问题**：文献综合已确认——
- BSAA 模型 = Chade-Smith (2006, Econometrica) "Simultaneous Search" 的大学申请组合问题；
- Value-Index 排序 = Mitten (1960) / Kadane (1969) 经典特例；
- (1-1/e) = Nemhauser-Wolsey-Fisher (1978) 标准结果；
- 而且更强的事实：Chade-Smith 已证**无约束下贪心（MIA）精确最优**，不是 (1-1/e) 近似——
  我们论文却把 (1-1/e) 当成果卖，反而**弱于**已知结论。

**建议改法**：
1. **Abstract 第 (3) 条**：把"greedy ... yields a (1-1/e) approximation guarantee"
   改为诚实的强表述——
   > "(3) under the obligatory-inspection + cardinality regime, the greedy optimizer with
   > internal ordering (GSIO) is **exact-optimal** (a consequence of the downward-recursive
   > structure, following Chade & Smith 2006); the (1-1/e) bound applies only once
   > hard 冲/稳/保 quota constraints are added, where exactness is no longer guaranteed."
2. **§1 Contributions**：在四条定理前加一句定位——
   > "We do not claim these structural results as new in the abstract combinatorial sense;
   > Value-Index ordering (Mitten 1960; Kadane 1969), submodular greedy bounds
   > (Nemhauser et al. 1978), and the portfolio structure (Chade & Smith 2006) are known.
   > **Our contribution is their synthesis and specialization to the absorption-structured
   > Gaokao setting**, plus the four items listed in §Novelty below."
3. **新增"真正的新颖性"清单**（这才是可辩护的边际贡献，来自记忆中的重定位）：
   ①参数化偏好 / Pareto 分段常数层（Thm 5.3，交互式前沿）
   ②阈值顺序统计量校准 + 结构化异方差（§4 校准子系统，中文文献空白）
   ③相关性鲁棒的诚实边界（Fréchet "保底=对冲" + correlation gap 限定口径）
   ④真实数据端到端系统 + 山东 7/22 真前瞻验证（out-of-time）

---

## 风险二【中】："DP 精确最优已上线"的名实不符

**现状**：`docs/acceptance_gates_v1.md:47-48` 写"上线优化器只用 DP（A3 已 Lean 证）"，
但算法审计证实 `optimizePlan.ts` 只调贪心，src/ 无 DP 无配额（S1-1 根因）。
paper.md:325 本身诚实（写的是"Verified implementation: paperTheory.ts 的 GSIO"），
所以**这条是内部文档问题，不是论文对外造假**——但若论文正文要提"精确 DP"，必须对齐。

**建议改法**：
1. 论文若声明精确性，措辞锚定**结构条件**而非部署状态：
   > "Exactness holds in the obligatory-inspection, cardinality-constrained regime via the
   > downward-recursive DP (Theorem 4.3'); the shipped optimizer uses GSIO greedy, which
   > coincides with the exact optimum in this regime (Chade & Smith 2006) and is retained
   > for its $O(|S|)$ incremental evaluation."
2. 明确记录能力边界（诚实声明，不藏）：
   > "Quota-constrained exactness (冲/稳/保 as hard constraints) requires the quota-DP
   > extension, which is validated in our artifact suite but not yet in the production path."

---

## 风险三【中】：相关性处理的"精确 vs 近似"边界

**现状**：论文 Related Work 完全没提相关性 Pandora's Box 谱系，也没提 correlation gap。

**问题**：2025 年该领域最强成果是"最优 4-近似"（arXiv 2509.17029，Correlated PB）——
我们若不引用、不划界，审稿人会认为我们无视了直接相关的 SOTA；反过来若含糊声称
"我们处理了相关性"，会被指与 4-近似结果冲突（他们近似、我们凭什么精确）。

**建议改法**：Related Work 新增一段 **"Sequential search and Pandora's Box"**（这是当前
最大的缺失，也是新颖性定位的关键）：
> "Our model is a member of the **committing-policy** family for the Pandora's Box problem
> (Beyhaghi & Kleinberg 2019; Beyhaghi & Cai 2023): BSAA corresponds to the special case
> where the 'inspect-in-order' set is the whole list and no box may be taken without
> inspection (obligatory inspection). This restriction is precisely why BSAA retains a
> **distribution-free exact** ordering optimality (Theorem 3.1), whereas the general
> nonobligatory-inspection problem is NP-hard (Fu et al. 2018). For correlated valuations,
> constant-factor approximation is the best achievable in polynomial time — the optimal
> ratio is 4, matching Min-Sum-Set-Cover (Chawla et al. 2020; the tight bound, 2025).
> We do **not** compete on the correlated-approximation axis: our absorption structure
> makes the *expected* objective exactly solvable under independence, and for correlation
> we give only a Fréchet worst-case safety bound (§correlation), not a general
> approximation guarantee."

**配套 references.bib 新增**（BIBLIOGRAPHY_ANNOTATED.md 已列 top-12 优先，标☆的需取全文核 DOI）：
Chade-Smith 2006, Weitzman 1979, Beyhaghi-Kleinberg 2019 (committing policy),
Fu-Li-Xu 2018 (nonobligatory NP-hard), Chawla et al. 2020 (correlated PB),
2509.17029 (optimal 4-approx), Singla 2018 (price of information), Doval 2018.

---

## 一句话总结给 Oliver

三处都是**同一个动作**：把论文从"我们首创了这些定理"改成"我们把已知的组合搜索结构
**特化并综合**到吸收结构的 Gaokao 场景，边际贡献是校准+相关性诚实边界+真前瞻验证"。
这个转向**不削弱论文**——反而让它经得起 OR/EC 审稿人的文献攻击，且 Chade-Smith 精确性
比原来的 (1-1/e) 近似**更强**。核心是诚实划界 + 正面引用最强对手（4-近似）。

**待你拍板**：①是否采纳这个整体转向 ②新颖性四条清单是否够（要不要加/减）
③相关性那段的口径（"不在相关近似轴上竞争"是否是你想要的立场）。
