# -*- coding: utf-8 -*-
"""Restore workspace to Sep 17 dawn patch (01:20~01:32 candle-analysis draw)."""
from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote

# 어제(9/17) 새벽 마지막 패치 직후 스냅샷 — 지시: 01:20~01:32
CUTOFF = datetime(2026, 9, 17, 1, 35, 0)
HIST = Path.home() / "AppData/Roaming/Cursor/User/History"
ROOT = Path(r"d:\apps\ailongshort")
BACKUP = ROOT / "docs" / "restore-backup-before-dawn017-rollback"

SKIP_PARTS = {
    "node_modules",
    ".next",
    "backups",
    "restore-backup-before-2am-rollback",
    "restore-backup-before-sep15-rollback",
    "restore-backup-before-dawn017-rollback",
    "server-sync-backup-20260913-230505",
    "server-sync-backup-20260913-115433",
    "server-sync-backup-20260913-112253",
    "chat-exports",
    ".git",
}


def resource_to_path(resource: str) -> Path | None:
    if not resource.startswith("file:///"):
        return None
    raw = unquote(resource[len("file:///") :])
    if len(raw) >= 2 and raw[1] == ":":
        return Path(raw)
    return Path("/" + raw)


def should_skip(path: Path) -> bool:
    try:
        rel = path.resolve().relative_to(ROOT.resolve())
    except ValueError:
        return True
    return bool(set(rel.parts) & SKIP_PARTS)


def main() -> None:
    BACKUP.mkdir(parents=True, exist_ok=True)
    restored: list[str] = []
    skipped_no_hist = 0
    for d in HIST.iterdir():
        if not d.is_dir():
            continue
        entries_path = d / "entries.json"
        if not entries_path.exists():
            continue
        try:
            data = json.loads(entries_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        path = resource_to_path(str(data.get("resource") or ""))
        if path is None or should_skip(path):
            continue
        if not str(path).lower().startswith(str(ROOT).lower()):
            continue
        best = None
        for ent in data.get("entries") or []:
            try:
                ts = datetime.fromtimestamp(int(ent["timestamp"]) / 1000.0)
            except Exception:
                continue
            if ts >= CUTOFF:
                continue
            if best is None or ts > best[0]:
                best = (ts, str(ent["id"]))
        if not best:
            skipped_no_hist += 1
            continue
        src = d / best[1]
        if not src.exists():
            print(f"MISSING {src}")
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() and path.is_file():
            rel = path.resolve().relative_to(ROOT.resolve())
            bak = BACKUP / rel
            bak.parent.mkdir(parents=True, exist_ok=True)
            try:
                shutil.copy2(path, bak)
            except OSError:
                pass
        shutil.copy2(src, path)
        restored.append(f"{path.relative_to(ROOT)} <- {best[1]} @ {best[0].isoformat(timespec='seconds')}")
        print("RESTORED", restored[-1])

    print("---")
    print(f"cutoff={CUTOFF.isoformat()} restored_count={len(restored)} no_hist={skipped_no_hist}")
    print(f"backup_dir={BACKUP}")


if __name__ == "__main__":
    main()
