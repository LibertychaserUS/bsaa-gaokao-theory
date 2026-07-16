#!/usr/bin/env python3
"""T3 路构建器 — 招生计划表 → plans（data_cleaning_spec_shandong_v1.md §1/附录v1.1）。

范围（P7）：普通类常规批第 2/3 次志愿"院校专业计划" xls，2022-2025（8 个文件）。
主计划本（第 1 次志愿全量计划）官方不发布（见 declarations/计划发布形态声明），
故无 round=1；本路只覆盖 round∈{2,3}。

本文件只 import common.py（R1-R12）+ vocab_annotations_v1.py（R6 分类，仅用于校验/台账，
T3 schema 无 annotations_json 列，不持久化逐原子分类结果）+ schema.py（DDL），不复制其逻辑。

结构（附录 v1.1 实测固化）：6 列 院校代号|院校、专业（类）名称及备注|考试科目要求|
学制（年）|计划数|年收费（元）；表头按"院校代号"锚定；master-detail 两级行状态机——
院校行（院校代号列非空）= 设当前院校上下文 + 给出该校计划小计；
专业行（院校代号列空）= 挂在当前院校下，T3 只收专业行入库，院校小计仅作校验用。

level 列设计决策（规范未显式覆盖 T3，此处按证据链推导，非猜测——见报告"level 推导依据"）：
  round=2 文件标题在全部 4 个年份均自称"本科计划"（如"2022年...第2次志愿院校专业本科计划"、
  "2023年...常规批（本科）第2次志愿..."），且 2022 R2 文件本身正是 build_t1.py R10a 用作
  官方本科 join 源的同一份文件——title 自证 100% 本科；
  round=3 按 R10 一般规则（"第 3 次表 = 专科"）+ 与 T1 admission_lines 实测交叉校验
  （99.6%+ 命中 T1 专科行，见报告）。

G1 记账口径（T3 master-detail 特有，规范未显式给出，此处显式声明——非静默处理）：
  院校行（结构性上下文行，非"数据行"）单独计数 n_school_context_rows，不入 G1 分母；
  G1 分母 = 院校代号列为空的物理行数（专业行候选，含畸形/空行）；
  G1 恒等式 = n_ok + n_ledger(专业行台账) == 该分母，逐文件机器校验；
  院校小计校验（Σ专业plan_count vs 院校行小计）产生的台账另计 n_subtotal_mismatch，
  挂在院校行 source_row 上，属结构性检查，不计入上述专业行 G1 分母（否则等式不闭合）。

用法: .venv-data/bin/python pipeline/build_derived/build_t3.py
产出: data/shandong/derived/staging/t3.sqlite (plans + exceptions_ledger)
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

import xlrd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
import schema  # noqa: E402
import vocab_annotations_v1 as vocab  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent.parent
RAW = ROOT / "data/shandong/raw"
STAGING = ROOT / "data/shandong/derived/staging"
DB_PATH = STAGING / "t3.sqlite"
LEDGER_TSV = STAGING / "t3_exceptions_ledger.tsv"

# ---------------------------------------------------------------------------
# 文件清单（P7 范围=普通类常规批第2/3次志愿计划；精确列出，不做 glob 猜测——
# 新年份文件名漂移必须显式加入，否则 gate_files 直接 fatal）。
# 2026 无同构文件（raw/2026 下只有"提前批A/B类第2次"计划，无"常规批"计划文件，P7 不碰提前批）。
# ---------------------------------------------------------------------------

FILES: dict[int, dict[int, str]] = {
    2022: {
        2: "2022年普通类常规批第2次志愿院校专业本科计划.xls",
        3: "2022年普通类常规批第3次志愿院校专业计划.xls",
    },
    2023: {
        2: "山东省2023年普通类常规批（本科）第2次志愿院校专业计划.xls",
        3: "山东省2023年普通类常规批第3次志愿院校专业计划.xls",
    },
    2024: {
        2: "2024年普通类常规批（本科）第2次志愿院校专业计划.xls",
        3: "2024年普通类常规批第3次志愿院校专业计划-.xls",
    },
    2025: {
        2: "2025年普通类常规批第2次志愿剩余本科计划.xls",
        3: "2025年普通类常规批第3次志愿院校专业计划.xls",
    },
}

# R2 表头别名（封闭表，本路专用；6 列结构实测五年二三次表零漂移）。
HEADER_ALIASES = {
    "院校代号": "school_code",
    "院校、专业（类）名称及备注": "name",
    "考试科目要求": "subject_req",
    "选考科目要求": "subject_req",
    "学制（年）": "duration",
    "计划数": "plan_count",
    "年收费（元）": "fee",
}


class HeaderUnrecognizedError(Exception):
    pass


def gate_files() -> None:
    missing = []
    for year, rounds in FILES.items():
        for rd, fname in rounds.items():
            if not (RAW / str(year) / fname).is_file():
                missing.append(f"{year} round={rd}: {fname}")
    if missing:
        raise SystemExit("FATAL: 以下文件缺失（禁止跳过静默漏扫）:\n" + "\n".join(missing))


def find_header(sh) -> tuple[int, dict[str, int]]:
    """R2: 表头行=首个命中 >=3 个别名的行（按"院校代号"单元格文本锚定精神实现）。"""
    for r in range(min(6, sh.nrows)):
        role_map: dict[str, int] = {}
        for c in range(sh.ncols):
            val = common.normalize_ws(str(sh.cell_value(r, c)))
            role = HEADER_ALIASES.get(val)
            if role is not None and role not in role_map:
                role_map[role] = c
        if len(role_map) >= 3:
            return r, role_map
    raise HeaderUnrecognizedError("no header row with >=3 aliases found in first 6 rows")


def cell_or_none(sh, r: int, c: int | None):
    if c is None:
        return None
    v = sh.cell_value(r, c)
    if isinstance(v, str):
        s = common.normalize_ws(v)
        return None if s == "" else s
    if isinstance(v, float) and v == "":
        return None
    return v


def derive_level(round_no: int) -> str:
    """level 推导（见文件头设计决策注释）：round=2 -> 本科（title 自证）；
    round=3 -> 专科（R10 一般规则 + T1 交叉校验佐证）。"""
    if round_no == 2:
        return "本科"
    if round_no == 3:
        return "专科"
    raise ValueError(f"unsupported round_no for T3 level derivation: {round_no!r}")


def process_file(year: int, round_no: int, fname: str, conn: sqlite3.Connection) -> dict:
    path = RAW / str(year) / fname
    rel_path = str(path.relative_to(ROOT))
    wb = xlrd.open_workbook(str(path))
    sh = wb.sheet_by_index(0)

    try:
        header_row, roles = find_header(sh)
    except HeaderUnrecognizedError as e:
        raise SystemExit(f"FATAL(HEADER_UNRECOGNIZED) {rel_path}: {e}") from e

    data_start = header_row + 1
    level = derive_level(round_no)

    n_physical_rows = sh.nrows - data_start
    n_school_context_rows = 0
    n_ok = 0
    n_ledger = 0  # 专业行台账（G1 分母对应项）
    n_subtotal_mismatch = 0  # 院校行小计校验台账（结构性检查，另计）

    current_school: tuple[str, str] | None = None  # (school_code, school_name)
    current_subtotal: int | None = None
    current_school_row: int | None = None
    current_major_sum = 0

    def ledger(reason_code: str, row: int, content: str, stage: str) -> None:
        nonlocal n_ledger
        common.append_ledger(LEDGER_TSV, rel_path, row, reason_code, content, stage)
        conn.execute(
            "INSERT INTO exceptions_ledger VALUES (?,?,?,?,?,?)",
            (rel_path, row, reason_code, content, stage, None),
        )
        n_ledger += 1

    def ledger_subtotal(row: int, content: str) -> None:
        nonlocal n_subtotal_mismatch
        common.append_ledger(LEDGER_TSV, rel_path, row, "SHEET_STRUCTURE_UNEXPECTED", content,
                              "T3_subtotal_check")
        conn.execute(
            "INSERT INTO exceptions_ledger VALUES (?,?,?,?,?,?)",
            (rel_path, row, "SHEET_STRUCTURE_UNEXPECTED", content, "T3_subtotal_check", None),
        )
        n_subtotal_mismatch += 1

    def finalize_school() -> None:
        """院校小计校验：Σ专业plan_count = 院校行小计（不等 -> 台账，不影响 G1 专业行分母）。"""
        if current_school is None or current_subtotal is None:
            return
        if current_subtotal != current_major_sum:
            ledger_subtotal(
                current_school_row,
                f"school={current_school[0]}({current_school[1]}) "
                f"subtotal={current_subtotal} sum_of_majors={current_major_sum}",
            )

    for r in range(data_start, sh.nrows):
        school_field = cell_or_none(sh, r, roles.get("school_code"))
        name_field = cell_or_none(sh, r, roles.get("name"))

        if school_field is not None:
            # 院校行：先结算上一个院校上下文的小计校验，再切换上下文。
            finalize_school()
            school_code = common.normalize_ws(str(school_field))
            school_name = common.normalize_ws(str(name_field)) if name_field is not None else ""
            plan_cell = sh.cell_value(r, roles["plan_count"]) if "plan_count" in roles else None
            try:
                subtotal = common.parse_plan_count(plan_cell)
            except common.PlanCountError:
                subtotal = None  # 小计本身不可解析 -> 不做校验（非致命，专业行仍正常处理）
            current_school = (school_code, school_name)
            current_subtotal = subtotal
            current_school_row = r
            current_major_sum = 0
            n_school_context_rows += 1
            continue

        if name_field is None:
            # 院校代号列空 且 名称列也空 -> 真空行（普查未见样例，防御性台账，计入专业行分母）。
            ledger("SHEET_STRUCTURE_UNEXPECTED", r, "", "blank_row_scan")
            continue

        # 专业行（院校代号列空，名称列非空）。
        if current_school is None:
            ledger("SHEET_STRUCTURE_UNEXPECTED", r, str(name_field), "orphan_major_no_school_context")
            continue
        school_code, school_name = current_school

        try:
            major_code, major_name_full = common.split_major(str(name_field))
        except common.MajorSplitError:
            ledger("MAJOR_SPLIT_FAIL", r, str(name_field), "R4")
            continue

        plan_cell = sh.cell_value(r, roles["plan_count"]) if "plan_count" in roles else None
        try:
            plan_count = common.parse_plan_count(plan_cell)
        except common.PlanCountError:
            ledger("BAD_PLAN_COUNT", r, repr(plan_cell), "R9")
            continue
        # plan_count 已解析成功 -> 无条件计入院校小计校验（反映原表真实计划数总和，
        # 与后续 R5/R6/R12 是否失败无关——subtotal 校验的是"计划数"这一列本身）。
        current_major_sum += plan_count

        try:
            major_base, segments = common.extract_parens(major_name_full)
        except common.ParenUnbalancedError:
            ledger("PAREN_UNBALANCED", r, major_name_full, "R5")
            continue

        unk_atoms: list[str] = []
        for seg in segments:
            for atom in common.split_annotation_atoms(seg):
                cls, _rule = vocab.classify_annotation(atom)
                if cls == "unclassified":
                    unk_atoms.append(atom)
        if unk_atoms:
            ledger("UNKNOWN_ANNOTATION", r, "; ".join(unk_atoms), "R6")
            continue

        subject_req_raw_field = cell_or_none(sh, r, roles.get("subject_req"))
        subject_req_raw = str(subject_req_raw_field) if subject_req_raw_field is not None else ""
        try:
            subject_req_norm = common.subject_req_norm(subject_req_raw)
        except common.SubjectReqParseError:
            ledger("SUBJECT_REQ_UNPARSED", r, repr(subject_req_raw), "R12")
            continue

        try:
            conn.execute(
                "INSERT INTO plans VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    year, round_no, school_code, school_name, major_code, major_name_full,
                    plan_count, (subject_req_raw or None), subject_req_norm, level,
                    rel_path, r,
                ),
            )
            n_ok += 1
        except sqlite3.IntegrityError:
            ledger("DUP_PRIMARY_KEY", r, f"{year}/{round_no}/{school_code}/{major_code}", "PK_insert")

    finalize_school()  # 结算文件末尾最后一个院校上下文
    conn.commit()

    n_major_candidate_rows = n_physical_rows - n_school_context_rows
    g1_ok = (n_ok + n_ledger == n_major_candidate_rows)

    return {
        "file": rel_path, "year": year, "round": round_no, "level": level,
        "n_physical_rows": n_physical_rows,
        "n_school_context_rows": n_school_context_rows,
        "n_major_candidate_rows": n_major_candidate_rows,
        "n_ok": n_ok, "n_ledger": n_ledger,
        "n_subtotal_mismatch": n_subtotal_mismatch,
        "g1_ok": g1_ok,
    }


def main() -> None:
    gate_files()
    STAGING.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()
    if LEDGER_TSV.exists():
        LEDGER_TSV.unlink()

    conn = sqlite3.connect(str(DB_PATH))
    conn.execute(schema.DDL_T3_PLANS)
    conn.execute(schema.DDL_T6_EXCEPTIONS_LEDGER)
    conn.commit()

    stats = []
    for year in sorted(FILES):
        for round_no in sorted(FILES[year]):
            fname = FILES[year][round_no]
            st = process_file(year, round_no, fname, conn)
            stats.append(st)
            print(
                f"{year} round={round_no} level={st['level']}: "
                f"physical_rows={st['n_physical_rows']} school_ctx={st['n_school_context_rows']} "
                f"major_candidate={st['n_major_candidate_rows']} ok={st['n_ok']} "
                f"ledger={st['n_ledger']} subtotal_mismatch={st['n_subtotal_mismatch']} "
                f"G1={'PASS' if st['g1_ok'] else 'FAIL'}"
            )

    conn.close()

    print(f"\n=== 汇总（{len(stats)} 文件）===")
    total_major = sum(s["n_major_candidate_rows"] for s in stats)
    total_ok = sum(s["n_ok"] for s in stats)
    total_ledger = sum(s["n_ledger"] for s in stats)
    total_school_ctx = sum(s["n_school_context_rows"] for s in stats)
    total_subtotal_mismatch = sum(s["n_subtotal_mismatch"] for s in stats)
    all_g1 = all(s["g1_ok"] for s in stats)
    print(f"专业行候选总数={total_major} ok={total_ok} ledger={total_ledger} "
          f"恒等式={'PASS' if total_major == total_ok + total_ledger else 'FAIL'} "
          f"(全文件G1={'PASS' if all_g1 else 'FAIL'})")
    print(f"院校上下文行总数(非G1分母, 单独计数)={total_school_ctx}")
    print(f"院校小计校验不一致数(结构性检查, 单独计数)={total_subtotal_mismatch}")
    print(f"写入: {DB_PATH}")


if __name__ == "__main__":
    main()
