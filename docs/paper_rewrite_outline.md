# 论文全量重写结构大纲（供 Oliver 审骨架，确认后写全文）

> 依据：`research_directions_2026-07-15.md`（设计定稿）+ `formal/LEMMAS.md`（已证定理）+ `BIBLIOGRAPHY_ANNOTATED.md`（相关工作+新颖性风险）。
> 原则：理论/模型/定理/相关工作**现在全量到位**；实验章节留"结果占位符"，7/22 山东前瞻验证数据回来只填数字，不改结构。
> 诚实纪律：已证的进正文，未证的（A5/A6/B6）明确标 future work 或 scope 声明；不把作废旧定位（(1-1/e) 是我们的贡献、AUC=0.998）带进来。

---

## 标题（候选）
- 主推：**Bayesian Sequential Assignment with Absorption: Exact and Distribution-Free Portfolio Optimization for Gaokao Volunteer Filling**
- 副线（投聊城不确定系统会）：强调 uncertain-random 混合模型的版本

## Abstract（重写要点）
- 问题：高考志愿=带吸收的序贯组合决策，提交前不知实现阈值。
- 定位诚实转向：**不宣称首创排序/子模/贪心**——明确 BSAA ≡ Chade-Smith (2006) college application portfolio，我们在高考语境重新发现并**精确化**。
- 真正贡献五点（见下）。
- 方法背书：核心定理链 **Lean 4 机器验证零 sorry**。
- 实验：山东全省权威数据 + **7/22 真实 out-of-time 前瞻验证**（结果占位）。

## 1. Introduction
- 1.1 问题与规模（千万考生、序贯吸收、一次性提交）。
- 1.2 现状批判：商业产品靠冲/稳/保启发式，无最优性保证、无多目标、无校准概率。
- 1.3 七条本质属性 → 唯一刻画为 BSAA。
- 1.4 **贡献声明（新五点，取代旧的"三定理"）**：
  1. **精确 + distribution-free**：吸收结构下 value-index 排序对任意联合分布逐点最优（不需独立/分布已知）；精确 DP（O(Nn)）取代 (1-1/e) 近似定位。
  2. **混合模型（本项目核心新意）**：录取端概率（频率数据）× 价值端不确定（专家信度），以 chance theory 正统结合；关键引理 B2——吸收单兑付结构使混合期望折叠**无需价值间独立性**。
  3. **阈值顺序统计量校准**：阈值=报考者位次分布第 m 顺序统计量，结构化异方差 Var≈p(1-p)/[N·f²]，破"池化同方差 vs 每组少观测"两难。
  4. **相关性对冲的定量刻画**：Fréchet 界（P(至少录取一)≥max p_j，保底=相关性对冲）+ correlation gap 决策质量层（诚实声明不覆盖下尾）。
  5. **真实前瞻验证**：山东 2026 冻结预测（时间戳+哈希）对 7/22 公布投档线，非回测。
- 1.5 机器验证背书：Lean 4 形式化。

## 2. Related Work（**全新章节，旧版几乎空白**）
- 2.1 **Pandora's Box 谱系**：Weitzman (1979) 源头指数策略；Doval (2018) nonobligatory inspection 起点；**committing policy（Beyhaghi-Kleinberg）——BSAA 精确定位为"必检集=全集、跳过集=空"的退化特例**，正因保留 obligatory inspection 才保有简单排序最优。
- 2.2 **组合搜索/申请组合**：Chade-Smith (2006) 是 BSAA 直接真身；Chade-Lewis-Smith (2014) 冲/保；Ali-Shorrer（College Portfolio）common-score 下 MIA 失效——正面区分。
- 2.3 **相关性推广**：Chawla et al. (2020) PA/FA 区分（BSAA 提交后无停止决策=能精确的根源）；最优 4-近似 (2509.17029) 是 2025 最强——**明说我们靠吸收得精确、他们靠近似，模型不同**。
- 2.4 **风险准则**：Ji (2026) CVaR-Pandora——**不声称 CVaR 排序首创**，定位为 B6 未来工作的技术基础。
- 2.5 子模优化（Nemhauser 等，保留但降为背景）；校准（顺序统计量、conformal）；不确定性理论（Liu，动机侧）。

## 3. Problem Formulation
- 3.1 七属性形式化。
- 3.2 BSAA 定义：候选 (p_c, v_c)，方案=无重复有序列表，效用 U(x)=Σ v·p·Π(1-p)。
- 3.3 目标函数恒等式 f(S)=E[max_{c∈A∩S} v_c]，layer-cake→嵌套 coverage（子模性一行）。
- 3.4 scope 声明：平行志愿批次；退档/调剂按专业组假设（雷1/雷24 显式列为边界）。

## 4. Structural Theory（**全部对应 Lean 已证定理，标注定理名**）
- 4.1 **Thm A2（value-index distribution-free）**：逐点排序，任意联合分布最优。★Lean 验证
- 4.2 **Thm A3（DP 精确）**：Horner 分解 + 逆向归纳，O(Nn) 精确。★Lean 验证。明确：贪心=MIA 在基数约束下精确（Chade-Smith），**配额约束下贪心不保证、必须 DP**。
- 4.3 **子模性**（TS 穷举验证 N≤8，非 Lean——诚实标注层级差异）。
- 4.4 **配额 DP**：冲稳保作硬约束，状态加一维仍精确（814 实例零失配）。
- 4.5 **Thm A4（Fréchet 安全界）**：P(≥1录取)≥max p_j，共单调取等。★Lean（选做）
- 4.6 分段常数 Pareto（Thm 5.3 保留，参数化偏好新意）。

## 5. Mixed Model: Random Admission × Uncertain Value（**核心新章，旧版无**）
- 5.1 动机：黄金路径价值无频率数据只有专家信度→Liu 不确定统计；录取阈值有 49 万频率数据→概率论。
- 5.2 chance theory（uncertain random）正统结合。
- 5.3 **Thm B2（混合归约主引理）**：吸收单兑付 ⇒ E_ch[Y]=Σ Pr[首录=c]·E[V_c]，**无需 V 间独立**。★Lean 验证
- 5.4 **Thm B3（优化转移）**：v̂_c=E[V_c] 代入，整个优化核（排序/DP/Fréchet）原封不动。★Lean 验证
- 5.5 **Thm B6（期望效用型风险厌恶折叠）**：凹效用 u 的 v̂=E[u(V)] 免费兼容；**边界声明**：分位数/CVaR/机会约束非线性准则不可折叠=开放问题（引 Ji 2026 为技术前沿）。

## 6. Calibration（阈值分布范式，取代旧的拍脑袋 sigmoid）
- 6.1 范式：估阈值预测分布 G_p，p=1-G_p(R)，全系统唯一概率口径。
- 6.2 结构化异方差（顺序统计量方差公式，一分一段给 f）。
- 6.3 六件套评估协议（留一年/Brier/Murphy/分层/CORP/sharpness）；**明确弃用 AUC（两个 AUC 皆构造伪影）**。
- 6.4 无泄漏 + 年对有效性掩码（政策断层五层矩阵；2024 选科断层只打理工农医子集）。
- 6.5 删失感知（le/missing/head_aggregate/征集轮）——从 M区 设计接。

## 7. Data & Provenance（**新章，投稿可信度关键**）
- 7.1 单省权威数据集战略（山东：专业级颗粒度、2020 起无断层、无调剂→BSAA 原子假设完美贴合）。
- 7.2 三区架构（L/R/D，跨区禁 join）。
- 7.3 政策引用六元组 + 数据 MANIFEST sha256 链（Data & Policy Provenance 附录）。

## 8. Experiments（**结构到位，数字留占位——7/22 后填**）
- 8.1 前瞻验证协议（预注册指标、冻结时间戳/哈希、7/22 对账口径、雷23 并入类别注记过滤）。
- 8.2 [占位] 校准质量（六件套结果表）。
- 8.3 [占位] GSIO/DP vs 冲稳保基线（点预测 MAE + CRPS + 区间覆盖率）。
- 8.4 [占位] 前瞻验证对账结果（预测 vs 7/22 实际投档线）。
- 8.5 参数化 Pareto 前沿演示（分段常数性可视化，理论已定可先做）。

## 9. Discussion / Limitations / Future Work
- 9.1 承重假设诚实清单（A1-A4 需数据验证/裁决项 + 雷24 征集轮独立性近似）。
- 9.2 退档/调剂建模（A5/A6，future work，机制级最大边界）。
- 9.3 非线性风险准则（B6 CVaR 开放问题，引 Ji 攻法方向）。
- 9.4 performativity（大规模采用→cutoff 漂移；近优平台随机化零代价缓解）。
- 9.5 相关性精确性边界（独立=精确/相关=近似的复杂度-现实性故事）。

## 附录
- A. Lean 形式化定理清单（LEMMAS 映射）。
- B. Data & Policy Provenance（六元组 + sha256）。
- C. 复现说明（脚本 git hash + 构建三元组）。

---

## 待 Oliver 确认的骨架级问题
1. **标题主推哪个**（OR 期刊向 vs 聊城不确定系统会向）？还是先写通用版，投稿时再裁？
2. **§5 混合模型放正文还是降为一节**？它是核心新意但也是最"非主流 OR"的部分——投 OR 期刊可能是加分也可能是审稿风险。
3. **实验章节**：8.2-8.4 现在全留占位，还是先用现有黑龙江旧数据填一版"方法演示"（标注非最终、待山东前瞻替换）？
4. **§7 Data & Provenance 单独成章还是并入实验**？我倾向单独成章（这是我们相对同类工作的硬差异化）。
