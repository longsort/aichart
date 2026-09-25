#!/usr/bin/env python3
"""Verify realtime/KST deploy + restart with ecosystem.config.cjs."""
from __future__ import annotations

import importlib.util
import os
import sys
import time

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE = "/root/ailongshort"


def out(s: str) -> None:
    sys.stdout.buffer.write((s + "\n").encode("utf-8", errors="replace"))
    sys.stdout.buffer.flush()


def load_creds():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod.HOST, mod.PORT, mod.USER, mod.PASSWORD


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 120) -> int:
    out(f"$ {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    while True:
        if stdout.channel.recv_ready():
            data = stdout.channel.recv(65536)
            sys.stdout.buffer.write(data)
            sys.stdout.buffer.flush()
        if stdout.channel.exit_status_ready() and not stdout.channel.recv_ready():
            break
        time.sleep(0.05)
    rest = stdout.read()
    if rest:
        sys.stdout.buffer.write(rest)
        sys.stdout.buffer.flush()
    err = stderr.read()
    if err.strip():
        sys.stdout.buffer.write(err)
        sys.stdout.buffer.flush()
    return stdout.channel.recv_exit_status()


def main() -> int:
    host, port, user, password = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    out(f"[ssh] {host}")
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    try:
        run(ssh, f"grep -n maxAgeMs {REMOTE}/lib/clientMarketCandleCache.ts | head -5")
        run(ssh, f"grep -nE 'KST_OFFSET|nextKstDaily' {REMOTE}/lib/closeSettlement.ts | head -10")
        run(ssh, "pm2 delete ailongshort 2>/dev/null || true")
        run(ssh, f"pm2 start {REMOTE}/ecosystem.config.cjs && pm2 save")
        run(ssh, "sleep 3; curl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:3000/")
        run(ssh, "pm2 list | sed -n '1,12p'")
        run(ssh, f"sed -i 's/\\r$//' {REMOTE}/scripts/install-server-cron.sh; bash {REMOTE}/scripts/install-server-cron.sh || true")
        out("[done]")
    finally:
        ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
