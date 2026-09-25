# -*- coding: utf-8 -*-
"""Upload deps that merged-desk build needs, then rebuild + pm2."""
from __future__ import annotations

import importlib.util
import os
import posixpath
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    "lib/doksuri1/fourStrategyCandidateLog.ts",
    "lib/doksuri1/bnbSfpYearReplay.ts",
    "lib/doksuri1/btc3mRocketYearReplay.ts",
    "lib/doksuri1/ethDumpYearReplay.ts",
    "lib/doksuri1/xrpFourStrategyYearReplay.ts",
    "lib/doksuri1/coinYearReplayShared.ts",
    "lib/doksuri1/bitgetApiAudit.ts",
    "lib/doksuri1/fourStrategyDetect.ts",
    "lib/doksuri1/fourStrategyTypes.ts",
    "lib/mtfStructureRocket.ts",
    "lib/bitgetFuturesCsv.ts",
    "lib/data/dataService.ts",
    "lib/data/collectors/bitgetFuturesFillsCollector.ts",
    "lib/visibleInterval.ts",
    "lib/chartPerfBudget.ts",
    "lib/clientMarketCandleCache.ts",
]


def load_creds():
    path = ROOT / "deploy_today.py"
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod.HOST, mod.PORT, mod.USER, mod.PASSWORD, mod.REMOTE_ROOT


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


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 7200) -> None:
    print(f"\n$ {cmd}", flush=True)
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if out.strip():
        chunk = out[-14000:] if len(out) > 14000 else out
        print(chunk.encode("cp949", errors="replace").decode("cp949", errors="replace"), flush=True)
    if err.strip():
        print(err[-3000:].encode("cp949", errors="replace").decode("cp949", errors="replace"), flush=True)
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail {code}: {cmd}")


def main() -> int:
    host, port, user, password, remote_root = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting {host}...", flush=True)
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            local = ROOT / rel.replace("/", os.sep)
            if not local.is_file():
                print(f"MISSING {rel}", flush=True)
                continue
            remote = posixpath.join(remote_root, rel)
            sftp_mkdirs(sftp, posixpath.dirname(remote))
            sftp.put(str(local), remote)
            print(f"Uploaded {rel}", flush=True)
        print("Building...", flush=True)
        run(ssh, f"cd {remote_root} && npm run build", timeout=7200)
        run(ssh, "pm2 restart ailongshort --update-env")
        run(ssh, "pm2 list | sed -n '1,12p'")
        run(ssh, 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/')
        print(f"\n[done] build fix → {remote_root}", flush=True)
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
