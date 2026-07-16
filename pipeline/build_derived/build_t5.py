#!/usr/bin/env python3
"""T5：跨年实体对照 entity_xwalk（data_cleaning_spec_shandong_v1.md §4 M1-M5，v1.6）。

范围：round=1（本科主轮），年对 2022→2023、2023→2024、2024→2025。

流程：
  M4（先行）：school_code 跨年稳定性台账（本次范围内的 27 条真改名，
              team-lead 2026-07-16 裁决，三签名判据全中，见 t5_school_renames.csv）。
  M1：match_key（R8：school_code+major_base+排序 identity 原子集）逐年精确相等。
      若某 match_key 在任一侧年内本身有重复（组内 >1 条），视为该 key 层无法唯一裁决，
      让位给 M2 的组内消歧（同 (school_code, major_base) 分组）。
  M2：M1 未决者按 (school_code, major_base) 分组——两侧各恰 1 条直接配对；
      多条先按 identity 原子集合精确对齐，再按 descriptive 原子集合精确对齐；
      全程只做集合相等判定，不做编辑距离/embedding 等模糊匹配（明令禁止）。
  M3：组内对齐后仍多对多 -> manual_review.csv，人审回填，本次不写入 entity_xwalk。
  M5：无对应候选（该 (school_code, major_base) 组在对侧年为空）-> unmatched，
      不是错误（新设/停招专业），只报计数与占比，不写入 entity_xwalk。

entity_id 传播：按年对时间顺序处理，一行第一次被配对时决定其 entity_id 与 match_method
（"先到先得"——同一行不会因后续年对的另一次配对被重新赋值/改写方法）。
"""

from __future__ import annotations

import csv
import hashlib
import json
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402
import schema  # noqa: E402
import vocab_annotations_v1 as vocab  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent.parent
STAGING = ROOT / "data/shandong/derived/staging"
T1_DB_PATH = STAGING / "t1.sqlite"
DB_PATH = STAGING / "t5.sqlite"
RENAMES_CSV = STAGING / "t5_school_renames.csv"
MANUAL_REVIEW_CSV = STAGING / "t5_manual_review.csv"

YEARS = [2022, 2023, 2024, 2025]
YEAR_PAIRS = [(2022, 2023), (2023, 2024), (2024, 2025)]

# --------------------------------------------------------------------------
# M4：school_code 跨年稳定性台账
# 27 条经 team-lead 裁决确认的真改名（2026-07-16 裁决，规范 v1.6 三签名判据：
# ①单向无 flapping ②plan_count 跨改名点平滑连续 ③符合已知改制范式）。
# 无一例触发 code 复用 fatal。major_code Jaccard 仅作辅助参考，非硬判据。
# --------------------------------------------------------------------------
SCHOOL_RENAMES = [
    ("A192", "吉林化工学院", "吉林化工大学", "2024-2025", "upgrade"),
    ("A229", "牡丹江医学院", "牡丹江医科大学", "2023-2024", "upgrade"),
    ("A277", "上海体育学院", "上海体育大学", "2022-2023", "upgrade"),
    ("A333", "常熟理工学院", "苏州工学院", "2024-2025", "transform"),
    ("A354", "嘉兴学院", "嘉兴大学", "2023-2024", "upgrade"),
    ("A367", "蚌埠医学院", "蚌埠医科大学", "2023-2024", "upgrade"),
    ("A388", "福建工程学院", "福建理工大学", "2022-2023", "upgrade"),
    ("A413", "赣南医学院", "赣南医科大学", "2023-2024", "upgrade"),
    ("A438", "潍坊医学院", "山东第二医科大学", "2023-2024", "upgrade"),
    ("A449", "滨州学院", "山东航空学院", "2023-2024", "transform"),
    ("A472", "新乡医学院", "河南医药大学", "2024-2025", "upgrade"),
    ("A477", "信阳师范学院", "信阳师范大学", "2022-2023", "upgrade"),
    ("A601", "桂林医学院", "桂林医科大学", "2024-2025", "upgrade"),
    ("A739", "天水师范学院", "天水师范大学", "2024-2025", "upgrade"),
    ("A753", "宁夏师范学院", "宁夏师范大学", "2023-2024", "upgrade"),
    ("B057", "浙江科技学院", "浙江科技大学", "2023-2024", "upgrade"),
    ("B059", "合肥学院", "合肥大学", "2023-2024", "upgrade"),
    ("B319", "南昌工程学院", "江西水利电力大学", "2024-2025", "upgrade"),
    ("B551", "重庆科技学院", "重庆科技大学", "2023-2024", "upgrade"),
    ("B810", "海南医学院", "海南医科大学", "2023-2024", "upgrade"),
    ("B847", "佛山科学技术学院", "佛山大学", "2023-2024", "upgrade"),
    ("C658", "湖南理工学院南湖学院", "岳阳学院", "2024-2025", "transform"),
    ("D326", "云南大学滇池学院", "滇池学院", "2023-2024", "transform"),
    ("D505", "新乡医学院三全学院", "豫北医学院", "2024-2025", "transform"),
    ("D673", "四川外国语大学成都学院", "成都外国语学院", "2023-2024", "transform"),
    ("E432", "河北中医学院", "河北中医药大学", "2022-2023", "upgrade"),
    ("F401", "北京师范大学-香港浸会大学联合国际学院", "北师香港浸会大学", "2024-2025", "upgrade"),
]


def write_renames_csv() -> None:
    STAGING.mkdir(parents=True, exist_ok=True)
    with RENAMES_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["school_code", "old_name", "new_name", "transition_years", "category", "ruling"])
        for code, old, new, trans, cat in SCHOOL_RENAMES:
            writer.writerow([code, old, new, trans, cat,
                              "genuine_rename_confirmed_spec_v1.6_three_signature_2026-07-16"])


# --------------------------------------------------------------------------
# 装载 T1 行 + 复原 identity/descriptive 原子集合 + 计算 match_key（R8）
# --------------------------------------------------------------------------

def load_rows(year: int) -> list[dict]:
    conn = sqlite3.connect(str(T1_DB_PATH))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(
        """
        SELECT year, round, level, school_code, school_name_raw, school_name_norm,
               major_code, major_name_raw, major_base, annotations_json,
               plan_count, min_rank, min_rank_censor, source_file, source_row
        FROM admission_lines
        WHERE year = ? AND round = 1
        """,
        (year,),
    )
    rows = []
    for r in cur.fetchall():
        annos = json.loads(r["annotations_json"])
        identity_atoms = [vocab.canon_identity_atom(a["atom"]) for a in annos if a["cls"] == "identity"]
        descriptive_atoms = [a["atom"] for a in annos if a["cls"] == "descriptive"]
        match_key = common.build_match_key(r["school_code"], r["major_base"], identity_atoms)
        rows.append({
            "year": r["year"],
            "school_code": r["school_code"],
            "major_code": r["major_code"],
            "major_base": r["major_base"],
            "school_name_norm": r["school_name_norm"],
            "major_name_raw": r["major_name_raw"],
            "identity_atoms": tuple(sorted(set(identity_atoms))),
            "descriptive_atoms": tuple(sorted(set(descriptive_atoms))),
            "match_key": match_key,
            "plan_count": r["plan_count"],
            "min_rank": r["min_rank"],
            "min_rank_censor": r["min_rank_censor"],
        })
    conn.close()
    return rows


# --------------------------------------------------------------------------
# M1 + M2 匹配引擎（单个年对）
# --------------------------------------------------------------------------

def _align_by_atomset(a_list: list[dict], b_list: list[dict], key: str):
    """按 identity_atoms 或 descriptive_atoms 原子集合精确对齐（禁止模糊匹配，
    仅做集合相等判定：组内该原子集合值在两侧各恰 1 条 -> 配对）。
    """
    a_by_set = defaultdict(list)
    for r in a_list:
        a_by_set[r[key]].append(r)
    b_by_set = defaultdict(list)
    for r in b_list:
        b_by_set[r[key]].append(r)

    resolved = []
    matched_a = set()
    matched_b = set()
    for atomset, a_group in a_by_set.items():
        b_group = b_by_set.get(atomset)
        if b_group and len(a_group) == 1 and len(b_group) == 1:
            resolved.append((a_group[0], b_group[0]))
            matched_a.add(id(a_group[0]))
            matched_b.add(id(b_group[0]))

    a_remaining = [r for r in a_list if id(r) not in matched_a]
    b_remaining = [r for r in b_list if id(r) not in matched_b]
    return a_remaining, b_remaining, resolved


def match_pair(rows_a: list[dict], rows_b: list[dict]):
    """返回 (m1_pairs, m2_pairs, m3_groups, unmatched_a, unmatched_b)。

    m1_pairs: [(row_a, row_b)]
    m2_pairs: [(row_a, row_b, subtype)]  subtype in {singleton-group, identity-set, descriptive-set}
    m3_groups: [(group_key, a_remaining_list, b_remaining_list)]
    """
    key_to_a = defaultdict(list)
    for row in rows_a:
        key_to_a[row["match_key"]].append(row)
    key_to_b = defaultdict(list)
    for row in rows_b:
        key_to_b[row["match_key"]].append(row)

    matched_a: set = set()
    matched_b: set = set()
    m1_pairs = []
    for key, a_list in key_to_a.items():
        b_list = key_to_b.get(key)
        if not b_list:
            continue
        if len(a_list) == 1 and len(b_list) == 1:
            m1_pairs.append((a_list[0], b_list[0]))
            matched_a.add(id(a_list[0]))
            matched_b.add(id(b_list[0]))
        # len>1 任一侧：match_key 层本身有内部重复，无法唯一裁决 -> 让位给 M2 组内消歧

    remaining_a = [r for r in rows_a if id(r) not in matched_a]
    remaining_b = [r for r in rows_b if id(r) not in matched_b]

    group_a = defaultdict(list)
    for r in remaining_a:
        group_a[(r["school_code"], r["major_base"])].append(r)
    group_b = defaultdict(list)
    for r in remaining_b:
        group_b[(r["school_code"], r["major_base"])].append(r)

    m2_pairs = []
    m3_groups = []
    m3_a_ids: set = set()
    m3_b_ids: set = set()

    for gkey in sorted(set(group_a) | set(group_b)):
        a_list = group_a.get(gkey, [])
        b_list = group_b.get(gkey, [])
        if not a_list or not b_list:
            continue  # 对侧该组为空 -> 无候选，落 unmatched（新设/停招），不是 M3
        if len(a_list) == 1 and len(b_list) == 1:
            m2_pairs.append((a_list[0], b_list[0], "singleton-group"))
            matched_a.add(id(a_list[0]))
            matched_b.add(id(b_list[0]))
            continue

        a_left, b_left, resolved1 = _align_by_atomset(a_list, b_list, "identity_atoms")
        for pa, pb in resolved1:
            m2_pairs.append((pa, pb, "identity-set"))
            matched_a.add(id(pa))
            matched_b.add(id(pb))

        if a_left and b_left:
            a_left2, b_left2, resolved2 = _align_by_atomset(a_left, b_left, "descriptive_atoms")
            for pa, pb in resolved2:
                m2_pairs.append((pa, pb, "descriptive-set"))
                matched_a.add(id(pa))
                matched_b.add(id(pb))
            a_left, b_left = a_left2, b_left2

        if a_left and b_left:
            m3_groups.append((gkey, a_left, b_left))
            m3_a_ids.update(id(r) for r in a_left)
            m3_b_ids.update(id(r) for r in b_left)
        # 若对齐后只剩一侧有余（另一侧已耗尽）：这些余留行没有候选可比对，落 unmatched

    unmatched_a = [r for r in rows_a if id(r) not in matched_a and id(r) not in m3_a_ids]
    unmatched_b = [r for r in rows_b if id(r) not in matched_b and id(r) not in m3_b_ids]

    return m1_pairs, m2_pairs, m3_groups, unmatched_a, unmatched_b


# --------------------------------------------------------------------------
# entity_id 构造与 entity_xwalk 记录（"先到先得"传播）
# --------------------------------------------------------------------------

def make_entity_id(year: int, school_code: str, major_code: str) -> str:
    h = hashlib.sha256(f"{year}:{school_code}:{major_code}".encode("utf-8")).hexdigest()[:16]
    return f"E{h}"


def main() -> None:
    if not T1_DB_PATH.exists():
        print(f"FATAL: {T1_DB_PATH} 不存在，先跑 build_t1.py")
        sys.exit(2)

    write_renames_csv()

    rows_by_year = {y: load_rows(y) for y in YEARS}

    entity_xwalk_records: dict[tuple, dict] = {}  # (year, school_code, major_code) -> {entity_id, method, confidence}
    manual_review_rows = []
    pair_stats = []

    def get_entity_id(row: dict) -> str:
        key = (row["year"], row["school_code"], row["major_code"])
        rec = entity_xwalk_records.get(key)
        if rec is not None:
            return rec["entity_id"]
        return make_entity_id(row["year"], row["school_code"], row["major_code"])

    def record(row: dict, entity_id: str, method: str, confidence: float) -> None:
        key = (row["year"], row["school_code"], row["major_code"])
        if key not in entity_xwalk_records:
            entity_xwalk_records[key] = {
                "entity_id": entity_id,
                "match_method": method,
                "match_confidence": confidence,
            }
        # 若已存在（该行在更早的年对中已被配对）-> 先到先得，不覆盖方法/置信度

    for (ya, yb) in YEAR_PAIRS:
        rows_a = rows_by_year[ya]
        rows_b = rows_by_year[yb]
        m1_pairs, m2_pairs, m3_groups, unmatched_a, unmatched_b = match_pair(rows_a, rows_b)

        for ra, rb in m1_pairs:
            eid = get_entity_id(ra)
            record(ra, eid, "M1", 1.0)
            record(rb, eid, "M1", 1.0)

        for ra, rb, _subtype in m2_pairs:
            eid = get_entity_id(ra)
            record(ra, eid, "M2", 0.9)
            record(rb, eid, "M2", 0.9)

        m3_a_count = sum(len(a_left) for _, a_left, _ in m3_groups)
        m3_b_count = sum(len(b_left) for _, _, b_left in m3_groups)

        for gkey, a_left, b_left in m3_groups:
            group_id = f"{ya}-{yb}:{gkey[0]}:{gkey[1]}"
            for r in a_left:
                manual_review_rows.append({
                    "group_id": group_id, "side": "A", "year": r["year"],
                    "school_code": r["school_code"], "major_code": r["major_code"],
                    "major_base": r["major_base"], "major_name_raw": r["major_name_raw"],
                    "identity_atoms": "|".join(r["identity_atoms"]),
                    "descriptive_atoms": "|".join(r["descriptive_atoms"]),
                    "plan_count": r["plan_count"], "min_rank": r["min_rank"],
                    "min_rank_censor": r["min_rank_censor"],
                })
            for r in b_left:
                manual_review_rows.append({
                    "group_id": group_id, "side": "B", "year": r["year"],
                    "school_code": r["school_code"], "major_code": r["major_code"],
                    "major_base": r["major_base"], "major_name_raw": r["major_name_raw"],
                    "identity_atoms": "|".join(r["identity_atoms"]),
                    "descriptive_atoms": "|".join(r["descriptive_atoms"]),
                    "plan_count": r["plan_count"], "min_rank": r["min_rank"],
                    "min_rank_censor": r["min_rank_censor"],
                })

        pair_stats.append({
            "pair": f"{ya}->{yb}",
            "n_a": len(rows_a), "n_b": len(rows_b),
            "m1": len(m1_pairs), "m2": len(m2_pairs),
            "m3_a": m3_a_count, "m3_b": m3_b_count,
            "unmatched_a": len(unmatched_a), "unmatched_b": len(unmatched_b),
        })

    # -- 写 manual_review.csv --
    STAGING.mkdir(parents=True, exist_ok=True)
    with MANUAL_REVIEW_CSV.open("w", newline="", encoding="utf-8") as f:
        fieldnames = ["group_id", "side", "year", "school_code", "major_code", "major_base",
                      "major_name_raw", "identity_atoms", "descriptive_atoms",
                      "plan_count", "min_rank", "min_rank_censor"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in manual_review_rows:
            writer.writerow(row)

    # -- 写 t5.sqlite --
    if DB_PATH.exists():
        DB_PATH.unlink()
    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()
    cur.execute(schema.DDL_T5_ENTITY_XWALK)
    for (year, school_code, major_code), rec in entity_xwalk_records.items():
        cur.execute(
            """
            INSERT INTO entity_xwalk (entity_id, year, school_code, major_code, match_method, match_confidence)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (rec["entity_id"], year, school_code, major_code, rec["match_method"], rec["match_confidence"]),
        )
    conn.commit()

    all_rows = [
        {"entity_id": rec["entity_id"], "year": y, "school_code": sc, "major_code": mc,
         "match_method": rec["match_method"], "match_confidence": rec["match_confidence"]}
        for (y, sc, mc), rec in entity_xwalk_records.items()
    ]
    digest = common.content_digest(
        all_rows,
        primary_key=["year", "school_code", "major_code"],
        columns=["entity_id", "year", "school_code", "major_code", "match_method", "match_confidence"],
    )
    conn.close()

    # -- 报告（纯文本） --
    print("=== T5 entity_xwalk 构建报告 ===")
    print(f"school_renames（M4，真改名台账）: {len(SCHOOL_RENAMES)} 条 -> {RENAMES_CSV}")
    print(f"manual_review（M3，待人审）: {len(manual_review_rows)} 行 -> {MANUAL_REVIEW_CSV}")
    print()
    for s in pair_stats:
        n_a, n_b = s["n_a"], s["n_b"]
        print(f"-- 年对 {s['pair']} --")
        print(f"  年A行数={n_a}  年B行数={n_b}")
        print(f"  M1配对={s['m1']}对  "
              f"A侧占比={s['m1']/n_a:.4%}  B侧占比={s['m1']/n_b:.4%}")
        print(f"  M2配对={s['m2']}对  "
              f"A侧占比={s['m2']/n_a:.4%}  B侧占比={s['m2']/n_b:.4%}")
        print(f"  M3待人审: A侧={s['m3_a']}行({s['m3_a']/n_a:.4%})  "
              f"B侧={s['m3_b']}行({s['m3_b']/n_b:.4%})")
        print(f"  unmatched: A侧={s['unmatched_a']}行({s['unmatched_a']/n_a:.4%})  "
              f"B侧={s['unmatched_b']}行({s['unmatched_b']/n_b:.4%})")
        print()
    print(f"entity_xwalk 总行数: {len(entity_xwalk_records)}")
    print(f"内容摘要 (G8 用): {digest}")


if __name__ == "__main__":
    main()
