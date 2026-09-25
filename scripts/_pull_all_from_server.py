#!/usr/bin/env python3
"""서버 /root/ailongshort 전체를 로컬로 받아 덮어쓰기 (서버 수정 없음)."""
from __future__ import annotations

import importlib.util
import os
import shutil
import sys
import tarfile
import tempfile
import time

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE = "/root/ailongshort"
REMOTE_TGZ = "/tmp/ailongshort-local-pull.tgz"

# 서버→로컬 풀 시 제외 (용량·비밀·빌드산출물)
EXCLUDE = [
    "node_modules",
    ".next",
    ".git",
    ".env",
    ".env.local",
    ".turbo",
    "playwright-report",
    "test-results",
    "coverage",
    "backups",
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
    err = stderr.read().decode("utf-8", errors="replace")
    if err.strip():
        out(err.strip())
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"Command failed ({code}): {cmd}")


def main() -> int:
    host, port, user, password = load_creds()

    # 로컬 비밀·환경 보존
    preserve: dict[str, bytes] = {}
    for name in (".env.local", ".env"):
        p = os.path.join(ROOT, name)
        if os.path.isfile(p):
            with open(p, "rb") as f:
                preserve[name] = f.read()
            out(f"[keep] {name}")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    out(f"[ssh] {host} …")
    ssh.connect(host, port=port, username=user, password=password, timeout=45)
    sftp = ssh.open_sftp()
    try:
        excludes = " ".join(f"--exclude='{e}'" for e in EXCLUDE)
        run(
            ssh,
            f"rm -f {REMOTE_TGZ} && cd {REMOTE} && tar czf {REMOTE_TGZ} {excludes} . && ls -lh {REMOTE_TGZ}",
            timeout=1800,
        )
        local_tgz = os.path.join(tempfile.gettempdir(), "ailongshort-local-pull.tgz")
        out(f"[get] {REMOTE_TGZ} → {local_tgz}")
        sftp.get(REMOTE_TGZ, local_tgz)
        run(ssh, f"rm -f {REMOTE_TGZ}")

        out(f"[extract] → {ROOT}")
        with tarfile.open(local_tgz, "r:gz") as tf:
            # Python 3.12+ filter; older: extractall
            try:
                tf.extractall(ROOT, filter=tarfile.data_filter)  # type: ignore[arg-type]
            except (AttributeError, TypeError):
                tf.extractall(ROOT)

        try:
            os.remove(local_tgz)
        except OSError:
            pass

        for name, data in preserve.items():
            p = os.path.join(ROOT, name)
            with open(p, "wb") as f:
                f.write(data)
            out(f"[restore] {name}")

        out("[done] server tree applied to local")
    finally:
        try:
            sftp.close()
        except Exception:
            pass
        ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
