#!/usr/bin/env python3
"""T3+T4 验收门（data_cleaning_spec_shandong_v1.md §3, T3附录v1.1, T4段）。

独立可执行、退出码 0=全绿。复核 agent 会独立重跑本脚本——不依赖 build_t3/t4.py 内部状态，
只读 data/shandong/derived/staging/{t3,t4}.sqlite + 原始 raw 文件核对 G1。

用法: .venv-data/bin/python pipeline/build_derived/gates_t34.py
"""
from __future__ import annotations

import hashlib
import sqlite3
import sys
from pathlib import Path

import xlrd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
RAW = ROOT / "data/shandong/raw"
T3_DB = ROOT / "data/shandong/derived/staging/t3.sqlite"
T4_DB = ROOT / "data/shandong/derived/staging/t4.sqlite"

sys.path.insert(0, str(HERE))
import common  # noqa: E402
from build_t3 import FILES as T3_FILES, HEADER_ALIASES as T3_ALIASES  # noqa: E402
from build_t4 import LINE_NAMES, TRANSCRIBED, KNOWN_REFERENCE  # noqa: E402

FAILS: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    print(f"[{'PASS' if cond else 'FAIL'}] {name} {detail}")
    if not cond:
        FAILS.append(f"{name} {detail}")


# ---------------------------------------------------------------------------
# T3 门
# ---------------------------------------------------------------------------

def t3_find_header(sh) -> tuple[int, dict[str, int]]:
    for r in range(min(6, sh.nrows)):
        role_map: dict[str, int] = {}
        for c in range(sh.ncols):
            val = common.normalize_ws(str(sh.cell_value(r, c)))
            role = T3_ALIASES.get(val)
            if role is not None and role not in role_map:
                role_map[role] = c
        if len(role_map) >= 3:
            return r, role_map
    raise SystemExit("FATAL: T3 表头未找到")


def t3_raw_counts(path: Path) -> tuple[int, int]:
    """独立重数：返回 (物理数据行数, 院校上下文行数)。院校行=院校代号列非空。"""
    wb = xlrd.open_workbook(str(path))
    sh = wb.sheet_by_index(0)
    header_row, roles = t3_find_header(sh)
    school_col = roles.get("school_code")
    data_start = header_row + 1
    n_physical = sh.nrows - data_start
    n_school_ctx = 0
    for r in range(data_start, sh.nrows):
        v = sh.cell_value(r, school_col)
        if isinstance(v, str):
            v = common.normalize_ws(v)
        if v not in (None, "", 0.0):
            n_school_ctx += 1
    return n_physical, n_school_ctx


def run_t3_gates() -> None:
    print("=== T3 门 ===")
    if not T3_DB.exists():
        check("T3.db存在", False, f"{T3_DB} 不存在，先跑 build_t3.py")
        return

    conn = sqlite3.connect(str(T3_DB))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # G1 行数恒等式（专业行候选 = ok + ledger(专业行台账)；院校上下文行单独计数，不入分母）
    print("--- G1 行数恒等式（T3, 专业行分母） ---")
    g1_all = True
    for year, rounds in T3_FILES.items():
        for round_no, fname in rounds.items():
            path = RAW / str(year) / fname
            rel = str(path.relative_to(ROOT))
            n_physical, n_school_ctx = t3_raw_counts(path)
            n_major_candidate = n_physical - n_school_ctx
            ok_n = cur.execute("SELECT COUNT(*) FROM plans WHERE source_file=?", (rel,)).fetchone()[0]
            ledger_n = cur.execute(
                "SELECT COUNT(*) FROM exceptions_ledger WHERE source_file=? AND reason_code != 'SHEET_STRUCTURE_UNEXPECTED'",
                (rel,),
            ).fetchone()[0]
            # SHEET_STRUCTURE_UNEXPECTED 台账条目分两类：专业行候选中的畸形行(计入分母) 和 院校小计不一致(不计入分母,
            # stage='T3_subtotal_check')；按 stage 精确区分。
            ledger_struct_major = cur.execute(
                "SELECT COUNT(*) FROM exceptions_ledger WHERE source_file=? AND reason_code='SHEET_STRUCTURE_UNEXPECTED' AND stage != 'T3_subtotal_check'",
                (rel,),
            ).fetchone()[0]
            ledger_n_total_major = ledger_n + ledger_struct_major
            eq = (ok_n + ledger_n_total_major == n_major_candidate)
            g1_all &= eq
            print(f"  {year}/round{round_no}: physical={n_physical} school_ctx={n_school_ctx} "
                  f"major_candidate={n_major_candidate} ok={ok_n} ledger={ledger_n_total_major} "
                  f"{'OK' if eq else 'MISMATCH'}")
    check("G1.T3行数恒等式（全部文件）", g1_all)

    # T3 主键零重复
    dup = cur.execute("""
        SELECT year, round, school_code, major_code, COUNT(*) c FROM plans
        GROUP BY year, round, school_code, major_code HAVING c > 1
    """).fetchall()
    check("T3.主键零重复", len(dup) == 0, f"重复数={len(dup)}")

    # 院校小计校验（有小计行的院校 Σ专业=小计）：统计有多少条 T3_subtotal_check 台账
    subtotal_mismatch = cur.execute(
        "SELECT COUNT(*) FROM exceptions_ledger WHERE stage='T3_subtotal_check'"
    ).fetchone()[0]
    check("T3.院校小计校验（不一致数应为0）", subtotal_mismatch == 0, f"不一致={subtotal_mismatch}")

    # G3 值域：T3 plan_count ∈ [1,5000]
    bad_plan = cur.execute("SELECT COUNT(*) FROM plans WHERE plan_count < 1 OR plan_count > 5000").fetchone()[0]
    check("G3.T3.plan_count值域[1,5000]", bad_plan == 0, f"违例={bad_plan}")

    # subject_req_norm 分布（报告用，非门；此处只做基本枚举合法性检查）
    bad_norm = cur.execute("""
        SELECT COUNT(*) FROM plans
        WHERE subject_req_norm IS NOT NULL AND subject_req_norm NOT GLOB '*[物化生政史地不限或+]*'
    """).fetchone()[0]
    check("T3.subject_req_norm字符集合法性", bad_norm == 0, f"违例={bad_norm}")

    conn.close()


# ---------------------------------------------------------------------------
# T4 门
# ---------------------------------------------------------------------------

def run_t4_gates() -> None:
    print("=== T4 门 ===")
    if not T4_DB.exists():
        check("T4.db存在", False, f"{T4_DB} 不存在，先跑 build_t4.py")
        return

    conn = sqlite3.connect(str(T4_DB))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    rows = cur.execute("SELECT year, line_name, score, source_doc FROM batch_lines ORDER BY year, line_name").fetchall()
    check("T4.总行数=15(5年x3线)", len(rows) == 15, f"实测={len(rows)}")

    # 每年恰 3 行普通类
    years = sorted(set(r["year"] for r in rows))
    per_year_ok = True
    for y in years:
        n = sum(1 for r in rows if r["year"] == y)
        ok = (n == 3)
        per_year_ok &= ok
        print(f"  {y}: {n} 行 {'OK' if ok else 'MISMATCH'}")
    check("T4.每年恰3行", per_year_ok)

    # G3 值域: score in [100,750]
    bad_score = [r for r in rows if not (100 <= r["score"] <= 750)]
    check("G3.T4.score值域[100,750]", len(bad_score) == 0, f"违例={[dict(r) for r in bad_score]}")

    # 逐年 sanity: 一段∈[400,480] 二段∈[140,220] 特招>一段>二段
    sanity_ok = True
    by_year: dict[int, dict[str, int]] = {}
    for r in rows:
        by_year.setdefault(r["year"], {})[r["line_name"]] = r["score"]
    for y, vals in by_year.items():
        seg1 = vals.get("一段线")
        seg2 = vals.get("二段线")
        special = vals.get("特殊类型招生控制线")
        ok = (
            seg1 is not None and 400 <= seg1 <= 480
            and seg2 is not None and 140 <= seg2 <= 220
            and special is not None and special > seg1 > seg2
        )
        sanity_ok &= ok
        print(f"  {y}: 特招={special} 一段={seg1} 二段={seg2} "
              f"{'OK' if ok else 'FAIL'}")
    check("T4.逐年sanity(一段/二段区间+特招>一段>二段)", sanity_ok)

    # 已知对照值核验（2025/2026）
    ref_ok = True
    for y, ref in KNOWN_REFERENCE.items():
        vals = by_year.get(y, {})
        for name, expect in ref.items():
            actual = vals.get(name)
            ok = (actual == expect)
            ref_ok &= ok
            if not ok:
                print(f"  对照值不符: {y} {name} expect={expect} actual={actual}")
    check("T4.已知对照值核验(2025/2026)", ref_ok)

    # IMAGE_TRANSCRIBED 台账条目数 = 2022-2024 三年 x 3 线 = 9
    n_transcribed_ledger = cur.execute(
        "SELECT COUNT(*) FROM exceptions_ledger WHERE reason_code='IMAGE_TRANSCRIBED'"
    ).fetchone()[0]
    check("T4.IMAGE_TRANSCRIBED台账条目数=9(3年x3线)", n_transcribed_ledger == 9,
          f"实测={n_transcribed_ledger}")

    conn.close()


# ---------------------------------------------------------------------------
# G8 内容摘要（两遍一致性；单遍打印摘要供外部两次构建对比）
# ---------------------------------------------------------------------------

def print_digests() -> None:
    print("=== G8 内容摘要 ===")
    if T3_DB.exists():
        conn = sqlite3.connect(str(T3_DB))
        conn.row_factory = sqlite3.Row
        rows = conn.execute("""
            SELECT year, round, school_code, major_code, school_name, major_name,
                   plan_count, subject_req_norm, level FROM plans
        """).fetchall()
        digest = common.content_digest(
            [dict(r) for r in rows],
            primary_key=["year", "round", "school_code", "major_code"],
            columns=["year", "round", "school_code", "major_code", "school_name", "major_name",
                     "plan_count", "subject_req_norm", "level"],
        )
        print(f"  T3 plans 内容摘要: {digest}")
        conn.close()
    if T4_DB.exists():
        conn = sqlite3.connect(str(T4_DB))
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT year, line_name, score FROM batch_lines").fetchall()
        digest = common.content_digest(
            [dict(r) for r in rows],
            primary_key=["year", "line_name"],
            columns=["year", "line_name", "score"],
        )
        print(f"  T4 batch_lines 内容摘要: {digest}")
        conn.close()


def main() -> None:
    run_t3_gates()
    run_t4_gates()
    print_digests()

    print(f"\n=== 结论: {'全绿 PASS' if not FAILS else f'{len(FAILS)} 项红 FAIL'} ===")
    if FAILS:
        for f in FAILS:
            print(f"  FAIL: {f}")
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
