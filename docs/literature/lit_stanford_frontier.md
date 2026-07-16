# 斯坦福新论文猎手 + 最前沿 — 文献备忘

> 收集 agent（仅收集+评注，不改现有文件/不写实现）。基线对照：`docs/research_directions_2026-07-15.md` §1-§3 +
> `formal/LEMMAS.md`（尤其 B6：EU 风险折叠边界，quantile/CVaR/chance-constrained 准则不可折叠，开放问题）。
> 工具约束：WebFetch 对 arxiv.org / ar5iv / semanticscholar.org / google.com 均返回 "Unable to verify domain"（网络策略阻断），
> 本文件全部结论基于 **WebSearch 摘要/片段**，未获取任何全文 PDF。凡未能交叉确认的事实均标注"待核"。
> 增量落盘：本文件为一次性整合写入（因多轮 WebFetch 受阻，未能分篇增量保存，改为汇总后一次性落盘）。

---

## 排序候选列表（按"是 Oliver 所指论文"的可能性排序）

### 候选 #1（高置信）：CVaR-Aware Pandora's Box and Prophet Inequalities

- **标题｜作者+机构｜年份/arxiv或期刊号｜一句话主结果｜与我们哪条定理/构造的关联｜可访问链接**
- Risk of Bad Tails: CVaR-Aware Pandora's Box and Prophet Inequalities｜确认作者之一 **Jingwei Ji（Stanford, Management Science and Engineering）**，其余合著者姓名待核（WebSearch 片段未完整列出全部作者，仅从 PDF 文本片段中识别出 Ji 的机构标注）｜arXiv 2605.19181（v1/v2 均见，标题在不同版本间略有出入："CVaR-Aware Pandora's Box and Prophet Inequality" vs "...Inequalities"）｜研究 Pandora's Box 与 prophet inequality 的 CVaR（条件风险价值）变体：**Pandora's Box 情形下风险规避问题仍保留一个"优雅的 Weitzman 式指数解"（经一维变分归约后得到）；但 prophet inequality 情形下没有这个好性质**——对任意 CVaR 水平 α∈(0,1)，若无分布结构假设，不存在正的常数近似比；额外加上 recentered IFRA（increasing-failure-rate-average）条件后，阈值策略性质恢复｜**直接命中** `formal/LEMMAS.md` B6 开放问题边界：B6 明确指出 quantile/CVaR/chance-constrained 类准则在"whole-table distribution"上不可线性折叠，是我们自己标记的未解问题；这篇论文正是在 Pandora's Box 这个我们的直接理论祖先模型上，系统性地刻画了 CVaR 准则下 Weitzman 指数策略"何时仍最优、何时失效"的边界条件（IFRA 分布假设）——这对 BSAA 未来若要处理"保底/风险规避型"排序策略提供了可直接借用的技术路径（一维变分归约 + IFRA 条件）｜https://arxiv.org/abs/2605.19181 （WebFetch 被阻断，仅 WebSearch 摘要片段，**未获取全文，标注"仅摘要/未取全文"**）

**判断理由**：这是目前唯一同时满足"（a）明确含 Stanford 作者、（b）2026 年最新（arXiv 编号 2605.xxxxx，对应约 2026 年 5 月区间）、（c）主题精确落在 Pandora's Box + 风险准则交叉点、且（d）与我们自己 LEMMAS.md B6 标记的开放问题直接对应"这四个条件的论文。**待核事项**：完整作者名单未确认（除 Jingwei Ji 外无法从搜索片段中提取其他作者姓名）；这也是 Oliver 描述"新数学+Pandora's Box"的最贴切候选，因为它字面上就是在做"经典 Pandora's Box 的一个新变体的新数学"。

### 候选 #2（中置信，同一研究者的前作/姊妹篇）：The Pandora's Box Problem with Sequential Inspections

- The Pandora's Box Problem with Sequential Inspections｜**Jingwei Ji（Stanford MS&E）+ Ali Aouad（London Business School）+ Yaron Shaposhnik（合著者，机构待核，推测 University of Rochester Simon Business School，未交叉确认）**｜arXiv 2507.07508；已发表于 *Operations Research*（INFORMS），DOI 10.1287/opre.2024.0733｜研究 Pandora's Box 的推广：agent 可以选择"完全打开"箱子付费获取精确值，也可以"部分打开"付较低费用获取有噪声/部分信息，引入了检查深度的序贯决策结构｜与 BSAA 的关联弱于候选 #1，但确立了 Jingwei Ji 是 Stanford 一位持续在做 Pandora's Box 变体研究的学者，其"序贯检查"设定（部分信息 vs 完全信息的代价-信息权衡）与我们 LEMMAS.md 中"两阶段吸收"（A5，退档/滑档建模）在方法论上有类比空间：都是在经典 Pandora's Box 单次揭示模型上叠加一层"信息获取的中间状态"｜https://arxiv.org/abs/2507.07508 （仅摘要片段，已发表版可查 pubsonline.informs.org/doi/abs/10.1287/opre.2024.0733，但该链接同样未做全文 WebFetch，仅摘要）

### 候选 #3（已排除，非 Stanford）：Pandora's Box Reopened: Robust Search and Choice Overload

- Pandora's Box Reopened: Robust Search and Choice Overload｜**Sarah Auster（University of Bonn）+ Yeon-Koo Che（Columbia University, Kelvin J. Lancaster Professor of Economic Theory）**——**确认无 Stanford 作者**｜arXiv 2512.21192；亦见 CEPR Discussion Paper DP20984｜研究经典 Pandora's Box 问题中，决策者以"最小化最大事后遗憾（minimize maximal ex-post regret）"为目标（而非期望效用），刻画遗憾最小化搜索规则，并说明"选择过载"（choice overload，选项越多反而更可能选择退出/outside option）现象如何从这个稳健准则中自然涌现｜与 B6 的"非线性准则不可折叠"问题也有一定相关性（minimax regret 同样是非线性于分布的准则），但**作者机构不是 Stanford**，与 Oliver 明确要求"斯坦福论文"不符，仅作为主题相关但排除的候选记录在案｜https://arxiv.org/abs/2512.21192 （仅摘要片段；机构信息来自 cepr.org 作者主页列表，非 arXiv 页面本身，标注"仅摘要/未取全文"）

**结论**：此前该论文被列为"需要确认作者"的候选，现已通过 cepr.org 的 Yeon-Koo Che 个人页面找到确切归属——**明确排除**，因为两位作者均非 Stanford（Bonn + Columbia）。

---

## 已排查但判定为低相关/低置信的方向

- **Chirag Pabbaraju**（Stanford CS Theory 五年级博士生，Moses Charikar + Gregory Valiant 联合指导）——WebSearch 结果（含其个人主页片段、OpenReview、Simons Institute 简介）均显示其研究方向为"statistical and algorithmic learning theory"（统计与算法学习理论），**没有任何搜索结果显示他有 Pandora's Box / 序贯搜索相关论文**。判定为**不匹配**，非 Oliver 所指论文的作者。（其 Stanford 个人主页 web.stanford.edu/~cpabbara/ 被 WebFetch 阻断，无法进一步核实完整发表列表，故完整排除仍"待核"，但现有证据强烈指向不匹配。）
- **Amin Saberi（Stanford MS&E）**——搜索显示其近期工作集中在两阶段二分匹配的最优舍入（SODA 2026）及作为 Stanford 博士后职位的导师，**未搜到其直接署名的 Pandora's Box 论文**。低相关。
- **Itai Ashlagi（Stanford MS&E）**——个人主页搜索片段显示近期工作是器官分配（与 Alvin Roth 合作，2026），**与 Pandora's Box 无直接关联**。低相关。
- **Ramesh Johari**——未搜到与 Pandora's Box 直接相关的近期论文；search 中出现的关联仅是同一批检索结果里的噪声（如 "Optimal Stopping vs Best-of-N for Inference Time Optimization", arXiv 2510.01394，作者含 Yusuf Kalayci@USC，未确认 Stanford 主导）。低相关。
- **Paul Milgrom 学术谱系**——未检索到其本人或直系学生近期（2025-2026）的 Pandora's Box 论文；此线索未能推进，标注"待核/未找到"。
- **"Sequential Search with Planning"**（arXiv 2606.10438）——研究"ordered Pandora's box"，决策者先付费选定初始探索范围（stage 数），后续可扩展范围；论文本身注明"作者按 Ray and Robson (2018) 惯例随机排序"（这是经济学常见的作者顺序说明，本身不透露具体作者名单），WebSearch 未能提取任何作者姓名或机构。**完全待核**，无法判断是否 Stanford，暂不纳入排序候选。
- **"A Proper Scoring Rule for Evaluating Sequential Search"**（arXiv 2605.01936）——主题是序贯搜索的评分规则校准（与我们的校准子系统主题相近），但未搜到作者/机构信息，且未直接涉及 Pandora's Box 的 box-opening/absorption 结构，相关性判定为主题邻近但不是核心候选。**待核**。
- **"Matching with Nested and Bundled Pandora Boxes"**（arXiv 2406.08711，Robin Bowers & Bo Waggoner）——未确认 Stanford 归属，且发布时间（2406，约 2024 年）不算"最新"，判定不匹配"最新斯坦福论文"的描述。

---

## 给 Oliver 的确认问题

1. **我的最佳猜测是候选 #1：arXiv 2605.19181《CVaR-Aware Pandora's Box and Prophet Inequalities》**，确认作者含 Stanford MS&E 的 Jingwei Ji。这篇论文在"新数学"（CVaR 一维变分归约 + IFRA 分布条件下的 Weitzman 指数解边界刻画）和"Pandora's Box"两个关键词上都精确命中，并且恰好落在我们自己 `formal/LEMMAS.md` B6 标记的开放问题（quantile/CVaR 类非线性准则不可折叠）上。请确认这是否就是您所指的论文？
2. 如果不是，是否记得论文标题中是否含"assignment / matching / absorption / commitment"这类关键词（而非"CVaR / risk / regret"）？这将帮助排除候选 #1/#2，转向搜索其他 Stanford 匹配/指派方向的序贯搜索论文（目前尚未系统检索"Stanford + 双边匹配 + Pandora's Box"这一交叉，可作为下一步方向）。
3. 候选 #2（arXiv 2507.07508，Ji + Aouad + Shaposhnik，已发表于 Operations Research）是否是您记忆中"更早看到、后来又有新版本/新论文"的那篇？如果 Oliver 记得的是"最近几周内看到的"，时间线上更贴近候选 #1（2605.xxxxx，约 2026 年 5 月）而非候选 #2（2507.xxxxx，约 2025 年 7 月）。
4. 候选 #3（Pandora's Box Reopened, arXiv 2512.21192）已确认作者为 Bonn + Columbia，**明确不是 Stanford**——如果 Oliver 记忆中"新论文"这个印象来自看到"Pandora's Box Reopened"这个标题本身，需要纠正：这篇不满足"斯坦福"这一条件。

**若无法进一步确认，最终建议**：以候选 #1（arXiv 2605.19181）作为最可能答案，理由是四个约束条件（Stanford + 最新 + Pandora's Box + 与我们自己的开放问题直接对应）同时满足度最高。但完整作者名单和论文最终定稿状态仍需人工核实全文（建议 Oliver 若有 arXiv/Google Scholar 直接访问权限，可自行拉取 PDF 首页核对作者列表，因为本次搜索环境的 WebFetch 对 arxiv.org 等域名被网络策略阻断，只能依赖 WebSearch 摘要片段）。
