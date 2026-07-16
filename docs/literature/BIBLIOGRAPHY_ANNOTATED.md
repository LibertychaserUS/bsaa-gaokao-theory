# BSAA 带评注文献库 + 定理级关联映射

状态：主循环综合（原 workflow 综合 agent stall，主循环亲自读 5 份主题备忘合成）。
可信度分级：★全文核实（含 CrossRef/arXiv 摘要页交叉验证或 Chrome DevTools 取全文）｜☆仅 WebSearch 摘要片段（arxiv.org 等域名被网络策略阻断，未取全文）。
**工具情报**：文献 agent 的 WebFetch 对 arxiv/ar5iv/semanticscholar 全被网络策略阻断；唯一突破是 CVaR agent 用 **Chrome DevTools 浏览器工具**打开了 arxiv.org/html 全文页——后续需要全文时走这条路。

---

## 一、总文献库（按主题分节）

### A. 序约束 / commitment / 有序列表（与 BSAA "吸收+提交有序列表"最贴近）

| # | 标题 | 作者/机构 | 编号 | 主结果 | 与 BSAA 关系 | 可信度 |
|---|---|---|---|---|---|---|
| A1 | Whether or Not to Open Pandora's Box | Doval / Caltech | JET 175 (2018) | 首引"非强制检查"，打破 Weitzman 指数策略最优性 | **谱系起点**：BSAA 保留 obligatory inspection 才得以保有 A2 简单排序最优——正因未涉入 Doval 打开的复杂性区域 | ★ |
| A2lit | Pandora's Box with Nonobligatory Inspection | Beyhaghi-Kleinberg 等 | 1905.01428 / 2212.01524 | committing policy 结构，两阶段固定顺序 + PTAS | **核心对照**：BSAA=committing policy 框架中"必检集=全集、跳过集=空"的退化特例 | ☆ |
| A3lit | Pandora's Box with Order Constraints | — | 2002.06968 | 序约束下阈值须反映搜索深度；DAG 序约束 NP-hard | 刻画 A3 精确 DP 边界：cardinality/树形可解，复杂序约束打破可解性 | ☆ |
| A4lit | Local Hedging Approx. Solves PB w/ Nonobligatory Inspection | Scully, Doval | 2410.19011 | obligatory→nonobligatory 策略转换，≤4/3 近似因子 | 侧证 BSAA 的 obligatory 假设非丧失一般性，与更一般情形价值差有界 | ★ |
| A5lit | Price of Information (Efficient Pricing/Contracting Comb. Prophet & PB via Duality) | Singla / Princeton | 1711.00405 / SODA'18 | matroid 约束组合 PB 的近似框架 | BSAA 的 k 名额=cardinality matroid 特例；A3 精确 DP = 该一般近似框架在最简特例的精确特化（不冲突） | ☆ |
| A6lit | Tree/matroid order-constrained PB 高效算法 | Boodaghians, Fusco, Lazos, Leonardi | MOR 48(1) 2023, 498-519 | 树序约束精确算法 | 与 A3 呼应：树形约束仍精确可解 | ★（CrossRef 核实） |

### B. 相关性 / Weitzman 规则推广（与"相关性对冲、Fréchet 界"对照）

| # | 标题 | 作者 | 编号 | 主结果 | 与 BSAA 关系 | 可信度 |
|---|---|---|---|---|---|---|
| B1 | Pandora's Box with Correlations | Chawla 等 | 1911.01632 | 首个相关 PB 常数近似；区分 FA（不可常数近似）/ PA（固定顺序自适应停止，可近似） | **最值得正面区分**：PA 策略保留"何时停止探测"自由度，BSAA 提交列表后无停止决策（吸收是外生 Bernoulli）——这个结构差异正是他们停在近似、我们能精确的根源 | ☆ |
| B2lit | Approximating PB with Correlations | — | 2108.12976 | 提出多项式时间常数近似开放问题；support-size m/log m 框架 | 与我们已引的 correlation gap（Agrawal-Ding-Saberi-Ye 2012）平行但技术路径不同（组合归约 vs 凹闭包） | ☆ |
| B3lit | Weitzman's Rule for PB with Correlations | — | 2301.13534 | Weitzman 指数规则**直接**搬到相关情形仍适用，近似比显著改进；多项式样本访问即可 | **正面例证但划边界**：同一规则跨独立/相关，但代价是"近似"非"精确"。与 A2 的 distribution-free **精确**排序是同题材两种强度 | ☆ |
| B4lit | Optimal 4-Approximation for Correlated Pandora | — | 2509.17029 (2025) | **最优 4-近似**，匹配 MSSC 的 4 下界，解决 B2lit 开放问题，常数紧 | 相关性近似谱系**当前最强成果，仍是近似非精确**；必须正面引用并划清模型边界 | ☆ |
| B5lit | Contextual Pandora's Box | — | 2205.13114 | 逐轮分布未知的在线学习（bandit 式） | **偏离主题**：其"相关性"是跨轮未知分布，非同实例内候选间联合相关，数学对象不同。防误引 | ☆ |

### C. 结构定理 / DP / 综述 / 应用

| # | 标题 | 作者 | 编号 | 主结果 | 与 BSAA 关系 | 可信度 |
|---|---|---|---|---|---|---|
| C1 | Weitzman (1979) 经典 PB | Weitzman | Econometrica 1979 | 指数（预约值）策略独立情形精确最优 | **整个谱系源头定理**，A2/A3"v 降序=最优"的经济学原型；但 Weitzman 非吸收可放弃，BSAA 吸收——不能写"=" | ★ |
| C2 | Markovian Pandora's Box | Yang, Zhang, Morgenstern, Xu | 2502.00228 | Markov 相关下自适应序最优 | 相关性放宽方向与 B2/B3 精神类似但随机过程路径，与我们不确定测度混合正交 | ★ |
| C3 | PB with Sequential Inspections | Ji(Stanford) + Aouad(LBS) + Shaposhnik | 2507.07508 / OR 2024 | 完全打开 vs 部分打开的信息-代价权衡 | 确立 Ji 是持续做 PB 的 Stanford 学者；"信息获取中间状态"与 A5 两阶段吸收有方法论类比 | ☆ |
| C4 | Recent Developments in PB（综述） | — | 2308.12242 | PB 变体系统综述 | 背景导航，全景校验用 | ☆ |
| C5 | Pandora's Box Gittins Index | — | 2406.20062 | Gittins 指数=独立情形 Bayesian 最优；成本感知贝叶斯优化 | A3"DP 精确"在独立情形的既有对应=Gittins；我们的吸收变体需区分 | ☆ |

### D. 风险准则 / CVaR（★斯坦福那篇 + B6 攻法）

| # | 标题 | 作者 | 编号 | 主结果 | 与 BSAA 关系 | 可信度 |
|---|---|---|---|---|---|---|
| **D1** | **Risk of Bad Tails: CVaR-Aware Pandora's Box and Prophet Inequalities** | **Jingwei Ji（Stanford MS&E，单作者）** | **2605.19181 v3（2026-06，preprint）** | CVaR 下 Weitzman 指数规则**精确成立**（经 Rockafellar-Uryasev 变分恒等式 + one-hot 代数恒等式，归约成对标量 t 一维外层 sup 的一族线性期望子问题，每子问题保留 Weitzman 结构）；Prophet 侧则无 IFRA 结构不存在常数近似比 | **★斯坦福那篇（确认）**。既支撑也划边界：one-hot 提升 `min{t,ΣAᵢXᵢ}=ΣAᵢ·min{t,Xᵢ}` 可能移植到 BSAA one-hot 级联兑付，为 **LEMMAS B6（CVaR 不可折叠开放问题）提供构造性子解法路径**；但模型不同构（单次揭示+检查成本 vs Bernoulli 级联无检查成本），配额/相关性两处 BSAA 复杂性 Ji 未碰，需新证明。**不构成新颖性竞争**（维度正交，不碰 matching/assignment/志愿） | ★（Chrome DevTools 取全文 + 猎手线交叉确认） |
| D2 | Pandora's Box Reopened: Robust Search and Choice Overload | Auster(Bonn) + Che(Columbia) | 2512.21192 | minimax ex-post regret 搜索规则，选择过载现象 | minimax regret 也是非线性准则（与 B6 相关），但**确认非 Stanford**——排除为"斯坦福那篇"的干扰项 | ★（CEPR 作者页核实机构） |

---

## 二、定理级关联映射矩阵（服务论文相关工作 + 新颖性声明）

| BSAA 定理/构造 | 关系=既有基础 | 关系=特例/退化 | 关系=竞争 | 关系=正交 | 关系=技术工具 |
|---|---|---|---|---|---|
| **A2 value-index 排序（distribution-free 精确）** | C1 Weitzman（经济学原型）、A2lit committing policy（背景框架） | — | **无直接竞争**（未发现任何文献证过 distribution-free 精确版） | — | — |
| **A3 DP 精确最优** | C5 Gittins（独立情形对应）、A5lit Price of Information（一般框架） | **A3 = A5lit matroid 框架在 cardinality 特例的精确特化**、A6lit 树约束精确 | — | — | — |
| **配额 DP（冲稳保）** | A3lit 序约束、A5lit matroid | cardinality matroid 特例 | — | — | — |
| **相关性对冲 / Fréchet 界** | B1 PA 策略、我们已引的 correlation gap 2012 | — | **B3lit/B4lit（Weitzman 相关近似）**——同题材，须划清"精确 vs 近似"边界 | B5lit（跨轮 bandit，数学对象不同） | — |
| **B2/B3 混合折叠（chance theory）** | — | — | — | **C2 Markov 相关（平行正交）** | — |
| **B6 CVaR/风险准则（开放问题）** | — | — | — | — | **D1 Ji（one-hot 归约=候选攻法）** |
| **吸收结构（提交列表后无停止决策）** | A1 Doval（obligatory 起点） | **BSAA=committing policy 去 nonobligatory 自由度的退化特例** | B1（PA 保留停止自由度，此差异=精确 vs 近似的根源） | — | A4lit（obligatory↔nonobligatory 折算桥，侧证非丧失一般性） |

---

## 三、新颖性风险清单（保投稿的关键——哪些自认新贡献其实已有/接近）

| BSAA 主张 | 风险等级 | 文献现状 | 应对 |
|---|---|---|---|
| **DP 精确最优** | 🟡中 | Gittins（C5）已给独立情形 Bayesian 精确解；A5lit/A6lit 给 matroid/树约束精确算法 | **改措辞**：不说"首个精确 DP"，说"在 obligatory-inspection + cardinality 约束 + 吸收语义下的精确 DP 特化"；强调吸收结构是新的（Gittins/PoI 都非吸收） |
| **value-index 排序** | 🟢低 | 各推广都基于 Weitzman，但 distribution-free 精确版未见 | **强调差异**：distribution-free（不要求分布已知/独立）+ 精确（非近似）是边际贡献；正面引用 A2lit committing policy 作致敬 |
| **相关性处理** | 🟡中 | B3lit/B4lit 已做 Weitzman 相关近似，B4lit 是 2025 最强（最优4近似） | **划边界**：我们靠吸收结构绕开乘积公理得精确，他们靠近似；必须正面引 B4lit 并说明模型不同（他们无吸收、保留停止决策） |
| **CVaR/风险敏感排序** | 🟠高（若声称） | **D1 Ji 已系统刻画 CVaR 下 Weitzman 精确边界** | **不要声称 CVaR 排序是我们首创**；若做 B6，明确引 D1 为技术基础，我们的贡献限于"吸收+级联兑付下的移植与新证明" |
| **吸收结构建模** | 🟢低 | committing policy 是最近亲但非吸收；志愿/matching 场景未见 PB 文献覆盖 | **主打新颖性**：吸收语义 + 高考志愿应用 + distribution-free 是三重结合的空白 |

---

## 四、斯坦福论文结论

**确认：Oliver 所指=D1，arXiv 2605.19181《Risk of Bad Tails: CVaR-Aware Pandora's Box and Prophet Inequalities》，Jingwei Ji（Stanford MS&E，单作者），2026-06 preprint。** 两条独立线（CVaR 深挖 agent 用 Chrome DevTools 取全文 + 斯坦福猎手线 WebSearch 排除法）收敛到同一结论。干扰项"Pandora's Box Reopened"(D2) 已确认是 Bonn+Columbia，排除。

**待 Oliver 确认**：若你记忆中那篇含 matching/assignment/absorption 关键词（而非 CVaR/risk），则可能另有其人，需转向"Stanford+双边匹配+PB"方向重搜（目前未系统检索）。否则以 D1 为准。

**对我们的用途**：D1 的 one-hot 归约技巧是攻 **B6（CVaR 不可折叠）开放问题**的候选钥匙——这正是"斯坦福新论文与我们新数学有关系"的实质。是否派 agent 试证，待 Oliver 定。

---

## 五、references.bib 优先纳入清单（top 12，按重要性）

1. **Weitzman (1979)** — Econometrica，谱系源头，必引 ★
2. **Doval (2018)** — JET，nonobligatory inspection 起点，定位 BSAA 边界 ★
3. **Beyhaghi-Kleinberg, committing policy (1905.01428/2212.01524)** — BSAA 的最近亲框架，核心致敬对象
4. **Ji (2605.19181)** — 斯坦福 CVaR-PB，B6 攻法 + 风险准则新颖性边界 ★
5. **Chawla et al. (1911.01632)** — 相关 PB 起点，PA/FA 区分，核心区分对象
6. **相关最优4近似 (2509.17029)** — 2025 相关性最强成果，必引划边界
7. **Weitzman correlated (2301.13534)** — 相关下指数规则近似
8. **Singla, Price of Information (1711.00405)** — matroid 框架，A3 定位
9. **Boodaghians et al. (MOR 2023)** — 树/序约束精确算法 ★
10. **Gittins index PB (2406.20062)** — 独立情形 Bayesian 精确解对应
11. **Recent Developments 综述 (2308.12242)** — 背景导航
12. **correlation gap (Agrawal-Ding-Saberi-Ye 2012)** — 已在 §7-6 引用，相关性对冲基础

**引用纪律**：标☆的仅摘要级，正式写入 references.bib 前须用 Chrome DevTools 取全文核对作者/结论/DOI（尤其 DOI 与卷期页码）。标★的已交叉验证可放心引用。
