#!/usr/bin/env python3
"""Stage 0 采集验收（A 门）审计脚本 — acceptance_gates_v1.md §Stage 0.

用法: .venv-data/bin/python pipeline/audit_collection.py
输出: 逐门 PASS/FAIL + 明细; 退出码 0=全绿, 1=有红门。
范围: 普通类常规批主线（P7 裁决）。
"""
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data/shandong/raw"
MANIFEST = ROOT / "data/shandong/MANIFEST.md"
YEARS = ["2022", "2023", "2024", "2025", "2026"]

FAILS: list[str] = []
WARNS: list[str] = []


def report(gate: str, ok: bool, detail: str) -> None:
    print(f"[{'PASS' if ok else 'FAIL'}] {gate}: {detail}")
    if not ok:
        FAILS.append(f"{gate}: {detail}")


def globs(year: str, *patterns: str) -> list[Path]:
    d = RAW / year
    out: list[Path] = []
    if d.is_dir():
        for p in patterns:
            out.extend(d.glob(p))
    return sorted(set(out))


def gate_a1() -> None:
    """A1 覆盖清单: 主线四件套逐年核对。"""
    # ① 投档表 (2022-2025 常规批 1/2/3 次; 2026 于 7/22 后追加)
    for y in ["2022", "2023", "2024", "2025"]:
        hits = globs(y, "*普通类常规批第*志愿投档情况表*.xls")
        rounds = {m.group(1) for f in hits for m in [re.search(r"第(.)次", f.name)] if m}
        ok = rounds >= {"1", "2", "3"} or rounds >= {"一", "二", "三"}
        report("A1.投档表", ok, f"{y}: 轮次={sorted(rounds)} 文件{len(hits)}个")
    # ② 一分一段 (2022-2026)
    for y in YEARS:
        hits = globs(y, "*夏季高考文化成绩一分一段表*.xls")
        report("A1.一分一段", len(hits) == 1, f"{y}: {len(hits)}个")
    # ③ 计划: 2026/2025 主计划本 或 声明文件（声明在 declarations/ 目录）
    decl_dir = RAW.parent / "declarations"
    for y in ["2025", "2026"]:
        main_plan = globs(y, "*普通类*[计划]*.xls", "*招生计划*.xls")
        main_plan = [f for f in main_plan if "第2次" not in f.name and "第3次" not in f.name
                     and "注册入学" not in f.name and "提前批" not in f.name]
        declaration = list(decl_dir.glob(f"*计划*声明*{y}*.md")) + \
            [f for f in decl_dir.glob("*计划*声明*.md") if y in f.read_text(encoding="utf-8")[:2000]] \
            if decl_dir.is_dir() else []
        ok = bool(main_plan) or bool(declaration)
        names = sorted({f.name for f in main_plan + declaration})
        report("A1.主计划本", ok, f"{y}: {names or '缺失且无声明'}")
    # ④ 批次线 (2022-2026, md 格式)
    for y in YEARS:
        hits = globs(y, "*控制线*.md", "*分数线*.md", "*批次线*.md", "*一段线*.md")
        hits = [f for f in hits if "艺术" not in f.name and "体育" not in f.name]
        report("A1.批次线", len(hits) >= 1, f"{y}: {[f.name for f in hits] or '缺失'}")


SCAN_DIRS = ["raw", "declarations", "newsid_index", "policy_evidence_cache"]
EXT_RE = r"(?:xls|xlsx|md|doc|docx|pdf|png|tsv|html|txt|csv|json)"


def gate_a2() -> None:
    """A2 MANIFEST 完整性 (v1.2): 四目录逐文件 sha256 对账, 键=相对路径。"""
    base = RAW.parent
    if not MANIFEST.is_file():
        report("A2.MANIFEST", False, "MANIFEST.md 不存在")
        return
    text = MANIFEST.read_text(encoding="utf-8", errors="replace")
    recorded: dict[str, str] = {}  # relpath -> sha256
    dup: list[str] = []
    for m in re.finditer(rf"`([^`\n]+\.{EXT_RE})`[^\n]*?([0-9a-f]{{64}})",
                         text, re.IGNORECASE):
        rel, sha = m.group(1), m.group(2).lower()
        if rel in recorded:
            dup.append(rel)
        recorded[rel] = sha
    disk: dict[str, Path] = {}
    for d in SCAN_DIRS:
        dd = base / d
        if not dd.is_dir():
            continue
        for p in dd.rglob("*"):
            if p.is_file() and not p.name.startswith("."):
                disk[str(p.relative_to(base))] = p
    orphan = sorted(set(disk) - set(recorded))
    ghosts = sorted(set(recorded) - set(disk))
    matched, mismatch = 0, []
    for rel in sorted(set(disk) & set(recorded)):
        h = hashlib.sha256(disk[rel].read_bytes()).hexdigest()
        if h == recorded[rel]:
            matched += 1
        else:
            mismatch.append(rel)
    ok = not orphan and not mismatch and not ghosts and not dup
    report("A2.对账", ok,
           f"匹配{matched} 孤儿{len(orphan)} 哈希不符{len(mismatch)} "
           f"幽灵{len(ghosts)} 重复{len(dup)} (范围={'+'.join(SCAN_DIRS)})")
    for x in (orphan[:5] + mismatch[:5] + ghosts[:5] + dup[:5]):
        print(f"        · {x}")


def gate_a3() -> None:
    """A3 可解析性抽检: 每类每年一个文件真实打开。"""
    try:
        import xlrd  # noqa
    except ImportError:
        report("A3.环境", False, "xlrd 不可用 (.venv-data)")
        return
    import xlrd
    samples: list[tuple[str, Path]] = []
    for y in ["2022", "2023", "2024", "2025"]:
        hits = globs(y, "*普通类常规批第1次志愿投档情况表*.xls",
                     "*普通类常规批第一次志愿投档情况表*.xls")
        if hits:
            samples.append((f"投档{y}", hits[0]))
    for y in YEARS:
        hits = globs(y, "*夏季高考文化成绩一分一段表*.xls")
        if hits:
            samples.append((f"一分一段{y}", hits[0]))
    bad = []
    for tag, path in samples:
        try:
            sh = xlrd.open_workbook(str(path)).sheet_by_index(0)
            if sh.nrows < 10:
                bad.append(f"{tag}:行数{sh.nrows}")
        except Exception as e:  # noqa: BLE001
            bad.append(f"{tag}:{type(e).__name__}")
    report("A3.抽检", not bad, f"{len(samples)}个样本, 异常: {bad or '无'}")


def gate_a4() -> None:
    """A4 政策存档: 5 份实施办法 + 2026 工作意见。"""
    hits = [p for p in RAW.rglob("*") if p.is_file()
            and re.search(r"(实施办法|实施方案|录取工作意见|policy)", p.name)]
    report("A4.政策存档", len(hits) >= 6,
           f"{len(hits)}份: {[p.name[:30] for p in hits][:8]}")


if __name__ == "__main__":
    print(f"=== A 门审计 @ {RAW} ===")
    gate_a1()
    gate_a2()
    gate_a3()
    gate_a4()
    print(f"\n=== 结论: {'全绿 ✓' if not FAILS else f'{len(FAILS)} 门红'} ===")
    for f in FAILS:
        print(f"  ✗ {f}")
    sys.exit(1 if FAILS else 0)
