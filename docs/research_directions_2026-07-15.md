# BSAA 接手日研究综合报告（2026-07-15）

> 本文沉淀 2026-07-15 接手日全部推理、验证与五路文献调研结论。作者：Claude（Fable 5），审阅：Oliver。
> 相关：`formal/LEMMAS.md`（Lean 4 形式化规格）、`formal/experiments/`（数值验证脚本）。

## 1. 模型正名（文献真身）

- BSAA ≡ **Chade & Smith (2006) "Simultaneous Search", Econometrica 74(5)** 的 college application portfolio 问题；后续 Chade, Lewis & Smith (2014, REStud 81(3))（stretch/safety = 冲/保）。
- Value-Index 定理 = Mitten (1960) / Kadane (1969) / Simon & Kadane (1975) 指标序列定理特例；IR 侧 = cascade click model（Craswell et al. 2008）。
- 目标函数恒等式：v 降序下首个录取 = 录取集中 v 最大者，故
  **f(S) = E[max_{c∈A∩S} v_c]**；layer-cake 展开 f(S)=∫(1−Π_{v_i≥t}(1−p_i))dt = **嵌套 coverage**
  （一行证子模性；嵌套=精确可解根源，一般 max-k-coverage 因任意重叠才 NP-hard）。
- 复杂度地图：无约束/常数层配额 → **精确 P**；一般 matroid → (1−1/e)（continuous greedy）；
  加异质申请成本/预算 → NP-hard（FPTAS）；BSAA 是 ProbeMax/期望次序统计量（一般 PTAS, Mehta et al. 2020）
  的精确可解 Bernoulli 特例。
- 论文措辞：由"首次证明"改为"在高考语境重新发现并精确化经典结果，新贡献在校准+相关鲁棒+机制边界+真实系统"。

## 2. 已验证的算法事实（脚本在 formal/experiments/）

1. **精确 DP**（= Chade-Smith downward-recursivity）：v 降序后
   `g(i,k)=max(g(i+1,k), p_i·v_i+(1−p_i)·g(i+1,k−1))`，O(Nn) 精确。
   验证：8000 组随机+对抗实例 vs 暴力枚举零失配（`verify_dp_exact.mjs`）。
2. **真实实例**（HLJ 1957 候选×45 位，`dp_vs_gsio_real.mjs`）：DP=0.9145673886 (1ms) vs
   GSIO=0.9145673870 (2347ms)，差 1.67e-9 = GSIO 自身 tie-break EPSILON 量级。**快 2000 倍且精确。**
3. **贪心=MIA 精确最优**（Chade-Smith 已证，仅基数约束下）；论文 Fig5 数据 50/50 全部 ratio=1
   而正文写 "close to 1"——需改写。⚠️ 配额约束下贪心精确性**不保证**，配额场景用 DP。
4. **配额 DP**：冲稳保作硬约束（"≥q 个 p≥0.8"）状态加一维仍精确（814 实例零失配，`verify_dp_quota.mjs`）。
5. **解的大平台期**：真实实例 DP 与 GSIO 解集仅重叠 26/45 而效用同至 9 位小数 ⇒
   近优平台上随机化 = 零代价去拥堵（§9.3 相关随机化的免费实现）。

## 3. 相关性章节骨架（研究定稿）

1. **排序层（distribution-free）**：v 降序最优对任意联合分布逐点成立（LEMMAS A2），交换论证退役。
2. **决策质量层**：correlation gap（Agrawal-Ding-Saberi-Ye 2012, OR 60(1)）——注意方向：
   F(x)≥(1−1/e)·f⁺(x)，f⁺ 为 concave closure（相关分布的 sup 非 inf）。可写"独立假设选表的
   决策质量常数保证"（常数口径待严格化），**不覆盖下尾**，须明说。
3. **最坏安全层（Fréchet 定理，已确认）**：任意相关下 P(至少录取一)≥max_j p_j，共单调取等。
   ⇒ 保底=相关性对冲（最坏 Safety 完全由最高 p 的保底决定）；对照区间 [max p_j, min(1,Σp_j)]。
   ⚠️ 该"保证"条件于 p 的校准正确性，产品端严禁表述为无条件承诺。
4. **精细谱**：单因子 Vasicek 模型 p_c(Z)，ρ∈[0,1] 在独立与共单调两端点间插值；条件独立下
   对 Z 做 20 点 Gauss-Hermite 积分；期望保子模 ⇒ 贪心 (1−1/e) 仍成立，但精确 DP 失效
   ——"独立=精确 / 相关=近似"的复杂度-现实性边界。
5. **防御性引用**：Ali & Shorrer (2021) The College Portfolio Problem（common-score 下 MIA 失效、
   精确 DP 存在——必须正面区分）；Asadpour et al. (2022, OR) 子模排序；Maehara (2015) CVaR
   单集合不可近似；Che & Koh (2016, JPE) 共同冲击；Azevedo & Leshno (2016, JPE) cutoff=均衡价格；
   Perdomo et al. (2020) performativity。

## 4. 校准子系统重构（研究定稿）

- **范式**：估录取概率 → 估**阈值预测分布** G_p，p = 1−G_p(R)。全系统唯一概率口径。
- **结构地基**：阈值 = 报考者位次分布第 m_p 顺序统计量，Var ≈ p(1−p)/[N·f²(x_p)]
  （f 由一分一段表直接给出）⇒ 结构化异方差，破"池化同方差"与"每组 3 观测"两难。
  理论锚：Azevedo-Leshno（cutoff=出清价格 ⇒ 计划数/需求为结构协变量）。
- **短期（1-2 周）**：六件套评估协议（留一年 / Brier+log-loss / Murphy 三分解 / 按|Δ|分层 /
  CORP 可靠性图 / sharpness），弃用 AUC（两个 AUC 皆构造伪影：伪配对≈0.5 按构造不可分；
  随机配对≈0.998 被远阈值样本淹没）；分层 logistic 或 beta calibration（Kull 2017）+ Firth 惩罚；
  非凸最小二乘换凸 MLE/保序回归。
- **中期**：GAMLSS/分层贝叶斯（μ_p 回归 + σ_p=g(计划,密度,层次) 用顺序统计量方差作先验）+
  Mondrian/CQR conformal 覆盖层（输出"90% 把握阈值界"，年际漂移诚实声明）+ EVT 头部分支。
- 中文文献缺口：全部做分数线点预测，无人做概率校准——占位机会。

## 5. 混合模型：录取端随机 × 价值端不确定（Oliver 定向，本项目核心新意）

- **动机**：黄金路径/原型价值无频率数据、只有专家信度 ⇒ 刘氏不确定统计的法定适用域；
  录取阈值有 49 万条频率数据 ⇒ 概率论。两者以 **chance theory（不确定随机变量）** 正统结合。
- **关键定理（LEMMAS B2）**：吸收结构下每次实现只有一个候选兑付 ⇒
  E_ch[Y] = Σ_c Pr[首录=c]·E[v_c]，**不需要 v 之间独立**（绕开乘积公理取小的全部坑）。
  推论（B3）：整个优化核（排序/DP/Fréchet）原封不动，v 换 v̂=E[v_c]。
- **不确定变量的层级**：设在**原型层**（约 7-15 个），非逐候选层——专家只能给原型打分；
  v_c = 数据属性 μ(c) 与不确定原型量的确定性函数 ⇒ v_c 天然相关，B2（无需独立）+ B4（共单调可加）
  正是为此准备。
- **升级空间**：机会约束 ℳ{路径匹配≥v₀}≥β（风险厌恶引入价值侧）——注意期望准则之外线性折叠失效，
  为新数学（见雷区 §7-5）。
- **投稿定位**：弃"双术语包装"；以 uncertain random 混合模型诚实定位投聊城（第 24 届不确定系统
  分会年会，2026 聊城大学），发表信用另投运筹期刊；Lean 4 机器验证为差异化背书。

## 6. 参数三分法（治理定稿）

| 类 | 例 | 处理 |
|---|---|---|
| 统计参数 | 5 套概率口径的全部魔法常数 | **删除**，换唯一校准 G_p；六件套回测验证 |
| 价值/偏好参数 | 黄金路径权重、原型分、λ | 专家启发+不确定统计；**禁止**用录取数据训练（会把羊群行为偷渡为规范判断；且可辨识性差） |
| 政策/合规常数 | 风险上限、保底配额、cannotDisableSafety | 冻结为带出处的显式配置，禁止学习 |

端到端方案级回测（bootstrap 阈值重采样下整表实现效用/落榜率）检验系统整体，不用于拟合单参数。

## 7. 雷区登记册（截至 2026-07-15 晚）

1. **退档/调剂未建模（机制级，最大）**：不服从调剂→退档=跌出整个批次（灾难态）；服从调剂→
   可能被吸收进未填报的专业。BSAA 把候选当原子事件，两者都不在状态空间里。论文需 scope 声明
   （按专业组+服从调剂假设），产品需在 P0-P4 门禁外显式建模退档风险。
2. **estimated_rank_2025 的来源与数据泄漏**：校准残差以它为锚。若该估计本身用 2022-24 阈值拟合，
   留一年回测即被污染（"测试年"信息已进锚点）。**回测前必须审计其 provenance**；必要时改用
   纯前年数据可构造的锚。
3. **位次尺度年际不可比**：当前用原始位次差（scale=10000 常数）。报名人数逐年变 ⇒ 同一位次差
   含义不同。应统一到百分位 u=rank/N_total 尺度建模。
4. **配额下贪心无精确保证**（§2-3）：冲稳保配额场景只认 DP；勿把 Chade-Smith 精确性引用到约束情形。
5. **期望准则之外线性折叠失效**：v̂ 折叠只对 chance 期望成立；若改用价值分位数/机会约束准则，
   排序可能不再由单标量决定，属新数学，未证。
6. **B2 的建模公理需显式声明**：录取随机性与价值不确定性定义在独立的两个空间上
   （chance 空间乘积结构）；且 E_ch 采用 Liu 链式（概率在外层）定义——形式化中应补
   B2'（与 chance measure 层积定义的一致性）。
7. **双计入风险（引擎收敛时）**：v_c 若含 schoolPlatform/majorFit 维度，与产品成本项
   strategy_axis_penalty 重复计分。统一时须做维度审计。
8. **校准数据的幸存者偏差**：min_rank 只在招满/有录取时存在；新设/更名专业经目录匹配噪声进入残差池。
   应按 catalogMatchConfidence 过滤/加权。
9. **"最坏情形保证"的表述合规**：Fréchet 界条件于校准正确性；产品端（禁用"概率"词表之外）
   严禁把 max p_j 表述为无条件"保证"，建议措辞"模型最坏情形匹配下限"。
10. **适用批次边界**：模型只适用平行志愿批次；专业级差/顺序志愿（提前批）机制不同，产品须按批次门禁。
11. **performativity 自指**：大规模采用→cutoff 漂移→p 失效；近优平台随机化（§2-5）为零代价缓解，
    均衡分析列 future work。
12. **中文论文作废快照 / 参考文献错（Zaslavsky 等）/ paper.md 5.8 错位**：投稿前修（已登记）。

## 7.5 雷区解法（2026-07-15 深夜定稿）

- **雷1 退档（优雅解已找到）**：滑档≠退档。绝对保守垫底治**滑档**（Fréchet：最坏 Safety=max p_j）；
  退档因一次投档发生在"被投出的那一个志愿"，垫底救不了。解法=**两阶段吸收 → 价值折扣变换**：
  ṽ_c=(1-r_c)v_c+r_c·v_dead（r_c=条件退档概率），结构与 BSAA 同构，交换论证/DP 对 (p,ṽ) 原样成立
  （LEMMAS A5）；"服从调剂"=价值端换成组内混合价值，同一框架。"绝对保守"的精确定义：p≈1 **且** r≈0。
  代价：A2 的 distribution-free 逐点性退化回交换论证（需独立/因子模型），须声明。
  **服从调剂=决策变量非不确定量（LEMMAS A6）**：每候选 flag a_c 只影响自身 ṽ_c，U 对 ṽ 单调线性
  ⇒ 最优 flag 逐点分离（a*=1 ⟺ E[v_调剂着陆] ≥ v_dead），ṽ*=max_a ṽ(a) 进原 sort+DP，零组合爆炸。
  flag 的输入（v_dead、组内着陆价值、"绝不接受专业"清单）按参数三分法归**学生本人**
  （问卷启发，可为不确定变量）；系统输出建议+判据解释，学生确认/覆盖。
  专业+院校模式（浙/鲁，无调剂概念）a 退化——按省×批次机制路由（雷10 同一配置层）。
- 雷2 泄漏：中期阈值分布模型（协变量全用滞后量）自动消灭；短期审计 estimated_rank_2025 构造式。
- 雷3 尺度：统一百分位 u=rank/N_total（顺序统计量在此尺度天然为 Beta）。
- 雷4 配额：只用配额 DP，不引用贪心精确性。
- 雷5 风险准则：**可折叠边界已刻画**（LEMMAS B6）——对外层概率混合**线性**的准则（含凹效用 u 的
  期望效用型风险厌恶，v̂=E[u(v)]）全部免费兼容；**非线性**准则（整表 Y 的分位数/机会约束/CVaR）
  不可分离=真开放问题。产品折中：期望优化+分位数报告（固定方案的 Ch 分布可算）。
- 雷7 双计入：v 维度与成本项维度唯一性审计（设计规则）。雷8 幸存者偏差：按目录匹配置信度加权
  +"曾征集"哨兵变量。雷9 合规："模型最坏情形匹配下限"措辞+前置条件声明。雷10 批次：按省×批次
  机制类型路由，仅平行志愿走 BSAA。

## 7.6 开放问题定位：分位数准则级联组合（research-quantile 调研定稿, 2026-07-15）

**新颖性判定（可信度高）**：first-success 级联组合 × 分位数/VaR/CVaR/机会约束准则 × 可含 uncertain random 价值——
**无人做过**。三条最近线各自止步：①Chade-Smith 谱系风险扩展（含 Ali & Shorrer "Hedging When Applying",
AER 2025, 115(2):571-598——其"风险态度"经核实是 EU 凹效用 isoelastic，仍是线性期望算子）；
②分位数偏好决策理论（Manski 1988; Rostek 2010 REStud 77(1); de Castro & Galvao 2019 Econometrica/2022 ET）
——止步于抽象 acts 与连续时间组合（He-Jiang-Kou 2020：连续域分位数目标已知病态），从未触及离散级联；
③**最近邻=Li & Ke (2019, ORL 47(5):452-457)** worst-case CVaR MNL assortment——但 MNL 成功概率**内生**
（IIA 归一化，可能正是其可解性根源）且价值确定已知，不能移植到独立外生 Bernoulli+不确定价值情形，
**必须防御性引用**。uncertain random 序贯/级联确认空白（Qin 2015 EJOR 等全是静态组合）。

**三层硬度论证链（全部有据）**：①Chern (1992, ORL)：级数系统冗余分配的阈值概率目标已 NP-hard；
②Bernard & Vanduffel (2015, Dependence Modeling 3(1))：混合分布分位数无跨分量解析分解
（= MIA/DP 赖以成立的线性可加性在分位数下失效的概率论根源）；③Maehara (2015, ORL 43(5))：
随机子模函数的 CVaR 不子模且无多项式乘性近似（除非 P=NP）+ Wang & Yu (2026, arXiv:2603.01232)：
VaR 比 CVaR 更不友好——Chade-Smith 期望目标恰是随机子模集合函数，硬度结果"量身定做"适用。

**论文引出段落草稿已备**（research-quantile 回传原文，入文前需核对：Chambers 2009 出处、
Coit-Smith 1998 页码、Ali-Shorrer 2025 与此前 research-robust 所引 "Ali & Shorrer 2021 The College
Portfolio Problem" 是否同一工作——两处引用需统一核实）。锚点：期望侧 Chade-Smith 2006 /
分位数侧 Rostek 2010 + de Castro-Galvao / 硬度侧 Chern 1992 + Maehara 2015 + Wang-Yu 2026 /
对照 Li & Ke 2019。附带空白子方向：cascading bandits × CVaR/quantile bandits 融合亦无人做（次要）。
注意术语陷阱：prophet inequality 的 "quantile" 变体是信息 oracle 非风险准则，勿混引。

## 8. 状态与下一步

- 已落库：接手 9 commits（产品 8 + 理论 1）；formal/LEMMAS.md；formal/experiments/ 三脚本；本报告。
- 进行中：Lean 4 形式化（lean-prover agent；elan 4.2.2 + Lean v4.30.0 已在机；验收=A2/A3/B2/B3 零 sorry）。
- 待 Oliver：论文重定位起草开工令；投稿路线确认；产品引擎收敛开工令；CC Switch 瘦身。
