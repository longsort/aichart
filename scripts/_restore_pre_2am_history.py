# -*- coding: utf-8 -*-
"""Restore key files from Cursor local history to last version before 2026-09-13 02:00."""
from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote

CUTOFF = datetime(2026, 9, 13, 2, 0, 0)
HIST = Path.home() / "AppData/Roaming/Cursor/User/History"
ROOT = Path(r"d:\apps\ailongshort")
BACKUP = ROOT / "docs" / "restore-backup-before-2am-rollback"
TARGETS = {
    "mergedDeskWavePathEngine.ts",
    "mergedDeskWavePathCatalog.ts",
    "mergedDeskWavePathCurve.ts",
    "mergedDeskRbSchematicChartDraw.ts",
    "mergedAnalysisOverlayIds.ts",
    "mergedAnalysisOverlayTimes.ts",
    "mergedAnalysisDeskEngine.ts",
    "mergedDeskChannelMoneyEdge.ts",
    "mergedDeskSharedChartView.ts",
    "MergedAnalysisDeskView.tsx",
    "ChartView.tsx",
    "ChartViewMergedServer.tsx",
}


def resource_to_path(resource: str) -> Path | None:
    if not resource.startswith("file:///"):
        return None
    # file:///d%3A/apps/...
    raw = unquote(resource[len("file:///") :])
    if len(raw) >= 2 and raw[1] == ":":
        return Path(raw)
    return Path("/" + raw)


def main() -> None:
    BACKUP.mkdir(parents=True, exist_ok=True)
    restored = []
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
        res = str(data.get("resource") or "")
        path = resource_to_path(res)
        if path is None:
            continue
        name = path.name
        if name not in TARGETS:
            continue
        best = None
        for ent in data.get("entries") or []:
            ts = datetime.fromtimestamp(int(ent["timestamp"]) / 1000.0)
            if ts >= CUTOFF:
                continue
            if best is None or ts > best[0]:
                best = (ts, ent["id"])
        if not best:
            print(f"SKIP (no pre-2am): {path}")
            continue
        src = d / best[1]
        if not src.exists():
            print(f"MISSING hist file: {src}")
            continue
        if not path.exists():
            print(f"SKIP missing workspace file: {path}")
            continue
        # backup current
        rel = path.relative_to(ROOT)
        bak = BACKUP / rel
        bak.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, bak)
        shutil.copy2(src, path)
        restored.append(f"{rel} <- {best[1]} @ {best[0].isoformat(timespec='seconds')}")
        print("RESTORED", restored[-1])

    print("---")
    print(f"restored_count={len(restored)}")
    print(f"backup_dir={BACKUP}")


if __name__ == "__main__":
    main()
