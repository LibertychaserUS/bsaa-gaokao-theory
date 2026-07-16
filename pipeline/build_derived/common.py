#!/usr/bin/env python3
"""公共规范化/解析函数库 — 山东数据清洗 v1（照 docs/data_cleaning_spec_shandong_v1.md 实现）。

范围：本文件只实现规范 R 系列里与"地基"直接相关、且已在 v1 固化的规则
（R1/R3/R4/R5/R7/R8/R9/R10/R12）+ 台账 append 函数（T6）+ sha256/内容摘要工具（P5）。
纯函数、无网络、无副作用（append_ledger 除外——显式写台账文件，这是台账本身的语义）。

禁止事项（照规范 §5 执行者禁止事项）：
- 禁 errors='coerce'；禁模糊匹配；无声吞行；改规则/词表/门禁。
"""
from __future__ import annotations

import csv
import hashlib
import re
from pathlib import Path
from typing import Iterable, Sequence

# ---------------------------------------------------------------------------
# R1 空白规范化（永远第一步）
# ---------------------------------------------------------------------------

# 需要折叠/剥离的空白字符：半角空格、全角空格 U+3000、制表符、不间断空格 U+00A0。
_WS_CHARS = " 　\t "
_WS_RUN_RE = re.compile(r"[ 　\t ]+")


def normalize_ws(s: str) -> str:
    """R1：strip 首尾空白 + 内部连续空白折叠为一个半角空格。

    正例（2024 真实样式）：
      "17文科试验班类(文科基础类专业)　　　" -> "17文科试验班类(文科基础类专业)"
    """
    if s is None:
        return s
    s = str(s)
    s = _WS_RUN_RE.sub(" ", s)
    return s.strip(_WS_CHARS + " ")


# ---------------------------------------------------------------------------
# R3 min_rank 三态解析（条件矩阵，禁止 errors='coerce'）
# ---------------------------------------------------------------------------

_QIAN_RE = re.compile(r"^前(\d+)名?$")


class RankParseError(Exception):
    """R3：其他任何未覆盖文本 -> 台账 UNKNOWN_RANK_FORMAT，整行不进 T1。"""


def parse_min_rank(value) -> tuple[int | None, str]:
    """R3 三态解析。

    返回 (min_rank, censor)，censor ∈ {'exact','le','missing'}。
    输入未覆盖 -> 抛 RankParseError（调用方负责落台账，不在此处静默处理）。
    """
    # 空/None -> missing
    if value is None:
        return None, "missing"
    if isinstance(value, float):
        # xlrd 数值单元格永远是 float；空单元格已由上层判断为 None/''。
        if value != value:  # NaN 防御（本规范禁止 coerce 产生 NaN，这里仅作硬性拒绝）
            raise RankParseError(f"NaN not allowed: {value!r}")
        return int(value), "exact"
    if isinstance(value, int):
        return int(value), "exact"
    if isinstance(value, str):
        s = normalize_ws(value)
        if s == "":
            return None, "missing"
        m = _QIAN_RE.match(s)
        if m:
            return int(m.group(1)), "le"
        raise RankParseError(f"unrecognized rank text: {s!r}")
    raise RankParseError(f"unsupported type: {type(value)!r} value={value!r}")


# ---------------------------------------------------------------------------
# R4 专业字段拆分
# ---------------------------------------------------------------------------

_MAJOR_RE = re.compile(r"^([0-9A-Z]{2})\s*(.+)$")


class MajorSplitError(Exception):
    """R4：不匹配 -> 台账 MAJOR_SPLIT_FAIL。"""


def split_major(major_field: str) -> tuple[str, str]:
    """R4：`^([0-9A-Z]{2})\\s*(.+)$` -> (major_code, major_name_full)。

    正例：
      "17文科试验班类(...)" -> ("17", "文科试验班类(...)")
      "52 城乡规划"          -> ("52", "城乡规划")
    """
    s = normalize_ws(major_field)
    m = _MAJOR_RE.match(s)
    if not m:
        raise MajorSplitError(f"major field does not match R4 pattern: {s!r}")
    code, name = m.group(1), m.group(2)
    return code, normalize_ws(name)


# ---------------------------------------------------------------------------
# R5 括号段提取
# ---------------------------------------------------------------------------

class ParenUnbalancedError(Exception):
    """R5：嵌套或不配对 -> 台账 PAREN_UNBALANCED。"""


# 全角/半角括号等价；仅支持两者均为“非嵌套、顺序配对”的段（规范未提及支持嵌套段）。
_OPEN = "（("
_CLOSE = "）)"


def extract_parens(major_name_full: str) -> tuple[str, list[str]]:
    """R5：提取全部括号段，剩余部分 = major_base。

    正例（真实）：
      "学前教育(中外合作办学)(师范类)" -> ("学前教育", ["中外合作办学", "师范类"])

    嵌套或不配对 -> 抛 ParenUnbalancedError。
    """
    s = major_name_full
    segments: list[str] = []
    base_parts: list[str] = []
    i = 0
    n = len(s)
    depth = 0
    buf: list[str] = []
    while i < n:
        ch = s[i]
        if ch in _OPEN:
            if depth > 0:
                raise ParenUnbalancedError(f"nested parens not supported: {s!r}")
            depth = 1
            buf = []
        elif ch in _CLOSE:
            if depth != 1:
                raise ParenUnbalancedError(f"unmatched close paren: {s!r}")
            depth = 0
            segments.append("".join(buf))
            buf = []
        else:
            if depth == 1:
                buf.append(ch)
            else:
                base_parts.append(ch)
        i += 1
    if depth != 0:
        raise ParenUnbalancedError(f"unclosed paren: {s!r}")
    base = normalize_ws("".join(base_parts))
    segments = [normalize_ws(seg) for seg in segments]
    return base, segments


# ---------------------------------------------------------------------------
# R6 注记原子拆分（拆分本身在这里；分类逻辑在 vocab_annotations_v1.py）
# ---------------------------------------------------------------------------

_ATOM_SPLIT_RE = re.compile(r"[，；、,;]")  # v1.2: 补半角 , ; (普查见 "校企合作,与X合作" 复合)


def split_annotation_atoms(segment: str) -> list[str]:
    """R6：括号段先按 ，；、 拆成原子注记。

    正例：
      "师范类，地方专项计划" -> ["师范类", "地方专项计划"]
    """
    parts = _ATOM_SPLIT_RE.split(segment)
    return [normalize_ws(p) for p in parts if normalize_ws(p) != ""]


# ---------------------------------------------------------------------------
# R7 院校字段拆分
# ---------------------------------------------------------------------------

_SCHOOL_RE = re.compile(r"^([A-Z]\d{3})(.+)$")


class SchoolSplitError(Exception):
    """R7：不匹配 -> 台账 SCHOOL_SPLIT_FAIL。"""


def split_school(school_field: str) -> tuple[str, str]:
    """R7：`^([A-Z]\\d{3})(.+)$` -> (school_code, school_name)。"""
    s = normalize_ws(school_field)
    m = _SCHOOL_RE.match(s)
    if not m:
        raise SchoolSplitError(f"school field does not match R7 pattern: {s!r}")
    code, name = m.group(1), m.group(2)
    return code, normalize_ws(name)


# ---------------------------------------------------------------------------
# R8 匹配键构造
# ---------------------------------------------------------------------------

def build_match_key(school_code: str, major_base: str, identity_atoms: Iterable[str]) -> str:
    """R8：match_key = school_code + '|' + major_base + '|' + sorted(identity 注记规范化集合)。

    identity_atoms 传入前应已完成伙伴名规范化（去 股份有限|有限|集团 后缀）等 identity 内部归一化——
    该归一化由 vocab_annotations_v1.normalize_partner_name 提供，本函数只负责排序拼接。
    """
    uniq_sorted = sorted(set(identity_atoms))
    return f"{school_code}|{major_base}|{','.join(uniq_sorted)}"


# ---------------------------------------------------------------------------
# R9 plan_count
# ---------------------------------------------------------------------------

class PlanCountError(Exception):
    """R9：0/负/非数 -> 台账 BAD_PLAN_COUNT。"""


def parse_plan_count(value) -> int:
    """R9：必须为正整数（xlrd float 且为整数值）。"""
    if isinstance(value, bool):
        raise PlanCountError(f"bool not allowed: {value!r}")
    if isinstance(value, float):
        if value != value or value <= 0:
            raise PlanCountError(f"non-positive or NaN plan_count: {value!r}")
        if not value.is_integer():
            raise PlanCountError(f"non-integer plan_count: {value!r}")
        return int(value)
    if isinstance(value, int):
        if value <= 0:
            raise PlanCountError(f"non-positive plan_count: {value!r}")
        return value
    if isinstance(value, str):
        s = normalize_ws(value)
        if s == "" or not re.fullmatch(r"\d+", s):
            raise PlanCountError(f"non-numeric plan_count text: {value!r}")
        n = int(s)
        if n <= 0:
            raise PlanCountError(f"non-positive plan_count text: {value!r}")
        return n
    raise PlanCountError(f"unsupported type: {type(value)!r} value={value!r}")


# ---------------------------------------------------------------------------
# R10 round/level 判定
# ---------------------------------------------------------------------------

_ROUND_RE = re.compile(r"第([一二三123])次")
_ROUND_CN2NUM = {"一": 1, "二": 2, "三": 3, "1": 1, "2": 2, "3": 3}


def parse_round_from_filename(filename: str) -> int:
    """R10：round 从文件名解析（`第[一二三123]次`）。未匹配则抛错——不属于三路径 level 规则，
    调用方按需落台账（本函数不写台账，纯解析）。
    """
    m = _ROUND_RE.search(filename)
    if not m:
        raise ValueError(f"cannot parse round from filename: {filename!r}")
    return _ROUND_CN2NUM[m.group(1)]


def round_level(round_no: int, level_col_value: str | None) -> str:
    """R10：level 判定。
    - 第 1 次表 = 本科（常规批第 1 次志愿仅本科）。
    - 第 2 次表 = 读"层次"列（level_col_value 必须提供且为 本科/专科）。
    - 第 3 次表 = 专科。
    """
    if round_no == 1:
        return "本科"
    if round_no == 3:
        return "专科"
    if round_no == 2:
        if level_col_value is None:
            raise ValueError("round=2 requires level_col_value from '层次' column")
        lv = normalize_ws(level_col_value)
        if lv not in ("本科", "专科"):
            raise ValueError(f"unrecognized level value for round=2: {level_col_value!r}")
        return lv
    raise ValueError(f"unsupported round_no: {round_no!r}")


# ---------------------------------------------------------------------------
# R12 选科要求规范化（T3；地基路先落盘供 T3 路 import）
# ---------------------------------------------------------------------------

class SubjectReqParseError(Exception):
    """R12：解析失败 -> 台账 SUBJECT_REQ_UNPARSED。"""


def subject_req_norm(raw: str) -> str:
    """R12：subject_req_raw -> 枚举 norm。

    规则：出现"和/且/均须"->'+'；"或"->'或'；空或"不限"->'不限'。
    枚举值形如：'不限' / '物' / '化' / '物+化' / '物或化' / 其他组合规范串。
    """
    s = normalize_ws(raw) if raw is not None else ""
    if s == "" or s == "不限":
        return "不限"
    # 判断连接词：优先匹配"和/且/均须"（+），否则"或"。
    has_and = bool(re.search(r"[和且]|均须", s))
    has_or = "或" in s
    if has_and and has_or:
        raise SubjectReqParseError(f"ambiguous connective (both and/or): {s!r}")
    conn = "+" if has_and else ("或" if has_or else None)
    # 抽取科目关键字：物理/化学/生物/思想政治/历史/地理 及其单字简写 物/化/生/政/史/地。
    subj_map = [
        ("物理", "物"), ("化学", "化"), ("生物", "生"),
        ("思想政治", "政"), ("政治", "政"), ("历史", "史"), ("地理", "地"),
    ]
    found: list[str] = []
    remaining = s
    for full, short in subj_map:
        if full in remaining:
            found.append(short)
            remaining = remaining.replace(full, "")
    if not found:
        # 单字科目直接出现的情形（如已是规范简写）。
        for ch in "物化生政史地":
            if ch in s and ch not in found:
                found.append(ch)
    if not found:
        raise SubjectReqParseError(f"no subject keyword recognized: {s!r}")
    # 去重保序
    seen = set()
    ordered = [c for c in found if not (c in seen or seen.add(c))]
    if len(ordered) == 1:
        return ordered[0]
    if conn is None:
        raise SubjectReqParseError(f"multiple subjects but no connective found: {s!r}")
    return conn.join(ordered)


# ---------------------------------------------------------------------------
# T6 异常台账（exceptions_ledger）append 函数
# ---------------------------------------------------------------------------

LEDGER_FIELDS = ["source_file", "source_row", "reason_code", "raw_content", "stage", "resolution"]

REASON_CODES = {
    "UNKNOWN_RANK_FORMAT", "EMPTY_RANK", "MAJOR_SPLIT_FAIL", "SCHOOL_SPLIT_FAIL",
    "PAREN_UNBALANCED", "UNKNOWN_ANNOTATION", "BAD_PLAN_COUNT", "HEADER_UNRECOGNIZED",
    "DUP_PRIMARY_KEY", "SHEET_STRUCTURE_UNEXPECTED", "SUBJECT_REQ_UNPARSED",
    "IMAGE_TRANSCRIBED", "LEVEL_UNRESOLVED",
}


def append_ledger(
    ledger_path: str | Path,
    source_file: str,
    source_row: int,
    reason_code: str,
    raw_content: str,
    stage: str,
    resolution: str | None = None,
) -> None:
    """T6：向 exceptions_ledger.csv 追加一行（封闭 reason_code 枚举强制校验）。

    reason_code 不在封闭集内 -> 直接抛异常（规则不可即兴扩展，见规范 T6）。
    文件不存在则先写表头。
    """
    if reason_code not in REASON_CODES:
        raise ValueError(f"reason_code not in closed enum (T6): {reason_code!r}")
    ledger_path = Path(ledger_path)
    is_new = not ledger_path.exists()
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    with ledger_path.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=LEDGER_FIELDS)
        if is_new:
            writer.writeheader()
        writer.writerow({
            "source_file": source_file,
            "source_row": source_row,
            "reason_code": reason_code,
            "raw_content": raw_content,
            "stage": stage,
            "resolution": resolution if resolution is not None else "",
        })


# ---------------------------------------------------------------------------
# P5：sha256 工具 + 内容摘要函数
# ---------------------------------------------------------------------------

def sha256_file(path: str | Path) -> str:
    """对文件内容计算 sha256（用于 build_meta.json 记录源文件指纹）。"""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def content_digest(rows: Sequence[dict], primary_key: Sequence[str], columns: Sequence[str]) -> str:
    """P5：表内容摘要 = sha256(按主键排序的规范 CSV 导出)。

    rows: 字典列表（每行含 columns 覆盖的全部字段）。
    primary_key: 排序键（子集，须为 columns 的成员）。
    columns: 输出列顺序（决定 CSV 序列化的确定性）。
    """
    def sort_key(row: dict):
        return tuple(row.get(k) for k in primary_key)

    sorted_rows = sorted(rows, key=sort_key)
    import io
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(columns)
    for row in sorted_rows:
        writer.writerow([row.get(c) for c in columns])
    return sha256_bytes(buf.getvalue().encode("utf-8"))
