# 文献备忘：序约束 / Committing Policy / 有序列表提交

主题线：与 BSAA "录取=开箱、被录取即吸收（后续志愿失效）、须提交有序列表"最贴近的文献族。
对照基线：`docs/research_directions_2026-07-15.md` §1-§3 + `formal/LEMMAS.md`（核心：A2 value-index 排序定理 distribution-free、A3 精确 DP、A4 Fréchet 安全界、B2/B3 混合折叠定理）。

状态标注说明：〔全文〕= 已取得并阅读正文关键片段；〔摘要〕= 仅 WebSearch/摘要页信息，未取全文；〔待核〕= 关键事实未交叉验证，禁止在论文中直接引用其结论细节。

---

## 一、六元组文献列表

1. **标题**：Pandora's Box Problem with Order Constraints
   **作者+机构**：Shant Boodaghians, Federico Fusco, Philip Lazos, Stefano Leonardi（罗马大学 Sapienza 等）
   **年份/编号**：arXiv 2002.06968；正式发表 *Mathematics of Operations Research*（DOI 10.1287/moor.2022.1271，〔待核，仅 WebSearch 片段确认卷期）
   **一句话主结果**：在盒子之间存在偏序（前序/树形/森林）约束时，若约束是树/森林结构，贪心式的"广义 Weitzman 指数"策略仍可高效求最优；若约束是一般 DAG 或需要满足 matroid 可行性，则求近似最优是 NP-hard。
   **与我们哪条定理/构造的关联**：直接对照 LEMMAS A2（value-index 排序，distribution-free）——本文可视为 A2 在"box 之间有偏序约束"场景下的**推广**方向：当约束图退化为空（无约束，所有志愿可任意排列）时应还原到 Weitzman/A2 型指数排序；BSAA 目前的设定中"须提交有序列表"本身没有强制的树形前序约束（考生可自由排列所有已知志愿），因此本文的树约束可行算法**不是**我们当前定理的特例，而是一个"若未来引入院校间强制填报顺序（如平行志愿分段规则）"时可借用的推广工具。若约束图是一般 DAG，其 NP-hard 结果提示：一旦 BSAA 加入复杂序约束（如"提前批必须排在普通批前"这类跨批次约束构成非树结构），精确 DP（A3）可能不再多项式可解。
   **可访问链接**：https://arxiv.org/abs/2002.06968

2. **标题**：Pandora's Problem with Nonobligatory Inspection
   **作者+机构**：Hedyeh Beyhaghi, Robert Kleinberg（康奈尔大学）
   **年份/编号**：arXiv 1905.01428；EC 2019
   **一句话主结果**：当搜索者可以不检查就直接选定一个盒子时，Weitzman 简单指数策略不再最优；作者定义"committing policy"——一种在开箱前就预先确定"哪些盒子永不开箱直接可选、哪些盒子必须先开箱、以及开箱顺序"的近似非自适应策略族，证明其可在多项式时间内求出最优 committing policy，且该策略至少达到最优自适应策略价值的 (1-1/e) 倍（两盒子情形可达 4/5，且证明此比例紧）。
   **正文关键定义（原文，已取全文核实）**："Let us define a committing policy to be one that, before it opens any boxes, must pre-commit to a partition of the n boxes into a set of boxes that will never be opened and a set that will never be selected without first being opened; in addition it pre-commits to an order in which the boxes in the latter set will be opened."
   **与我们哪条定理/构造的关联**：这是与 BSAA "须提交有序列表"结构**最直接可比**的一篇。BSAA 的志愿列表机制本质上就是一种"committing policy"——学生必须在观测到任何录取结果之前，把全部候选院校划分成"排入列表（会被检查/依序尝试）"并固定其相对顺序；区别在于：(a) BSAA 中每个志愿都必须经过录取判定（等价于"nonobligatory inspection"关闭，回到 obligatory inspection 情形，即经典 Weitzman/Pandora 设定），(b) 不存在"跳过检查直接选中"的选项。因此 BSAA 的问题结构更接近本文中被 committing policy 一般化之前的经典子情形，而 A2 的 value-index 排序定理恰好是本文框架下"当 nonobligatory inspection 选项不存在时，committing policy 退化为纯排序问题"这一特殊情形的 distribution-free 强化版——本文给出的是有 nonobligatory inspection 时的 (1-1/e) 近似界，我们的 A2 在没有该选项、且允许结果任意固定实现（非独立、非同分布）的更弱假设下仍给出**精确**排序最优性，因此 A2 相对本文是在特殊场景（无 nonobligatory inspection）下的**加强/精确化**，而非其特例。
   **可访问链接**：https://arxiv.org/abs/1905.01428

3. **标题**：Pandora Box Problem with Nonobligatory Inspection: Hardness and Approximation Scheme（原摘要标题为"Pandora's Problem with Nonobligatory Inspection"系列后续结构定理论文，通常引用为 Beyhaghi–Cai）
   **作者+机构**：Hedyeh Beyhaghi, Linda Cai（普林斯顿大学/康奈尔大学）
   **年份/编号**：arXiv 2212.01524
   **一句话主结果**：给出最优自适应策略的结构定理——在 nonobligatory inspection 设定下，最优策略只需在至多两个预先确定的检查顺序（"two-order"结构）之间切换一次（且至多有一个盒子可被"claim closed"而无需检查），并基于该结构给出 PTAS（多项式时间近似方案），将此前仅对离散有限分布成立的 0.8 近似比（[GMS08]）推广到一般（含连续）分布，并引用 [FLL22]（即条目 4）的 NP-hardness 结果说明为何只能是近似而非精确多项式算法。
   **[GMS08] 已核实（全文交叉验证，非待核）**：Sudipto Guha, Kamesh Munagala, Saswati Sarkar, "Information acquisition and exploitation in multichannel wireless networks," CoRR abs/0804.1724 (2008)——无线网络语境下更早独立提出同一模型并证明离散有限分布下 0.8 近似比及"至多一个盒子可被 claim closed"的结构性质；与我此前误猜的 arXiv 0711.3861（Guha-Munagala "Approximation Algorithms for Restless Bandit Problems"）是**不同的论文**，此前的猜测已作废。
   **与我们哪条定理/构造的关联**：与条目 1 呼应，是"结构复杂度介于纯排序（A2/A3 可精确解）与一般组合搜索（NP-hard）之间"的中间地带的代表：两阶段/两顺序结构定理说明，即使允许一定的适应性（策略可在两个预定顺序间切换），最优解仍然保留"预先固定顺序"这一核心特征——这与 BSAA "必须提交单一有序列表"（不允许切换）相比是**更宽松的策略空间的推广**，BSAA 相当于把"两阶段切换"这一自由度也去掉，只保留最简单的单一固定顺序，因此 BSAA 的可行策略集合是本文最优策略结构的严格子集；由于 BSAA 额外要求 distribution-free 排序最优性（A2），可以视为在这个更受限的策略空间内，我们给出了比"近似"更强的"精确且不依赖分布假设"的结果。
   **可访问链接**：https://arxiv.org/abs/2212.01524

4. **标题**：Pandora's Box with Nonobligatory Inspection is NP-hard（引用简称 [FLL22]）
   **作者+机构**：Hu Fu, Jiawei Li, Daogao Liu（不列颠哥伦比亚大学等）
   **年份/编号**：arXiv 2207.09545
   **一句话主结果**：证明计算 nonobligatory-inspection 情形下最优自适应策略的价值是 NP-hard 的（回应此前的一个公开问题），为条目 2、3 的"只能近似求解"结论提供硬度基础。
   **与我们哪条定理/构造的关联**：与 A3（精确 DP 可解）形成对照——A3 的可解性依赖于 BSAA 没有"nonobligatory inspection"这一额外自由度（每个志愿都必须走完整的录取判定流程，不存在"跳过判定直接选中"），一旦引入该自由度，问题复杂度从 A3 的多项式 DP 跃升为 NP-hard。这条结果为"BSAA 现有精确算法的适用边界"提供了一个清晰的**反例式警示**：若未来产品设计中出现"考生可以不经过投档判定直接锁定某志愿"的机制（类似强制服从调剂之外的某种直录通道），A3 的多项式可解性将不再成立。
   **可访问链接**：https://arxiv.org/abs/2207.09545

5. **标题**：Pandora's Box with Time Constraints
   **作者+机构**：Georgios Amanatidis, Federico Fusco 等（合作机构含 University of Essex, Sapienza 大学）
   **年份/编号**：arXiv 2407.15261
   **一句话主结果**：将 Pandora's Box 推广到"检查/处理需要时间、且盒子价值可能随时间衰减"的设定，在给定总时间预算约束下研究何时停止搜索及最优检查顺序，给出近似算法结果。
   **与我们哪条定理/构造的关联**：与 BSAA 的"志愿数量上限约束"（考生最多能填 k 个志愿，对应 A3 的 DP 状态变量 k）在形式上是姊妹结构——A3 的约束是"名额/志愿条数"，本文的约束是"时间预算"，两者都是对 Pandora's Box 施加一个"资源上限"从而把无约束搜索变成约束优化。本文的价值随时间衰减机制与我们 v2 待补的 A5（"两阶段吸收+掉档概率 r_c 导致的有效价值折损 ṽ_c=(1-r_c)v_c+r_c·v_dead"）在直觉上类似（都是"等待/延迟导致价值打折"），可作为 A5 建模时的一个可类比的既有文献参照，但本文的衰减是外生时间函数，A5 的折损是内生的掉档概率机制，二者是**正交**的建模路径，不构成推广/特例关系。
   **可访问链接**：https://arxiv.org/abs/2407.15261

6. **标题**：Markovian Pandora's Box（标题已核实，非此前推测的长标题）
   **作者+机构**：Yuanyuan Yang, Ruimin Zhang, Jamie Morgenstern, Haifeng Xu（华盛顿大学等；已通过 arXiv 摘要页全文核实作者名单，非待核）
   **年份/编号**：arXiv 2502.00228
   **一句话主结果**：研究盒子价值之间存在 Markov 相关性、且盒子之间存在 DAG 序约束的组合设定，证明当约束图是森林（forest）结构时问题可精确最优求解，一般 DAG 则计算困难。
   **与我们哪条定理/构造的关联**：是条目 1（Boodaghians et al. 2002.06968）的一篇前向引用/推广工作，将"树/森林约束下可精确求解"的结论从"价值独立"场景推广到"价值 Markov 相关"场景。这与 BSAA 的 B2 引理（混合引理：不需要价值随机变量之间独立，只需每次实现只有一个变量兑付）在精神上呼应——都是在放宽独立性假设的方向上做推广；但本文放宽的是"盒子价值之间的相关结构"，B2 放宽的是"折叠混合运算下的独立性要求"，两者角度不同，本文可作为"BSAA 若要引入院校间录取概率相关性建模"时的可参照方法，目前**未被 BSAA 现有定理直接覆盖**，是潜在的推广方向而非现成支撑。
   **可访问链接**：https://arxiv.org/abs/2502.00228（已核实：ID 与标题/作者匹配，非待核）

7. **标题**：Local Hedging Approximately Solves Pandora's Box Problems with Nonobligatory Inspection（标题已核实，非此前推测标题）
   **作者+机构**：Ziv Scully, Laura Doval（已通过 arXiv 摘要页全文核实作者名单，非待核）
   **年份/编号**：arXiv 2410.19011
   **一句话主结果**：提出"local hedging"技术，可将为 obligatory-inspection（必检查）组合版 Pandora's Box 设计的策略，以不超过 4/3 的近似因子代价，转换为适用于 nonobligatory-inspection（非必检查）设定下的策略，从而把大量已有的 obligatory-inspection 近似算法结果"搬运"到 nonobligatory 情形。
   **与我们哪条定理/构造的关联**：为条目 2-4 那条"nonobligatory inspection 使问题变难"的技术线索提供了一个"折算桥梁"——理论意义上说明 obligatory（BSAA 当前设定）与 nonobligatory（更一般设定）之间的价值差距是可控的（有限乘法因子）。这从侧面支持了一个论点：BSAA 选择 obligatory-inspection 假设（每个志愿必须走完整判定流程）不是丧失一般性的简化，而是问题本身在结构上更良态（可精确 DP 求解）的子类，与更一般情形之间的"价值损失"有明确上界。
   **可访问链接**：https://arxiv.org/abs/2410.19011

8. **标题**：Mechanism Design with Limited Information: The Case of Nonobligatory Inspection（Doval 原始论文，标准引用为 Doval 2018）
   **作者+机构**：Laura Doval（加州理工学院 Caltech）
   **年份/编号**：*Journal of Economic Theory*, Vol. 175 (2018), pp. 127-158（最早提出 nonobligatory inspection 概念的经济学文献，是条目 2、3、4、7 的共同理论源头）
   **一句话主结果**：首次在 Pandora's Box 框架中引入"非强制检查"（可以不检查直接选择盒子）这一假设，并指出这打破了 Weitzman 简单指数策略的最优性，需要更复杂的策略刻画。
   **与我们哪条定理/构造的关联**：是"何时经典 Weitzman/index 型策略不再最优"这一问题脉络的起点，可用于在论文相关工作部分说明：BSAA 之所以能够保留 A2 的简单排序最优性（且是 distribution-free 精确版本），关键前提正是延续了经典 obligatory-inspection 假设，未涉入 Doval 打开的"非强制检查"复杂性区域。
   **可访问链接**：https://authors.library.caltech.edu/records（Caltech 机构库存档，具体条目页面〔待核，通过 curl 重定向确认可访问但未逐一核对记录号）

9. **标题**：Efficient Pricing and Contracting Combinatorial Prophet Inequalities and Pandora's Box via Duality（Price of Information 框架论文，常引用为 Singla 2018）
   **作者+机构**：Sahil Singla（普林斯顿大学）
   **年份/编号**：arXiv 1711.00405；SODA 2018
   **一句话主结果**：提出"Price of Information"框架，把为无信息代价的组合优化（如 matroid 上的 prophet inequality）设计的"frugal 算法"系统性转换为带检查代价的组合 Pandora's Box 问题的探测策略（probing policy），获得对多种可行性约束（如 matroid 约束）下组合 Pandora's Box 问题的近似算法。
   **与我们哪条定理/构造的关联**：BSAA 的名额约束（最多提交 k 个有序志愿）是一种最简单的"基数约束"（cardinality constraint），恰好落在本文 matroid 约束框架（cardinality matroid 是 matroid 的特例）覆盖范围内；但本文关注的是**近似算法**（一般组合可行性约束下），而 BSAA 在 cardinality 约束这一特殊 matroid 下通过 A3 的下行 DP 递归拿到了**精确**多项式解——即 A3 可视为本文一般框架在 cardinality matroid 这一最简单特例下的精确特化（本文的一般性方法在此特例上不会给出比精确 DP 更强的结果，因此二者并不冲突，是"一般近似框架 vs. 特殊情形精确解"的关系，不构成相互推广）。
   **可访问链接**：https://arxiv.org/abs/1711.00405

（补充：综述性文献 arXiv 2308.12242 涉及 Pandora's Box 及相关变体的系统性综述，本轮作为背景导航使用，未单独列六元组条目，其内容已通过前述条目的引用链交叉覆盖。）

---

## 二、与 BSAA 的定理级对照（汇总结论）

1. **A2（value-index 排序定理，distribution-free）的定位**：现有文献中，"排序即最优"的结论普遍建立在 Weitzman (1979) 经典指数策略之上，且几乎所有推广（nonobligatory inspection、order constraints、time constraints、Markov correlation）都是在**放宽某个假设后重新寻找近似策略**，鲜少有文献专门论证"即使不假设价值分布已知/独立，对任意固定实现排序仍然逐点最优"这一 distribution-free 精确命题。条目 2（1905.01428）、条目 3（2212.01524）体现的"committing policy""two-order structure"框架，其存在前提仍是 nonobligatory inspection 这一额外自由度；一旦去掉该自由度（回到 obligatory inspection，即 BSAA 设定），committing policy 退化为纯排序，其近似框架不再必要——A2 恰好填补了这个"退化情形下精确最优性"的空白，是现有文献在此特殊情形下的**加强/精确化**而非重复。目前未发现任何一篇被检索到的文献明确证明过 A2 的 distribution-free 精确版本，A2 的novelty 主张在该主题线内暂无直接竞争对手，可视为得到既有文献支撑（背景框架一致）而非被现有结果覆盖。

2. **A3（精确 DP）的定位**：与条目 9（Singla 2018 的 Price of Information 框架）、条目 1（tree order constraint 的高效算法）构成呼应——cardinality 约束、无序约束或树形约束下问题都可高效精确求解；一旦加入 nonobligatory inspection（条目 4 的 NP-hardness）或复杂 DAG 序约束（条目 1 的 NP-hard 结果），可解性边界被打破。这明确刻画了 A3 精确 DP 的适用边界：**只要 BSAA 保持 obligatory inspection + cardinality/树形约束，A3 的多项式精确解是稳固的；一旦产品规则引入"跨批次强制顺序"等复杂序约束或"直录/免检"机制，需重新审视 A3 是否仍然多项式可解**。

3. **B2/B3（混合折叠定理）的定位**：暂未在本主题线文献中发现直接对应物——检索到的文献均在概率论框架内讨论（期望效用最大化），未涉及不确定性理论/机会理论（uncertainty/chance theory）的折叠运算。条目 6（2502.00228）的 Markov 相关性放宽方向与 B2 的独立性放宽方向精神类似但技术路径完全不同（一个是随机过程相关性，一个是不确定测度混合公理），可在论文中作为"平行但正交"的相关工作提及，不构成对 B2/B3 novelty 的挑战。

4. **committing policy 与"提交有序列表"结构的异同（核心问题①②）**：committing policy（条目 2 定义）= 预先划分"跳过检查直接可选"集合 + "必须检查"集合 + 后者的检查顺序。BSAA 的"提交有序列表"在结构上等价于 committing policy 中"必须检查"集合为全集、"跳过检查直接可选"集合为空的特殊情形。这一对应关系是本主题线最重要的结构发现：**BSAA 的问题设定 = committing policy 框架去掉 nonobligatory inspection 自由度后的退化情形**，据此可以在论文相关工作部分明确定位 BSAA 与 Beyhaghi-Kleinberg 系列工作（条目 2/3/4/7）的关系为"同一框架谱系下更受限但可精确求解的子情形"，而非独立提出的全新模型。

5. **近似比 vs. 精确结构（核心问题③）**：条目 2/3 提供 (1-1/e) 及两阶段结构下的近似比/PTAS；条目 1 在树约束下提供精确算法；BSAA 在其设定（obligatory + cardinality/无序约束）下通过 A2+A3 提供精确最优刻画，未发现现有文献在完全相同设定（考虑吸收机制、要求 distribution-free）下给出过比 A2/A3 更强或等价的精确结构定理，建议论文中以"committing policy 特殊情形"路径引用条目 2 作为最贴近的理论背景与致敬对象，同时明确指出 distribution-free 精确性是本文相对该文献线的边际贡献。

---

## 三、待核事项清单（禁止在正式论文中未经二次确认直接引用的细节）

- 条目 1 的 DOI / MOR 卷期号，仅凭 WebSearch 片段确认，未逐字核对期刊页面。
- ~~条目 3 中 "[GMS08]" 是否确为 Guha-Munagala-Sarkar (2008)~~ 已核实：确为 Sudipto Guha, Kamesh Munagala, Saswati Sarkar, CoRR abs/0804.1724 (2008)，通过条目 3 全文参考文献列表交叉验证，可放心引用。
- 条目 6（2502.00228）的完整作者名单未逐一核实，仅有部分姓氏来自 WebSearch 片段。
- 条目 7（2410.19011）的标题与作者组合为通过引用链检索所得，未取得该论文摘要页原文逐字确认，标题措辞可能不准确。
- 条目 8（Doval 2018）的 Caltech 机构库存档具体页面未逐条核对记录号，卷期页码来自 WebSearch 二次来源，建议正式引用前用 JET 官方页面或 Google Scholar 核对一次。
