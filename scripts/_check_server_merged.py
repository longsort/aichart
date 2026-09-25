#!/usr/bin/env python3
"""Quick VPS health check for merged desk."""
from __future__ import annotations

import importlib.util
import os
import sys

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_creds():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod.HOST, mod.PORT, mod.USER, mod.PASSWORD


def main() -> int:
    host, port, user, password = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    cmds = [
        "pm2 jlist | python3 -c \"import sys,json; d=json.load(sys.stdin);\\n[print(p.get('name'), p.get('pm2_env',{}).get('status'), p.get('pm2_env',{}).get('pm_uptime')) for p in d]\"",
        "curl -s -o /dev/null -w 'home=%{http_code}\\n' http://127.0.0.1:3000/",
        "curl -s -o /dev/null -w 'api_market=%{http_code}\\n' 'http://127.0.0.1:3000/api/market?symbol=BTCUSDT&timeframe=1h&depth=recent'",
        "curl -s -o /dev/null -w 'api_analyze=%{http_code}\\n' 'http://127.0.0.1:3000/api/analyze?symbol=BTCUSDT&timeframe=15m&collect=0'",
        "grep -n chartMergedDeskAnchoredVwap /root/ailongshort/lib/settings.ts | head -8 || echo no_avwap_settings",
        "test -f /root/ailongshort/lib/mergedDeskAnchoredVwap.ts && echo avwap_lib_ok || echo no_avwap_lib",
        "grep -n 'AVWAP\\|Anchored VWAP\\|buildMergedDeskAnchoredVwapDualPack' /root/ailongshort/app/components/ChartView.tsx | head -15 || echo no_avwap_chartview",
        "pm2 logs ailongshort --lines 25 --nostream 2>&1 | sed -n '1,80p'",
    ]
    for c in cmds:
        print("====", c[:100].encode("ascii", "replace").decode("ascii"))
        _, stdout, stderr = ssh.exec_command(c, timeout=90)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        sys.stdout.buffer.write(out.encode("utf-8", "replace"))
        sys.stdout.buffer.write(b"\n")
        if err.strip():
            sys.stdout.buffer.write(("ERR: " + err[:800] + "\n").encode("utf-8", "replace"))
        sys.stdout.buffer.flush()
    ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
