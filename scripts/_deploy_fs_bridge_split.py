#!/usr/bin/env python3
"""Fix setupSourceBridge fs client-bundle warning."""
from __future__ import annotations

import importlib.util
import os
import posixpath
import sys
import time

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [
    "lib/eagle1Tapoint/setupSourceBridge.ts",
    "lib/eagle1Tapoint/setupSourceBridge.server.ts",
    "lib/eagle1Tapoint/index.ts",
    "lib/mergedDeskServerAutoTradeRunner.ts",
    "app/api/eagle1/tapoint-decide/route.ts",
]


def main() -> None:
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    remote = getattr(mod, "REMOTE_ROOT", "/root/ailongshort")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting {mod.HOST} ...", flush=True)
    ssh.connect(
        mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=30
    )
    sftp = ssh.open_sftp()

    def ensure_remote_dir(rem_file: str) -> None:
        d = posixpath.dirname(rem_file)
        parts = d.strip("/").split("/")
        cur = ""
        for p in parts:
            cur = f"{cur}/{p}" if cur else f"/{p}"
            try:
                sftp.stat(cur)
            except OSError:
                try:
                    sftp.mkdir(cur)
                except OSError:
                    pass

    try:
        for rel in FILES:
            local = os.path.join(ROOT, rel.replace("/", os.sep))
            rem = posixpath.join(remote, rel)
            ensure_remote_dir(rem)
            print(f"Uploading {rel}", flush=True)
            sftp.put(local, rem)
    finally:
        sftp.close()

    def run(cmd: str, timeout: int = 7200) -> str:
        print(f"\n$ {cmd}", flush=True)
        _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        safe = lambda s: s.encode("cp949", errors="replace").decode(
            "cp949", errors="replace"
        )
        if out.strip():
            print(safe(out[-5000:] if len(out) > 5000 else out), flush=True)
        if err.strip():
            print(safe(err[-800:] if len(err) > 800 else err), flush=True)
        code = stdout.channel.recv_exit_status()
        if code != 0:
            raise RuntimeError(f"fail({code}) {cmd}")
        return out

    run(f"cd {remote} && npm run build", timeout=7200)
    run(
        "pm2 restart ailongshort --update-env || pm2 restart all --update-env",
        timeout=120,
    )
    time.sleep(4)
    _, o, _ = ssh.exec_command(
        "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/"
    )
    code = o.read().decode().strip()
    ssh.close()
    print(f"home={code}", flush=True)
    if code != "200":
        raise RuntimeError(f"home={code}")
    print("FS_BRIDGE_SPLIT deploy OK", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"FAIL: {e}", flush=True)
        sys.exit(1)
