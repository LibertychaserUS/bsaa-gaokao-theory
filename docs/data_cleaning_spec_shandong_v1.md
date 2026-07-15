# 山东数据集标注与清洗规范 v1

状态：**规范先行**（Oliver 2026-07-16 指令）。本文件是 R 区（raw）→ D 区（derived）构建的**唯一立法**；
执行者（sonnet 清洗 agent）只实现与执行本规范，**无权修改规则**——规则歧义/未覆盖样式一律上报主循环，
由主循环修订规范后重跑。配套背景见 `research_directions_2026-07-15.md` §7.9（三区架构 + 实证雷 14-22）。

依据：2026-07-16 主循环对 4 年普通类第 1 次投档表的实证检查（18286/19230/20300/21381 行全量解析）
+ 全体括号注记普查（2594 种，16632 次出现）。规范中的正反例全部取自真实数据。

---

## 0. 总原则（P 系列）

- **P1 原文不可变**：R 区文件永不修改。一切"修复"都是构建代码里的显式规则；禁止手改任何数据文件。
- **P2 无声即错**：每一行输入，要么成功进 D 区，要么进异常台账（带原因码）。
  恒等式 `输入行数 = 输出行数 + 台账行数` 逐文件机器校验（门 G1）。
  禁止静默丢弃、静默 coerce、静默去重、静默截断。
- **P3 确定性优先，保留优先于修复**：清洗器只做确定性变换（同输入同输出）；
  不确定的值保留原文并打标，不猜测修复。**行级禁止 LLM 即兴判断**——执行 agent 跑的是规则代码，
  不是对每行"理解一下"；规则未覆盖 → 台账 → 人审 → 增补词表/规则（版本号+1）→ 全量重跑。
- **P4 双列并存**：每个被规范化的字段同时保留 `*_raw`（原文）与 `*_norm`（规范化）两列，可追溯可回滚。
- **P5 可复算**：D 区任何表 = f(R 区文件, 规则版本, 脚本版本)。构建元数据（`build_meta.json`）记录：
  每个源文件 sha256、构建脚本 git hash、规范版本号、词表版本号、构建时间。
  表内容摘要 = sha256(按主键排序的规范 CSV 导出)，重跑摘要必须一致（逻辑确定性）。
- **P6 口径显式**：每张 D 区表的元数据声明口径（位次口径=投档最低位次；含政策性加分；轮次/层次语义；
  年份覆盖）。任何消费方不允许"默认懂"。
- **P7 范围=普通类（Oliver 2026-07-16 裁决："我们最重要的是普通类，其他特殊的可以放一放"）**：
  v1 构建范围 = **普通类常规批**。第 1 次志愿（本科主轮）= 主线，清洗必须完美；
  第 2/3 次表只服务"曾征集"哨兵与专科支线。**体育/艺术类整体封存**：raw 已采文件原地保留
  （R 区不动、零成本），**不进 v1 derived 构建、不进验收门、不派清洗工作量**；
  未来若启用，按本规范同构扩展（其断层规则已在 §7.10 年表备案）。

---

## 1. 目标 Schema（D 区，SQLite：`data/shandong/derived/shandong.sqlite`）

存储：SQLite（零依赖、可 SQL 验收）；旁挂 `build_meta.json` 与 `exceptions_ledger.csv`。
所有表带 `source_file`（R 区相对路径）与 `source_row`（0 起行号）两列回溯锚。

### T1 `admission_lines`（投档线事实表——核心）
| 列 | 类型 | 说明 |
|---|---|---|
| year | INT | 2022-2026 |
| round | INT | 1/2/3（文件名解析） |
| level | TEXT | 本科/专科（规则 R10） |
| school_code | TEXT | `A001` 式（规则 R7） |
| school_name_raw / school_name_norm | TEXT | 规范化=R1 后的名称 |
| major_code | TEXT | 年内院校内 2 位码（规则 R4；**只作年内键**） |
| major_name_raw | TEXT | 原文整格 |
| major_base | TEXT | 主名（去全部括号段） |
| annotations_json | TEXT | 括号段解析结果（规则 R5/R6），JSON 数组 |
| plan_count | INT | 投档计划数（规则 R9） |
| min_rank | INT NULL | 最低位次数值（删失/缺失时为该语义下的值或 NULL） |
| min_rank_censor | TEXT | `exact` / `le`（"前50名"→ min_rank=50, censor=le）/ `missing` |
主键 `(year, round, level, school_code, major_code)`。

### T2 `score_rank`（一分一段事实表）
`year, category(普通类/体育类/艺术×子类), score, count_at, cum_count, source_file, source_row`。
口径：cum_count = 该分及以上累计人数（=该分考生最低位次上界）。含加分口径按源表声明进表级元数据。
（列结构待 collect-sd 任务 #8 的实测确认后，由主循环固化为 v1.1 附录，不由执行 agent 自定。）

### T3 `plans`（招生计划表）
`year, school_code, school_name, major_code, major_name, plan_count, subject_req_raw, subject_req_norm, level, source_file, source_row`。
`subject_req_norm` 枚举：`不限` / `物` / `化` / `物+化` / `物或化` / 其他组合的规范串——
这是雷 13（2024 选科断层）flag 的数据源。列结构同样待实测后固化。

### T4 `batch_lines`（批次控制线）
`year, line_name(一段线/二段线/特招线/艺术类文化线×子类), score, source_doc`。

### T5 `entity_xwalk`（跨年实体对照表——年对训练的地基）
`entity_id, year, school_code, major_code, match_method(M1/M2/M3-manual), match_confidence`。
构建规则见 §4。**宁缺勿错**：匹配不上的年份对就是缺失，禁止模糊匹配凑数。

### T6 `exceptions_ledger`（异常台账）
`source_file, source_row, reason_code, raw_content, stage, resolution(默认NULL，人审后填)`。
reason_code 枚举（封闭集，新增须改规范）：
`UNKNOWN_RANK_FORMAT` / `EMPTY_RANK` / `MAJOR_SPLIT_FAIL` / `SCHOOL_SPLIT_FAIL` /
`PAREN_UNBALANCED` / `UNKNOWN_ANNOTATION` / `BAD_PLAN_COUNT` / `HEADER_UNRECOGNIZED` /
`DUP_PRIMARY_KEY` / `SHEET_STRUCTURE_UNEXPECTED` / `SUBJECT_REQ_UNPARSED`。

---

## 2. 字段级规则（R 系列，条件矩阵 + 正反例）

- **R1 空白规范化（永远第一步）**：strip 半角空格、全角空格 `　`、制表、不间断空格；
  字段内部连续空白折叠为一个半角空格。
  正例：`"17文科试验班类(文科基础类专业)　　　"`（2024 真实样式）→ `"17文科试验班类(文科基础类专业)"`。
  **失败封堵**：跳过 R1 会导致 2024 整年跨年匹配静默全灭（雷 16）。

- **R2 列识别按表头文本，禁止按位置**：表头别名映射（封闭表，v1）：
  `投档最低位次|最低位次 → min_rank`；`专业代号及名称|专业 → major`；
  `院校代号及名称|院校 → school`；`投档计划数 → plan_count`；`层次 → level`。
  前导空列自动跳过；表头行=首个命中 ≥3 个别名的行（实测为 r1）；
  全文件命不中 → 台账 `HEADER_UNRECOGNIZED`，该文件 fatal，不得猜列。
  已知漂移（实测）：2022-24 五列带前导空列，2025 四列；2023 表头简写"专业/院校"；
  2025 第 2 次表六列含"层次"；sheet 名不可依赖（2025 非 Sheet1）。

- **R3 min_rank 三态解析**（条件矩阵）：
  | 输入 | 输出 | censor |
  |---|---|---|
  | float/int（xlrd 数值单元格） | int 值 | `exact` |
  | 匹配 `^前(\d+)名?$` | 捕获组 N | `le` |
  | 空串/None | NULL | `missing` |
  | 其他任何文本 | 台账 `UNKNOWN_RANK_FORMAT`，整行不进 T1 | — |
  真实正例：清华 `前50`（2024）、`前50名`（2025）→ (50, le)；
  2022 北京联合大学 1Y 旅游管理 空位次 → (NULL, missing)。
  **失败封堵**：pandas 默认 `to_numeric(errors='coerce')` 会把"前50名"变 NaN 再被 dropna 吞掉——禁止。

- **R4 专业字段拆分**：`^([0-9A-Z]{2})\s*(.+)$` → (major_code, major_name_full)。
  正例：`17文科试验班类(…)` → (`17`, …)；`52 城乡规划`（第 2 次表带空格样式）→ (`52`, `城乡规划`)。
  不匹配 → 台账 `MAJOR_SPLIT_FAIL`。

- **R5 括号段提取**：对 major_name_full 提取全部 `（…）` 与 `(…)` 段（两种括号等价），
  剩余部分 = `major_base`。嵌套或不配对 → 台账 `PAREN_UNBALANCED`。
  多括号段正例（真实）：`学前教育(中外合作办学)(师范类)` → base=`学前教育`，段=[`中外合作办学`,`师范类`]。

- **R6 注记段拆分与分类**：每个括号段先按 `，`、`；`、`、` 拆成原子注记
  （正例：`师范类，地方专项计划` → [`师范类`,`地方专项计划`]），再逐个按词表分类：
  - **cls=identity（身份注记，进匹配键）**：中外合作办学、中X合作(办学)（X∈美英德法澳俄…）、
    校企合作(+伙伴名)、地方专项计划、国家专项计划、高校专项计划、公费师范生/公费医学生/公费农科生、
    定向（含"非西藏生源定向西藏就业"等）、XX校区/XX分校（如 威海、高密、马来西亚分校）、
    XX走读（济南走读/威海走读）、师范类/师范/非师范、学制类（5+3一体化/八年制/五年制/3+2/2加2）、
    中外学分互认/交流计划类、双学士学位/双学位、嵌入式培养。
  - **cls=descriptive（描述注记，不进匹配键但保留）**：班型名（实验班/卓越班/创新班/菁英班/
    韶峰班/梁希实验班/勤信实验班/融创班/拔尖…基地 等）、`含…项目/含…班` 措辞、
    专业方向词（如 剧院管理/供应链——长尾 1168 个单次注记的主体）、注册会计师/国际会计 等培养特色。
  - **cls=contextual（环境注记，剥离出匹配键，保留在 annotations）**：选考/选科要求描述
    （`不限选考科目类专业` 等）、语种（`外语语种为英语`/`英语`）、就读地点说明（`就读地点泰安`、
    `大一泰安，大二大三青岛`、单独城市名如 `广州`）、学费/收费说明、单科成绩要求、体检要求。
  - 词表未覆盖 → cls=`unclassified` + 台账 `UNKNOWN_ANNOTATION`（人审后进词表 v+1，全量重跑）。
  - **伙伴名规范化**：校企合作伙伴去 `股份有限|有限|集团` 后缀再比较
    （真实正例：`青岛英谷教育科技公司` ≡ `青岛英谷教育科技股份有限公司`）。
  - **班型名注意**：descriptive 不进 M1/M2 匹配键，但在 M2 组内消歧时参与（见 §4）——
    同校同 base 下 `(实验班)` 与裸行是两个产品，靠组内消歧区分，不靠全局词表。

- **R7 院校字段拆分**：`^([A-Z]\d{3})(.+)$` → (school_code, school_name)。不匹配 → 台账 `SCHOOL_SPLIT_FAIL`。

- **R8 匹配键构造**：`match_key = school_code + '|' + major_base + '|' + sorted(identity 注记规范化集合)`。

- **R9 plan_count**：必须为正整数（xlrd float 且为整数值）；0/负/非数 → 台账 `BAD_PLAN_COUNT`。

- **R10 round/level 判定**：round 从文件名解析（`第[一二三123]次`）。
  level：第 1 次表 = 本科（常规批第 1 次志愿仅本科，政策佐证=当年《录取工作意见》，
  research-policy 交付后把文号写进表级元数据）；第 2 次表 = 读"层次"列；第 3 次表 = 专科。

- **R11 年份/类别判定**：从文件路径 `raw/<年>/` 与文件名（普通类/体育类/艺术类×子类）解析；
  文件名与表内标题行（r0）交叉校验，不一致 → 台账 `SHEET_STRUCTURE_UNEXPECTED`。

- **R12 选科要求规范化（T3）**：`subject_req_raw` → 枚举 norm（`不限`/`物`/`物+化`/`物或化`/…）。
  规则：出现"和/且/均须"→`+`；"或"→`或`；空或"不限"→`不限`。解析失败 → 台账 `SUBJECT_REQ_UNPARSED`。
  ——此列是 2024 选科断层 flag（雷 13）的唯一数据源，**禁止**从投档表括号注记推断选科要求
  （括号里的选科描述是偶发的，不成体系）。

---

## 3. 验收门（G 系列，全部机器可查；任一失败 = 构建不得标记 release）

- **G1 行数恒等式**：逐文件 `解析成功行 + 台账行 = 数据行总数`。
- **G2 主键唯一**：T1 主键零重复（实测基线：4 年第 1 次表 (school_code,major_code) 年内零重复）。
- **G3 值域**：min_rank ∈ [1, 800000]；plan_count ∈ [1, 5000]；year ∈ [2022, 2026]；score ∈ [100, 750]。
- **G4 跨年连续性**：相邻年 school_code 集合 Jaccard ≥ 0.90；第 1 次表行数年际 |Δ| ≤ 15%
  （实测基线：18286→19230→20300→21381，最大 Δ≈5.6%）。超限 → 报警人审（可能是政策断层，非 bug）。
- **G5 黄金断言（硬编码真实锚点）**：
  ① 每年存在 A001 北京大学；② 2025 第 1 次表恰 21381 数据行；
  ③ 2024/2025 各存在恰 1 条清华 censor=le 删失行（min_rank=50）；
  ④ 2022 存在恰 1 条 B417 北京联合大学 missing 行；
  ⑤ 注记计数基线：首次成功构建时把各 identity 注记的拆分后计数冻结进 `golden_baseline.json`，
    此后每次重跑必须逐项相等；首次构建 sanity 区间：`师范类` ∈ [4679, 5500]
    （未拆分口径普查值 4679 为下界——复合注记拆分只会增加计数，超上界=拆分逻辑跑飞）。
- **G6 一分一段单调性**（T2）：按 score 降序 cum_count 严格递增；score 区间连续无洞。
- **G7 台账闭合**：release 前 `UNKNOWN_ANNOTATION`/`UNKNOWN_RANK_FORMAT`/`HEADER_UNRECOGNIZED`
  的未决（resolution=NULL）条目必须为 0——即全部经人审定夺。其余 reason_code 允许带 resolution 存档。
- **G8 摘要一致性**：重跑两次，逐表内容摘要（P5 定义）一致。
- 体育/艺术支线（P7）：G2/G3/G6 同标准，G4/G5 免除（类别重组是真实断层，2024 艺术类 Jaccard 必然崩）。

---

## 4. 跨年实体对照（M 系列——年对训练地基，宁缺勿错）

- **M1 精确层**：match_key（R8）逐年精确相等 → 同 entity。预期覆盖大头。
- **M2 组内消歧层**：M1 未匹配者，按 `(school_code, major_base)` 分组对齐两年候选：
  组内两侧各恰 1 条 → 直接匹配（吸收 contextual/descriptive 注记漂移，
  真实正例：北大 文科试验班类 2024`(文科基础类专业)` ↔ 2025`(不限选考科目类专业)`）；
  组内多条 → 按 identity 注记集合精确对齐；仍有多对多 → 再按 descriptive 注记集合对齐；
  还不唯一 → 进 M3。
- **M3 人审层**：输出 `manual_review.csv`（两年候选并排 + 计划数/位次参考），人审后回填。
  **禁止自动模糊匹配**（编辑距离/embedding 一律禁止——模糊匹配是幸存者偏差雷 8 的放大器）。
- **M4 院校层**：先全量验证 school_code 跨年稳定性（同 code 异名清单=改名/升格记录，以 code 为准）；
  若发现 code 复用（同 code 指向不同学校）→ fatal 上报，M1-M3 全部重审。
- **M5 未匹配处理**：unmatched 不是错误——新设/停招专业照常入库（供冷启动研究），
  只是不产生年对训练样本。**报告必须列出 unmatched 计数与占比**（无声即错原则的实体版）。

---

## 5. 执行编排（sonnet 清洗 agent 工作协议）

- **时机**：collect-sd 全部落地 + MANIFEST.md 就绪 + 本规范 v1.1（补 T2/T3 列结构附录）之后。
- **输入**：本规范 + R 区 + MANIFEST + `.venv-data/`（pandas 3.0.3 + xlrd 2.0.2 已装）。
- **产出**（全部进 git，data/ 除外）：
  ① `pipeline/build_derived/*.py`（解析器/规范化/词表 `vocab_annotations_v1.py`/xwalk/验收门，纯函数式，无网络）；
  ② `data/shandong/derived/shandong.sqlite` + `build_meta.json`（gitignore 内，摘要进报告）；
  ③ `data/shandong/derived/exceptions_ledger.csv` + `manual_review.csv`；
  ④ 验收报告（G1-G8 逐门结果 + 台账统计 + unmatched 统计），**纯文本返回**，
    结构化副产物一律走文件（sidecar），不得塞进 agent 返回值 schema。
- **分工建议**：按表 4 路并行（T1 投档 / T2 一分一段 / T3 计划+T4 批次线 / T5 xwalk 串后），
  每路独立 sonnet，主循环合并验收；词表与规则文件由 T1 路首先落盘，其余路只 import 不复制。
- **禁止事项（失败封堵）**：改规则/改词表/改验收门；行级"智能修复"；模糊匹配；
  `errors='coerce'`；跳过台账直接丢行；触碰 R 区与 L 区；把 L 区（gaokao.bsaa.sqlite）当参照数据 join。
- **升级路径**：规则歧义、未覆盖样式、G 门失败 → 停该路，报告主循环，等规范修订版，全量重跑。

---

## 6. 版本与变更

- 本文件版本随规则/词表变更递增（v1 → v1.1：T2/T3 列结构附录；v2：人审后词表扩充）。
- 每次 D 区构建在 build_meta.json 中锁定（规范版本, 词表版本, 脚本 git hash）三元组；
  论文引用 D 区数字时引用该三元组 + R 区源文件 sha256（与 §7.7 引用纪律衔接）。
