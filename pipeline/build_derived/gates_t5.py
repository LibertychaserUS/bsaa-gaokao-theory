#!/usr/bin/env python3
"""T5 验收门（data_cleaning_spec_shandong_v1.md §4 M1-M5，v1.6）。独立可执行，退出码 0=绿。

覆盖：
  - 唯一性（(year,school_code,major_code) 单归属；(entity_id,year) 至多一条）
  - match_method 值域
  - 抽 50 条 M1 配对，断言两年 match_key 逐字相等（复用 build_t5.load_rows 单一真源）
  - M5 行数恒等式：每年 entity_xwalk 行数 vs admission_lines 总行数（差值=M3+unmatched，非门红项，只报数）
  - G8：二次构建 digest 一致
"""
from __future__ import annotations

import random
import sqlite3
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DB_PATH = ROOT / "data/shandong/derived/staging/t5.sqlite"
T1_DB_PATH = ROOT / "data/shandong/derived/staging/t1.sqlite"

sys.path.insert(0, str(HERE))
import common  # noqa: E402
import build_t5  # noqa: E402 (复用 load_rows/YEARS，match_key 计算单一真源，不重复实现)

FAILS: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    print(f"[{'PASS' if cond else 'FAIL'}] {name} {detail}")
    if not cond:
        FAILS.append(f"{name} {detail}")


def main() -> None:
    if not DB_PATH.exists():
        print(f"FATAL: {DB_PATH} 不存在，先跑 build_t5.py")
        sys.exit(2)
    if not T1_DB_PATH.exists():
        print(f"FATAL: {T1_DB_PATH} 不存在")
        sys.exit(2)

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # --- G_唯一1：(year, school_code, major_code) 只属一个 entity（PK 已约束，复核） ---
    dup1 = cur.execute("""
        SELECT year, school_code, major_code, COUNT(*) c
        FROM entity_xwalk GROUP BY year, school_code, major_code HAVING c > 1
    """).fetchall()
    check("G_唯一1.(year,school_code,major_code)单归属", len(dup1) == 0, f"重复数={len(dup1)}")

    # --- G_唯一2：同 entity_id 同年至多一条（UNIQUE 已约束，复核） ---
    dup2 = cur.execute("""
        SELECT entity_id, year, COUNT(*) c
        FROM entity_xwalk GROUP BY entity_id, year HAVING c > 1
    """).fetchall()
    check("G_唯一2.(entity_id,year)至多一条", len(dup2) == 0, f"重复数={len(dup2)}")

    # --- G_值域：match_method 封闭集 ---
    bad_method = cur.execute("""
        SELECT COUNT(*) FROM entity_xwalk WHERE match_method NOT IN ('M1','M2','M3-manual')
    """).fetchone()[0]
    check("G_值域.match_method", bad_method == 0, f"非法值数={bad_method}")

    # --- G_M1抽样：抽 50 条 M1 配对，断言两年 match_key 逐字相等 ---
    rows_by_year = {y: build_t5.load_rows(y) for y in build_t5.YEARS}
    key_lookup = {}
    for y, rows in rows_by_year.items():
        for r in rows:
            key_lookup[(y, r["school_code"], r["major_code"])] = r["match_key"]

    m1_rows = cur.execute("""
        SELECT entity_id, year, school_code, major_code
        FROM entity_xwalk WHERE match_method = 'M1'
        ORDER BY entity_id, year
    """).fetchall()
    by_entity: dict[str, list] = {}
    for r in m1_rows:
        by_entity.setdefault(r["entity_id"], []).append(r)

    adjacent_pairs = []
    for eid, rlist in by_entity.items():
        for i in range(len(rlist) - 1):
            adjacent_pairs.append((rlist[i], rlist[i + 1]))

    random.seed(42)
    sample = random.sample(adjacent_pairs, min(50, len(adjacent_pairs)))
    mismatches = []
    for ra, rb in sample:
        ka = key_lookup.get((ra["year"], ra["school_code"], ra["major_code"]))
        kb = key_lookup.get((rb["year"], rb["school_code"], rb["major_code"]))
        if ka is None or kb is None or ka != kb:
            mismatches.append(f"{ra['entity_id']}:{ra['year']}vs{rb['year']} ka={ka!r} kb={kb!r}")
    check(
        "G_M1抽样50.match_key逐字相等",
        len(mismatches) == 0 and len(sample) > 0,
        f"抽样数={len(sample)}/候选总数={len(adjacent_pairs)} 不一致数={len(mismatches)}",
    )
    for m in mismatches[:10]:
        print(f"  MISMATCH: {m}")

    # --- M5 行数恒等式（报数，非门红——unmatched/M3 不是错误，见规范 M5） ---
    print("--- M5 行数分布（entity_xwalk 覆盖 vs admission_lines 总行数）---")
    for y in build_t5.YEARS:
        total = len(rows_by_year[y])
        in_xwalk = cur.execute(
            "SELECT COUNT(*) FROM entity_xwalk WHERE year = ?", (y,)
        ).fetchone()[0]
        left = total - in_xwalk
        print(f"  年={y} 总行数={total} entity_xwalk(M1+M2)行数={in_xwalk} "
              f"未入表(M3待人审+unmatched)={left}({left/total:.4%})")

    # --- G8 前半：读取当前库内容摘要 ---
    all_rows = cur.execute("""
        SELECT entity_id, year, school_code, major_code, match_method, match_confidence
        FROM entity_xwalk
    """).fetchall()
    digest1 = common.content_digest(
        [dict(r) for r in all_rows],
        primary_key=["year", "school_code", "major_code"],
        columns=["entity_id", "year", "school_code", "major_code", "match_method", "match_confidence"],
    )
    conn.close()

    # --- G8 后半：二次构建，比对摘要 ---
    result = subprocess.run(
        [sys.executable, str(HERE / "build_t5.py")],
        capture_output=True, text=True, cwd=str(HERE),
    )
    check("G8.二次构建退出码", result.returncode == 0, f"returncode={result.returncode}")
    digest2 = None
    for line in result.stdout.splitlines():
        if line.startswith("内容摘要"):
            digest2 = line.split(":", 1)[1].strip()
    print(f"  首次构建摘要={digest1}")
    print(f"  二次构建摘要={digest2}")
    check("G8.两遍构建摘要一致", digest2 == digest1, f"digest1={digest1} digest2={digest2}")

    print(f"\n=== 结论: {'全绿 PASS' if not FAILS else f'{len(FAILS)} 项红 FAIL'} ===")
    if FAILS:
        for f in FAILS:
            print(f"  FAIL: {f}")
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
