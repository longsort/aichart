# -*- coding: utf-8 -*-
"""Deploy signal-live briefing card → /root/ailongshort"""
from __future__ import annotations

import importlib.util
import os
import posixpath
import sys
import time
from pathlib import Path

import paramiko

ROOT = Path(r"d:\apps\ailongshort")
REMOTE = "/root/ailongshort"
FILES = [
    "app/components/eagle1Tapoint/Eagle1TapointDeskView.tsx",
    "lib/eagle1Tapoint/vmaxPanelPrefs.ts",
    "lib/eagle1Tapoint/signalLiveBriefing.ts",
    "lib/eagle1Tapoint/index.ts",
]


def out(s: str) -> None:
    sys.stdout.buffer.write((s + "\n").encode("utf-8", errors="replace"))
    sys.stdout.buffer.flush()


def load():
    path = ROOT / "deploy_today.py"
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod


def mkdirs(sftp, remote_dir: str) -> None:
    parts = remote_dir.strip("/").split("/")
    cur = ""
    for part in parts:
        cur = f"{cur}/{part}" if cur else f"/{part}"
        try:
            sftp.stat(cur)
        except OSError:
            try:
                sftp.mkdir(cur)
            except OSError:
                pass


def run(ssh, cmd: str, timeout: int = 7200) -> None:
    out(f"$ {cmd}")
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
    err = stderr.read().decode("utf-8", errors="replace")
    if err.strip():
        out(err.strip())
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail ({code}): {cmd}")


def main() -> int:
    mod = load()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=30)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            local = ROOT / rel.replace("/", os.sep)
            if not local.is_file():
                out(f"[FAIL] missing {rel}")
                return 1
            remote = posixpath.join(REMOTE, rel)
            mkdirs(sftp, posixpath.dirname(remote))
            out(f"[put] {rel}")
            sftp.put(str(local), remote)
        run(ssh, f"cd {REMOTE} && npm run build")
        run(ssh, "pm2 restart ailongshort --update-env")
        run(
            ssh,
            "sleep 5 && curl -sf -o /dev/null -w 'home=%{http_code}\\n' http://127.0.0.1:3000/",
        )
        out("[done] signal-live briefing")
    finally:
        sftp.close()
        ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
