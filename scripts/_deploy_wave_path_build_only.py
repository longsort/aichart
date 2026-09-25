#!/usr/bin/env python3
"""Build + pm2 only after files already uploaded."""
from __future__ import annotations

import importlib.util
import os
import sys

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_creds():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod.HOST, mod.PORT, mod.USER, mod.PASSWORD, mod.REMOTE_ROOT


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 7200) -> None:
    print(f"\n$ {cmd}", flush=True)
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")

    def safe(s: str) -> str:
        return s.encode("cp949", errors="replace").decode("cp949", errors="replace")

    if out.strip():
        chunk = out[-8000:] if len(out) > 8000 else out
        print(safe(chunk), flush=True)
    if err.strip():
        print(safe(err[-2000:]), flush=True)
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail {code}: {cmd}")


def main() -> int:
    host, port, user, password, remote_root = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting {host}...", flush=True)
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    try:
        run(ssh, f"cd {remote_root} && npm run build", timeout=7200)
        run(ssh, "pm2 restart ailongshort")
        run(ssh, "pm2 list | sed -n '1,12p'")
        run(ssh, 'curl -s -o /dev/null -w "%{http_code}\\n" http://127.0.0.1:3000/')
        print("\n[done] build+pm2 OK", flush=True)
    finally:
        ssh.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print(f"[FAIL] {e}", flush=True)
        raise SystemExit(1)
