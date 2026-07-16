#!/usr/bin/env python3
"""D 区合装脚本 — 把 Stage 1 五轨 staging 表合并为单一 derived 库 + build_meta.json。

只做合装：不重算清洗规则、不碰 L 区（data/gaokao.bsaa.sqlite 绝不读）、
不修改 staging/t1..t5.sqlite（只读）。content_digest 直接 import common.py，不复制逻辑。

用法: .venv-data/bin/python pipeline/build_derived/assemble_derived.py
"""
from __future__ import annotations

import datetime
import json
import sqlite3
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
STAGING = ROOT / "data/shandong/derived/staging"
OUT_DB = ROOT / "data/shandong/derived/shandong.sqlite"
OUT_META = ROOT / "data/shandong/derived/build_meta.json"
MANIFEST = ROOT / "data/shandong/MANIFEST.md"

sys.path.insert(0, str(HERE))
import common  # noqa: E402

SPEC_VERSION = "v1.6"
VOCAB_VERSION = "v1"

# 各主表: staging 文件、表名、全列(按 CREATE TABLE 顺序)、主键、digest 用列子集。
# digest 列子集 + 主键须与各轨 gates 脚本 G8 计算口径逐一对应
# （见 gates_t1.py / gates_t2.py / gates_t34.py / gates_t5.py 里 common.content_digest 调用处）。
TABLE_SPECS = [
    dict(
        staging_file="t1.sqlite",
        table="admission_lines",
        all_columns=["year", "round", "level", "school_code", "school_name_raw",
                     "school_name_norm", "major_code", "major_name_raw", "major_base",
                     "annotations_json", "plan_count", "min_rank", "min_rank_censor",
                     "source_file", "source_row"],
        primary_key=["year", "round", "level", "school_code", "major_code"],
        digest_columns=["year", "round", "level", "school_code", "major_code", "min_rank",
                         "min_rank_censor", "plan_count", "major_base", "school_name_norm"],
        expected_digest="dc8a6df9189a61de56e3c5c008a72d22a1e652a318d0dc1d6d3d71556535f40c",
    ),
    dict(
        staging_file="t2.sqlite",
        table="score_rank",
        all_columns=["year", "subject_pool", "score", "count_at", "cum_count", "censor",
                     "source_file", "source_row"],
        primary_key=["year", "subject_pool", "score"],
        digest_columns=["year", "subject_pool", "score", "count_at", "cum_count", "censor"],
        expected_digest="f55f33561346b8c48371fe4055c1603854494f3f857c066ee569c613bdd16c24",
    ),
    dict(
        staging_file="t3.sqlite",
        table="plans",
        all_columns=["year", "round", "school_code", "school_name", "major_code", "major_name",
                     "plan_count", "subject_req_raw", "subject_req_norm", "level",
                     "source_file", "source_row"],
        primary_key=["year", "round", "school_code", "major_code"],
        digest_columns=["year", "round", "school_code", "major_code", "school_name", "major_name",
                         "plan_count", "subject_req_norm", "level"],
        expected_digest="20069879f66dcd228c50efd90f484b518be9a23573fcdcc388cb72ce87762186",
    ),
    dict(
        staging_file="t4.sqlite",
        table="batch_lines",
        all_columns=["year", "line_name", "score", "source_doc"],
        primary_key=["year", "line_name"],
        digest_columns=["year", "line_name", "score"],
        expected_digest="620a528a6b9b48b95bd18ba207484df69d1834c950e89db8ebc9a91e48ab6561",
    ),
    dict(
        staging_file="t5.sqlite",
        table="entity_xwalk",
        all_columns=["entity_id", "year", "school_code", "major_code", "match_method",
                     "match_confidence"],
        primary_key=["year", "school_code", "major_code"],
        digest_columns=["entity_id", "year", "school_code", "major_code", "match_method",
                         "match_confidence"],
        expected_digest="fac37f50890cae70d2b487214d6a97ca80663e80f661d57e3630cad72f105274",
    ),
]

# t5.sqlite 无 exceptions_ledger 表（只有 entity_xwalk），故只合并 t1-t4 的台账。
LEDGER_TRACKS = ["t1", "t2", "t3", "t4"]

DDL_MAIN = {
    "admission_lines": """
        CREATE TABLE admission_lines (
            year INTEGER NOT NULL,
            round INTEGER NOT NULL,
            level TEXT NOT NULL,
            school_code TEXT NOT NULL,
            school_name_raw TEXT NOT NULL,
            school_name_norm TEXT NOT NULL,
            major_code TEXT NOT NULL,
            major_name_raw TEXT NOT NULL,
            major_base TEXT NOT NULL,
            annotations_json TEXT NOT NULL,
            plan_count INTEGER NOT NULL,
            min_rank INTEGER,
            min_rank_censor TEXT NOT NULL CHECK (min_rank_censor IN ('exact','le','missing')),
            source_file TEXT NOT NULL,
            source_row INTEGER NOT NULL,
            PRIMARY KEY (year, round, level, school_code, major_code)
        );
    """,
    "score_rank": """
        CREATE TABLE score_rank (
            year INTEGER NOT NULL,
            subject_pool TEXT NOT NULL,
            score INTEGER NOT NULL,
            count_at INTEGER NOT NULL,
            cum_count INTEGER NOT NULL,
            censor TEXT NOT NULL DEFAULT 'exact' CHECK (censor IN ('exact','head_aggregate')),
            source_file TEXT NOT NULL,
            source_row INTEGER NOT NULL,
            PRIMARY KEY (year, subject_pool, score)
        );
    """,
    "plans": """
        CREATE TABLE plans (
            year INTEGER NOT NULL,
            round INTEGER NOT NULL,
            school_code TEXT NOT NULL,
            school_name TEXT NOT NULL,
            major_code TEXT NOT NULL,
            major_name TEXT NOT NULL,
            plan_count INTEGER NOT NULL,
            subject_req_raw TEXT,
            subject_req_norm TEXT,
            level TEXT,
            source_file TEXT NOT NULL,
            source_row INTEGER NOT NULL,
            PRIMARY KEY (year, round, school_code, major_code)
        );
    """,
    "batch_lines": """
        CREATE TABLE batch_lines (
            year INTEGER NOT NULL,
            line_name TEXT NOT NULL,
            score INTEGER NOT NULL,
            source_doc TEXT NOT NULL,
            PRIMARY KEY (year, line_name)
        );
    """,
    "entity_xwalk": """
        CREATE TABLE entity_xwalk (
            entity_id TEXT NOT NULL,
            year INTEGER NOT NULL,
            school_code TEXT NOT NULL,
            major_code TEXT NOT NULL,
            match_method TEXT NOT NULL CHECK (match_method IN ('M1','M2','M3-manual')),
            match_confidence REAL NOT NULL,
            PRIMARY KEY (year, school_code, major_code),
            UNIQUE (entity_id, year)
        );
    """,
}

# 合并台账新增 source_table 列区分来源轨（t1..t5；本次实际只有 t1-t4 有数据）。
DDL_EXCEPTIONS_LEDGER = """
    CREATE TABLE exceptions_ledger (
        source_table TEXT NOT NULL,
        source_file TEXT NOT NULL,
        source_row INTEGER NOT NULL,
        reason_code TEXT NOT NULL CHECK (reason_code IN (
            'UNKNOWN_RANK_FORMAT','EMPTY_RANK','MAJOR_SPLIT_FAIL','SCHOOL_SPLIT_FAIL',
            'PAREN_UNBALANCED','UNKNOWN_ANNOTATION','BAD_PLAN_COUNT','HEADER_UNRECOGNIZED',
            'DUP_PRIMARY_KEY','SHEET_STRUCTURE_UNEXPECTED','SUBJECT_REQ_UNPARSED',
            'IMAGE_TRANSCRIBED','LEVEL_UNRESOLVED')),
        raw_content TEXT NOT NULL,
        stage TEXT NOT NULL,
        resolution TEXT
    );
"""


def fetch_all_dicts(db_path: Path, table: str, columns: list[str], order_by: list[str]) -> list[dict]:
    """只读打开 staging db，按主键 ORDER BY 取出全部行（决定固定行序，供物理插入顺序用）。"""
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    cols_sql = ", ".join(columns)
    order_sql = ", ".join(order_by)
    rows = conn.execute(f"SELECT {cols_sql} FROM {table} ORDER BY {order_sql}").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def git_hash(relpath: str) -> str:
    result = subprocess.run(
        ["git", "log", "-1", "--format=%H", "--", relpath],
        cwd=str(ROOT), capture_output=True, text=True, check=True,
    )
    h = result.stdout.strip()
    if not h:
        raise RuntimeError(f"git log 未找到该文件的历史: {relpath}")
    return h


def main() -> int:
    errors: list[str] = []
    assembled: dict[str, list[dict]] = {}
    digests: dict[str, str] = {}

    for spec in TABLE_SPECS:
        db_path = STAGING / spec["staging_file"]
        rows_full = fetch_all_dicts(db_path, spec["table"], spec["all_columns"], spec["primary_key"])
        assembled[spec["table"]] = rows_full

        digest = common.content_digest(
            rows_full, primary_key=spec["primary_key"], columns=spec["digest_columns"]
        )
        digests[spec["table"]] = digest
        if digest != spec["expected_digest"]:
            errors.append(
                f"{spec['table']}: digest 不符 expected={spec['expected_digest']} actual={digest}"
            )

    if errors:
        print("=== 停手：content_digest 与期望值不符，不写数据 ===")
        for e in errors:
            print(f"  {e}")
        return 1

    # ---- 合并 exceptions_ledger（加 source_table 列） ----
    ledger_rows: list[dict] = []
    for track in LEDGER_TRACKS:
        db_path = STAGING / f"{track}.sqlite"
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT source_file, source_row, reason_code, raw_content, stage, resolution "
            "FROM exceptions_ledger ORDER BY source_file, source_row, reason_code"
        ).fetchall()
        conn.close()
        for r in rows:
            d = dict(r)
            d["source_table"] = track
            ledger_rows.append(d)

    # ---- 写 shandong.sqlite ----
    if OUT_DB.exists():
        OUT_DB.unlink()
    conn = sqlite3.connect(str(OUT_DB))
    cur = conn.cursor()
    for spec in TABLE_SPECS:
        cur.execute(DDL_MAIN[spec["table"]])
        cols = spec["all_columns"]
        placeholders = ", ".join(["?"] * len(cols))
        cols_sql = ", ".join(cols)
        cur.executemany(
            f"INSERT INTO {spec['table']} ({cols_sql}) VALUES ({placeholders})",
            [tuple(row[c] for c in cols) for row in assembled[spec["table"]]],
        )
    cur.execute(DDL_EXCEPTIONS_LEDGER)
    ledger_cols = ["source_table", "source_file", "source_row", "reason_code",
                   "raw_content", "stage", "resolution"]
    cur.executemany(
        f"INSERT INTO exceptions_ledger ({', '.join(ledger_cols)}) "
        f"VALUES ({', '.join(['?'] * len(ledger_cols))})",
        [tuple(row[c] for c in ledger_cols) for row in ledger_rows],
    )
    conn.commit()
    conn.close()

    # ---- build_meta.json ----
    build_scripts_git = {}
    for fname in ["build_t1.py", "build_t2.py", "build_t3.py", "build_t4.py", "build_t5.py",
                  "common.py", "schema.py", "vocab_annotations_v1.py"]:
        relpath = str((HERE / fname).relative_to(ROOT))
        build_scripts_git[fname] = git_hash(relpath)

    manifest_sha = common.sha256_file(MANIFEST)

    build_meta = {
        "spec_version": SPEC_VERSION,
        "vocab_version": VOCAB_VERSION,
        "build_time": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source_manifest": manifest_sha,
        "table_digests": digests,
        "build_scripts_git": build_scripts_git,
        "table_metadata": {
            "admission_lines": {
                "2022_r2_level_source": "本科计划表 join (R10a, spec v1.4)",
            },
        },
    }
    OUT_META.write_text(json.dumps(build_meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # ---- 输出自检信息 ----
    print("=== 合装完成 ===")
    for spec in TABLE_SPECS:
        print(f"  {spec['table']}: {len(assembled[spec['table']])} 行, digest={digests[spec['table']]}")
    dist = {t: sum(1 for r in ledger_rows if r["source_table"] == t) for t in LEDGER_TRACKS}
    print(f"  exceptions_ledger: {len(ledger_rows)} 行, source_table 分布={dist}")
    print(f"  build_meta.json -> {OUT_META}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
