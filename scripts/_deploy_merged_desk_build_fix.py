#!/usr/bin/env python3
"""Quick fix: upload missing candleBattle + next.config, rebuild, pm2 restart."""
from __future__ import annotations

import importlib.util
import os
import sys
import time
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
REMOTE = "/root/ailongshort"
FILES = [
    "next.config.mjs",
    "lib/candleBattle/index.ts",
    "lib/candleBattle/types.ts",
    "lib/candleBattle/buildPack.ts",
    "lib/candleBattle/focusMode.ts",
    "lib/stubs/emptyPlaywright.js",
    "instrumentation.ts",
    "start.js",
]


def out(s: str) -> None:
    sys.stdout.buffer.write((s + "\n").encode("utf-8", errors="replace"))
    sys.stdout.buffer.flush()


def load():
    path = ROOT / "deploy_today.py"
    spec = importlib.util.spec_from_file_location("d", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    return mod


def run(ssh, cmd: str, timeout: int = 7200) -> None:
    out("$ " + cmd)
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    while True:
        if stdout.channel.recv_ready():
            sys.stdout.buffer.write(stdout.channel.recv(65536))
            sys.stdout.buffer.flush()
        if stdout.channel.exit_status_ready() and not stdout.channel.recv_ready():
            break
        time.sleep(0.05)
    rest = stdout.read()
    if rest:
        sys.stdout.buffer.write(rest)
        sys.stdout.buffer.flush()
    err = stderr.read().decode("utf-8", "replace")
    if err.strip():
        out(err.strip()[:2000])
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail {code}: {cmd}")


def main() -> int:
    d = load()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    out(f"[ssh] {d.HOST} → {REMOTE}")
    ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=30)
    sftp = ssh.open_sftp()
    try:
        run(ssh, f"mkdir -p {REMOTE}/lib/candleBattle {REMOTE}/lib/stubs")
        for rel in FILES:
            local = ROOT / rel.replace("/", os.sep)
            if not local.is_file():
                raise FileNotFoundError(str(local))
            out(f"[put] {rel}")
            sftp.put(str(local), f"{REMOTE}/{rel}")
    finally:
        sftp.close()

    run(ssh, f"cd {REMOTE} && npm run build")
    run(ssh, "pm2 restart ailongshort --update-env")
    run(ssh, "sleep 6 && curl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:3000/")
    run(ssh, "pm2 list | sed -n '1,8p'")
    out("[done] candleBattle + rebuild")
    ssh.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        out(f"[FAIL] {e}")
        raise SystemExit(1)
