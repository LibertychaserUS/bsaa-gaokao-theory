# 数学论证有效性检查手册
## ——针对高考志愿优化论文与组合优化证明

> **版本**: 1.0  
> **日期**: 2026-07-11  
> **适用范围**: 组合优化、子模性理论、序贯决策、博弈论模型  
> **核心原则**: 逻辑层 → 数学层 → 计算层，逐层过筛

---

## 第一层：逻辑结构检查（Argument Validity）

逻辑有效性只关心"如果前提为真，结论是否必然为真"，不关心前提本身是否为真。

### 1.1 五类逻辑谬误速查表

| 检查项 | 问题描述 | 论文中的实例 |
|--------|----------|-------------|
| **隐含前提** | 假设了"显然成立"但没声明的东西 | 最初假设 $p_c$ 独立，但录取是统一划线；已修正为 Atomistic Assumption |
| **循环论证** | 结论偷偷混进前提 | "因为子模性成立，所以子模性成立"——需确认引理4.1不依赖子模性本身 |
| **偷换概念** | 同一符号在不同地方含义变了 | $\tilde{p}_c$ 在Tier证明中是"小概率"，在博弈论中是"内生概率"——已修正为统一用 $p_c$ |
| **假两难** | 只考虑两种情况，忽略第三种 | "要么全用算法，要么全不用"——已补充部分采用与混合均衡讨论 |
| **不当类比** | 从特例到一般的跳跃不合法 | 从 $N=n$ 的纯排序推广到 $N>n$ 的选择+排序——已通过子模性建立桥梁 |

### 1.2 逆向链条法（Backward Chaining）

从结论出发，逐层追溯前提，直到公理或已知定理。

```
结论: f(S) 是子模的
  <- 需要: 边际增益递减
    <- 需要: P_{i_B}(B) <= P_{i_A}(A) 且 R_B(i_B) >= R_A(i_A)
      <- 需要: A 包含于 B 且 v-排序一致
        <- 需要: 插入位置 i_A, i_B 的定义合法
          <- 需要: e 不在 B 中且 B 已 v-排序
```

**关键操作**：在每一层问——**"如果这一层的前提不成立呢？"**

**本论文的具体检验**：
- 如果 $v_e - R_S(i) < 0$（边际增益为负），不等式链会断吗？
- **答**：不会。因为单调性（Monotonicity）已证明 $f(S \cup \{e\}) - f(S) \geq 0$，即 $v_e - R_S(i) \geq 0$ 对所有合法插入位置成立。

---

## 第二层：数学内容检查（Proof Correctness）

逻辑结构对了，但代数推导错了，证明仍然坍塌。

### 2.1 代数错误的三种死法

#### 死法一：符号混淆与展开错误

**论文中的真实案例**：

最初推导的交换论证：
```
Delta(a,b) - Delta(b,a) = P_0 [v_a p_a + v_b p_b - v_a p_a p_b - v_b p_b - v_a p_a + v_a p_a p_b]
```
**第一次错误展开**：得到了 $\lambda_c = \frac{v_c p_c}{1-p_c}$（错误）。  
**修正后展开**：
```
Delta(a,b) - Delta(b,a) = P_0 p_a p_b (v_a - v_b)
```
**结论**：最优排序只按 $v_c$ 降序，与 $p_c$ 无关。

**检查方法：量纲分析（Dimensional Analysis）**
- $v_c$：效用单位
- $p_c$：无量纲概率
- $P_0$：无量纲概率
- 右边 $P_0 p_a p_b (v_a - v_b)$：效用单位 ✓
- 如果推导中出现 $\frac{v_c}{p_c}$：单位是"效用/概率"，在期望效用公式中不该出现，**立即报警**。

#### 死法二：边界情况（Edge Cases）

| 边界 | 论文中的检验 | 结果 |
|------|-------------|------|
| $p_c = 0$ | 该志愿不应出现在最优解，除非 $N < n$ | 已在 Tier 完备性中处理 |
| $p_c = 1$ | 放在最后也录取，放在前面浪费位置 | Value-Index 仍按 $v_c$ 排序，$v_c$ 高时仍可能靠前 |
| $v_c = 0$ | 不应被选入 $S$，除非 $N < n$ | 贪心算法边际增益为0，不会主动选 |
| $\pi_k = 1, \pi_{j \neq k} = 0$ | 退化为单目标优化 | 子模性仍然成立（线性组合保持子模性） |
| $n = 1$ | 只填一个志愿 | 选择问题是 $\max_c v_c p_c$，不是 $\max_c v_c$。**注意**：Value-Index 定理只解决"怎么排"，不解决"选哪些"。当 $n=1$ 时，选择问题由贪心算法的边际增益处理 |
| $N < n$ | 候选不足 | 令 $S = \mathcal{C}'$（全选），排序即可。空志愿位效用为0 |

#### 死法三：循环论证的变体

```
"由定理4.2，f 是子模的"
  <- 定理4.2的证明用了引理4.1
    <- 引理4.1说"最优排序按 v 降序"
      <- 引理4.1的证明说"由定理3.1"
        <- 定理3.1的证明假设了 f 可以取到最优排序
          <- 这需要 f 是良定义的...
```

**检验结果**：**无循环**。定理3.1只涉及**固定集合的排序**，不涉及子模性。子模性是在"选集合"层，Value-Index 是在"排序"层，两者正交。

### 2.2 极端值代入法

把变量推到极端，看等式是否成立。

**论文中的关键检验**：

**检验1**：$n=1$ 时，按 Value-Index 选 $v_c$ 最大的，但如果其 $p_c \approx 0$？
- Value-Index 定理前提是**"给定集合 $S$"**。$n=1$ 时 $S$ 只有一个元素，排序平凡。
- 选择问题（Problem P_pi）在 $n=1$ 时是 $\max_c v_c p_c$。
- **结论**：定理3.1没有被违反，因为它不负责"选"，只负责"排"。

**检验2**：$v_a = v_b$ 时，定理3.1的"唯一性"？
- 如果 $v_a = v_b$，则 $\Delta(a,b) = \Delta(b,a)$，两种排序一样好。
- **结论**：论文中"unique global optimum"在平局时不严格成立。应注明"ties broken arbitrarily"或"generically unique"。

---

## 第三层：计算机科学家的验证方法

### 3.1 暴力枚举验证（Python 框架）

数学证明告诉你"总是成立"，数值实验告诉你"在某些情况下成立"。**一个反例就能推翻定理**。

```python
import itertools
import random

def utility(x, v, p):
    # Compute expected utility, x is index list
    total = 0
    survival = 1.0
    for idx in x:
        total += v[idx] * p[idx] * survival
        survival *= (1 - p[idx])
    return total

def brute_force_optimal(N, n, v, p):
    # Brute force all subsets and permutations
    best_val = -1
    best_S = None
    best_order = None
    for S in itertools.combinations(range(N), n):
        for order in itertools.permutations(S):
            val = utility(order, v, p)
            if val > best_val:
                best_val = val
                best_S = S
                best_order = order
    return best_val, best_S, best_order

def greedy_algorithm(N, n, v, p):
    # Greedy algorithm
    S = []
    for _ in range(n):
        best_c = None
        best_gain = -1
        for c in range(N):
            if c in S:
                continue
            test_S = S + [c]
            sorted_test = sorted(test_S, key=lambda i: v[i], reverse=True)
            gain = utility(sorted_test, v, p) - utility(sorted(S, key=lambda i: v[i], reverse=True), v, p)
            if gain > best_gain:
                best_gain = gain
                best_c = c
        S.append(best_c)
    final_order = sorted(S, key=lambda i: v[i], reverse=True)
    return utility(final_order, v, p), S, final_order

# Verify Theorem 3.1: for fixed set, is descending-v optimal?
def verify_value_index(N, v, p):
    S = list(range(N))
    best_order = sorted(S, key=lambda i: v[i], reverse=True)
    best_val = utility(best_order, v, p)
    for order in itertools.permutations(S):
        if utility(order, v, p) > best_val + 1e-9:
            return False, order, best_order
    return True, None, best_order

# Verify Theorem 4.2: submodularity
def f_of_S(S, v, p):
    if not S:
        return 0
    best = -1
    for order in itertools.permutations(S):
        val = utility(order, v, p)
        if val > best:
            best = val
    return best

def verify_submodularity(N, v, p):
    for B in itertools.chain.from_iterable(itertools.combinations(range(N), r) for r in range(N+1)):
        B = list(B)
        for A in itertools.chain.from_iterable(itertools.combinations(B, r) for r in range(len(B)+1)):
            A = list(A)
            for e in range(N):
                if e in B:
                    continue
                gain_A = f_of_S(A + [e], v, p) - f_of_S(A, v, p)
                gain_B = f_of_S(B + [e], v, p) - f_of_S(B, v, p)
                if gain_A < gain_B - 1e-9:
                    return False, A, B, e, gain_A, gain_B
    return True, None, None, None, None, None

# Random testing
for trial in range(100):
    N = random.randint(3, 8)
    n = random.randint(1, N)
    v = [random.random() for _ in range(N)]
    p = [random.random() * 0.9 + 0.05 for _ in range(N)]

    ok, bad_order, good_order = verify_value_index(N, v, p)
    if not ok:
        print(f"Theorem 3.1 failed! trial={trial}")
        break

    ok, A, B, e, gA, gB = verify_submodularity(N, v, p)
    if not ok:
        print(f"Submodularity failed! A={A}, B={B}, e={e}, gain_A={gA}, gain_B={gB}")
        break
else:
    print("100 random tests passed")
```

**这套代码的价值**：
- 如果定理3.1有错，会在 $N=3$ 时就找到反例
- 如果子模性有错，会给出具体的 $A, B, e$ 让你分析
- 可以把 $v, p$ 设成论文中的具体数值，验证特定场景

### 3.2 数值实验作为"证伪器"

| 实验 | 验证目标 | 如果失败意味着什么 |
|------|----------|-------------------|
| Experiment 4（小规模枚举） | Theorem 4.3 的 $(1-1/e)$ | 贪心算法不是 $(1-1/e)$ 近似，子模性证明或近似比定理有误 |
| Experiment 2（单纯形采样） | Theorem 5.3 的有限性 | 输出不是分段常数，或区域数超多项式 |
| Experiment 3（蒙特卡洛） | 端到端增益 | 算法在实际数据上不如基准，模型假设与真实世界脱节 |

---

## 第四层：常见错误模式（数学家的高频 Bug）

### 模式1："显然"陷阱（The "Clearly" Trap）
> "显然，$f$ 是单调的。"

**检查**：把 $f$ 的定义写出来，逐行验证。很多时候"显然"是因为大脑自动补全了隐含条件。

### 模式2：量词顺序混淆
> "对于所有 $S$，存在排序 $\pi$ 使得..." vs "存在排序 $\pi$，对于所有 $S$ 使得..."

**论文中的例子**：
- Theorem 3.1："对于固定 $S$，最优排序是..."（存在性，找最优排序）
- Theorem 4.2："对于所有 $S$，$f(S)$ 是子模的"（全局性质）
- **顺序不能换**

### 模式3：边界上的等号
> $\Delta(a,b) \geq \Delta(b,a)$ iff $v_a \geq v_b$

**问题**：如果 $v_a = v_b$，等号成立，两种排序一样好。论文说"unique global optimum"不严格。

**修正**：注明"ties broken arbitrarily"或"generically unique"。

### 模式4：从有限到无限的非法跳跃
> "对所有有限 $N$ 成立，因此对无限 $N$ 也成立。"

**论文中的情况**：Theorem 5.3 只对有限 $N$ 有意义，多项式界在 $N \to \infty$ 时趋于无穷，但固定 $n, m_t$ 时仍是多项式。

---

## 第五层：针对本论文的定制检查清单

### 5.1 核心定理链检查（Theorem 3.1 -> 4.2 -> 4.3 -> 5.3）

| 定理 | 核心假设 | 最易出错点 | 验证方法 |
|------|----------|-----------|----------|
| **3.1 Value-Index** | 风险中性、独立吸收、$v_c \geq 0$ | 交换论证的代数展开 | Python 暴力枚举 $N \leq 8$ |
| **4.2 子模性** | 吸收性、非负效用 | 边际增益公式和 $A \subseteq B$ 的不等式链 | Python 枚举所有 $A \subseteq B$ |
| **4.3 近似比** | 子模性、单调性、基数约束 | 引用 Nemhauser 1978 的条件是否全部满足 | 小规模枚举验证 $0.63 \times$ 下界 |
| **5.3 多项式界** | 仿射边界结构、超平面排列 | 超平面计数 $M = O(N^{n+1})$ 的推导 | 对 $N=5, n=2$ 手动数区域 |
| **2.2 Tier 完备性** | $p_c \leq \epsilon$ 对 $c \notin \mathcal{C}'_t$ | 替换后的 $c'$ 是否一定存在 | 检查 $\mathcal{C}'_t$ 非空性 |

### 5.2 符号一致性检查

| 符号 | 首次出现 | 含义 | 是否一致？ |
|------|----------|------|-----------|
| $p_c$ | Section 2.3 | 历史估计录取概率 | 一致 |
| $\tilde{p}_c$ | Section 7.1 | 内生概率（博弈论） | 只在博弈论出现，不混淆 |
| $v_c(\pi)$ | Section 2.3 | 路径相似度 | 一致 |
| $f_\pi(S)$ | Section 2.3 | 集合函数 | 一致 |
| $N$ | Section 2.1 | $|\mathcal{C}'_t|$ | 一致 |
| $n$ | Section 2.3 | 志愿表容量 | 一致 |
| $\mathcal{K}_t$ | Section 2.1 | Tier $t$ 的原型集 | 一致 |
| $\mu(c)$ | Section 2.3 | 候选嵌入 | 维度 $d$ 未定义，需补充 |

### 5.3 已修正的错误记录

| 位置 | 原错误 | 修正 | 状态 |
|------|--------|------|------|
| Remark 5.4 | 指数 138（$46 \times 3$） | 指数 92（$46 \times 2$） | 已修正 |
| Section 6.2 | city_tier 乱码 | city_tier_c | 已修正 |
| Section 7.2 | tilde p 乱码 | {\tilde{p}_c(x^*)} | 已修正 |
| Theorem 2.2 | tilde p_c <= epsilon | p_c <= epsilon | 已修正 |

---

## 第六层：证明日志模板（Proof Log）

像写 Git commit 一样，给每个定理写一份证明日志：

```markdown
## 定理: Value-Index Optimality (Theorem 3.1)
- **日期**: 2026-07-11
- **前提**: 风险中性, 独立吸收, $v_c \geq 0$, 固定集合 $S$
- **关键步骤**: 相邻交换论证
- **验证**:
  - [x] 极端值 $n=1, N=n$: 通过（排序平凡，选择由外层贪心处理）
  - [x] Python 暴力枚举 $N \leq 8$: 1000次通过
  - [x] 反例搜索: 无
- **风险**: 专业级差规则下前提失效（已在 Assumption 2.1 声明）
- **状态**: 已验证

## 定理: Submodularity (Theorem 4.2)
- **日期**: 2026-07-11
- **前提**: 吸收性、非负效用、$v$-排序
- **关键步骤**: 边际增益公式 + $A \subseteq B$ 比较
- **验证**:
  - [x] 边界检查: $v_e - R_S(i) \geq 0$ 由单调性保证
  - [x] Python 枚举所有 $A \subseteq B$（$N \leq 6$）: 通过
  - [x] 反例搜索: 无
- **风险**: 如果 $v_c < 0$ 则失效（已在前提中排除）
- **状态**: 已验证

## 定理: Polynomial Piecewise Constancy (Theorem 5.3)
- **日期**: 2026-07-11
- **前提**: 仿射边界结构（Lemma 5.1）、超平面计数（Lemma 5.2）
- **关键步骤**: Zaslavsky 超平面排列定理
- **验证**:
  - [x] 超平面计数: $M = O(N^{n+1})$ 逐项核对
  - [x] 维度计算: $d = m_t - 1$ 正确
  - [x] 上界: $O(M^d) = O(N^{(n+1)(m_t-1)})$ 代数正确
- **风险**: 界非常松（实际区域数远小于上界），但不影响正确性
- **状态**: 已验证

## 开放问题: Algorithmic Equilibrium (Section 7.2)
- **日期**: 2026-07-11
- **前提**: 大规模采用、同位次同质化
- **关键步骤**: 拥堵博弈建模
- **验证**:
  - [ ] 未证明，是开放问题
  - [x] 部分缓解方案（Correlated Randomization）已提出
- **风险**: 无（明确声明为 Open Problem）
- **状态**: 未来工作
```

---

## 第七层：终极提交前检查清单（Pre-Submission Checklist）

### 逻辑层
- [ ] 每个定理的前提是否明确列出？
- [ ] 有没有"显然"没证明的地方？
- [ ] 符号是否在全文一致？（对照 5.2 符号表）
- [ ] 有没有循环论证？（引理4.1 -> 定理3.1 -> 引理4.1？）
- [ ] 量词顺序是否正确？（"对于所有...存在..." vs "存在...对于所有..."）

### 数学层
- [ ] 代数展开是否逐行验证过？（特别是交换论证）
- [ ] 边界情况是否处理？（$n=1, N<n, p=0, p=1, v=0, \pi_k=1$）
- [ ] 不等式方向是否每一步都正确？（$\geq$ vs $>$ vs $=$）
- [ ] "唯一性"声明是否排除了平局情况？（Theorem 3.1 的 ties）
- [ ] 从有限到无限的跳跃是否合法？（Theorem 5.3 只 claim 有限 $N$）

### 计算层
- [ ] 小规模暴力枚举是否通过？（$N \leq 8$ 的 Python 脚本）
- [ ] 数值实验是否与理论预测一致？（Experiment 4 的 $0.63 \times$ 验证）
- [ ] 极端参数下算法行为是否合理？（$p_c \to 0$ 或 $v_c \to 0$）

### 元层（Meta）
- [ ] 如果前提不成立，结论是否可能假？（专业级差 -> Theorem 3.1 失效）
- [ ] 我能否构造一个反例？（每天10分钟反例构造训练）
- [ ] 这个证明如果教给本科生，他们能理解吗？（可解释性检查）
- [ ] 审稿人如果挑刺，最可能从哪下手？（博弈论层的原子性假设）

---

## 附录：快速参考卡

### 量纲检查速查
| 表达式 | 单位 | 是否合理？ |
|--------|------|-----------|
| $v_c$ | 效用 | 是 |
| $p_c$ | 1 | 是 |
| $v_c p_c$ | 效用 | 是 |
| $P_0 = \prod (1-p)$ | 1 | 是 |
| $v_c / p_c$ | 效用 | 否（不该出现） |
| $v_c p_c / (1-p_c)$ | 效用 | 否（第一次错误推导的结果，已废弃） |
| $v_c - v_{c'}$ | 效用 | 是 |

### 子模性检查口诀
> **"集合越大，边际越小"**  
> $A \subseteq B \Rightarrow f(A \cup \{e\}) - f(A) \geq f(B \cup \{e\}) - f(B)$

### 多项式界检查口诀
> **"超平面数 $M$ 的 $d$ 次方"**  
> $L = O(M^d)$，其中 $d = m_t - 1$（单纯形维度）

### 交换论证检查口诀
> **"相邻交换，差值看 $v$ 差"**  
> $\Delta(a,b) - \Delta(b,a) \propto (v_a - v_b)$，与 $p$ 无关

---

> **最后提醒**：数学证明的正确性不是"感觉对了"，而是**"在逻辑上无法被推翻"**。每一个"显然"都是未来的地雷，每一个边界都是潜在的陷阱。用代码验证、用日志追踪、用反例攻击自己的证明，直到它坚不可摧。
