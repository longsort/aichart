# -*- coding: utf-8 -*-
"""Deploy short SL/TP ensure + ETH entry fix."""
from __future__ import annotations

import importlib.util
import os
import posixpath
import sys

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE = "/root/ailongshort"

FILES = [
    "lib/bitgetPrivateTrade.ts",
    "lib/mergedDeskServerLiveRoeExit.ts",
    "lib/mergedDeskServerAutoTradeRunner.ts",
    "lib/mergedDeskLiveSlTp.ts",
    "app/api/cron/merged-desk-live-exit/route.ts",
    "app/components/mergedAnalysis/MergedAnalysisDeskView.tsx",
]


def load():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("d", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod


def run(ssh, cmd: str, timeout: int = 7200) -> None:
    print(f"$ {cmd}", flush=True)
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if out:
        sys.stdout.buffer.write(out.encode("utf-8", errors="replace"))
        sys.stdout.buffer.flush()
    if err.strip():
        print(err.strip(), flush=True)
    if stdout.channel.recv_exit_status() != 0:
        raise RuntimeError(cmd)


def main() -> int:
    mod = load()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=30)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            local = os.path.join(ROOT, rel.replace("/", os.sep))
            remote = posixpath.join(REMOTE, rel)
            run(ssh, f"mkdir -p {posixpath.dirname(remote)}")
            print(f"put {rel}", flush=True)
            sftp.put(local, remote)
        run(ssh, f"cd {REMOTE} && npm run build")
        run(ssh, "pm2 restart ailongshort")
        print("[done] short-sl eth-entry deploy OK", flush=True)
    finally:
        sftp.close()
        ssh.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print(f"[FAIL] {e}", flush=True)
        raise SystemExit(1)
