# -*- coding: utf-8 -*-
"""Download 통합모드(merged*) files from /root/ailongshort → local workspace sync."""
from __future__ import annotations

import importlib.util
import os
import posixpath
import shutil
from datetime import datetime
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
BACKUP = ROOT / "docs" / f"server-sync-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}"

FIND_CMD = r"""
cd /root/ailongshort && find lib app -type f \( \
  -iname '*merged*' -o -iname '*Merged*' \
  -o -path 'app/components/ChartView.tsx' \
  -o -path 'app/components/ChartViewMergedServer.tsx' \
  -o -path 'app/components/mergedAnalysis/*' \
  -o -path 'app/api/merged-desk/*' \
  -o -path 'app/api/merged-*/*' \
  -o -path 'app/telegram-merged-capture/*' \
\) 2>/dev/null | sort
"""


def load_creds():
    path = ROOT / "deploy_today.py"
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod.HOST, mod.PORT, mod.USER, mod.PASSWORD, mod.REMOTE_ROOT


def main() -> int:
    host, port, user, password, remote_root = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting {host}...", flush=True)
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    sftp = ssh.open_sftp()
    try:
        _, stdout, _ = ssh.exec_command(FIND_CMD, timeout=120)
        listing = stdout.read().decode("utf-8", errors="replace").strip().splitlines()
        files = [ln.strip() for ln in listing if ln.strip()]
        extra = [
            "lib/settings.ts",
            "app/HomePageContent.tsx",
            "app/globals.css",
            "app/components/CandleAnalysisHeader.tsx",
            "lib/mergedAnalysisDeskVisualCleanup.ts",
            "lib/mergedAnalysisOverlayIds.ts",
        ]
        for rel in extra:
            if rel not in files:
                files.append(rel)
        print(f"Found {len(files)} remote files", flush=True)
        BACKUP.mkdir(parents=True, exist_ok=True)

        ok = 0
        fail = 0
        for rel in files:
            rel = rel.replace("\\", "/").lstrip("./")
            remote = posixpath.join(remote_root, rel)
            local = ROOT / rel.replace("/", os.sep)
            try:
                if local.exists():
                    bak = BACKUP / rel.replace("/", os.sep)
                    bak.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(local, bak)
                local.parent.mkdir(parents=True, exist_ok=True)
                sftp.get(remote, str(local))
                ok += 1
                if ok % 25 == 0:
                    print(f"  ... {ok}/{len(files)}", flush=True)
            except Exception as e:
                fail += 1
                print(f"FAIL {rel}: {e}", flush=True)

        print(f"\n[done] synced ok={ok} fail={fail}", flush=True)
        print(f"backup={BACKUP}", flush=True)
    finally:
        sftp.close()
        ssh.close()
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
