#!/usr/bin/env python3
"""T4 路构建器 — 各类别分数线公告 → batch_lines（普通类三条线，data_cleaning_spec_shandong_v1.md §1）。

范围（P7）：普通类三条线——特殊类型招生控制线 / 一段线 / 二段线，2022-2026 五年。
数据源：data/shandong/raw/<年>/*各类别分数线*.md（正文或附图），2025/2026 另有原生 PDF 文本层
（.pdf，pdftotext -layout 已提取进 .md 正文，见 raw/2025|2026 的 .md 文件"正文"段落）。

2022-2024：md 正文为空（数字锁在附图 png 里）——本构建器不做 OCR 自动化；
　数字来自主循环对附图的人工视觉转录（Read 工具直接读图），转录结果硬编码在 TRANSCRIBED 表，
　并在台账记 reason='IMAGE_TRANSCRIBED' + 附图相对路径（规范 T6：文档级转录非行级判断，允许）。
2025-2026：md 正文含 pdftotext -layout 提取的原生文本表格，本构建器用正则从正文解析三行数值
　（非图片转录，是文本解析，不记 IMAGE_TRANSCRIBED）。

sanity（非先验筛选，事后核验，见规范 T4 段）：一段∈[400,480]、二段∈[140,220]、
特招>一段>二段；2025/2026 与已知对照值（521/441/150、525/442/150）比对，
不符则回读原图以图为准（本构建器实现中：2025/2026 走 PDF 文本解析，需与已知值核对）。

用法: .venv-data/bin/python pipeline/build_derived/build_t4.py
产出: data/shandong/derived/staging/t4.sqlite (batch_lines + exceptions_ledger)
"""
from __future__ import annotations

import re
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
import schema  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent.parent
RAW = ROOT / "data/shandong/raw"
STAGING = ROOT / "data/shandong/derived/staging"
DB_PATH = STAGING / "t4.sqlite"
LEDGER_TSV = STAGING / "t4_exceptions_ledger.tsv"

LINE_NAMES = ("特殊类型招生控制线", "一段线", "二段线")

# ---------------------------------------------------------------------------
# 2022-2024：附图视觉转录（主循环 Read 工具直接读图，见任务对话记录）。
# 转录来源附图路径 + sha256 见 MANIFEST.md（raw/ 区）；此处只记相对路径供台账引用。
# ---------------------------------------------------------------------------

TRANSCRIBED: dict[int, dict] = {
    2022: {
        "md": "data/shandong/raw/2022/山东省2022年夏季高考各类别分数线.md",
        "image": "data/shandong/raw/2022/山东省2022年夏季高考各类别分数线_图片版.png",
        "values": {"特殊类型招生控制线": 513, "一段线": 437, "二段线": 150},
    },
    2023: {
        "md": "data/shandong/raw/2023/山东省2023年夏季高考各类别分数线.md",
        "image": "data/shandong/raw/2023/山东省2023年夏季高考各类别分数线_图片版.png",
        "values": {"特殊类型招生控制线": 520, "一段线": 443, "二段线": 150},
    },
    2024: {
        "md": "data/shandong/raw/2024/山东省2024年夏季高考各类别分数线.md",
        "image": "data/shandong/raw/2024/山东省2024年夏季高考各类别分数线_图片版.png",
        "values": {"特殊类型招生控制线": 521, "一段线": 444, "二段线": 150},
    },
}

# ---------------------------------------------------------------------------
# 2025-2026：md 正文含原生 PDF 文本层（pdftotext -layout），正则解析普通类三行。
# ---------------------------------------------------------------------------

PDF_TEXT_FILES: dict[int, str] = {
    2025: "data/shandong/raw/2025/山东省2025年夏季高考各类别分数线.md",
    2026: "data/shandong/raw/2026/山东省2026年夏季高考各类别分数线.md",
}

# 已知对照值（另路已核，见规范 T4 段）——用于 sanity 比对，不符则 fatal 上报（以图为准重读）。
KNOWN_REFERENCE: dict[int, dict[str, int]] = {
    2025: {"特殊类型招生控制线": 521, "一段线": 441, "二段线": 150},
    2026: {"特殊类型招生控制线": 525, "一段线": 442, "二段线": 150},
}

# 正文里"特殊类型招生控制线"数值可能与其名称跨行（数值另起一行），
# 一段线/二段线数值与名称同行或次行——用逐行扫描 + 就近取整数的方式解析，
# 只在"一、普通类"段落到"二、艺术类"段落之间扫描，避免误采艺术类/体育类数值。
_SECTION_START_RE = re.compile(r"一、普通类")
_SECTION_END_RE = re.compile(r"二、艺术类")
_INT_RE = re.compile(r"^\d{3}$")


class BatchLineParseError(Exception):
    pass


def parse_pdf_text_section(text: str) -> dict[str, int]:
    """从 md 正文（含 pdftotext -layout 文本层）解析普通类三行数值。

    正例（2025 真实正文片段）：
      特殊类型招生控制线                      521
           一段线                       441
           二段线                       150
    """
    m_start = _SECTION_START_RE.search(text)
    m_end = _SECTION_END_RE.search(text)
    if not m_start or not m_end or m_start.start() >= m_end.start():
        raise BatchLineParseError("无法定位'一、普通类'到'二、艺术类'段落")
    section = text[m_start.end():m_end.start()]

    result: dict[str, int] = {}
    lines = section.splitlines()
    for i, line in enumerate(lines):
        line_norm = common.normalize_ws(line)
        for name in LINE_NAMES:
            if name in line_norm and name not in result:
                # 数值可能在同一行（去掉名称后剩余部分是数字），也可能在下一行。
                rest = line_norm.replace(name, "").strip()
                if _INT_RE.match(rest):
                    result[name] = int(rest)
                    continue
                # 同行未找到，向后找最近的纯数字行（跳过空行）。
                for j in range(i + 1, min(i + 3, len(lines))):
                    cand = common.normalize_ws(lines[j])
                    if _INT_RE.match(cand):
                        result[name] = int(cand)
                        break
    missing = [n for n in LINE_NAMES if n not in result]
    if missing:
        raise BatchLineParseError(f"未能解析全部三行, 缺失={missing}, 段落原文={section!r}")
    return result


def ledger(conn: sqlite3.Connection, source_file: str, row: int, reason_code: str,
           raw_content: str, stage: str) -> None:
    common.append_ledger(LEDGER_TSV, source_file, row, reason_code, raw_content, stage)
    conn.execute(
        "INSERT INTO exceptions_ledger VALUES (?,?,?,?,?,?)",
        (source_file, row, reason_code, raw_content, stage, None),
    )


def main() -> None:
    STAGING.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()
    if LEDGER_TSV.exists():
        LEDGER_TSV.unlink()

    conn = sqlite3.connect(str(DB_PATH))
    conn.execute(schema.DDL_T4_BATCH_LINES)
    conn.execute(schema.DDL_T6_EXCEPTIONS_LEDGER)
    conn.commit()

    rows_report: list[tuple] = []

    # ---- 2022-2024: 附图视觉转录 ----
    for year, spec in sorted(TRANSCRIBED.items()):
        md_path = ROOT / spec["md"]
        image_path = ROOT / spec["image"]
        if not md_path.is_file() or not image_path.is_file():
            raise SystemExit(f"FATAL: {year} 源文件缺失 md={md_path} image={image_path}")
        for idx, name in enumerate(LINE_NAMES):
            score = spec["values"][name]
            conn.execute(
                "INSERT INTO batch_lines VALUES (?,?,?,?)",
                (year, name, score, str(image_path.relative_to(ROOT))),
            )
            ledger(
                conn, str(image_path.relative_to(ROOT)), idx, "IMAGE_TRANSCRIBED",
                f"{name}={score}", "T4_visual_transcription",
            )
            rows_report.append((year, name, score, "附图视觉转录", str(image_path.relative_to(ROOT))))

    # ---- 2025-2026: PDF 文本层正则解析 ----
    for year, rel in sorted(PDF_TEXT_FILES.items()):
        md_path = ROOT / rel
        if not md_path.is_file():
            raise SystemExit(f"FATAL: {year} 源文件缺失 {md_path}")
        text = md_path.read_text(encoding="utf-8")
        try:
            parsed = parse_pdf_text_section(text)
        except BatchLineParseError as e:
            raise SystemExit(f"FATAL(T4 PDF文本解析) {year} {rel}: {e}") from e

        known = KNOWN_REFERENCE.get(year)
        for name in LINE_NAMES:
            score = parsed[name]
            if known and known[name] != score:
                raise SystemExit(
                    f"FATAL(T4 sanity对照不符) {year} {name}: 解析={score} 对照={known[name]}"
                    f" — 按规范须重读原图以图为准，本构建器不做自动修复"
                )
            conn.execute(
                "INSERT INTO batch_lines VALUES (?,?,?,?)",
                (year, name, score, rel),
            )
            rows_report.append((year, name, score, "正文PDF文本层解析", rel))

    conn.commit()
    conn.close()

    print(f"=== T4 batch_lines（{len(rows_report)} 行，应为 15 = 5年 x 3线）===")
    for year, name, score, method, src in rows_report:
        print(f"  {year} {name}={score}  [{method}]  来源={src}")
    print(f"写入: {DB_PATH}")


if __name__ == "__main__":
    main()
