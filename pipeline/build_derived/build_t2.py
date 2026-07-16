#!/usr/bin/env python3
"""T2 路构建器 — 一分一段表 → score_rank（一分一段事实表）。

照 docs/data_cleaning_spec_shandong_v1.md（v1.5）T2 附录 + G6/G6b 实现。
范围：2022-2026 五年"夏季高考文化成绩一分一段表.xls"（普通类，文化总分口径）。

头部聚合删失（v1.5 统一锚点，主循环 2026-07-16 二次立法修正 v1.3 错误）：
  每 (year, subject_pool) 独立判定该池首个"本段+累计双列非空白"行 s；
  gap = 该行 累计−本段；gap>0 时在全表构造分数点 table_top+1（每年一个，全表所有池共用）
  写入一条哨兵 (censor='head_aggregate')；[s+1, table_top] 空白区间整段不输出（既非0行也非台账，
  被该哨兵吸收）；[s, 150] 逐分行 censor='exact'，直接采用源表本段/累计的原始数值（不重算），
  G6b 只做还原校验，不做构造。

本文件只 import common.py（R1 空白规范化 / T6 台账 / P5 摘要工具）+ schema.py（DDL），
不复制其逻辑。

用法: .venv-data/bin/python pipeline/build_derived/build_t2.py
产出:
  data/shandong/derived/staging/t2.sqlite (score_rank + exceptions_ledger)
  data/shandong/derived/staging/t2_subject_pool_sizes.csv (每年每池 score=150 的 cum_count)
"""
from __future__ import annotations

import csv
import sqlite3
import sys
from pathlib import Path

import xlrd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
import schema  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent.parent
RAW = ROOT / "data/shandong/raw"
STAGING = ROOT / "data/shandong/derived/staging"
DB_PATH = STAGING / "t2.sqlite"
LEDGER_TSV = STAGING / "t2_exceptions_ledger.tsv"
POOL_SIZES_CSV = STAGING / "t2_subject_pool_sizes.csv"

# ---------------------------------------------------------------------------
# 文件清单（P7 范围=普通类；R11 年份从路径解析，此处精确列出，不做模糊 glob）。
# ---------------------------------------------------------------------------

FILES: dict[int, str] = {
    2022: "2022年夏季高考文化成绩一分一段表.xls",
    2023: "2023年夏季高考文化成绩一分一段表.xls",
    2024: "2024年夏季高考文化成绩一分一段表.xls",
    2025: "2025年夏季高考文化成绩一分一段表.xls",
    2026: "2026年夏季高考文化成绩一分一段表.xls",
}

# r1 一级表头文本 -> subject_pool 规范名（按表头文本锚定，禁止位置硬编码）。
POOL_ALIASES = {
    "全体": "全体",
    "选考物理": "物理",
    "选考化学": "化学",
    "选考生物": "生物",
    "选考思想政治": "思想政治",
    "选考历史": "历史",
    "选考地理": "地理",
}
POOL_ORDER = ["全体", "物理", "化学", "生物", "思想政治", "历史", "地理"]

SUBJECT_POOL_VALUES = set(POOL_ALIASES.values())


class HeaderUnrecognizedError(Exception):
    pass


def gate_files() -> None:
    missing = []
    for year, fname in FILES.items():
        if not (RAW / str(year) / fname).is_file():
            missing.append(f"{year}: {fname}")
    if missing:
        raise SystemExit("FATAL: 以下文件缺失（禁止跳过静默漏扫）:\n" + "\n".join(missing))


def find_header(sh) -> tuple[int, dict[str, int]]:
    """按文本锚定：r1 行 col0 == '分数段'；返回 (r1_row_idx, {pool_name: count_at_col})。"""
    header_r1 = None
    for r in range(min(6, sh.nrows)):
        if common.normalize_ws(str(sh.cell_value(r, 0))) == "分数段":
            header_r1 = r
            break
    if header_r1 is None:
        raise HeaderUnrecognizedError("未找到'分数段'表头行（r1）")

    r2 = header_r1 + 1
    if r2 >= sh.nrows:
        raise HeaderUnrecognizedError("r1 之后无 r2 表头行")
    r2_c1 = common.normalize_ws(str(sh.cell_value(r2, 1)))
    if r2_c1 != "本段人数":
        raise HeaderUnrecognizedError(f"r2 表头首列非'本段人数': {r2_c1!r}")

    pool_cols: dict[str, int] = {}
    for c in range(sh.ncols):
        text = common.normalize_ws(str(sh.cell_value(header_r1, c)))
        if text in POOL_ALIASES:
            pool_cols[POOL_ALIASES[text]] = c

    missing_pools = SUBJECT_POOL_VALUES - set(pool_cols.keys())
    if missing_pools:
        raise HeaderUnrecognizedError(f"r1 表头缺失科目池: {missing_pools}")

    return header_r1, pool_cols


def is_blank(v) -> bool:
    return isinstance(v, str) and common.normalize_ws(v) == ""


def to_int_exact(v, context: str) -> int:
    """v 必须是无小数部分的 float（xlrd 数值单元格约定）；否则抛异常（调用方负责落台账）。"""
    if not isinstance(v, float):
        raise ValueError(f"{context}: 非 float 类型: {type(v)!r} value={v!r}")
    if v != v:  # NaN 防御
        raise ValueError(f"{context}: NaN 不允许: {v!r}")
    if not v.is_integer():
        raise ValueError(f"{context}: 非整数值: {v!r}")
    return int(v)


def process_pool(
    sh, year: int, pool: str, count_col: int, data_start: int, data_end: int,
    table_top: int, rel_path: str, conn: sqlite3.Connection,
) -> dict:
    """处理单个 (year, subject_pool) 的全部数据行。返回统计字典。"""
    cum_col = count_col + 1
    n_ledger = 0

    def ledger(source_row: int, content: str, stage: str) -> None:
        nonlocal n_ledger
        common.append_ledger(LEDGER_TSV, rel_path, source_row, "SHEET_STRUCTURE_UNEXPECTED",
                              content, stage)
        conn.execute(
            "INSERT INTO exceptions_ledger VALUES (?,?,?,?,?,?)",
            (rel_path, source_row, "SHEET_STRUCTURE_UNEXPECTED", content, stage, None),
        )
        n_ledger += 1

    # ---- 阶段 1：定位该池首个"本段+累计双列非空白"行 s（锚点扫描） ----
    s_idx = None  # rows 数组下标（相对 data_start 的偏移）
    absorbed_cells = 0
    r = data_start
    while r <= data_end:
        count_v = sh.cell_value(r, count_col)
        cum_v = sh.cell_value(r, cum_col)
        count_blank = is_blank(count_v)
        cum_blank = is_blank(cum_v)
        if count_blank and cum_blank:
            absorbed_cells += 1
            r += 1
            continue
        if count_blank != cum_blank:
            # 单列空白单列非空白：未覆盖样式，落台账，本行不计入 absorbed 也不计入 s。
            ledger(r, f"pool={pool} count_v={count_v!r} cum_v={cum_v!r}", "T2_partial_blank")
            r += 1
            continue
        s_idx = r
        break

    if s_idx is None:
        raise SystemExit(
            f"FATAL: {rel_path} 池={pool} 年={year} 全表空白，无首个非空白行（未覆盖样式）"
        )

    score_s = to_int_exact(sh.cell_value(s_idx, 0), f"{rel_path} r{s_idx} score")
    count_s = to_int_exact(sh.cell_value(s_idx, count_col), f"{rel_path} r{s_idx} count_at({pool})")
    cum_s = to_int_exact(sh.cell_value(s_idx, cum_col), f"{rel_path} r{s_idx} cum_count({pool})")
    gap = cum_s - count_s

    n_exact = 0
    n_sentinel = 0

    if gap < 0:
        ledger(s_idx, f"pool={pool} gap<0 (cum={cum_s} count={count_s})", "T2_negative_gap")
    else:
        if gap > 0:
            sentinel_score = table_top + 1
            try:
                conn.execute(
                    "INSERT INTO score_rank VALUES (?,?,?,?,?,?,?,?)",
                    (year, pool, sentinel_score, gap, gap, "head_aggregate", rel_path, s_idx),
                )
                n_sentinel += 1
            except sqlite3.IntegrityError:
                ledger(s_idx, f"pool={pool} sentinel PK冲突 score={sentinel_score}", "DUP_PRIMARY_KEY")

        # s 行本身作为 exact 行入库（直接采用源表数值，不重算）。
        try:
            conn.execute(
                "INSERT INTO score_rank VALUES (?,?,?,?,?,?,?,?)",
                (year, pool, score_s, count_s, cum_s, "exact", rel_path, s_idx),
            )
            n_exact += 1
        except sqlite3.IntegrityError:
            ledger(s_idx, f"pool={pool} exact PK冲突 score={score_s}", "DUP_PRIMARY_KEY")

    # ---- 阶段 2：s 之后逐行 exact（预期全部非空白，防御性校验） ----
    for r in range(s_idx + 1, data_end + 1):
        count_v = sh.cell_value(r, count_col)
        cum_v = sh.cell_value(r, cum_col)
        if is_blank(count_v) or is_blank(cum_v):
            ledger(r, f"pool={pool} s之后出现空白 count_v={count_v!r} cum_v={cum_v!r}",
                   "T2_unexpected_blank_after_s")
            continue
        try:
            score_v = to_int_exact(sh.cell_value(r, 0), f"{rel_path} r{r} score")
            count_at = to_int_exact(count_v, f"{rel_path} r{r} count_at({pool})")
            cum_count = to_int_exact(cum_v, f"{rel_path} r{r} cum_count({pool})")
        except ValueError as e:
            ledger(r, str(e), "T2_bad_numeric")
            continue
        try:
            conn.execute(
                "INSERT INTO score_rank VALUES (?,?,?,?,?,?,?,?)",
                (year, pool, score_v, count_at, cum_count, "exact", rel_path, r),
            )
            n_exact += 1
        except sqlite3.IntegrityError:
            ledger(r, f"pool={pool} exact PK冲突 score={score_v}", "DUP_PRIMARY_KEY")

    n_raw_cells = data_end - data_start + 1
    identity_ok = (n_exact + absorbed_cells + n_ledger == n_raw_cells)

    return {
        "year": year, "pool": pool, "s_idx": s_idx, "score_s": score_s, "gap": gap,
        "n_raw_cells": n_raw_cells, "n_exact": n_exact, "n_sentinel": n_sentinel,
        "absorbed_cells": absorbed_cells, "n_ledger": n_ledger, "identity_ok": identity_ok,
    }


def process_file(year: int, fname: str, conn: sqlite3.Connection) -> list[dict]:
    path = RAW / str(year) / fname
    rel_path = str(path.relative_to(ROOT))
    wb = xlrd.open_workbook(str(path))
    sh = wb.sheet_by_index(0)

    try:
        header_r1, pool_cols = find_header(sh)
    except HeaderUnrecognizedError as e:
        raise SystemExit(f"FATAL(HEADER_UNRECOGNIZED) {rel_path}: {e}") from e

    data_start = header_r1 + 2
    data_end = sh.nrows - 1

    table_top = to_int_exact(sh.cell_value(data_start, 0), f"{rel_path} table_top")
    bottom_score = to_int_exact(sh.cell_value(data_end, 0), f"{rel_path} bottom_score")
    if bottom_score != 150:
        raise SystemExit(
            f"FATAL: {rel_path} 末行分数={bottom_score} != 150（规范固定止于150分，未覆盖样式）"
        )

    stats = []
    for pool in POOL_ORDER:
        count_col = pool_cols[pool]
        st = process_pool(sh, year, pool, count_col, data_start, data_end, table_top, rel_path, conn)
        stats.append(st)
    conn.commit()
    return stats


def main() -> None:
    gate_files()
    STAGING.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()
    if LEDGER_TSV.exists():
        LEDGER_TSV.unlink()

    conn = sqlite3.connect(str(DB_PATH))
    conn.execute(schema.DDL_T2_SCORE_RANK)
    conn.execute(schema.DDL_T6_EXCEPTIONS_LEDGER)
    conn.commit()

    all_stats: list[dict] = []
    for year in sorted(FILES):
        fname = FILES[year]
        stats = process_file(year, fname, conn)
        all_stats.extend(stats)
        for st in stats:
            print(
                f"{year} pool={st['pool']}: s_idx_score={st['score_s']} gap={st['gap']} "
                f"raw_cells={st['n_raw_cells']} exact={st['n_exact']} sentinel={st['n_sentinel']} "
                f"absorbed={st['absorbed_cells']} ledger={st['n_ledger']} "
                f"identity={'OK' if st['identity_ok'] else 'MISMATCH'}"
            )

    conn.close()

    # 附带产出：subject_pool_sizes（score=150 的 cum_count，直接读源表数值）
    conn2 = sqlite3.connect(str(DB_PATH))
    with POOL_SIZES_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["year", "subject_pool", "n_total_cum_at_150"])
        for year in sorted(FILES):
            for pool in POOL_ORDER:
                row = conn2.execute(
                    "SELECT cum_count FROM score_rank WHERE year=? AND subject_pool=? AND score=150",
                    (year, pool),
                ).fetchone()
                writer.writerow([year, pool, row[0] if row else ""])
    conn2.close()

    print(f"\n=== 汇总（{len(all_stats)} 池×年）===")
    total_raw = sum(s["n_raw_cells"] for s in all_stats)
    total_exact = sum(s["n_exact"] for s in all_stats)
    total_absorbed = sum(s["absorbed_cells"] for s in all_stats)
    total_ledger = sum(s["n_ledger"] for s in all_stats)
    total_sentinel = sum(s["n_sentinel"] for s in all_stats)
    identity = total_raw == total_exact + total_absorbed + total_ledger
    print(f"raw_cells={total_raw} exact={total_exact} absorbed_blank_cells={total_absorbed} "
          f"ledger={total_ledger} sentinel_rows={total_sentinel} "
          f"恒等式(raw=exact+absorbed+ledger)={'PASS' if identity else 'FAIL'}")
    print(f"写入: {DB_PATH}")
    print(f"写入: {POOL_SIZES_CSV}")


if __name__ == "__main__":
    main()
