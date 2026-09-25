# -*- coding: utf-8 -*-
"""Pull ChartView* from server (last night deploy, before Sep 13 02:00 local morning edits)."""
from __future__ import annotations

import importlib.util
import os
import shutil
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
BACKUP = ROOT / "docs" / "restore-backup-before-2am-rollback"
FILES = [
    "app/components/ChartView.tsx",
    "app/components/ChartViewMergedServer.tsx",
    "app/components/mergedAnalysis/MergedAnalysisDeskView.tsx",
]


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
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            local = ROOT / rel.replace("/", os.sep)
            remote = f"{remote_root.rstrip('/')}/{rel}"
            bak = BACKUP / rel.replace("/", os.sep)
            bak.parent.mkdir(parents=True, exist_ok=True)
            if local.exists():
                shutil.copy2(local, bak)
            print(f"Downloading {remote} -> {local}", flush=True)
            local.parent.mkdir(parents=True, exist_ok=True)
            sftp.get(remote, str(local))
            print(f"OK {rel} size={local.stat().st_size}", flush=True)
    finally:
        sftp.close()
        ssh.close()
    print("[done] pulled ChartView* from server", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
