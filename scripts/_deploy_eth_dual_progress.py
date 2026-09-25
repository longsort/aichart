#!/usr/bin/env python3
"""Deploy ETH Dual Lane + coin progress to /root/ailongshort."""
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
    "lib/mergedDeskAiZoneDriveTrade.ts",
    "lib/mergedDeskAutoTradeConfig.ts",
    "lib/mergedDeskCoinScoreBoard.ts",
    "lib/mergedDeskCoinTradeProgress.ts",
    "app/components/mergedAnalysis/MergedAnalysisDeskView.tsx",
]


def load_creds():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod.HOST, mod.PORT, mod.USER, mod.PASSWORD, getattr(mod, "REMOTE_ROOT", REMOTE_DIR)


def run(ssh, cmd, timeout=7200):
    print(f"\n$ {cmd}", flush=True)
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    safe = lambda s: s.encode("cp949", errors="replace").decode("cp949", errors="replace")
    if out.strip():
        print(safe(out[-10000:] if len(out) > 10000 else out), flush=True)
    if err.strip():
        print(safe(err[-2000:]), flush=True)
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail {code}: {cmd}")
    return out


def main():
    host, port, user, password, remote_root = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            local = os.path.join(ROOT, rel.replace("/", os.sep))
            remote = posixpath.join(remote_root, rel)
            run(ssh, f"mkdir -p {posixpath.dirname(remote)}")
            print(f"Uploading {rel}", flush=True)
            sftp.put(local, remote)
    finally:
        sftp.close()

    run(ssh, f"cd {remote_root} && npm run build", timeout=7200)
    run(ssh, "pm2 restart ailongshort --update-env")
    run(ssh, "sleep 3")
    http = run(ssh, 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/').strip()
    if "200" not in http:
        raise RuntimeError(f"health not 200: {http!r}")
    for cmd in [
        f"grep -n \"startsWith('ETH')\" {remote_root}/lib/mergedDeskRbScalpDriveTrade.ts | head -2",
        f"grep -n \"'ETH'\" {remote_root}/lib/mergedDeskCoinTradeProgress.ts | head -3",
        f"grep -n 'ETHUSDT' {remote_root}/lib/mergedDeskAutoTradeConfig.ts | head -5",
        f"grep -n \"startsWith('ETH')\" {remote_root}/app/components/mergedAnalysis/MergedAnalysisDeskView.tsx | head -3",
    ]:
        if not run(ssh, cmd).strip():
            raise RuntimeError(f"verify miss: {cmd}")
    print("\nOK ETH Dual + progress deploy", flush=True)
    ssh.close()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
