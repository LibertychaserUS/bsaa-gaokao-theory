# CVaR-Aware Pandora's Box and Prophet Inequalities — 深挖备忘

> 收集 agent（仅收集+评注，不改现有文件/不写实现）。基线对照：`docs/research_directions_2026-07-15.md` §1-§3、
> §7.6（分位数准则级联组合开放问题）+ `formal/LEMMAS.md` B6（EU 风险折叠边界，quantile/CVaR/chance-constrained
> 准则不可折叠，标注为开放问题）。
>
> **工具突破**：本次通过 Chrome DevTools 浏览器（而非 WebFetch/WebSearch，两者在本环境对 arxiv.org 等域名
> 均系统性受阻）成功打开 arXiv 摘要页与 HTML 全文页（`arxiv.org/html/2605.19181v3`），**取得全文**（非仅摘要）。
> 之前 `lit_stanford_frontier.md` 中标注"仅摘要/未取全文/待核"的关键事项，本文件已用全文交叉核实并更新。

---

## 六元组

| 字段 | 内容 |
|---|---|
| 标题 | *Risk of Bad Tails: CVaR-Aware Pandora's Box and Prophet Inequalities* |
| 作者 + 机构 | **Jingwei Ji**，Management Science and Engineering, **Stanford University**（`jingwei.ji@stanford.edu`）。**全文页脚已核实：单一作者**，此前 `lit_stanford_frontier.md` 标注的"其余合著者待核"应更新为"无其余合著者" |
| 年份/号 | arXiv:2605.19181 [cs.CC]；v1 2026-05-18，v2 2026-06-17，v3（现行版）2026-06-21。License CC BY-NC-ND 4.0。**未见任何会议/期刊接收标注**（arXiv 页面 Subjects 仅列 cs.CC，无 "to appear in..." 字样） |
| 主结果一句话 | Pandora's Box 的 CVaR 版本经一维变分归约后**精确保留 Weitzman 指数解**；但 prophet inequality 的 CVaR 版本**没有**这个好性质——对任意 α∈(0,1) 若无额外分布结构则不存在正常数近似比，需 IFRA 条件才恢复常数保证 |
| 与我们 B6/排序定理的关联 | **技术工具，可能部分解开我们自己标记的开放问题**（见下文详述），而非竞争性抢先发表；模型设定（Weitzman 单次揭示+检查成本）与 BSAA（Bernoulli 录取+无检查成本）不同构，需要移植而非直接套用 |
| 可访问链接 | 摘要页 <https://arxiv.org/abs/2605.19181>；全文 HTML <https://arxiv.org/html/2605.19181v3>（本次经浏览器工具实际读取，**全文已取**）；PDF <https://arxiv.org/pdf/2605.19181> |

---

## 详细问答

### 1. 作者 + 机构：是否斯坦福？

**确认，且是唯一作者。** 全文 HTML 页脚（`arxiv.org/html/2605.19181v3`）明确写着：

> Jingwei Ji
> Management Science and Engineering Stanford University
> jingwei.ji@stanford.edu

单一作者，无合著者。这纠正了此前 `lit_stanford_frontier.md` 中"其余合著者姓名待核"的悬而未决状态——不是没搜到其他作者的名字，而是根本没有其他作者。

Jingwei Ji 此前另有一篇 Pandora's Box 相关工作（`lit_stanford_frontier.md` 候选#2）：*The Pandora's Box Problem with Sequential Inspections*（arXiv 2507.07508，与 Ali Aouad、Yaron Shaposhnik 合著，已发表于 *Operations Research*），可见其是持续在 Weitzman/Pandora's Box 谱系深耕的斯坦福学者，这篇 CVaR 论文是其独立署名的后续/平行工作。

**确信度：高**（直接从全文页脚原文提取，非二手转述）。

### 2. CVaR 模型：风险厌恶如何进入 Pandora's Box？

目标函数从经典 Weitzman (1979) 的

$$\max_\pi \; \mathbb{E}\Big[\sum_i \mathbb{A}_i X_i - \sum_i \mathbb{I}_i c_i\Big]$$

变成

$$\max_\pi \; \Big\{\mathrm{CVaR}_\alpha\Big(\sum_i \mathbb{A}_i X_i\Big) - \mathbb{E}\Big[\sum_i \mathbb{I}_i c_i\Big]\Big\}$$

**关键设计选择（Remark 1）**：只对**选中的奖品**（selected prize）取 CVaR，检查成本仍保持期望形式不变。作者明确说明这是刻意的建模选择："成本通常是确定性或近确定性的、数额不大，而奖品才承载分布风险"。α=1 时退化为经典 Weitzman 目标。

这个"只对结果取风险度量、成本仍线性"的建模选择，与我们 LEMMAS.md B6 的风险折叠恰好是**同一类问题的孪生版本**：B6 关心的是"整表 Y"（即最终录取的那个候选的价值）的非线性风险准则，Ji 这里关心的是"选中的奖品"$\sum_i \mathbb{A}_i X_i$ 的非线性风险准则——两者都是"one-hot 选择结果"上的 CVaR，结构完全对应。

### 3. 核心定理：CVaR 目标下 Weitzman 精确指数规则是否仍然最优？

**是，但需要一个额外的一维外层搜索——这正是"retains an exact Weitzman-style index solution"这句话的完整含义。**

机制（Theorem 1 + 证明，Section 3.2）：

1. **变分表示（Step 1-2）**：用 Rockafellar-Uryasev (2000, 2002) 的 CVaR 变分恒等式
   $\mathrm{CVaR}_\alpha(Y) = \sup_{t\in\mathbb{R}} \{\frac{1}{\alpha}\mathbb{E}[\min\{t,Y\}] - \frac{1-\alpha}{\alpha}t\}$，
   把非线性的 CVaR 转写成"对一个标量 $t$ 取 sup 的一族**期望**（线性）泛函"。
2. **策略与 $t$ 的 sup 交换顺序（Step 3）**：因为两个 sup 是对同一目标函数在 $(\pi,t)$ 联合定义域上的 sup，可自由交换。
3. **one-hot 代数恒等式（Step 4，关键一步）**：因为 $\mathbb{A}=(\mathbb{A}_1,\dots,\mathbb{A}_n)$ 是 one-hot（恰好一个为 1），对任意函数 $f$ 有 $f(\sum_i \mathbb{A}_i X_i) = \sum_i \mathbb{A}_i f(X_i)$。取 $f(y)=\min\{t,y\}$，把 $\min$ 提进线性组合内部：$\min\{t,\sum_i \mathbb{A}_i X_i\} = \sum_i \mathbb{A}_i \min\{t,X_i\}$。
4. **内层问题退化为经典风险中性 Pandora 实例（Step 5）**：固定 $t$ 后，内层 sup 恰好是用**截断+缩放后的奖品** $\tilde X_i = \frac{1}{\alpha}\min\{t,X_i\}$、**成本不变** $c_i$ 的经典 Weitzman 问题——直接套用经典指数定理，指数 $\sigma_i(t)$ 由 $c_i = \mathbb{E}[(\tilde X_i - \sigma_i(t))^+]$ 唯一确定。
5. **外层一维优化**：$t^\star \in \arg\max_t \mathbb{E}[\max_i \kappa_i(t)] - \frac{1-\alpha}{\alpha}t$，$\kappa_i(t)=\min\{\tilde X_i, \sigma_i(t)\}$。

所以精确的表述是：**CVaR 目标本身不是线性可折叠的（呼应我们 B6 的判断），但它可以被"提升一维"精确归约成一族线性可折叠（期望型）子问题，每个子问题都精确保留 Weitzman 指数结构，代价是要多做一次一维标量搜索。** 这不是"CVaR 意外地变成线性了"，而是"CVaR 存在一个精确的、可计算的非线性→线性族的归约"。

### 4. Prophet Inequality 的 CVaR 结果

**结果方向相反：没有免费的午餐。**

Theorem 2：对任意固定 $\alpha\in(0,1)$，在独立非负奖励分布这一全类上，**不存在**依赖 $\alpha$ 的正常数 $c$，使得在线策略的 $\mathrm{CVaR}_\alpha(S)$ 总能保证达到先知 $\mathrm{CVaR}_\alpha(M)$ 的至少 $c$ 倍——这与风险中性情形（$\alpha=1$，Krengel-Sucheston 1977/1978 的经典 $1/2$ 常数）形成鲜明对比。取而代之的是一个**依赖具体实例**的紧界 $B_\alpha(M)$（threshold tail-capture coefficient，由阈值 $\tau$、截断 $t$、临界点 tie-breaking 概率 $r$ 三元组的 sup 定义），由某个阈值策略精确达到。

**两项奖品的困难实例（Section 4.1 证明中）**：第一项奖品设计成有很多可能取值、越稀有的取值比例上越大（这样"加入更多可能取值"会不断推高先知的 CVaR 基准）；第二项奖品以概率 $\alpha$ 支付 0、否则支付一个很大的值（先知的 CVaR 由"第二项恰好为 0"这一分支主导）。在线策略必须在不知道第二项是否为零之前决定是否拿第一项——若为了保留拿到第二项大奖的机会而拒绝第一项，那份上行收益落在最坏 $\alpha$-分位之外，对 CVaR 毫无帮助。这个构造直接揭示了 CVaR 目标的本质障碍：**它只衡量最差的 $\alpha$-比例结果，牺牲上行去保留小概率大奖完全不划算。**

**正面结果（Section 4.2）**：若奖励分布是连续的且满足 recentered **IFRA**（increasing-failure-rate-average，可靠性理论中的经典形状约束，Kochar & Wiens 1987），则阈值策略可以恢复一个显式的、只依赖 $\alpha$ 的正常数乘性近似保证。

### 5. 与 BSAA 的定理级关联

**这不是对我们核心定理的抢先发表/新颖性竞争，而是一个可能移植的技术工具**，理由分五层说清楚：

**(a) 模型不同构，不能直接套用。** Weitzman/Ji 模型的随机原语是"打开箱子付费揭示一个随机奖品值 $X_i$"（cost-of-information 权衡），选择是"在已揭示的箱子里挑最大的"；BSAA 的随机原语是"候选以概率 $p_c$ 录取你（Bernoulli 吸收），价值 $v_c$ 本身已知/确定"，没有检查成本，是"first-success 级联"结构。两者是 Pandora's Box 谱系下的两个不同变体（我们自己 `research_directions_2026-07-15.md` §1 已指出 BSAA 祖先是 Chade-Smith 2006，与 Mitten/Kadane/Simon-Kadane 指标定理同源，跟 Weitzman 1979 是平行谱系，不是同一个模型）。

**(b) 但核心代数技巧（one-hot 提升）结构上可移植。** Ji 证明 Step 4 的关键恒等式 $\min\{t,\sum_i\mathbb{A}_iX_i\}=\sum_i\mathbb{A}_i\min\{t,X_i\}$ 只依赖于"$\mathbb{A}$ 是 one-hot 选择向量"这一点，不依赖 Weitzman 模型的检查成本细节。BSAA 的最终兑付同样是 one-hot：$Y=\sum_c \mathbb{1}[\text{首次录取}=c]\cdot v_c$。这意味着**同一个变分归约技巧原则上可以直接搬到 BSAA 上**：
$$\mathrm{CVaR}_\alpha(Y) = \sup_t \Big\{\tfrac{1}{\alpha}\mathbb{E}\big[\max_{\text{可行序}} \text{(用 } \min\{t,v_c\}\text{ 替代 } v_c\text{ 后的 BSAA 值)}\big] - \tfrac{1-\alpha}{\alpha}t\Big\}$$
即：把每个候选的价值截断为 $\min\{t,v_c\}$ 后，跑一次**风险中性**的 BSAA 精确 DP（排序不变，因为 $\min\{t,\cdot\}$ 是单调变换，只是可能造成截断后的并列，需要用原始 v 做二级排序打破平局），再对标量 $t$ 做一维外层搜索。

**(c) 这直接命中 LEMMAS.md B6 的开放问题边界，且是"部分解开"而非"证明无法解开"。** B6 明确写"分位数/机会约束/CVaR 型准则（对整表 Y 的 Ch 分布非线性）不可分离，为开放问题"。Ji 这篇论文相当于给出了 CVaR 这一个特例的解法路径——不是直接的线性折叠（B6 原本设想的那种），而是"非线性 CVaR = 线性期望族的一维 sup"这一更弱但同样可用的归约。**如果这个技巧能在 BSAA 设定下坐实（需要新证明，非直接抄），意味着 B6 的开放问题在 CVaR 这个子情形下可能有解**，从"开放问题"降级为"已知构造性解法待形式化"。

**(d) 但不要过度乐观——至少三处需要新工作，不能白嫖：**
   - BSAA 的价值折叠是在 Bernoulli 录取的**级联**结构上（不是单次揭示），需要重新证明"截断后 DP 仍精确"这一步，而不能照抄 Weitzman 的指数唯一性论证（我们的 DP 递推 $g(i,k)$ 与 Weitzman 指数公式形式不同，虽然同源）。
   - 配额约束（冲稳保硬约束）下我们已知贪心失效、只能用 DP（雷4）；Ji 论文完全没有配额/组合约束，这部分的 CVaR 兼容性是全新问题，不能假设自动成立。
   - Ji 论文假设独立奖励分布；我们自己 §3-4 已经指出相关录取（单因子 Vasicek 模型）下期望目标仍保子模但 DP 精确性已经退化为近似——CVaR + 相关性会是双重新问题，Ji 论文完全没有涉及（其模型本身独立性是基本假设，未讨论相关扩展）。

**(e) prophet inequality 部分的负面结果是一个有用的"防御性引用"，提示我们不要在 CVaR 场景下随意声称鲍鱼式的分布无关常数保证。** 我们 A2 排序定理的核心卖点是"distribution-free"（对任意联合分布逐点成立）；Ji 的 Theorem 2 证明了**CVaR 版本的 prophet inequality 恰恰放弃了这种分布无关性**——没有额外结构（IFRA）就没有常数保证。这提示：如果我们未来想要一个"CVaR 版 BSAA 排序定理"，很可能也无法维持 A2 那种纯 distribution-free 的强度，需要额外假设（可能类比 IFRA 或别的形状约束）。这与我们自己在 §7.6 的硬度论证链（Chern 1992/Maehara 2015/Wang-Yu 2026）方向完全一致，是同一个"分位数类准则天生更脆弱"叙事的又一实锐佐证，应该并列引用。

**结论**：这篇论文对我们**既是支撑（技术工具+硬度佐证），也划出了边界（不能直接套，级联+配额+相关性下的 CVaR 兼容性仍是我们自己要做的新工作）**。不构成对我们新颖性的竞争性抢先，因为它的模型（单次揭示、无组合约束、独立性假设）与 BSAA 的核心新颖性主张（级联吸收+配额约束+相关鲁棒+真实系统校准）在维度上基本正交。

### 6. 年份/发表状态

- arXiv 2605.19181，v1 提交 **2026-05-18**，v2 **2026-06-17**，v3（当前版）**2026-06-21**。
- Subjects: **Computational Complexity (cs.CC)**（单一学科分类，未见交叉列在 cs.DS/cs.GT）。
- **未见任何会议/期刊接收标注**——arXiv 摘要页没有"to appear in..."或类似字样，License 为 arXiv 默认的 CC BY-NC-ND 4.0（非出版方版权声明模式）。据此判断：**截至可见信息，该论文尚未确认被会议/期刊接收，处于 arXiv preprint 阶段**（这点未做超出 arXiv 页面本身的独立核实，比如没有去查该作者主页或 Google Scholar profile 交叉确认投稿状态，如需更高确信度需另外核实）。

---

## 给 Oliver 的确认：这是否是你说的斯坦福那篇

**大概率是。** 四个条件同时满足：(a) 确认斯坦福作者（Jingwei Ji，MS&E，单一作者，全文页脚原文核实）；(b) 时间新（2026 年 5-6 月，是近几周内的工作）；(c) 主题精确落在 Pandora's Box 之上；(d) 恰好命中我们自己 LEMMAS.md B6 标记的"CVaR 不可折叠"开放问题,是"新数学+Pandora's Box"这一描述里最贴切的候选。

**如果这不是你记忆中的那篇**，可以用来排除的线索：这篇论文**不涉及**匹配/指派（assignment/matching）、不涉及退档/调剂（absorption/commitment）、不涉及组合约束/配额，纯粹是经典单代理 Weitzman Pandora's Box 加 CVaR 目标的数学分析论文，没有任何"高考志愿""大学申请"或类似应用场景的措辞。如果你记忆中的斯坦福论文提到过这类应用场景关键词，那可能是另一篇，需要重新搜索。

**给理论组的建议**：如果确认是这篇，下一步可以让 lean-prover 或 theory-gates agent 评估"one-hot 提升技巧移植到 BSAA 级联结构"的可行性——这可能是 B6 开放问题里第一个有真实解法路径的子情形，值得单独立一个 v3 待办项（对应 LEMMAS.md 待办区，建议编号 B7）。
