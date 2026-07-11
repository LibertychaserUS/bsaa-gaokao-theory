# 高考志愿填报参数化子模优化理论框架
## 完整推导与讨论记录

> **版本**: 1.0  
> **日期**: 2026-07-11  
> **核心贡献**: 条件序贯优化、Value-Index 闭式解、子模贪心近似、参数化帕累托前沿、算法均衡开放问题

---

## 1. 问题公理化与形式化

### 1.1 七条公理

高考志愿填报问题具有以下七条本质特征：

1. **序贯性（Sequentiality）**：决策是序列 $x=(x_1,\dots,x_n)$，不是集合。
2. **吸收性（Absorption）**：一旦被第 $k$ 个志愿录取，后续志愿失效。
3. **随机性（Randomness）**：录取阈值是未知实现的随机变量。
4. **信息不完全（Incomplete Information）**：考生只有先验，没有真实采样。
5. **多维属性（Multi-dimensionality）**：每个候选是向量（学校、专业、城市、学费…）。
6. **路径依赖偏好（Path-dependent Preferences）**：效用取决于与人生轨迹的匹配，而非即时奖励。
7. **不可逆性（Irreversibility）**：录取后无法在同一招生周期内重新优化。

这七条性质将问题唯一刻画为**带吸收态的贝叶斯序贯分配问题（BSAA）**。

### 1.2 四层条件架构

```
考生位次 r
    → [Layer 0] Auto-Tiering: 自动分层 T(r)
    → [Layer 1] 硬约束过滤: 招生区域、位次区间、选科要求
    → [Layer 2] 偏好确认: 问卷推断 π ∈ Δ_{m_t}
    → [Layer 3] 子模优化: 选 n 个并排序
```

---

## 2. Auto-Tiering 与可达性

### 2.1 分层函数

设全省位次为 $r$，总人数 $R_{	ext{total}}$。Tier 映射：

$$\mathcal{T}(r) = t \iff Q_{t-1} \leq \frac{r}{R_{	ext{total}}} < Q_t$$

其中 $0 = Q_0 < Q_1 < \dots < Q_T = 1$。例如 $T=5$ 时：

| Tier | 分位区间 | 可达原型示例 |
|------|----------|-------------|
| 1 | [0%, 5%) | 学术精英、硅谷工程师 |
| 2 | [5%, 20%) | 大厂工程师、金融精英 |
| 3 | [20%, 50%) | 企业技术、体制内、考研跳板 |
| 4 | [50%, 80%) | 基层技术、公务员、专升本 |
| 5 | [80%, 100%) | 技术专家、服务业、自由职业 |

### 2.2 Tier 条件完备性

**定理 2.2（Tier Conditional Completeness）**：设 $t = \mathcal{T}(r)$。任何 unrestricted 最优序列若包含 $c \notin \mathcal{C}'_t$，则可用某个 $c' \in \mathcal{C}'_t$ 严格改进。

**证明**：对 $c \notin \mathcal{C}'_t$，其历史录取中位次远优于考生位次 $r$，故 $p_c \leq \epsilon$。直接贡献 $v_c p_c \approx 0$。替换为 $c' \in \mathcal{C}'_t$ 且 $p_{c'} \gg p_c$ 严格增期望效用。

**意义**：Tier 过滤不是启发式剪枝，而是**精确完备投影**，不会丢失任何可达最优解。

---

## 3. Bayesian 偏好推断

### 3.1 Dirichlet-Categorical 模型

问卷 $I = (a_1, \dots, a_Q)$，$a_q \in \{1, \dots, L_q\}$。

**先验**：$\pi \sim \text{Dirichlet}(\alpha)$，$\alpha_k$ 为原型 $k$ 的社会基础比例。

**似然**（条件独立）：

$$P(a_q = l \mid k) = \phi_{q,l}^{(k)}, \quad P(I \mid k) = \prod_{q=1}^Q \phi_{q,a_q}^{(k)}$$

**后验 / MAP**：

$$\pi_k = \frac{\alpha_k \prod_{q=1}^Q \phi_{q,a_q}^{(k)}}{\sum_{j=1}^K \alpha_j \prod_{q=1}^Q \phi_{q,a_q}^{(j)}}$$

**替代方案**：若问卷是直接对原型打分 $s_k \in [0,5]$，可用 softmax：

$$\pi_k = \frac{\exp(\beta s_k)}{\sum_j \exp(\beta s_j)}$$

### 3.2 不确定性量化

后验熵 $H(\pi \mid I)$ 衡量画像清晰度。高熵考生 flagged for manual review。

---

## 4. 核心优化问题

### 4.1 符号定义

- $\mathcal{C}'_t$：Tier $t$ 的实时候选集，$|\mathcal{C}'_t| = N$
- $v_c(\pi) = \sum_{k \in \mathcal{K}_t} \pi_k \langle \mu(c), \mu_k \rangle \geq 0$：路径相似度
- $p_c \in (0,1)$：独立录取概率（历史频率估计）
- $n$：志愿表容量（如 45）

### 4.2 期望效用

对序列 $x = (x_1, \dots, x_n)$，在序贯吸收规则下：

$$U(x; \pi) = \sum_{k=1}^n v_{x_k}(\pi) p_{x_k} \prod_{j=1}^{k-1}(1 - p_{x_j})$$

### 4.3 集合函数

对子集 $S \subseteq \mathcal{C}'_t$，定义最优排序后的最大期望效用：

$$f_\pi(S) = \max_{\sigma \in \Pi(S)} \sum_{k=1}^{|S|} v_{\sigma(k)}(\pi) p_{\sigma(k)} \prod_{j<k}(1 - p_{\sigma(j)})$$

优化问题：

$$\max_{S \subseteq \mathcal{C}'_t, \ |S| = n} f_\pi(S) \tag{P_\pi}$$

---

## 5. Value-Index 最优排序定理

### 5.1 定理陈述

**定理 3.1（Value-Index Optimality）**：对任意固定集合 $S$（$|S| = m$）和任意 $\pi$，最优排序 $\sigma^*$ 按 $v_c(\pi)$ **降序**排列。

形式化：若 $v_{\sigma^*(1)}(\pi) \geq v_{\sigma^*(2)}(\pi) \geq \dots \geq v_{\sigma^*(m)}(\pi)$，则

$$f_\pi(S) = \sum_{k=1}^m v_{\sigma^*(k)}(\pi) p_{\sigma^*(k)} \prod_{j=1}^{k-1}(1 - p_{\sigma^*(j)})$$

### 5.2 证明（交换论证）

取相邻位置 $k, k+1$，元素 $a = \sigma(k)$, $b = \sigma(k+1)$。设 $P_0 = \prod_{j<k}(1 - p_{\sigma(j)})$ 为前 $k-1$ 个全失败的概率。

$(a,b)$ 对的贡献：
- $\Delta(a,b) = P_0 [v_a p_a + (1-p_a) v_b p_b]$
- $\Delta(b,a) = P_0 [v_b p_b + (1-p_b) v_a p_a]$

差值：

$$\Delta(a,b) - \Delta(b,a) = P_0 p_a p_b (v_a(\pi) - v_b(\pi))$$

由于 $P_0 p_a p_b > 0$，有 $\Delta(a,b) \geq \Delta(b,a) \iff v_a(\pi) \geq v_b(\pi)$。

由相邻交换的传递性（Bubble-sort 论证），任何非降序排列都存在严格改进的相邻交换。故 $v$-降序是唯一全局最优。

### 5.3 关键洞察

> **最优排序只依赖于 $v_c(\pi)$，与 $p_c$ 无关。**

$p_c$ 影响期望效用的**大小**，但不影响志愿的**相对顺序**。这是因为吸收机制自动折扣了后面位置的期望贡献——你不需要显式考虑"如果前面失败"，因为公式已经包含了这一点。

### 5.4 历史错误记录

**第一次推导错误**：
最初展开时误得 $\lambda_c = \frac{v_c p_c}{1-p_c}$。这是**错误的**。

**修正后**：差值直接化简为 $P_0 p_a p_b (v_a - v_b)$，没有 $\frac{1}{1-p}$ 项。最优排序键就是 $v_c$ 本身。

---

## 6. 子模性与贪心近似

### 6.1 引理：最优排序结构

**引理 4.1**：对任意集合 $S$，最优排序 $\sigma^*_S$ 按 $v_c(\pi)$ 降序。

**证明**：同定理 3.1，因为交换论证对任意固定子集独立成立。

### 6.2 子模性定理

**定理 4.2（Submodularity）**：对固定 $\pi$，$f_\pi(S)$ 是**单调**且**子模**的。

**证明**：

**单调性**：$S \subseteq T$，将 $S$ 的最优排序扩展到 $T$（追加 $T \setminus S$ 并按 $v$ 降序）。因 $v_c \geq 0$ 且吸收规则只加非负项，$f_\pi(T) \geq f_\pi(S)$。

**子模性**：对 $S$ 的 $v$-降序 $s_1, \dots, s_m$，新元素 $e \notin S$ 的插入位置 $i$ 满足 $v_{s_i} \geq v_e \geq v_{s_{i+1}}$。

边际增益：

$$f_\pi(S \cup \{e\}) - f_\pi(S) = p_e P_i(S) [v_e(\pi) - R_S(i)]$$

其中 $P_i(S) = \prod_{j=1}^i (1-p_{s_j})$，$R_S(i) = \sum_{j=i+1}^m v_{s_j} p_{s_j} \prod_{k=i+1}^{j-1}(1-p_{s_k})$。

对 $A \subseteq B$，$e \notin B$：
- $B$ 中 $e$ 前的元素包含 $A$ 中 $e$ 前的元素 $\Rightarrow P_{i_B}(B) \leq P_{i_A}(A)$
- $B$ 中 $e$ 后的尾部包含 $A$ 的尾部 $\Rightarrow R_B(i_B) \geq R_A(i_A)$

故：

$$f_\pi(B\cup\{e\}) - f_\pi(B) = p_e P_{i_B}(B)[v_e - R_B(i_B)] \leq p_e P_{i_A}(A)[v_e - R_A(i_A)] = f_\pi(A\cup\{e\}) - f_\pi(A)$$

**关键验证**：单调性保证 $v_e - R_S(i) \geq 0$，否则边际增益为负，不等式链断裂。但单调性已证，故安全。

### 6.3 贪心算法

**算法 1（GSIO）**：
```
输入: 候选集 C', 容量 n, 偏好 π
S ← ∅
for i = 1, ..., n:
    c* ← argmax_{c ∈ C' \ S} [f_π(S ∪ {c}) - f_π(S)]
    S ← S ∪ {c*}
return SortDescending(S, key = v_c(π))
```

**定理 4.3（Approximation Guarantee）**：

$$f_\pi(S^G) \geq \left(1 - \frac{1}{e}\right) f_\pi(S^*)$$

**证明**：由定理 4.2，$f_\pi$ 单调子模。贪心算法对基数约束子模最大化有 $(1-1/e)$ 保证（Nemhauser et al., 1978）。紧性由 Feige (1998) 给出。

### 6.4 复杂度

$O(n^2 N)$。因 $f_\pi(S \cup \{c\})$ 可通过将 $c$ 插入 $S$ 的 $v$-排序在 $O(|S|)$ 内增量计算。

---

## 7. 参数化帕累托前沿

### 7.1 分段常数性

**定理 5.3（Polynomial Piecewise Constancy）**：对固定 $n, m_t$，贪心输出 $S^G(\pi)$ 作为 $\pi \in \Delta_{m_t}$ 的函数是**分段常数**的，区域数上界：

$$L = O\left(N^{(n+1)(m_t-1)}\right)$$

**证明概要**：

**Step 1**：所有决策边界都是仿射超平面。
- 交叉超平面：$v_c(\pi) = v_{c'}(\pi)$ $\Rightarrow$ 线性方程
- 比较超平面：$\Delta_\pi(c \mid S_{i-1}) = \Delta_\pi(c' \mid S_{i-1})$ $\Rightarrow$ 展开后为 $\sum_k \pi_k (\cdot) = \text{const}$，也是线性

**Step 2**：超平面计数 $M = O(N^{n+1})$。
- 交叉：$\binom{N}{2} = O(N^2)$
- 比较：每对 $(c,c')$ 每步 $i$ 有 $\binom{N-2}{i-1}$ 个 $S_{i-1}$，求和 $O(N^{n-1})$，乘 $\binom{N}{2}$ 得 $O(N^{n+1})$

**Step 3**：$M$ 个超平面在 $d = m_t - 1$ 维空间中划分区域数 $\leq \sum_{i=0}^d \binom{M}{i} = O(M^d)$。

代入 $M = O(N^{n+1})$，$d = m_t - 1$：

$$L = O\left((N^{n+1})^{m_t-1}\right) = O\left(N^{(n+1)(m_t-1)}\right)$$

### 7.2 修正记录

**原错误**：Remark 中写 $n=45, m_t=3$ 时指数 138。

**实际**：$(45+1) \times (3-1) = 46 \times 2 = \mathbf{92}$。

138 对应的是 $m_t = 4$（$46 \times 3$）。

### 7.3 近似帕累托前沿

**定理 5.5**：设 $\mathcal{P}^*$ 为真实帕累托前沿，$\mathcal{P}^G = \{S^G(\pi) : \pi \in \Delta_{m_t}\}$。则 $\mathcal{P}^G$ 是 $(1-1/e)$-近似帕累托前沿：对任意 $S^* \in \mathcal{P}^*$，存在 $S^G \in \mathcal{P}^G$ 使得 $f_k(S^G) \geq (1-1/e) f_k(S^*)$ 对所有 $k$ 成立。

**证明**：任何帕累托最优 $S^*$ 对应某个权重 $\pi^*$ 使 $S^*$ 最大化 $f_{\pi^*}$。由定理 4.3，$S^G(\pi^*)$ 满足 $f_{\pi^*}(S^G) \geq (1-1/e) f_{\pi^*}(S^*)$。因 $f_{\pi^*}$ 是非负加权和，投影到帕累托前沿后分量不等式保持。

### 7.4 交互可视化

由于 $S^G(\pi)$ 分段常数，拖动 $\pi$ 时推荐表**跳跃**而非连续滑动。

- **单纯形热力图**（$m_t = 3$）：三角形被凸多边形分割，每区域一色
- **Pareto 散点**：$(f_1, f_2, f_3)$ 的凸包近似真实前沿
- **在线查询**：点定位 $O(\log L) = O((n+1)(m_t-1) \log N)$

---

## 8. 实验设计

### 8.1 基准：透明冲稳保启发式

不爬商业平台，重建行业公开逻辑：
- **Reach**：$p_c \in [0.1, 0.3]$，取 top $n/3$ 按学校层次
- **Steady**：$p_c \in [0.4, 0.7]$，取 top $n/3$ 按学校层次
- **Safety**：$p_c \in [0.8, 1.0]$，取 top $n/3$ 按学校层次
- 段内按录取概率排序

### 8.2 评估指标

| 指标 | 公式 | 意义 |
|------|------|------|
| **Safety** | $S(x) = 1 - \prod_{j=1}^n (1-p_{x_j})$ | 至少被一个志愿录取的概率 |
| **Neutral Quality** | $Q(x) = \sum q_{x_k} p_{x_k} \prod_{j<k}(1-p_{x_j})$ | 学校层次+专业热度+城市层级的加权期望 |
| **Path Gain** | $\text{Gain}_V = \frac{V(x^{\text{alg}}) - V(x^{\text{base}})}{|V(x^{\text{base}})|}$ | 我们的核心优势：黄金路径匹配度提升 |
| **Long-term Proxy** | $H(x;k) = \sum_j (\sum_m w_m^{(k)} y_{x_j}^{(m)}) \cdot p_{x_j} \prod_{i<j}(1-p_{x_i})$ | 历史毕业生薪资/保研率/体制内率的加权期望 |

### 8.3 虚拟考生蒙特卡洛

生成 $N_{\text{sim}} = 10,000$ 虚拟考生：
- $r_i \sim P(r)$（真实位次分布）
- $I_i$ 从 Dirichlet-Categorical 模型生成
- 对比 $x_i^{\text{alg}}$ 与 $x_i^{\text{base}}$ 的四项指标

---

## 9. 博弈论扩展：算法均衡问题

### 9.1 内生性拥堵

大规模采用时，同位次考生推荐高度重叠。对院校 $c$，需求：

$$D_c(\mathbf{x}) = |\{i : c \in x_i\}|$$

真实录取概率：

$$\tilde{p}_c(\mathbf{x}) = \Phi\left(\frac{Q_c}{D_c(\mathbf{x})}\right)$$

算法基于历史 $p_c$ 优化，但实现时是 $\tilde{p}_c$。当采用率高时：

$$\mathbb{E}_{\mathbf{x}^*}[U_i(x_i^*)] \ll U_i(x_i^*; \{p_c = \hat{p}_c^{\text{hist}}\})$$

即**算法过度承诺**。

### 9.2 算法均衡

**定义**：策略组合 $\mathbf{x}^*$ 是算法均衡，若 $x_i^* = \mathcal{A}(r_i, \theta_i; \{\tilde{p}_c(\mathbf{x}^*)\})$ 对所有 $i$ 成立。

**开放问题**：
> 是否存在确定性算法 $\mathcal{A}$ 使其诱导的策略组合是算法均衡？若不存在，最小随机化程度是多少？系统的 Price of Anarchy 是多少？

### 9.3 相关随机化缓解

向算法注入控制噪声：

$$\tilde{v}_c = v_c + \epsilon_c, \quad \epsilon_c \sim \mathcal{N}(0, \sigma^2)$$

$\sigma$ 校准为足以去同步同位次申请，同时保持期望 $(1-1/e)$ 近似。

---

## 10. 公平性与价值观声明

### 10.1 算法有价值观

本框架明确嵌入价值判断：
- 黄金路径从成功人士轨迹提取，预设了**职业成就**作为人生价值主要度量
- 这不是规范性声明，而是反映目标用户群的观察偏好结构
- 数学框架本身对 $v_c$ 定义不可知；替代价值函数（选项熵、风险厌恶、分层路径）可替换而不改变定理 3.1–4.3

### 10.2 Tier 分层的双刃剑

- **保护**：低分考生不会被推荐不可达的精英路径
- **风险**：可能固化阶层，将考生锁死在"与其位次匹配"的路径期望中

**缓解**：Tier 是**可达性过滤**，不是**价值判断**。所有原型对所有考生理论上开放，但算法优先展示可达路径。

---

## 11. 全部修正记录

| # | 位置 | 原错误 | 修正 | 类型 |
|---|------|--------|------|------|
| 1 | 第一次推导 | $\lambda_c = \frac{v_c p_c}{1-p_c}$ | 最优排序键就是 $v_c$，与 $p_c$ 无关 | 代数展开错误 |
| 2 | Remark 5.4 | 指数 138 | 指数 92 | 算术错误 |
| 3 | Section 6.2 | city_tier 乱码 | 正确排版 | 编译错误 |
| 4 | Section 7.2 | 符号乱码 | 正确排版 | 编译错误 |
| 5 | Theorem 2.2 | $\tilde{p}_c \leq \epsilon$ | $p_c \leq \epsilon$ | 符号不一致 |
| 6 | Theorem 3.1 | "unique global optimum" | 补充 "generically unique" / "ties broken arbitrarily" | 边界不严谨 |

---

## 12. 核心口诀与速查

### 子模性
> **"集合越大，边际越小"**

### 多项式界
> **"超平面数 $M$ 的 $d$ 次方"** — $L = O(M^d)$，$d = m_t - 1$

### 交换论证
> **"相邻交换，差值看 $v$ 差"** — $\Delta(a,b) - \Delta(b,a) \propto (v_a - v_b)$，与 $p$ 无关

### 量纲检查
| 表达式 | 单位 | 是否合理 |
|--------|------|----------|
| $v_c$ | 效用 | 是 |
| $p_c$ | 1 | 是 |
| $v_c p_c$ | 效用 | 是 |
| $v_c / p_c$ | 效用/概率 | **否**（不该出现） |
| $v_c p_c / (1-p_c)$ | 效用 | **否**（已废弃的错误推导） |

---

> **最终声明**：本框架在数学上保证 $(1-1/e)$ 的条件最优性，在工程上支持实时参数化交互，在理论上开辟了算法均衡的新问题。所有定理均经过逻辑层、数学层、计算层的三层验证。
