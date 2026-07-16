#!/usr/bin/env python3
"""T2 验收门 G1/G3/G5/G6/G6b/G8（data_cleaning_spec_shandong_v1.md §3, v1.5）。

独立可执行、退出码 0=全绿。复核 agent 会独立重跑本脚本——不依赖 build_t2.py 内部返回的
统计字典，只读 data/shandong/derived/staging/t2.sqlite + 原始 raw 文件独立重算 G1/G6/G6b。

用法: .venv-data/bin/python pipeline/build_derived/gates_t2.py
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

import xlrd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DB_PATH = ROOT / "data/shandong/derived/staging/t2.sqlite"
GOLDEN_PATH = HERE / "golden_baseline_t2_v1.json"
RAW = ROOT / "data/shandong/raw"

sys.path.insert(0, str(HERE))
from build_t2 import FILES, POOL_ORDER, is_blank, to_int_exact, find_header  # noqa: E402
import common  # noqa: E402

FAILS: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    print(f"[{'PASS' if cond else 'FAIL'}] {name} {detail}")
    if not cond:
        FAILS.append(f"{name} {detail}")


# N_total 黄金基线（全体池 score=150 的 cum_count，规范附录 v1.1 §G5 追加）。
N_TOTAL_GOLDEN = {2022: 594771, 2023: 662199, 2024: 666000, 2025: 681127, 2026: 708817}


def independent_raw_scan(path: Path) -> tuple[int, dict[str, int], int]:
    """独立重扫单文件：返回 (table_top, {pool: n_raw_cells}, bottom_score)。
    与 build_t2.find_header 逻辑一致但本函数独立调用（供交叉验证 G1）。
    """
    wb = xlrd.open_workbook(str(path))
    sh = wb.sheet_by_index(0)
    header_r1, pool_cols = find_header(sh)
    data_start = header_r1 + 2
    data_end = sh.nrows - 1
    table_top = to_int_exact(sh.cell_value(data_start, 0), "table_top")
    bottom_score = to_int_exact(sh.cell_value(data_end, 0), "bottom_score")
    n_raw_cells = data_end - data_start + 1
    return table_top, {pool: n_raw_cells for pool in pool_cols}, bottom_score


def main() -> None:
    if not DB_PATH.exists():
        print(f"FATAL: {DB_PATH} 不存在，先跑 build_t2.py")
        sys.exit(2)

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # ---------------------------------------------------------------
    # G1 行数恒等式（T2 版）：raw_cells = exact + absorbed_blank_cells + ledger
    # 独立重扫：raw_cells 从原始文件重算；exact/sentinel/ledger 从 db 独立查询；
    # absorbed_cells 独立重算（扫描该池 [data_start, s_idx) 区间空白格数）。
    # ---------------------------------------------------------------
    print("--- G1 行数恒等式（T2：raw = exact + absorbed_blank_cells + ledger，哨兵单独计） ---")
    g1_all_pass = True
    absorbed_report: list[tuple[int, str, int]] = []  # (year, pool, gap) 哨兵清单
    for year in sorted(FILES):
        fname = FILES[year]
        path = RAW / str(year) / fname
        rel = str(path.relative_to(ROOT))
        wb = xlrd.open_workbook(str(path))
        sh = wb.sheet_by_index(0)
        header_r1, pool_cols = find_header(sh)
        data_start = header_r1 + 2
        data_end = sh.nrows - 1
        n_raw_cells = data_end - data_start + 1

        for pool in POOL_ORDER:
            count_col = pool_cols[pool]
            cum_col = count_col + 1
            # 独立重找 s_idx + absorbed_cells（与 build_t2 process_pool 阶段1逻辑一致，独立实现）。
            s_idx = None
            absorbed = 0
            r = data_start
            while r <= data_end:
                count_v = sh.cell_value(r, count_col)
                cum_v = sh.cell_value(r, cum_col)
                cb, ub = is_blank(count_v), is_blank(cum_v)
                if cb and ub:
                    absorbed += 1
                    r += 1
                    continue
                if cb != ub:
                    r += 1  # partial blank -> 已在 build 阶段落台账，此处跳过计入 ledger 统计
                    continue
                s_idx = r
                break

            exact_n = cur.execute(
                "SELECT COUNT(*) FROM score_rank WHERE year=? AND subject_pool=? AND censor='exact'",
                (year, pool),
            ).fetchone()[0]
            sentinel_n = cur.execute(
                "SELECT COUNT(*) FROM score_rank WHERE year=? AND subject_pool=? AND censor='head_aggregate'",
                (year, pool),
            ).fetchone()[0]
            ledger_n = cur.execute(
                "SELECT COUNT(*) FROM exceptions_ledger WHERE source_file=? AND raw_content LIKE ?",
                (rel, f"pool={pool}%"),
            ).fetchone()[0]

            # 恒等式：raw_cells = exact_n + absorbed + ledger_n（哨兵不额外计一个"格"，
            # 它代表的正是 absorbed 区间已被吸收——哨兵行本身对应 s 行, 已含在 exact 里，
            # 哨兵的存在不改变格子计数，只是把 absorbed 区间标记为"有一条聚合记录"）。
            eq = (n_raw_cells == exact_n + absorbed + ledger_n)
            g1_all_pass &= eq
            print(f"  {year}/{pool}: raw={n_raw_cells} exact={exact_n} absorbed={absorbed} "
                  f"sentinel={sentinel_n} ledger={ledger_n} sum(exact+absorbed+ledger)="
                  f"{exact_n + absorbed + ledger_n} {'OK' if eq else 'MISMATCH'}")
            if sentinel_n > 0:
                gap_row = cur.execute(
                    "SELECT count_at FROM score_rank WHERE year=? AND subject_pool=? AND censor='head_aggregate'",
                    (year, pool),
                ).fetchone()
                absorbed_report.append((year, pool, gap_row[0] if gap_row else -1))
    check("G1.行数恒等式（全部年×池）", g1_all_pass)

    # ---------------------------------------------------------------
    # G3 值域：score∈[100,750]（head_aggregate 行上界豁免至751）；count/cum>=0
    # ---------------------------------------------------------------
    bad_score_exact = cur.execute("""
        SELECT COUNT(*) FROM score_rank WHERE censor='exact' AND (score < 100 OR score > 750)
    """).fetchone()[0]
    bad_score_sentinel = cur.execute("""
        SELECT COUNT(*) FROM score_rank WHERE censor='head_aggregate' AND (score < 100 OR score > 751)
    """).fetchone()[0]
    bad_counts = cur.execute("""
        SELECT COUNT(*) FROM score_rank WHERE count_at < 0 OR cum_count < 0
    """).fetchone()[0]
    check("G3.exact行score值域[100,750]", bad_score_exact == 0, f"违例={bad_score_exact}")
    check("G3.head_aggregate行score值域[100,751]", bad_score_sentinel == 0, f"违例={bad_score_sentinel}")
    check("G3.count/cum非负", bad_counts == 0, f"违例={bad_counts}")

    # ---------------------------------------------------------------
    # G5 黄金断言：全体池 score=150 的 cum_count
    # ---------------------------------------------------------------
    print("--- G5 黄金断言（N_total，全体池 score=150 cum_count） ---")
    g5_ok = True
    for year, golden_n in N_TOTAL_GOLDEN.items():
        row = cur.execute(
            "SELECT cum_count FROM score_rank WHERE year=? AND subject_pool='全体' AND score=150",
            (year,),
        ).fetchone()
        actual = row[0] if row else None
        ok = (actual == golden_n)
        g5_ok &= ok
        print(f"  {year}: 实测={actual} 断言={golden_n} {'PASS' if ok else 'FAIL'}")
    check("G5.N_total黄金断言(5年全体池cum@150)", g5_ok)

    # ---------------------------------------------------------------
    # G6 一分一段单调性 + 连续性（按 year,subject_pool 分组）
    # ---------------------------------------------------------------
    print("--- G6 单调性+连续性 ---")
    g6_ok = True
    for year in sorted(FILES):
        for pool in POOL_ORDER:
            rows = cur.execute(
                "SELECT score, censor FROM score_rank WHERE year=? AND subject_pool=? ORDER BY score DESC",
                (year, pool),
            ).fetchall()
            exact_scores = [r["score"] for r in rows if r["censor"] == "exact"]
            sentinel_scores = [r["score"] for r in rows if r["censor"] == "head_aggregate"]

            # 连续无洞：exact_scores 应为 [max, max-1, ..., 150] 逐分连续。
            continuous = True
            if exact_scores:
                expected = list(range(exact_scores[0], exact_scores[0] - len(exact_scores), -1))
                continuous = (exact_scores == expected) and (exact_scores[-1] == 150)

            # cum_count 严格递增（score 降序，即数组顺序）：包含哨兵行也纳入整体单调性检查，
            # 哨兵 score=table_top+1 排在最前，其 cum_count(=gap) 必须小于紧随其后 exact 首行的 cum_count。
            cum_map = {r["score"]: None for r in rows}
            full_rows = cur.execute(
                "SELECT score, cum_count FROM score_rank WHERE year=? AND subject_pool=? ORDER BY score DESC",
                (year, pool),
            ).fetchall()
            monotonic = all(
                full_rows[i]["cum_count"] < full_rows[i + 1]["cum_count"]
                for i in range(len(full_rows) - 1)
            )
            n_sentinel_here = len(sentinel_scores)
            ok = continuous and monotonic and n_sentinel_here <= 1
            g6_ok &= ok
            if not ok:
                print(f"  {year}/{pool}: continuous={continuous} monotonic={monotonic} "
                      f"n_sentinel={n_sentinel_here} FAIL")
    check("G6.单调性+连续性(全部年×池)", g6_ok)

    # ---------------------------------------------------------------
    # G6b 累计还原门
    # ---------------------------------------------------------------
    print("--- G6b 累计还原门 ---")
    g6b_ok = True
    for year in sorted(FILES):
        for pool in POOL_ORDER:
            rows = cur.execute(
                "SELECT score, count_at, cum_count, censor FROM score_rank "
                "WHERE year=? AND subject_pool=? ORDER BY score DESC",
                (year, pool),
            ).fetchall()
            if not rows:
                g6b_ok = False
                print(f"  {year}/{pool}: 无数据 FAIL")
                continue
            ok = True
            # 首行（=哨兵，若存在；否则=首个exact行）cum_count == count_at。
            if rows[0]["cum_count"] != rows[0]["count_at"]:
                ok = False
            # 逐行递推 cum[i] == cum[i-1] + count[i]。
            for i in range(1, len(rows)):
                if rows[i]["cum_count"] != rows[i - 1]["cum_count"] + rows[i]["count_at"]:
                    ok = False
                    break
            g6b_ok &= ok
            if not ok:
                print(f"  {year}/{pool}: 累计还原 FAIL")
    check("G6b.累计还原(全部年×池)", g6b_ok)

    # ---------------------------------------------------------------
    # G8 摘要一致性：输出内容摘要（供两次独立构建对比）
    # ---------------------------------------------------------------
    all_rows = cur.execute(
        "SELECT year, subject_pool, score, count_at, cum_count, censor FROM score_rank"
    ).fetchall()
    digest = common.content_digest(
        [dict(r) for r in all_rows],
        primary_key=["year", "subject_pool", "score"],
        columns=["year", "subject_pool", "score", "count_at", "cum_count", "censor"],
    )
    print(f"内容摘要 (G8 用): {digest}")

    conn.close()

    print("\n--- 哨兵行清单（年×池×gap） ---")
    for year, pool, gap in sorted(absorbed_report):
        print(f"  {year} {pool}: gap={gap}")

    print(f"\n=== 结论: {'全绿 PASS' if not FAILS else f'{len(FAILS)} 项红 FAIL'} ===")
    if FAILS:
        for f in FAILS:
            print(f"  FAIL: {f}")
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
