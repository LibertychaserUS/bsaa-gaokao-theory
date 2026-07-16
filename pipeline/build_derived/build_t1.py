#!/usr/bin/env python3
"""T1 路构建器 — 投档表 → admission_lines（核心事实表）。

照 docs/data_cleaning_spec_shandong_v1.md（v1.4）T1 schema + R 系列规则实现。
范围（P7）：普通类常规批 2022-2025 × 第 1/2/3 次志愿，共 12 个文件。

本文件只 import common.py（R1-R12 解析函数）+ vocab_annotations_v1.py（注记分类）+
schema.py（DDL），不复制其逻辑。

用法: .venv-data/bin/python pipeline/build_derived/build_t1.py
产出: data/shandong/derived/staging/t1.sqlite (admission_lines + exceptions_ledger)
"""
from __future__ import annotations

import json
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
DB_PATH = STAGING / "t1.sqlite"
LEDGER_TSV = STAGING / "t1_exceptions_ledger.tsv"  # 人读副本（sqlite 为准）
UNKNOWN_TSV = STAGING / "t1_unknown_annotations.tsv"

# ---------------------------------------------------------------------------
# 文件清单（P7 范围=普通类常规批；R11 年份/类别从路径+文件名解析，此处精确列出，
# 不做模糊 glob 猜测——新年份文件名漂移必须显式加入，否则 gate_files 直接 fatal）。
# ---------------------------------------------------------------------------

FILES: dict[int, dict[int, str]] = {
    2022: {
        1: "山东省2022年普通类常规批第一次志愿投档情况表.xls",
        2: "山东省2022年普通类常规批第二次志愿投档情况表（公布）.xls",
        3: "山东省2022年普通类常规批第三次志愿投档情况表.xls",
    },
    2023: {
        1: "山东省2023年普通类常规批第1次志愿投档情况表（公布）.xls",
        2: "山东省2023年普通类常规批第2次志愿投档情况表(公布).xls",
        3: "山东省2023年普通类常规批第3次志愿投档情况表(公布).xls",
    },
    2024: {
        1: "山东省2024年普通类常规批第1次志愿投档情况表(公布).xls",
        2: "山东省2024年普通类常规批第2次志愿投档情况表(公布).xls",
        3: "山东省2024年普通类常规批第3次志愿投档情况表(公布).xls",
    },
    2025: {
        1: "山东省2025年普通类常规批第1次志愿投档情况表(公布).xls",
        2: "山东省2025年普通类常规批第2次志愿投档情况表.xls",
        3: "山东省2025年普通类常规批第3次志愿投档情况表.xls",
    },
}

# R10a: 2022 第 2 次表本科 join 源（v1.4 主循环裁决）。
PLAN2022_R2_FILE = RAW / "2022" / "2022年普通类常规批第2次志愿院校专业本科计划.xls"

# R2 表头别名（封闭表，v1）。
HEADER_ALIASES = {
    "投档最低位次": "min_rank", "最低位次": "min_rank",
    "专业代号及名称": "major", "专业": "major",
    "院校代号及名称": "school", "院校": "school",
    "投档计划数": "plan_count",
    "层次": "level",
}


class HeaderUnrecognizedError(Exception):
    pass


def gate_files() -> None:
    missing = []
    for year, rounds in FILES.items():
        for rd, fname in rounds.items():
            if not (RAW / str(year) / fname).is_file():
                missing.append(f"{year} round={rd}: {fname}")
    if not PLAN2022_R2_FILE.is_file():
        missing.append(f"2022 R10a join source: {PLAN2022_R2_FILE.name}")
    if missing:
        raise SystemExit("FATAL: 以下文件缺失（禁止跳过静默漏扫）:\n" + "\n".join(missing))


def find_header(sh) -> tuple[int, dict[str, int]]:
    """R2: 表头行=首个命中 >=3 个别名的行；返回 (header_row, {role: col_idx})。"""
    for r in range(min(6, sh.nrows)):
        role_map: dict[str, int] = {}
        for c in range(sh.ncols):
            val = common.normalize_ws(str(sh.cell_value(r, c)))
            role = HEADER_ALIASES.get(val)
            if role is not None and role not in role_map:
                role_map[role] = c
        if len(role_map) >= 3:
            return r, role_map
    raise HeaderUnrecognizedError(f"no header row with >=3 aliases found in first 6 rows")


def cell_or_none(sh, r: int, c: int | None):
    if c is None:
        return None
    v = sh.cell_value(r, c)
    if isinstance(v, str):
        s = common.normalize_ws(v)
        return None if s == "" else s
    return v


# ---------------------------------------------------------------------------
# R10a: 2022 第 2 次表本科计划 join 集合构造（master-detail 状态机解析）
# ---------------------------------------------------------------------------

def build_2022_r2_undergrad_join_set() -> set[tuple[str, str]]:
    """解析 2022年普通类常规批第2次志愿院校专业本科计划.xls，产出 (school_code, major_code) 集合。

    结构（master-detail）：院校行=院校代号非空+名称列=纯校名（其余列空/非专业格式）；
    专业行=院校代号列为空，名称列=专业代号+名称(+备注括号)。向前填充院校上下文。
    """
    wb = xlrd.open_workbook(str(PLAN2022_R2_FILE))
    sh = wb.sheet_by_index(0)
    # 表头锚定：找"院校代号"所在行（R2 精神：按文本锚定，不按位置硬编码）。
    header_row = None
    for r in range(min(6, sh.nrows)):
        for c in range(sh.ncols):
            if common.normalize_ws(str(sh.cell_value(r, c))) == "院校代号":
                header_row = r
                break
        if header_row is not None:
            break
    if header_row is None:
        raise SystemExit("FATAL(R10a join source): 未找到'院校代号'表头，本科计划表结构异常")

    join_set: set[tuple[str, str]] = set()
    current_school_code: str | None = None
    for r in range(header_row + 1, sh.nrows):
        school_field = cell_or_none(sh, r, 0)
        name_field = cell_or_none(sh, r, 1)
        if name_field is None:
            continue
        if school_field is not None:
            # 院校行：school_field 形如 "A010"（纯代码，本表院校列与名称列已分列）。
            current_school_code = common.normalize_ws(str(school_field))
            continue
        # 专业行：院校代号列为空，向前填充院校上下文。
        if current_school_code is None:
            raise SystemExit(
                f"FATAL(R10a join source): row {r} 专业行缺少院校上下文（结构异常）: {name_field!r}"
            )
        try:
            major_code, _rest = common.split_major(str(name_field))
        except common.MajorSplitError as e:
            raise SystemExit(f"FATAL(R10a join source): row {r} 专业代号解析失败: {e}") from e
        join_set.add((current_school_code, major_code))
    return join_set


# ---------------------------------------------------------------------------
# 主构建逻辑
# ---------------------------------------------------------------------------

def process_file(
    year: int, round_no: int, fname: str, conn: sqlite3.Connection,
    join_set_2022_r2: set[tuple[str, str]] | None,
) -> dict:
    """处理单文件全部数据行，写入 admission_lines / exceptions_ledger。返回统计字典。"""
    path = RAW / str(year) / fname
    rel_path = str(path.relative_to(ROOT))
    wb = xlrd.open_workbook(str(path))
    sh = wb.sheet_by_index(0)

    try:
        header_row, roles = find_header(sh)
    except HeaderUnrecognizedError as e:
        # 全文件命不中 -> 台账 HEADER_UNRECOGNIZED，该文件 fatal（规范明文：不得猜列）。
        raise SystemExit(f"FATAL(HEADER_UNRECOGNIZED) {rel_path}: {e}") from e

    # R11: 文件名与表内标题行（r0）交叉校验。
    title_row_text = common.normalize_ws(str(sh.cell_value(0, 0)))
    if not title_row_text:
        # 有些文件 r0 第一格为空，标题在其它列（如 2025 r0 c0 直接是标题）；已知样式均在 c0-c1。
        for c in range(min(3, sh.ncols)):
            t = common.normalize_ws(str(sh.cell_value(0, c)))
            if t:
                title_row_text = t
                break
    year_str = str(year)
    if year_str not in title_row_text or "普通类常规批" not in title_row_text:
        common.append_ledger(
            LEDGER_TSV, rel_path, 0, "SHEET_STRUCTURE_UNEXPECTED",
            title_row_text, "R11_title_crosscheck",
        )
        conn.execute(
            f"INSERT INTO exceptions_ledger VALUES (?,?,?,?,?,?)",
            (rel_path, 0, "SHEET_STRUCTURE_UNEXPECTED", title_row_text, "R11_title_crosscheck", None),
        )

    data_start = header_row + 1
    n_data_rows = sh.nrows - data_start
    n_ledger = 0
    n_ok = 0

    for r in range(data_start, sh.nrows):
        raw_row_repr = json.dumps(
            [sh.cell_value(r, c) for c in range(sh.ncols)], ensure_ascii=False
        )

        def ledger(reason_code: str, content: str, stage: str) -> None:
            nonlocal n_ledger
            common.append_ledger(LEDGER_TSV, rel_path, r, reason_code, content, stage)
            conn.execute(
                "INSERT INTO exceptions_ledger VALUES (?,?,?,?,?,?)",
                (rel_path, r, reason_code, content, stage, None),
            )
            n_ledger += 1

        major_field = cell_or_none(sh, r, roles.get("major"))
        school_field = cell_or_none(sh, r, roles.get("school"))
        plan_field = sh.cell_value(r, roles["plan_count"]) if "plan_count" in roles else None
        rank_field = sh.cell_value(r, roles["min_rank"]) if "min_rank" in roles else None
        level_col_raw = cell_or_none(sh, r, roles.get("level"))

        if major_field is None and school_field is None:
            # 全空行：不属于规范明确覆盖的样式（普查已确认 0 例），落台账而非静默跳过。
            ledger("SHEET_STRUCTURE_UNEXPECTED", raw_row_repr, "blank_row_scan")
            continue

        # R7 院校拆分
        try:
            school_code, school_name_norm = common.split_school(str(school_field))
        except common.SchoolSplitError:
            ledger("SCHOOL_SPLIT_FAIL", str(school_field), "R7")
            continue

        # R4 专业拆分
        try:
            major_code, major_name_full = common.split_major(str(major_field))
        except common.MajorSplitError:
            ledger("MAJOR_SPLIT_FAIL", str(major_field), "R4")
            continue

        # R5 括号段提取
        try:
            major_base, segments = common.extract_parens(major_name_full)
        except common.ParenUnbalancedError:
            ledger("PAREN_UNBALANCED", major_name_full, "R5")
            continue

        # R6 原子拆分 + 分类
        annotations: list[dict] = []
        identity_atoms: list[str] = []
        unknown_found = False
        for seg in segments:
            for atom in common.split_annotation_atoms(seg):
                cls, rule = vocab.classify_annotation(atom)
                annotations.append({"atom": atom, "cls": cls, "rule": rule})
                if cls == "unclassified":
                    unknown_found = True
                elif cls == "identity":
                    identity_atoms.append(vocab.canon_identity_atom(atom))
        if unknown_found:
            unk_atoms = [a["atom"] for a in annotations if a["cls"] == "unclassified"]
            ledger("UNKNOWN_ANNOTATION", "; ".join(unk_atoms), "R6")
            continue

        # R9 plan_count
        try:
            plan_count = common.parse_plan_count(plan_field)
        except common.PlanCountError:
            ledger("BAD_PLAN_COUNT", repr(plan_field), "R9")
            continue

        # R3 min_rank 三态
        try:
            min_rank, min_rank_censor = common.parse_min_rank(rank_field)
        except common.RankParseError:
            ledger("UNKNOWN_RANK_FORMAT", repr(rank_field), "R3")
            continue

        # R10 / R10a round-level 判定
        if round_no == 1:
            level = "本科"
        elif round_no == 3:
            level = "专科"
        else:  # round_no == 2
            if "level" in roles:
                if level_col_raw is None:
                    ledger("SHEET_STRUCTURE_UNEXPECTED", raw_row_repr, "R10_missing_level_value")
                    continue
                lv = common.normalize_ws(level_col_raw)
                if lv not in ("本科", "专科"):
                    ledger("SHEET_STRUCTURE_UNEXPECTED", f"level={lv!r}", "R10_bad_level_value")
                    continue
                level = lv
            else:
                # R10a: 2022 第2次表无层次列 -> join 官方本科计划表判本/专。
                if join_set_2022_r2 is None:
                    ledger("LEVEL_UNRESOLVED", raw_row_repr, "R10a_no_join_set")
                    continue
                level = "本科" if (school_code, major_code) in join_set_2022_r2 else "专科"

        annotations_json = json.dumps(annotations, ensure_ascii=False)

        try:
            conn.execute(
                "INSERT INTO admission_lines VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    year, round_no, level, school_code, str(school_field), school_name_norm,
                    major_code, major_name_full, major_base, annotations_json,
                    plan_count, min_rank, min_rank_censor, rel_path, r,
                ),
            )
            n_ok += 1
        except sqlite3.IntegrityError:
            ledger("DUP_PRIMARY_KEY", f"{year}/{round_no}/{level}/{school_code}/{major_code}", "PK_insert")

    conn.commit()
    return {
        "file": rel_path, "year": year, "round": round_no,
        "n_data_rows": n_data_rows, "n_ok": n_ok, "n_ledger": n_ledger,
    }


def main() -> None:
    gate_files()
    STAGING.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()
    if LEDGER_TSV.exists():
        LEDGER_TSV.unlink()

    join_set_2022_r2 = build_2022_r2_undergrad_join_set()
    print(f"R10a join set (2022 R2 本科计划): {len(join_set_2022_r2)} (school_code,major_code) 对")

    conn = sqlite3.connect(str(DB_PATH))
    conn.execute(schema.DDL_T1_ADMISSION_LINES)
    conn.execute(schema.DDL_T6_EXCEPTIONS_LEDGER)
    conn.commit()

    stats = []
    for year in sorted(FILES):
        for round_no in sorted(FILES[year]):
            fname = FILES[year][round_no]
            js = join_set_2022_r2 if (year == 2022 and round_no == 2) else None
            st = process_file(year, round_no, fname, conn, js)
            stats.append(st)
            print(
                f"{year} round={round_no}: data_rows={st['n_data_rows']} "
                f"ok={st['n_ok']} ledger={st['n_ledger']} "
                f"identity={'ok' if st['n_ok']+st['n_ledger']==st['n_data_rows'] else 'MISMATCH'}"
            )

    conn.close()

    # unknown 注记清单（人审用）
    unk_rows: list[tuple[str, str]] = []
    if LEDGER_TSV.exists():
        import csv
        with LEDGER_TSV.open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row["reason_code"] == "UNKNOWN_ANNOTATION":
                    unk_rows.append((row["source_file"], row["raw_content"]))
    with UNKNOWN_TSV.open("w", encoding="utf-8") as f:
        f.write("source_file\traw_content\n")
        for sf, rc in unk_rows:
            f.write(f"{sf}\t{rc}\n")

    print(f"\n=== 汇总（{len(stats)} 文件）===")
    total_data = sum(s["n_data_rows"] for s in stats)
    total_ok = sum(s["n_ok"] for s in stats)
    total_ledger = sum(s["n_ledger"] for s in stats)
    print(f"总数据行={total_data} ok={total_ok} ledger={total_ledger} "
          f"恒等式={'PASS' if total_data == total_ok + total_ledger else 'FAIL'}")
    print(f"写入: {DB_PATH}")


if __name__ == "__main__":
    main()
