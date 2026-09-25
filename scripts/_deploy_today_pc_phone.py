#!/usr/bin/env python3
"""오늘 통합·분석 패치 + PC/폰 비율·기능 동일 → /root/ailongshort + build + pm2."""
from __future__ import annotations

import importlib.util
import os
import posixpath
import sys
import time

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE = "/root/ailongshort"

FILES = [
    "app/globals.css",
    "lib/mergedDeskVisualTokens.ts",
    "lib/mergedDeskDumpLifeCycle.ts",
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
    return mod.HOST, mod.PORT, mod.USER, mod.PASSWORD


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 7200) -> None:
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


def sftp_mkdirs(sftp: paramiko.SFTPClient, remote_dir: str) -> None:
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


def main() -> int:
    host, port, user, password = load_creds()
    missing = [f for f in FILES if not os.path.isfile(os.path.join(ROOT, f.replace("/", os.sep)))]
    if missing:
        out("[FAIL] missing local files:")
        for m in missing:
            out(f"  - {m}")
        return 1

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    out(f"[ssh] {host} → {REMOTE}")
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            local = os.path.join(ROOT, rel.replace("/", os.sep))
            remote = posixpath.join(REMOTE, rel)
            sftp_mkdirs(sftp, posixpath.dirname(remote))
            out(f"[put] {rel}")
            sftp.put(local, remote)
        run(ssh, f"cd {REMOTE} && npm run build", timeout=7200)
        run(ssh, "pm2 restart ailongshort --update-env")
        run(ssh, "sleep 5 && curl -sf -o /dev/null -w home=%{http_code} http://127.0.0.1:3000/; echo")
        run(ssh, "pm2 list | sed -n '1,12p'")
        out("[done] today pc/phone patch → /root/ailongshort")
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
