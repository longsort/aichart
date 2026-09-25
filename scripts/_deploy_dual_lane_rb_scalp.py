#!/usr/bin/env python3
"""Deploy Ultra Scalp Dual Lane (rb-scalp + ai-zone) to /root/ailongshort."""
from __future__ import annotations

import importlib.util
import os
import posixpath
import sys

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE_DIR = "/root/ailongshort"

FILES = [
    "lib/mergedDeskRbScalpDriveTrade.ts",
    "lib/mergedDeskUnifiedAnalysisEntry.ts",
    "lib/mergedDeskAutoTradeConfig.ts",
    "lib/mergedDeskVirtualTradeSession.ts",
    "lib/mergedDeskCoinScoreBoard.ts",
    "app/components/mergedAnalysis/MergedAnalysisDeskView.tsx",
    "app/components/mergedAnalysis/MergedDeskAutoTradePanel.tsx",
]


def load_creds():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod.HOST, mod.PORT, mod.USER, mod.PASSWORD, getattr(mod, "REMOTE_ROOT", REMOTE_DIR)


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 7200) -> str:
    print(f"\n$ {cmd}", flush=True)
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")

    def safe(s: str) -> str:
        return s.encode("cp949", errors="replace").decode("cp949", errors="replace")

    if out.strip():
        chunk = out[-14000:] if len(out) > 14000 else out
        print(safe(chunk), flush=True)
    if err.strip():
        print(safe(err[-3000:]), flush=True)
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail {code}: {cmd}")
    return out


def main() -> int:
    host, port, user, password, remote_root = load_creds()
    files = list(dict.fromkeys(FILES))
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting {host} -> {remote_root} ...", flush=True)
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    sftp = ssh.open_sftp()
    try:
        for rel in files:
            local = os.path.join(ROOT, rel.replace("/", os.sep))
            if not os.path.exists(local):
                raise FileNotFoundError(local)
            remote = posixpath.join(remote_root, rel)
            run(ssh, f"mkdir -p {posixpath.dirname(remote)}")
            print(f"Uploading {rel}", flush=True)
            sftp.put(local, remote)
    finally:
        sftp.close()

    run(ssh, f"cd {remote_root} && npm run build", timeout=7200)
    run(ssh, "pm2 restart ailongshort --update-env")
    run(ssh, "sleep 3")
    run(ssh, "pm2 list | sed -n '1,14p'")

    http = run(
        ssh, 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/'
    ).strip()
    if "200" not in http:
        raise RuntimeError(f"health not 200: {http!r}")

    checks = [
        (
            f"grep -n \"rb-scalp\" {remote_root}/lib/mergedDeskUnifiedAnalysisEntry.ts | head -5",
            "rb-scalp allow",
        ),
        (
            f"grep -n \"autoTradeScalpMode\" {remote_root}/lib/mergedDeskAutoTradeConfig.ts | head -5",
            "scalp mode",
        ),
        (
            f"grep -n \"buildRbScalpDriveCandidate\" {remote_root}/lib/mergedDeskRbScalpDriveTrade.ts | head -3",
            "rb scalp module",
        ),
        (
            f"grep -n \"Lane Fast\" {remote_root}/app/components/mergedAnalysis/MergedAnalysisDeskView.tsx | head -3",
            "desk fast lane",
        ),
        (
            f"grep -n \"buildDualLaneTradeStats\" {remote_root}/app/components/mergedAnalysis/MergedDeskAutoTradePanel.tsx | head -3",
            "panel dual stats",
        ),
    ]
    for cmd, label in checks:
        out = run(ssh, cmd)
        if not out.strip():
            raise RuntimeError(f"verify miss: {label}")

    print("\nOK Dual Lane deploy + health 200", flush=True)
    ssh.close()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr, flush=True)
        sys.exit(1)
