#!/usr/bin/env python3
"""地基自检: 规范 R 规则正反例逐条断言 + 词表护栏断言 + 提案表生成。

用法: .venv-data/bin/python pipeline/build_derived/test_foundation.py
退出码 0=全绿。同时生成 vocab_proposals_v1.tsv（普查全量分类提案, 主循环人审对象）。
"""
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import common  # noqa: E402
import vocab_annotations_v1 as vocab  # noqa: E402

HERE = Path(__file__).parent
FAILS: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    print(f"[{'PASS' if cond else 'FAIL'}] {name} {detail}")
    if not cond:
        FAILS.append(name)


# ---- R1 空白规范化 ----
check("R1.全角尾空格", common.normalize_ws("17文科试验班类(文科基础类专业)　　　")
      == "17文科试验班类(文科基础类专业)")
check("R1.内部折叠", common.normalize_ws("52  城乡 规划") == "52 城乡 规划")

# ---- R3 min_rank 三态 ----
check("R3.数值", common.parse_min_rank(3721.0) == (3721, "exact"))
check("R3.前50", common.parse_min_rank("前50") == (50, "le"))
check("R3.前50名", common.parse_min_rank("前50名") == (50, "le"))
check("R3.空", common.parse_min_rank("") == (None, "missing"))
check("R3.None", common.parse_min_rank(None) == (None, "missing"))
try:
    common.parse_min_rank("约50")
    check("R3.坏文本必须抛", False)
except common.RankParseError:
    check("R3.坏文本必须抛", True)

# ---- R4 专业拆分 ----
check("R4.常规", common.split_major("17文科试验班类(文科基础类专业)")[0] == "17")
check("R4.带空格", common.split_major("52 城乡规划") == ("52", "城乡规划"))

# ---- R5 括号段 ----
base, segs = common.extract_parens("学前教育(中外合作办学)(师范类)")
check("R5.多段", base == "学前教育" and segs == ["中外合作办学", "师范类"])
base2, segs2 = common.extract_parens("金融学（中外合作办学）")
check("R5.全角等价", base2 == "金融学" and segs2 == ["中外合作办学"])

# ---- R6 原子拆分 + 分类 ----
check("R6.全角逗号拆分", common.split_annotation_atoms("师范类，地方专项计划")
      == ["师范类", "地方专项计划"])
check("R6.半角逗号拆分", common.split_annotation_atoms("校企合作,与山东网商集团合作")
      == ["校企合作", "与山东网商集团合作"])
CASES = [
    ("师范类", "identity"), ("中外合作办学", "identity"), ("校企合作", "identity"),
    ("地方专项计划", "identity"), ("高职院校专项计划", "identity"),
    ("与青岛英谷教育科技公司合作", "identity"), ("中美合作", "identity"),
    ("省属公费医学生", "identity"), ("面向德州市就业", "identity"),
    ("非西藏生源定向西藏就业", "identity"), ("高密校区", "identity"),
    ("就读于沂水校区", "identity"), ("济南走读", "identity"),
    ("5+3一体化", "identity"), ("高职3+2贯通培养", "identity"), ("2加2", "identity"),
    ("八年制", "identity"), ("双学士学位", "identity"), ("嵌入式培养", "identity"),
    ("中外高水平大学学生交流计划", "identity"), ("本科预科班", "identity"),
    ("不限选考科目类专业", "contextual"), ("外语语种为英语", "contextual"),
    ("就读地点泰安", "contextual"), ("只提供英语教学", "contextual"),
    ("招收边防军人子女", "contextual"), ("只招女生", "contextual"),
    ("实验班", "descriptive"), ("卓越班", "descriptive"), ("韶峰班", "descriptive"),
    ("梁希实验班", "descriptive"), ("含创新实验班", "descriptive"),
    ("含双学士学位项目", "descriptive"), ("商务方向", "descriptive"),
    ("注册会计师", "descriptive"), ("剧院管理", "descriptive"),
    ("拔尖学生培养基地", "descriptive"),
]
for atom, want in CASES:
    got, rule = vocab.classify_annotation(atom)
    check(f"R6.{atom}", got == want, f"→{got}({rule})")

# ---- 伙伴名规范化 ----
check("R6.伙伴等价",
      vocab.canon_identity_atom("与青岛英谷教育科技公司合作")
      == vocab.canon_identity_atom("与青岛英谷教育科技股份有限公司合作"))

# ---- R7 院校拆分 ----
check("R7.常规", common.split_school("A001北京大学") == ("A001", "北京大学"))

# ---- R8 匹配键 identity 序无关 ----
check("R8.序无关",
      common.build_match_key("A001", "学前教育", ["师范类", "中外合作办学"])
      == common.build_match_key("A001", "学前教育", ["中外合作办学", "师范类"]))

# ---- R12 选科 ----
check("R12.物化", common.subject_req_norm("物理和化学") == "物+化")
check("R12.不限", common.subject_req_norm("不限") == "不限")
check("R12.或", common.subject_req_norm("物理或化学") == "物或化")

# ---- 提案表生成 + 触发词护栏审计 ----
survey = HERE / "annotation_survey.tsv"
proposals = HERE / "vocab_proposals_v1.tsv"
guard_violation = 0
cls_stats: dict[str, int] = {}
with survey.open(encoding="utf-8") as f, proposals.open("w", encoding="utf-8", newline="") as out:
    w = csv.writer(out, delimiter="\t")
    w.writerow(["注记", "次数", "提案cls", "依据规则"])
    rd = csv.reader(f, delimiter="\t")
    next(rd)
    for row in rd:
        atom, cnt = row[0], row[1]
        cls, rule = vocab.classify_annotation(atom)
        cls_stats[cls] = cls_stats.get(cls, 0) + 1
        # 护栏: 触发词注记不得由 longtail-default/desc 兜底规则吸收
        if vocab.TRIGGER_RE.search(atom) and cls in ("descriptive",) \
                and rule in ("longtail-default",):
            guard_violation += 1
        w.writerow([atom, cnt, cls, rule])
check("护栏.触发词不落兜底", guard_violation == 0, f"违例{guard_violation}")
print(f"\n提案分布: {cls_stats}")
print(f"=== 结论: {'全绿 ✓' if not FAILS else f'{len(FAILS)} 项红'} ===")
sys.exit(1 if FAILS else 0)
