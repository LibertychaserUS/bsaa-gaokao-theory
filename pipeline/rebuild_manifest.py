#!/usr/bin/env python3
"""按磁盘真相全量重建 data/shandong/MANIFEST.md（缺口4, A2 门 v1.2 格式）。

幂等：每次运行 walk 四目录重扫。旧账溯源（URL/NewsID/日期）按 basename 或 sha256 抢救。
用法: .venv-data/bin/python pipeline/rebuild_manifest.py
"""
import hashlib
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "data/shandong"
MANIFEST = BASE / "MANIFEST.md"
BACKUP = BASE / "archive/MANIFEST_pre_rebuild_20260716.md"
SCAN_DIRS = ["raw", "declarations", "newsid_index", "policy_evidence_cache"]

# 已复核的补充溯源: relpath 前缀 -> (来源, 发布日期)
KNOWN = {
    "raw/2025/山东省2025年夏季高考各类别分数线": (
        "NewsID=6941 https://www.sdzk.cn/NewsInfo.aspx?NewsID=6941", "2025-06-25"),
    "raw/2026/山东省2026年夏季高考各类别分数线": (
        "NewsID=7256 https://www.sdzk.cn/NewsInfo.aspx?NewsID=7256", "2026-06-25"),
}
# raw/policies/ 文号（docs/policy_provenance_shandong.md 六元组登记册, 已逐条核对）
DOC_NUMBERS = {
    "NewsID5719": "无独立文号(NewsID=5719+2022-04-19 替代)",
    "NewsID6067": "鲁招考委办〔2023〕3号",
    "NewsID6502": "鲁招考委办〔2024〕2号",
    "NewsID6866": "鲁招考委办〔2025〕2号",
    "NewsID7200": "无独立文号(NewsID=7200+2026-05-18 替代)",
    "NewsID7251": "无独立文号(NewsID=7251 替代); 发布机关=山东省招生考试委员会办公室",
}


def sha256_of(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_legacy() -> tuple[dict[str, str], dict[str, str]]:
    """旧账: basename -> 行原文, sha256 -> 行原文（两个索引抢救溯源）。"""
    src = BACKUP if BACKUP.is_file() else MANIFEST
    by_name: dict[str, str] = {}
    by_sha: dict[str, str] = {}
    if not src.is_file():
        return by_name, by_sha
    for line in src.read_text(encoding="utf-8", errors="replace").splitlines():
        sha_m = re.search(r"\b([0-9a-f]{64})\b", line, re.IGNORECASE)
        name_m = re.search(
            r"([^\s|/\\`]+\.(?:xls|xlsx|md|doc|docx|pdf|png|tsv|html|txt|csv|json))",
            line, re.IGNORECASE)
        if name_m:
            by_name.setdefault(name_m.group(1), line)
        if sha_m:
            by_sha.setdefault(sha_m.group(1).lower(), line)
    return by_name, by_sha


FIELD_RE = {
    "url": re.compile(r"(https?://\S+?)(?=[|\s]|$)"),
    "newsid": re.compile(r"NewsID[=＝]?\s*(\d+)", re.IGNORECASE),
    "date": re.compile(r"(20\d{2}-\d{2}-\d{2})"),
}


def rescue(line: str) -> tuple[str, str, str]:
    """从旧行抠 (来源, 发布日期, 下载时间)。日期取第1个, 下载时间取第2个(如有)。"""
    url = FIELD_RE["url"].search(line)
    nid = FIELD_RE["newsid"].search(line)
    dates = FIELD_RE["date"].findall(line)
    source = ""
    if nid:
        source = f"NewsID={nid.group(1)}"
    if url:
        source = f"{source} {url.group(1)}".strip()
    return source or "待补", (dates[0] if dates else "待补"), (dates[1] if len(dates) > 1 else "")


def main() -> None:
    BACKUP.parent.mkdir(parents=True, exist_ok=True)
    if MANIFEST.is_file() and not BACKUP.is_file():
        BACKUP.write_bytes(MANIFEST.read_bytes())
    by_name, by_sha = load_legacy()

    rows: dict[str, list[dict]] = {d: [] for d in SCAN_DIRS}
    stats = {"rescued": 0, "mtime_fb": 0, "todo": 0}
    for d in SCAN_DIRS:
        dd = BASE / d
        if not dd.is_dir():
            continue
        for p in sorted(dd.rglob("*")):
            if not p.is_file() or p.name.startswith("."):
                continue
            rel = str(p.relative_to(BASE))
            sha = sha256_of(p)
            legacy = by_name.get(p.name) or by_sha.get(sha)
            mtime = datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d")
            note = ""
            if legacy:
                source, pub, dl = rescue(legacy)
                stats["rescued"] += 1
            else:
                source, pub, dl = "待补", "待补", ""
            for prefix, (ksrc, kpub) in KNOWN.items():
                if rel.startswith(prefix):
                    source, pub = ksrc, kpub
            if d == "policy_evidence_cache":
                note = "证据缓存(rescue 自 /tmp, 2026-07-16)"
            elif rel.startswith("raw/policies/"):
                for k, v in DOC_NUMBERS.items():
                    if k in p.name:
                        note = v
                        break
            if not dl:
                dl = mtime
                if not legacy:
                    stats["mtime_fb"] += 1
            if source == "待补":
                stats["todo"] += 1
            rows[d].append(dict(rel=rel, size=p.stat().st_size, source=source,
                                pub=pub, dl=dl, note=note or "-", sha=sha))

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    git_hash = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT,
                              capture_output=True, text=True).stdout.strip() or "n/a"
    out = [
        "# 山东数据集 MANIFEST（A2 门 v1.2 格式）", "",
        f"- 生成时间: {now}；生成器: `pipeline/rebuild_manifest.py`（git {git_hash}）",
        f"- 覆盖目录: {', '.join(SCAN_DIRS)}（相对 data/shandong/；点文件与 derived/、archive/ 不入账）",
        "- 行格式: | `相对路径` | 字节数 | 来源URL/NewsID | 发布日期 | 下载时间 | 备注 | sha256 |",
        f"- 文件数: " + "，".join(f"{d}={len(rows[d])}" for d in SCAN_DIRS)
        + f"，合计 {sum(len(v) for v in rows.values())}",
        f"- 溯源: 抢救旧账 {stats['rescued']}，mtime fallback {stats['mtime_fb']}，来源待补 {stats['todo']}",
        "",
    ]
    for d in SCAN_DIRS:
        if not rows[d]:
            continue
        out += [f"## {d}/", "",
                "| 路径 | 字节数 | 来源 | 发布日期 | 下载时间 | 备注 | sha256 |",
                "|---|---|---|---|---|---|---|"]
        out += [f"| `{r['rel']}` | {r['size']} | {r['source']} | {r['pub']} "
                f"| {r['dl']} | {r['note']} | {r['sha']} |" for r in rows[d]]
        out.append("")
    MANIFEST.write_text("\n".join(out), encoding="utf-8")
    print(f"重建完成: {sum(len(v) for v in rows.values())} 文件; 统计 {stats}")


if __name__ == "__main__":
    main()
