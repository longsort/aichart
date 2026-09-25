#!/usr/bin/env python3
"""Deploy mobile fullscreen chart fill fix to /root/ailongshort."""
from __future__ import annotations

import importlib.util
import os
import sys
import time

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE = "/root/ailongshort"
FILES = [
    "app/globals.css",
    "app/components/mergedAnalysis/MergedAnalysisDesk.module.css",
    "app/components/mergedAnalysis/MergedAnalysisDeskView.tsx",
    "app/components/ChartView.tsx",
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
            remote = f"{REMOTE}/{rel}"
            run(ssh, f"mkdir -p '{os.path.dirname(remote)}'")
            out(f"[put] {rel}")
            sftp.put(local, remote)
        run(
            ssh,
            f"grep -n '하단 검은 공백 제거\\|modeFsStrip' {REMOTE}/app/globals.css "
            f"{REMOTE}/app/components/mergedAnalysis/MergedAnalysisDesk.module.css | head -20",
        )
        run(ssh, f"cd {REMOTE} && npm run build", timeout=7200)
        run(
            ssh,
            "pm2 delete ailongshort 2>/dev/null || true; "
            f"cd {REMOTE} && (pm2 start ecosystem.config.cjs || pm2 start ecosystem.config.js --only ailongshort || "
            "pm2 start npm --name ailongshort -- start); pm2 save",
        )
        run(ssh, "sleep 3; curl -sS -m 12 -o /dev/null -w 'home=%{http_code}\\n' http://127.0.0.1:3000/")
        out("[done] mobile FS chart fill OK")
    finally:
        sftp.close()
        ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
