#!/usr/bin/env python3
"""注记普查（v1.2 词表冷启动条款，规范 R6 末段）。

用 xlrd 扫 4 年（2022-2025）普通类常规批第 1/2/3 次投档表全部数据行：
  R1 空白规范化 -> R4 拆专业字段 -> R5 提取括号段 -> R6 按 ，；、 拆原子注记。
统计 distinct 注记 + 出现次数 + 示例专业行，写 pipeline/build_derived/annotation_survey.tsv。

同时输出扫描行数统计（供 G1 行数恒等式核对：普查行数应等于 4 文件 × 3 轮次的数据行总数）。

用法: .venv-data/bin/python pipeline/build_derived/survey_annotations.py
"""
from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

import xlrd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    MajorSplitError, ParenUnbalancedError, extract_parens, normalize_ws,
    split_annotation_atoms, split_major,
)

ROOT = Path(__file__).resolve().parent.parent.parent
RAW = ROOT / "data/shandong/raw"
OUT_TSV = Path(__file__).resolve().parent / "annotation_survey.tsv"

# 4 年 × 3 轮次投档表（第 1/2/3 次志愿；普通类常规批）。文件名逐年漂移，逐一列出（R2 精神：
# 不按位置猜测，按已知真实文件名精确锚定；若未来年份文件名不在此列表中会被 gate_files() 捕获为
# 缺失并 fatal，而不是静默漏扫）。
FILES: dict[str, dict[int, str]] = {
    "2022": {
        1: "山东省2022年普通类常规批第一次志愿投档情况表.xls",
        2: "山东省2022年普通类常规批第二次志愿投档情况表（公布）.xls",
        3: "山东省2022年普通类常规批第三次志愿投档情况表.xls",
    },
    "2023": {
        1: "山东省2023年普通类常规批第1次志愿投档情况表（公布）.xls",
        2: "山东省2023年普通类常规批第2次志愿投档情况表(公布).xls",
        3: "山东省2023年普通类常规批第3次志愿投档情况表(公布).xls",
    },
    "2024": {
        1: "山东省2024年普通类常规批第1次志愿投档情况表(公布).xls",
        2: "山东省2024年普通类常规批第2次志愿投档情况表(公布).xls",
        3: "山东省2024年普通类常规批第3次志愿投档情况表(公布).xls",
    },
    "2025": {
        1: "山东省2025年普通类常规批第1次志愿投档情况表(公布).xls",
        2: "山东省2025年普通类常规批第2次志愿投档情况表.xls",
        3: "山东省2025年普通类常规批第3次志愿投档情况表.xls",
    },
}

# R2 表头别名（专业字段列）：本任务只需定位"专业"列，不需要全表头解析（T1 路负责完整 R2）。
MAJOR_HEADER_ALIASES = {"专业代号及名称", "专业"}


def gate_files() -> None:
    missing = []
    for year, rounds in FILES.items():
        for rd, fname in rounds.items():
            p = RAW / year / fname
            if not p.is_file():
                missing.append(f"{year} round={rd}: {fname}")
    if missing:
        raise SystemExit("FATAL: 以下文件缺失，无法普查（禁止跳过静默漏扫）:\n" + "\n".join(missing))


def find_header_row_and_major_col(sh) -> tuple[int, int]:
    """定位表头行（首个命中 ≥1 个"专业"别名的行；本普查只需专业列，R2 全表头解析由 T1 路负责）
    与该行中专业列的列索引。
    """
    for r in range(min(5, sh.nrows)):
        for c in range(sh.ncols):
            val = normalize_ws(str(sh.cell_value(r, c)))
            if val in MAJOR_HEADER_ALIASES:
                return r, c
    raise SystemExit(f"FATAL: 未找到专业列表头（在前 5 行内）; nrows={sh.nrows} ncols={sh.ncols}")


def survey() -> tuple[dict[str, list], dict[str, int]]:
    """返回 (atom -> [count, example_major_line], per_file_row_count)。"""
    atom_stats: dict[str, list] = defaultdict(lambda: [0, ""])
    per_file_rows: dict[str, int] = {}
    parse_fail = []

    for year, rounds in FILES.items():
        for rd, fname in rounds.items():
            path = RAW / year / fname
            wb = xlrd.open_workbook(str(path))
            sh = wb.sheet_by_index(0)
            header_row, major_col = find_header_row_and_major_col(sh)
            data_start = header_row + 1
            n_data_rows = sh.nrows - data_start
            key = f"{year}/round{rd}"
            per_file_rows[key] = n_data_rows

            for r in range(data_start, sh.nrows):
                cell = sh.cell_value(r, major_col)
                major_field = normalize_ws(str(cell))
                if major_field == "":
                    continue
                try:
                    _code, name_full = split_major(major_field)
                except MajorSplitError:
                    parse_fail.append((key, r, major_field, "MAJOR_SPLIT_FAIL"))
                    continue
                try:
                    _base, segments = extract_parens(name_full)
                except ParenUnbalancedError:
                    parse_fail.append((key, r, major_field, "PAREN_UNBALANCED"))
                    continue
                for seg in segments:
                    atoms = split_annotation_atoms(seg)
                    for atom in atoms:
                        entry = atom_stats[atom]
                        entry[0] += 1
                        if entry[1] == "":
                            entry[1] = f"{key} r{r}: {major_field}"

    if parse_fail:
        print(f"WARN: {len(parse_fail)} 行解析失败（R4/R5），示例前 10 条:", file=sys.stderr)
        for item in parse_fail[:10]:
            print(f"  {item}", file=sys.stderr)

    return atom_stats, per_file_rows


def main() -> None:
    gate_files()
    atom_stats, per_file_rows = survey()

    rows_sorted = sorted(atom_stats.items(), key=lambda kv: (-kv[1][0], kv[0]))
    with OUT_TSV.open("w", encoding="utf-8") as f:
        f.write("注记\t次数\t示例专业行\n")
        for atom, (count, example) in rows_sorted:
            f.write(f"{atom}\t{count}\t{example}\n")

    total_occurrences = sum(c for c, _ in atom_stats.values())
    print(f"distinct 注记数: {len(atom_stats)}")
    print(f"总出现次数: {total_occurrences}")
    print("逐文件数据行数:")
    for k, v in per_file_rows.items():
        print(f"  {k}: {v}")
    print(f"数据行总数: {sum(per_file_rows.values())}")
    print(f"输出: {OUT_TSV}")
    print("\n前 20 高频:")
    for atom, (count, example) in rows_sorted[:20]:
        print(f"  {atom}\t{count}\t{example}")


if __name__ == "__main__":
    main()
