#!/usr/bin/env python3
"""Patch deploy: MTF dump zones (4h/1d on 1h) + page client fix → /root/ailongshort."""
from __future__ import annotations

import importlib.util
import os
import sys
import time

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE = "/root/ailongshort"

FILES = [
    "lib/mergedDeskMtfDumpZoneBridge.ts",
    "app/components/mergedAnalysis/MergedAnalysisDeskView.tsx",
    "app/components/mergedAnalysis/MergedAnalysisDesk.module.css",
    "app/page.tsx",
    "lib/telegramPrecisionTouchRunner.ts",
]


def out(s: str) -> None:
    sys.stdout.buffer.write((s + "\n").encode("utf-8", errors="replace"))
    sys.stdout.buffer.flush()


def load_creds():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 7200) -> None:
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
        out(err.strip())
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail {code}: {cmd}")


def main() -> int:
    d = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    out(f"[ssh] {d.HOST}")
    ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=30)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            local = os.path.join(ROOT, rel.replace("/", os.sep))
            if not os.path.isfile(local):
                out(f"[skip missing] {rel}")
                continue
            remote = f"{REMOTE}/{rel}"
            remote_dir = os.path.dirname(remote).replace("\\", "/")
            run(ssh, f"mkdir -p '{remote_dir}'")
            out(f"[put] {rel}")
            sftp.put(local, remote)

        run(ssh, f"cd {REMOTE} && rm -rf .next")
        run(ssh, f"cd {REMOTE} && npm run build", timeout=7200)
        run(
            ssh,
            f"cd {REMOTE} && "
            "(pm2 restart ailongshort --update-env || "
            "(pm2 start ecosystem.config.cjs && pm2 save))",
        )
        run(
            ssh,
            "sleep 2; curl -sf -o /dev/null -w 'home=%{http_code}\\n' "
            "http://127.0.0.1:3000/; pm2 list | sed -n '1,12p'",
        )
        out("[done] mtf dump patch OK")
    finally:
        sftp.close()
        ssh.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        out(f"[FAIL] {e}")
        raise SystemExit(1)
