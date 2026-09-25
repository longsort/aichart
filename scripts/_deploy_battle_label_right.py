#!/usr/bin/env python3
"""Battle/FVG/Breaker zone labels → right, above shared dump fills."""
from __future__ import annotations

import importlib.util
import os
import posixpath
import sys

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [
    "app/components/eagle1Tapoint/TapointCleanChart.tsx",
    "lib/eagle1Tapoint/chartSignals.ts",
    "lib/eagle1Tapoint/battleZoneEngine.ts",
    "lib/eagle1Tapoint/buildTapointSharedMergedLayers.ts",
    "lib/eagle1Tapoint/applyTapointBattleZoneStyle.ts",
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
            print(safe(out[-6000:] if len(out) > 6000 else out), flush=True)
        if err.strip():
            print(safe(err[-1000:] if len(err) > 1000 else err), flush=True)
        code = stdout.channel.recv_exit_status()
        if code != 0:
            raise RuntimeError(f"fail({code}) {cmd}")
        return out

    run(f"cd {remote} && npm run build", timeout=7200)
    run(
        f"cd {remote} && (pm2 restart ailongshort || pm2 restart all || true)",
        timeout=120,
    )
    ssh.close()
    print("OK battle-label-right deployed", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"FAIL: {e}", file=sys.stderr, flush=True)
        sys.exit(1)
