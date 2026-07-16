#!/usr/bin/env python3
"""注记分类词表 v1 — data_cleaning_spec_shandong_v1.md R6 的机器化身。

立法来源: 规范 R6 三类清单（逐字转录）+ v1.2 词表冷启动条款（实测普查扩展, 见
annotation_survey.tsv 3886 distinct）。执行 agent 只 import, 无权修改;
词表变更 = 主循环人审 → VOCAB_VERSION+1 → 全量重跑。

分类优先级（顺序即法律）:
  1. 含-前缀 → descriptive（规范: "含…项目/含…班" 措辞）; 但含公费/专项/定向的留 unclassified 人审
  2. identity 精确表 → identity
  3. identity 模式族 → identity
  4. contextual 模式族 → contextual
  5. descriptive 模式族 → descriptive
  6. 触发词护栏: 含身份触发词但未被 2/3 命中 → unclassified（禁止自动降级, v1.2 条款）
  7. 长尾默认 → descriptive（规范: 长尾 1648 个单次注记的主体=专业方向词）
"""
from __future__ import annotations

import re

VOCAB_VERSION = "v1"

# ---- 触发词护栏（v1.2 条款: 命中且未被白名单规则吸收 → unclassified） ----
TRIGGER_RE = re.compile(
    r"合作|专项|公费|定向|校区|分校|走读|师范|学分互认|交流|双学|嵌入式"
    r"|一体化|年制|贯通|订单|预科|民族班"
)

# ---- 1/2/3: identity ----
IDENTITY_EXACT = {
    "中外合作办学", "校企合作", "地方专项计划", "国家专项计划", "高校专项计划",
    "高职院校专项计划", "省属公费师范生", "省属公费医学生", "省属公费农科生",
    "公费师范生", "公费医学生", "公费农科生", "委培师范生",
    "师范类", "师范", "非师范", "师范兼非师范",
    "5+3一体化", "八年制", "五年制", "3+2", "2加2", "4加0", "高本贯通",
    "高职3+2贯通培养", "高职技师合作培养",
    "双学士学位", "双学位", "双学士学位项目",
    "嵌入式培养", "订单培养", "本科预科班", "民族班", "少数民族预科班",
    "济南走读", "威海走读",
    "中外高水平大学学生交流计划", "非西藏生源定向西藏就业",
}
IDENTITY_FAMILIES: list[tuple[str, re.Pattern[str]]] = [
    ("id-中X合作", re.compile(r"中[美德英韩法日澳加俄新以马意荷外]\S{0,2}合作")),  # 内嵌亦捕
    ("id-校企伙伴", re.compile(r"^与.{2,30}合作(办学|培养|项目|共建)?")),   # 与青岛英谷…合作
    ("id-校企序号", re.compile(r"^校企合作\d*$")),                        # 校企合作1/2 变体
    ("id-机构合作", re.compile(r"(公司|大学|学院|集团|中心|研究院|机器人)合作")),
    ("id-专项计划", re.compile(r"专项计划$")),
    ("id-公费生", re.compile(r"^(省属)?公费(师范|医学|农科)生?")),
    ("id-定向", re.compile(r"定向")),                                # 定向培养/定向就业/非西藏生源…
    ("id-就业地承诺", re.compile(r"^面向.{1,8}(市|县|地区)?就业$")),   # 公费生就业地 = 产品身份
    ("id-校区分校", re.compile(r"校区|分校")),
    ("id-走读", re.compile(r"走读$")),
    ("id-师范", re.compile(r"师范")),                                # 职教师范/物理师范教育/衔接X师范学院
    ("id-学制贯通", re.compile(
        r"贯通(培养)?|衔接.{2,20}学院|^\d\s*\+\s*\d|\d加\d|一体化"
        r"|[0-9四五六七八九]年制|本[博硕]连读|本硕|本博|共建产业学院")),
    ("id-双学位", re.compile(r"双学(士学)?位|双学士")),
    ("id-合作办学嵌入", re.compile(r"合作办学|合作项目|合作共建")),      # 长串内嵌的中外/校企合作
    ("id-互认交流", re.compile(r"学分互认|交流计划|联合培养项目")),
    ("id-培养模式", re.compile(r"嵌入式培养|订单培养|技师合作培养")),
    ("id-预科民族", re.compile(r"预科|民族班")),
]

# ---- 4: contextual（剥出匹配键, 保留在 annotations; T7 资格谓词的数据源） ----
CONTEXTUAL_FAMILIES: list[tuple[str, re.Pattern[str]]] = [
    ("ctx-选科", re.compile(r"选考|选科|不限选考科目")),
    ("ctx-语种", re.compile(r"语种|^(英|日|俄|法|德|西班牙|阿拉伯)语$|^只?提供英语教学$|外语.*(教学|授课)")),
    ("ctx-就读地", re.compile(r"^就读(地点|于)|^大[一二三四]|本部$")),
    ("ctx-学费", re.compile(r"学费|收费|元/年|元每年|待入学后|奖学金")),
    ("ctx-单科", re.compile(r"单科|成绩要求|数学.*分|英语.*分")),
    ("ctx-体检", re.compile(r"体检|色盲|色弱|裸眼视力|无色觉异常")),
    ("ctx-资格限定", re.compile(r"^只(招|限)|^限招|^招(收|全省)|子女$|合格考生$")),
    ("ctx-面试政审", re.compile(r"面试|政审|军检|政治考核")),
    ("ctx-退档缺额", re.compile(r"退档|缺额")),                        # 轮次语境（T3 备注）
]

# ---- 5: descriptive（不进匹配键, M2 组内消歧参与） ----
DESCRIPTIVE_FAMILIES: list[tuple[str, re.Pattern[str]]] = [
    ("desc-班型", re.compile(r"班$")),
    ("desc-基地拔尖", re.compile(r"基地$|拔尖|卓越(计划|工程师)?$")),
    ("desc-方向", re.compile(r"方向$")),
    ("desc-大类含方向", re.compile(r"^含|等专业$|大类招生")),
]

_HAN_GUARD_RE = re.compile(r"公费|专项|定向")   # 含-前缀里出现这些 → 人审


def canon_partner(atom: str) -> str:
    """校企合作伙伴名规范化: 去 股份有限|有限|集团|公司 后缀再比较（规范 R6）。"""
    s = atom
    for _ in range(4):
        s2 = re.sub(r"(股份有限公司|有限公司|科技集团|控股集团|集团有限公司|集团|公司)$", "", s)
        if s2 == s:
            break
        s = s2
    return s


def canon_identity_atom(atom: str) -> str:
    """identity 原子进 match_key 前的规范形: 伙伴名去后缀; 其余原样。"""
    if atom.startswith("与") and "合作" in atom:
        m = re.match(r"^与(.+?)合作(办学|培养)?$", atom)
        if m:
            return "与" + canon_partner(m.group(1)) + "合作"
    return atom


def classify_annotation(atom: str) -> tuple[str, str]:
    """返回 (cls, rule_id)。cls ∈ {identity, descriptive, contextual, unclassified}。"""
    a = atom.strip()
    if not a:
        return "unclassified", "empty"
    if a.startswith("含"):
        if _HAN_GUARD_RE.search(a):
            return "unclassified", "han-prefix-trigger-guard"
        return "descriptive", "desc-含前缀"
    if a in IDENTITY_EXACT:
        return "identity", "id-exact"
    for rule, pat in IDENTITY_FAMILIES:
        if pat.search(a):
            return "identity", rule
    for rule, pat in CONTEXTUAL_FAMILIES:
        if pat.search(a):
            return "contextual", rule
    for rule, pat in DESCRIPTIVE_FAMILIES:
        if pat.search(a):
            return "descriptive", rule
    if TRIGGER_RE.search(a):
        return "unclassified", "trigger-guard"
    return "descriptive", "longtail-default"
