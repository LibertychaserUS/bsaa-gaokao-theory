#!/usr/bin/env python3
"""T1 验收门 G1-G5+G8（data_cleaning_spec_shandong_v1.md §3, v1.4）。

独立可执行、退出码 0=全绿。复核 agent 会独立重跑本脚本——不依赖 build_t1.py 内部状态，
只读 data/shandong/derived/staging/t1.sqlite + 原始 raw 文件核对 G1。

用法: .venv-data/bin/python pipeline/build_derived/gates_t1.py
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

import xlrd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DB_PATH = ROOT / "data/shandong/derived/staging/t1.sqlite"
GOLDEN_PATH = HERE / "golden_baseline_v1.json"
RAW = ROOT / "data/shandong/raw"

sys.path.insert(0, str(HERE))
from build_t1 import FILES  # noqa: E402  (single source of truth for file list + rounds)

FAILS: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    print(f"[{'PASS' if cond else 'FAIL'}] {name} {detail}")
    if not cond:
        FAILS.append(f"{name} {detail}")


def raw_data_row_count(path: Path) -> int:
    """独立重数原始文件数据行数（表头行=首个命中≥1个已知别名的行，简单实现，
    与 build_t1.find_header_row 逻辑一致但本函数独立实现，供交叉验证）。
    """
    wb = xlrd.open_workbook(str(path))
    sh = wb.sheet_by_index(0)
    aliases = {"投档最低位次", "最低位次", "专业代号及名称", "专业", "院校代号及名称", "院校",
               "投档计划数", "层次"}
    header_row = None
    for r in range(min(5, sh.nrows)):
        hits = 0
        for c in range(sh.ncols):
            val = str(sh.cell_value(r, c)).strip()
            if val in aliases:
                hits += 1
        if hits >= 3:
            header_row = r
            break
    if header_row is None:
        raise SystemExit(f"FATAL: 未找到表头行: {path}")
    return sh.nrows - header_row - 1


def main() -> None:
    if not DB_PATH.exists():
        print(f"FATAL: {DB_PATH} 不存在，先跑 build_t1.py")
        sys.exit(2)

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # ---------------------------------------------------------------
    # G1 行数恒等式：逐文件 入库行数 + 台账行数 = 原始数据行数
    # ---------------------------------------------------------------
    print("--- G1 行数恒等式 ---")
    g1_all_pass = True
    for year, rounds in FILES.items():
        for round_no, fname in rounds.items():
            path = RAW / str(year) / fname
            raw_n = raw_data_row_count(path)
            rel = str(path.relative_to(ROOT))
            ok_n = cur.execute(
                "SELECT COUNT(*) FROM admission_lines WHERE source_file=?", (rel,)
            ).fetchone()[0]
            ledger_n = cur.execute(
                "SELECT COUNT(*) FROM exceptions_ledger WHERE source_file=?", (rel,)
            ).fetchone()[0]
            eq = (ok_n + ledger_n == raw_n)
            g1_all_pass &= eq
            print(f"  {year}/round{round_no}: raw={raw_n} ok={ok_n} ledger={ledger_n} "
                  f"sum={ok_n + ledger_n} {'OK' if eq else 'MISMATCH'}")
    check("G1.行数恒等式（全部文件）", g1_all_pass)

    # ---------------------------------------------------------------
    # G2 主键唯一
    # ---------------------------------------------------------------
    dup = cur.execute("""
        SELECT year, round, level, school_code, major_code, COUNT(*) c
        FROM admission_lines
        GROUP BY year, round, level, school_code, major_code
        HAVING c > 1
    """).fetchall()
    check("G2.主键唯一", len(dup) == 0, f"重复数={len(dup)}")

    # ---------------------------------------------------------------
    # G3 值域
    # ---------------------------------------------------------------
    bad_rank = cur.execute("""
        SELECT COUNT(*) FROM admission_lines
        WHERE min_rank IS NOT NULL AND (min_rank <= 0 OR min_rank > 800000)
    """).fetchone()[0]
    bad_plan = cur.execute("""
        SELECT COUNT(*) FROM admission_lines
        WHERE plan_count < 1 OR plan_count > 5000
    """).fetchone()[0]
    bad_year = cur.execute("""
        SELECT COUNT(*) FROM admission_lines WHERE year < 2022 OR year > 2026
    """).fetchone()[0]
    bad_round = cur.execute("""
        SELECT COUNT(*) FROM admission_lines WHERE round NOT IN (1,2,3)
    """).fetchone()[0]
    bad_level = cur.execute("""
        SELECT COUNT(*) FROM admission_lines WHERE level NOT IN ('本科','专科')
    """).fetchone()[0]
    check("G3.min_rank值域", bad_rank == 0, f"违例={bad_rank}")
    check("G3.plan_count值域", bad_plan == 0, f"违例={bad_plan}")
    check("G3.year值域", bad_year == 0, f"违例={bad_year}")
    check("G3.round值域", bad_round == 0, f"违例={bad_round}")
    check("G3.level值域", bad_level == 0, f"违例={bad_level}")

    # ---------------------------------------------------------------
    # G4 跨年连续性（round=1 主轮；报警项非门红——按规范"超限→报警人审，非门红"，
    # 这里仍打印数值供报告引用，用 PASS/WARN 标记而不计入 FAILS）
    # ---------------------------------------------------------------
    print("--- G4 跨年连续性（round=1，报警项非门红） ---")
    years_sorted = sorted(FILES.keys())
    row_counts = {}
    school_sets = {}
    for year in years_sorted:
        codes = cur.execute(
            "SELECT DISTINCT school_code FROM admission_lines WHERE year=? AND round=1",
            (int(year),)
        ).fetchall()
        school_sets[year] = set(r[0] for r in codes)
        row_counts[year] = cur.execute(
            "SELECT COUNT(*) FROM admission_lines WHERE year=? AND round=1", (int(year),)
        ).fetchone()[0]
    for i in range(1, len(years_sorted)):
        y0, y1 = years_sorted[i - 1], years_sorted[i]
        s0, s1 = school_sets[y0], school_sets[y1]
        jaccard = len(s0 & s1) / len(s0 | s1) if (s0 | s1) else 1.0
        n0, n1 = row_counts[y0], row_counts[y1]
        delta_pct = abs(n1 - n0) / n0 if n0 else 0.0
        status = "OK" if (jaccard >= 0.90 and delta_pct <= 0.15) else "WARN(报警人审, 非门红)"
        print(f"  {y0}->{y1}: jaccard={jaccard:.4f} rows {n0}->{n1} delta={delta_pct:.4f} {status}")

    # ---------------------------------------------------------------
    # G5 黄金断言
    # ---------------------------------------------------------------
    print("--- G5 黄金断言 ---")
    # ① 每年存在 A001 北京大学
    g5_1 = True
    for year in years_sorted:
        n = cur.execute(
            "SELECT COUNT(*) FROM admission_lines WHERE year=? AND school_code='A001'",
            (int(year),)
        ).fetchone()[0]
        ok = n > 0
        g5_1 &= ok
        print(f"  G5.①.{year}.A001北京大学存在: {'PASS' if ok else 'FAIL'} (n={n})")
    check("G5.①每年存在A001北京大学", g5_1)

    # ② 2025 第1次表恰 21381 数据行（= ok+ledger 而非只 ok；此为原始数据行数断言）
    raw_2025_r1 = raw_data_row_count(RAW / "2025" / FILES[2025][1])
    check("G5.②2025第1次表恰21381数据行", raw_2025_r1 == 21381, f"实测={raw_2025_r1}")

    # ③ 2024/2025 各存在恰 1 条清华 censor=le 删失行 (min_rank=50)
    for year in ("2024", "2025"):
        n = cur.execute("""
            SELECT COUNT(*) FROM admission_lines
            WHERE year=? AND school_code='A003' AND min_rank_censor='le' AND min_rank=50
        """, (int(year),)).fetchone()[0]
        check(f"G5.③{year}清华le删失行恰1条(min_rank=50)", n == 1, f"实测={n}")

    # ④ 2022 存在恰 1 条 B417 北京联合大学 min_rank_censor='missing' 行
    n_b417 = cur.execute("""
        SELECT COUNT(*) FROM admission_lines
        WHERE year=2022 AND school_code='B417' AND min_rank_censor='missing'
    """).fetchone()[0]
    check("G5.④2022 B417北京联合大学missing行恰1条", n_b417 == 1, f"实测={n_b417}")

    # ⑤ identity 注记计数基线（首次构建冻结，此后逐项相等）
    rows = cur.execute("SELECT annotations_json, round FROM admission_lines").fetchall()
    identity_counts: dict[str, int] = {}
    identity_counts_round1: dict[str, int] = {}
    for r in rows:
        anns = json.loads(r["annotations_json"])
        for a in anns:
            if a.get("cls") == "identity":
                atom = a.get("atom")
                identity_counts[atom] = identity_counts.get(atom, 0) + 1
                if r["round"] == 1:
                    identity_counts_round1[atom] = identity_counts_round1.get(atom, 0) + 1

    shifan_r1 = identity_counts_round1.get("师范类", 0)
    check("G5.⑤round1师范类计数sanity∈[4679,5500]", 4679 <= shifan_r1 <= 5500,
          f"实测={shifan_r1}")

    if not GOLDEN_PATH.exists():
        GOLDEN_PATH.write_text(
            json.dumps({"identity_counts": identity_counts,
                        "identity_counts_round1": identity_counts_round1},
                       ensure_ascii=False, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        print(f"  G5.⑤ 首次构建：已冻结基线 -> {GOLDEN_PATH}")
        check("G5.⑤注记计数基线(首次冻结)", True)
    else:
        golden = json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))
        golden_counts = golden.get("identity_counts", {})
        mismatches = []
        for atom, cnt in identity_counts.items():
            if golden_counts.get(atom) != cnt:
                mismatches.append((atom, golden_counts.get(atom), cnt))
        for atom, cnt in golden_counts.items():
            if atom not in identity_counts:
                mismatches.append((atom, cnt, 0))
        check("G5.⑤注记计数基线逐项相等", len(mismatches) == 0,
              f"不一致={len(mismatches)}: {mismatches[:5]}")

    # ---------------------------------------------------------------
    # G7 台账闭合审计（release 门；此处只统计不作为本路自检硬门，因人审是主循环职责）
    # ---------------------------------------------------------------
    print("--- G7 台账闭合（未决条目统计，非本路自检硬门；release 前须=0） ---")
    for code in ("UNKNOWN_ANNOTATION", "UNKNOWN_RANK_FORMAT", "HEADER_UNRECOGNIZED"):
        n = cur.execute(
            "SELECT COUNT(*) FROM exceptions_ledger WHERE reason_code=? AND "
            "(resolution IS NULL OR resolution='')", (code,)
        ).fetchone()[0]
        print(f"  {code}: 未决={n}")

    # ---------------------------------------------------------------
    # G8 摘要一致性：本次不重跑 build（由主循环编排两次独立构建后对比 build_meta），
    # 这里输出内容摘要供报告引用/供外部两次构建对比。
    # ---------------------------------------------------------------
    all_rows = cur.execute("""
        SELECT year, round, level, school_code, major_code, min_rank, min_rank_censor,
               plan_count, major_base, school_name_norm
        FROM admission_lines
    """).fetchall()
    sys.path.insert(0, str(HERE))
    import common  # noqa: E402
    digest = common.content_digest(
        [dict(r) for r in all_rows],
        primary_key=["year", "round", "level", "school_code", "major_code"],
        columns=["year", "round", "level", "school_code", "major_code", "min_rank",
                 "min_rank_censor", "plan_count", "major_base", "school_name_norm"],
    )
    print(f"内容摘要 (G8 用): {digest}")

    conn.close()

    print(f"\n=== 结论: {'全绿 PASS' if not FAILS else f'{len(FAILS)} 项红 FAIL'} ===")
    if FAILS:
        for f in FAILS:
            print(f"  FAIL: {f}")
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
