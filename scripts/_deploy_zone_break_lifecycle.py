# -*- coding: utf-8 -*-
"""Deploy short-zone break lifecycle patch → /root/ailongshort."""
from __future__ import annotations

import importlib.util
import os
import posixpath
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    "lib/mergedDeskZoneBreakLifecycle.ts",
    "lib/mergedAnalysisDeskVisualCleanup.ts",
    "lib/mergedDeskDumpLifeCycle.ts",
    "lib/mergedDeskMtfDumpZoneBridge.ts",
    "lib/mergedDeskMirageZoneState.ts",
    "lib/mergedDeskMirageZoneCompactLabel.ts",
    "app/globals.css",
]


def load_creds():
    path = ROOT / "deploy_today.py"
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod.HOST, mod.PORT, mod.USER, mod.PASSWORD, mod.REMOTE_ROOT


def run(ssh, cmd, timeout=7200):
    print(f"\n$ {cmd}", flush=True)
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if out.strip():
        print(out[-8000:], flush=True)
    if err.strip():
        print(err[-2000:], flush=True)
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail {code}: {cmd}")


def main() -> int:
    host, port, user, password, remote_root = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting {host}...", flush=True)
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            local = ROOT / rel.replace("/", os.sep)
            if not local.is_file():
                raise FileNotFoundError(rel)
            remote = posixpath.join(remote_root, rel)
            print(f"Uploading {rel}", flush=True)
            sftp.put(str(local), remote)
        run(ssh, f"cd {remote_root} && npm run build", timeout=7200)
        run(ssh, "pm2 restart ailongshort")
        run(ssh, 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/')
        print("\n[done] zone-break lifecycle deployed", flush=True)
    finally:
        sftp.close()
        ssh.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print(f"[FAIL] {e}", flush=True)
        raise SystemExit(1)
