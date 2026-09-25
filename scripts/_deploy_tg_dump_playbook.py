#!/usr/bin/env python3
"""Deploy telegram dump-zone touch E/SL/TP + playbook to /root/ailongshort."""
from __future__ import annotations

import importlib.util
import os
import sys
import time

import paramiko

ROOT = r"d:\apps\ailongshort"
REMOTE = "/root/ailongshort"

FILES = [
    "lib/telegramEventDedupServer.ts",
    "lib/telegramDumpPathBrief.ts",
    "lib/telegramPrecisionTouchRunner.ts",
    "lib/telegramZoneTouchAutoRunner.ts",
    "lib/telegramMoneyEntryTouchRunner.ts",
    "lib/telegramAlertBriefing.ts",
    "lib/telegramMergedDeskAutoRunner.ts",
    "lib/telegramMtfAlertContext.ts",
]


def out(s: str) -> None:
    sys.stdout.buffer.write((s + "\n").encode("utf-8", errors="replace"))
    sys.stdout.buffer.flush()


def load_creds():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("d", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 600) -> str:
    out(f"$ {cmd}")
    _stdin, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    text = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if text.strip():
        out(text.strip()[-4000:])
    if err.strip():
        out(err.strip()[-2000:])
    if code != 0:
        raise RuntimeError(f"failed ({code}): {cmd}")
    return text


def main() -> int:
    d = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    out(f"Connecting to {d.HOST}...")
    ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=25)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            local = os.path.join(ROOT, rel.replace("/", os.sep))
            remote = f"{REMOTE}/{rel}"
            if not os.path.isfile(local):
                raise FileNotFoundError(local)
            remote_dir = os.path.dirname(remote)
            run(ssh, f"mkdir -p {remote_dir}")
            out(f"upload {rel}")
            sftp.put(local, remote)
        out("build...")
        run(
            ssh,
            f"cd {REMOTE} && npm run build",
            timeout=900,
        )
        out("pm2 restart...")
        run(
            ssh,
            "pm2 restart ailongshort || (cd /root/ailongshort && pm2 start ecosystem.config.cjs) || true",
            timeout=120,
        )
        run(ssh, "sleep 4; curl -sS -m 20 -o /dev/null -w 'home=%{http_code}\\n' http://127.0.0.1:3000/")
        run(
            ssh,
            "test -f /root/ailongshort/lib/telegramSignalPlaybook.ts && "
            "grep -n '롱 반등 세팅' /root/ailongshort/lib/telegramPrecisionTouchRunner.ts | head -3",
        )
        out("[done] telegram dump playbook deployed")
    finally:
        sftp.close()
        ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
