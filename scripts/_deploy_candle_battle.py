#!/usr/bin/env python3
"""Deploy REAL CANDLE BATTLE engine to /root/ailongshort only."""
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
    "lib/candleBattle/types.ts",
    "lib/candleBattle/buildPack.ts",
    "lib/candleBattle/index.ts",
    "lib/settings.ts",
    "lib/mergedAnalysisOverlayIds.ts",
    "lib/mergedAnalysisOverlayTimes.ts",
    "lib/mergedAnalysisDeskEngine.ts",
    "types/index.ts",
    "app/api/analyze/route.ts",
    "app/components/ChartView.tsx",
    "app/components/mergedAnalysis/CandleBattlePhaseStrip.tsx",
    "app/components/mergedAnalysis/CandleBattlePanes.tsx",
    "app/components/mergedAnalysis/MergedAnalysisDeskView.tsx",
    "app/components/mergedAnalysis/MergedAnalysisDesk.module.css",
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
    host, port, user, password = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            local = os.path.join(ROOT, rel.replace("/", os.sep))
            if not os.path.isfile(local):
                raise FileNotFoundError(local)
            remote = posixpath.join(REMOTE, rel)
            run(ssh, f"mkdir -p {posixpath.dirname(remote)}")
            out(f"[put] {rel}")
            sftp.put(local, remote)
        run(
            ssh,
            f"grep -n 'candleBattle\\|buildCandleBattlePack\\|캔들전투' "
            f"{REMOTE}/app/components/mergedAnalysis/MergedAnalysisDeskView.tsx | head -8",
        )
        run(ssh, f"cd {REMOTE} && rm -rf .next && npm run build", timeout=7200)
        run(ssh, "pm2 restart ailongshort")
        run(ssh, "sleep 2; curl -sf -o /dev/null -w 'home=%{http_code}\\n' http://127.0.0.1:3000/")
        out("[done] REAL CANDLE BATTLE -> /root/ailongshort")
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
