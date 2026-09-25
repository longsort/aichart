#!/usr/bin/env python3
"""Deploy coin trade progress gauge UI to /root/ailongshort."""
from __future__ import annotations

import importlib.util
import os
import posixpath
import sys

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE_DIR = "/root/ailongshort"

FILES = [
    "lib/mergedDeskCoinTradeProgress.ts",
    "app/components/mergedAnalysis/MergedDeskCoinTradeProgressStrip.tsx",
    "app/components/mergedAnalysis/MergedAnalysisDesk.module.css",
    "app/components/mergedAnalysis/MergedDeskAutoTradePanel.tsx",
    "app/components/mergedAnalysis/MergedAnalysisDeskView.tsx",
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
        print(safe(out[-12000:] if len(out) > 12000 else out), flush=True)
    if err.strip():
        print(safe(err[-2500:]), flush=True)
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail {code}: {cmd}")
    return out


def main() -> int:
    host, port, user, password, remote_root = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting {host} -> {remote_root} ...", flush=True)
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
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
    http = run(
        ssh, 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/'
    ).strip()
    if "200" not in http:
        raise RuntimeError(f"health not 200: {http!r}")

    checks = [
        f"grep -n '코인매매진행' {remote_root}/app/components/mergedAnalysis/MergedDeskCoinTradeProgressStrip.tsx | head -2",
        f"grep -n 'probeRbScalpProgress' {remote_root}/lib/mergedDeskCoinTradeProgress.ts | head -2",
        f"grep -n 'MergedDeskCoinTradeProgressStrip' {remote_root}/app/components/mergedAnalysis/MergedDeskAutoTradePanel.tsx | head -2",
        f"grep -n 'upsertCoinTradeProgress' {remote_root}/app/components/mergedAnalysis/MergedAnalysisDeskView.tsx | head -3",
        f"grep -n 'coinProgressPanel' {remote_root}/app/components/mergedAnalysis/MergedAnalysisDesk.module.css | head -2",
    ]
    for cmd in checks:
        out = run(ssh, cmd)
        if not out.strip():
            raise RuntimeError(f"verify miss: {cmd}")

    print("\nOK coin-progress deploy + health 200", flush=True)
    ssh.close()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr, flush=True)
        sys.exit(1)
