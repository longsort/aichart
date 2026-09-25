#!/usr/bin/env python3
"""Redeploy TF set colors + bounce/surge labels (keep features)."""
from __future__ import annotations

import importlib.util
import os
import sys
import time

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE = "/root/ailongshort"
FILES = [
    "lib/mergedDeskDumpLifeCycle.ts",
    "lib/mergedDeskMtfDumpZoneBridge.ts",
    "lib/mergedDeskZoneChartLabelClean.ts",
    "lib/mergedDeskDumpCeilingReachStats.ts",
    "lib/mergedDeskMtfBounceTargetByTf.ts",
    "lib/telegramMtfAlertContext.ts",
    "lib/telegramDumpPathBrief.ts",
    "app/globals.css",
]


def out(s: str) -> None:
    sys.stdout.buffer.write((s + "\n").encode("utf-8", errors="replace"))
    sys.stdout.buffer.flush()


def load():
    path = os.path.join(ROOT, "deploy_today.py")
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
    out(f"[ssh] {d.HOST}")
    ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=30)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            local = os.path.join(ROOT, rel.replace("/", os.sep))
            if not os.path.isfile(local):
                raise FileNotFoundError(local)
            remote = f"{REMOTE}/{rel}"
            run(ssh, f"mkdir -p '{os.path.dirname(remote)}'")
            out(f"[put] {rel}")
            sftp.put(local, remote)
        run(
            ssh,
            f"grep -n 'merged-desk-mtf-dump-set-1h\\|dumpTfSetRoleVisual\\|bounceCtxByTf' "
            f"{REMOTE}/app/globals.css "
            f"{REMOTE}/lib/mergedDeskDumpLifeCycle.ts "
            f"{REMOTE}/lib/mergedDeskMtfDumpZoneBridge.ts | head -n 40",
        )
        run(ssh, f"cd {REMOTE} && npm run build", timeout=7200)
        run(
            ssh,
            "pm2 delete ailongshort 2>/dev/null || true; "
            f"cd {REMOTE} && (pm2 start ecosystem.config.cjs || pm2 start ecosystem.config.js --only ailongshort || "
            "pm2 start npm --name ailongshort -- start); pm2 save",
        )
    finally:
        sftp.close()
        ssh.close()
    out("[done] TF set color restore deploy OK -> /root/ailongshort")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
