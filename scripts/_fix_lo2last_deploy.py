#!/usr/bin/env python3
"""Hotfix: lo2Last ReferenceError → /root/ailongshort."""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
REL = "lib/mergedDeskBlueRedChannels.ts"
REMOTE = "/root/ailongshort"


def load_creds():
    path = ROOT / "deploy_today.py"
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod.HOST, mod.PORT, mod.USER, mod.PASSWORD


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 7200) -> None:
    print(f"\n$ {cmd}", flush=True)
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")

    def safe(s: str) -> str:
        return s.encode("cp949", errors="replace").decode("cp949", errors="replace")

    if out.strip():
        print(safe(out[-8000:] if len(out) > 8000 else out), flush=True)
    if err.strip():
        print(safe(err[-2000:]), flush=True)
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail {code}: {cmd}")


def main() -> None:
    host, port, user, password = load_creds()
    print(f"Connecting {host}...", flush=True)
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port=port, username=user, password=password, timeout=60)
    sftp = ssh.open_sftp()
    local = ROOT / REL
    remote = f"{REMOTE}/{REL}"
    sftp.put(str(local), remote)
    print(f"uploaded {remote}", flush=True)
    sftp.close()
    run(ssh, f"cd {REMOTE} && npm run build")
    run(ssh, "pm2 restart ailongshort --update-env")
    run(ssh, 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/')
    ssh.close()
    print("[done] lo2Last fix deployed", flush=True)


if __name__ == "__main__":
    main()
