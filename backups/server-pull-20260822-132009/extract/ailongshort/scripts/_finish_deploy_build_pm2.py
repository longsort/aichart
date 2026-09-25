#!/usr/bin/env python3
"""Finish deploy on VPS after tar already extracted — npm install + build + pm2."""
from __future__ import annotations

import importlib.util
import os
import sys
import time

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE_DIR = "/root/ailongshort"


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


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 7200) -> None:
    out(f"$ {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    while True:
        if stdout.channel.recv_ready():
            data = stdout.channel.recv(65536).decode("utf-8", errors="replace")
            sys.stdout.buffer.write(data.encode("utf-8", errors="replace"))
            sys.stdout.buffer.flush()
        if stdout.channel.exit_status_ready() and not stdout.channel.recv_ready():
            break
        time.sleep(0.05)
    rest = stdout.read().decode("utf-8", errors="replace")
    if rest:
        sys.stdout.buffer.write(rest.encode("utf-8", errors="replace"))
        sys.stdout.buffer.flush()
    err = stderr.read().decode("utf-8", errors="replace")
    if err.strip():
        out(err.strip())
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"Command failed ({code}): {cmd}")


def main() -> int:
    host, port, user, password = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    out(f"[ssh] {host}")
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    try:
        # verify zone files landed
        run(
            ssh,
            f"test -f {REMOTE_DIR}/lib/mergedDeskAssetAutoZones.ts && "
            f"test -f {REMOTE_DIR}/lib/mergedDeskAssetsCatalogFullMatch.ts && "
            f"echo '[ok] zone modules present'",
        )
        run(
            ssh,
            f"cd {REMOTE_DIR} && npm install --no-audit --no-fund",
            timeout=7200,
        )
        run(ssh, f"cd {REMOTE_DIR} && npm run build", timeout=7200)
        # delete duplicate name collisions then start one clean process
        run(
            ssh,
            "pm2 delete ailongshort 2>/dev/null || true; "
            f"(pm2 start {REMOTE_DIR}/ecosystem.config.js --only ailongshort) || "
            f"(cd {REMOTE_DIR} && pm2 start npm --name ailongshort -- start)",
        )
        run(ssh, "pm2 save 2>/dev/null || true")
        run(ssh, "pm2 list | sed -n '1,25p'")
        run(ssh, "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || true")
        out("[done] build+pm2 OK")
    finally:
        ssh.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        out(f"[FAIL] {e}")
        raise SystemExit(1)
