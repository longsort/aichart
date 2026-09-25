#!/usr/bin/env python3
"""Deploy AIZONE Tier-S (BTC/SOL/XRP) to /root/ailongshort + build + pm2 + verify."""
from __future__ import annotations

import importlib.util
import os
import posixpath
import sys

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE_DIR = "/root/ailongshort"

FILES = [
    "lib/mergedDeskUnifiedAnalysisEntry.ts",
    "lib/mergedDeskServerAutoTradeRunner.ts",
    "lib/mergedDeskCoinScoreBoard.ts",
    "lib/mergedDeskAiZoneDriveTrade.ts",
    "lib/mergedDeskAiZoneFeeGate.ts",
    "lib/mergedDeskAiZoneEntryGate.ts",
    "lib/mergedDeskAiZoneEvidenceGate.ts",
    "lib/mergedDeskAiZoneSnapshot.ts",
    "lib/mergedDeskCoinTradeLedger.ts",
    "lib/mergedDeskAutoTradeConfig.ts",
    "lib/mergedDeskHedgeEntry.ts",
    "lib/mergedDeskAutoTradeRunner.ts",
    "lib/mergedDeskVirtualTradeSession.ts",
    "app/components/mergedAnalysis/MergedAnalysisDeskView.tsx",
    "app/components/mergedAnalysis/MergedDeskAutoTradePanel.tsx",
]


def load_creds():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod.HOST, mod.PORT, mod.USER, mod.PASSWORD, getattr(mod, "REMOTE_ROOT", REMOTE_DIR)


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 7200) -> str:
    print(f"\n$ {cmd}", flush=True)
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")

    def safe(s: str) -> str:
        return s.encode("cp949", errors="replace").decode("cp949", errors="replace")

    if out.strip():
        chunk = out[-14000:] if len(out) > 14000 else out
        print(safe(chunk), flush=True)
    if err.strip():
        print(safe(err[-3000:]), flush=True)
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail {code}: {cmd}")
    return out


def main() -> int:
    host, port, user, password, remote_root = load_creds()
    files = list(dict.fromkeys(FILES))
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting {host} -> {remote_root} ...", flush=True)
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    sftp = ssh.open_sftp()
    try:
        for rel in files:
            local = os.path.join(ROOT, rel.replace("/", os.sep))
            if not os.path.exists(local):
                raise FileNotFoundError(local)
            remote = posixpath.join(remote_root, rel)
            run(ssh, f"mkdir -p {posixpath.dirname(remote)}")
            print(f"Uploading {rel}", flush=True)
            sftp.put(local, remote)

        run(ssh, f"cd {remote_root} && npm run build", timeout=7200)
        run(ssh, "pm2 restart ailongshort --update-env")
        # give next a moment
        run(ssh, "sleep 3")
        run(ssh, "pm2 list | sed -n '1,14p'")
        run(ssh, "pm2 show ailongshort | sed -n '1,40p'")

        http = run(
            ssh, 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/'
        ).strip()
        if "200" not in http:
            raise RuntimeError(f"health not 200: {http!r}")

        # remote source smoke: markers must exist
        checks = [
            (
                f"grep -n \"srcName !== 'ai-zone'\" {remote_root}/lib/mergedDeskUnifiedAnalysisEntry.ts | head -3",
                "ai-zone",
            ),
            (
                f"grep -n \"startsWith('BTC')\" {remote_root}/lib/mergedDeskAiZoneDriveTrade.ts | head -3",
                "BTC",
            ),
            (
                f"grep -n \"BTCUSDT\" {remote_root}/lib/mergedDeskAutoTradeConfig.ts | head -5",
                "BTCUSDT",
            ),
            (
                f"grep -n \"HEDGE_ENTRY_GLOBALLY_DISABLED\" {remote_root}/lib/mergedDeskHedgeEntry.ts | head -2",
                "HEDGE",
            ),
            (
                f"grep -n \"return \\[\\]\" {remote_root}/lib/mergedDeskServerAutoTradeRunner.ts | head -3",
                "server collect empty",
            ),
        ]
        for cmd, label in checks:
            out = run(ssh, cmd)
            if not out.strip():
                raise RuntimeError(f"verify miss: {label}")

        # pm2 must be online
        jlist = run(ssh, "pm2 jlist")
        if '"status":"online"' not in jlist.replace(" ", "") and '"status": "online"' not in jlist:
            # softer check
            if "online" not in jlist:
                raise RuntimeError("pm2 not online")

        print("\n[done] Tier-S AIZONE deployed + verified on /root/ailongshort", flush=True)
        print(f"[ok] http={http.strip()} host={host}", flush=True)
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
