#!/usr/bin/env python3
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


def run(ssh, cmd: str) -> str:
    _, stdout, stderr = ssh.exec_command(cmd, timeout=120)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    sys.stdout.buffer.write(("\n$ " + cmd + "\n").encode())
    sys.stdout.buffer.write(out.encode("utf-8", "replace"))
    if err.strip():
        sys.stdout.buffer.write(("ERR: " + err[:1000] + "\n").encode("utf-8", "replace"))
    sys.stdout.buffer.flush()
    return out


def main() -> int:
    host, port, user, password = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port=port, username=user, password=password, timeout=30)

    run(ssh, "pm2 describe ailongshort | sed -n '1,40p'")
    run(
        ssh,
        "cd /root/ailongshort && (test -f .env.local && echo HAS_ENV || echo NO_ENV); "
        "grep -E '^(APP_SESSION_SECRET|INTERNAL_ANALYZE_SECRET|TELEGRAM_MULTITF_CRON_SECRET)=' .env.local 2>/dev/null | sed 's/=.*/=***set***/' || true",
    )
    run(
        ssh,
        "curl -sS 'http://127.0.0.1:3000/api/market?symbol=BTCUSDT&timeframe=1h&depth=recent' | head -c 400; echo",
    )
    run(
        ssh,
        "curl -sS 'http://127.0.0.1:3000/api/analyze?symbol=BTCUSDT&timeframe=15m&collect=0' | head -c 400; echo",
    )
    run(
        ssh,
        "grep -n 'resolveAppSessionSecret\\|APP_SESSION_SECRET' /root/ailongshort/lib/serverRouteGuard.ts /root/ailongshort/middleware.ts 2>/dev/null | head -30 || echo no_guard",
    )
    run(
        ssh,
        "grep -n chartMergedDeskAnchoredVwapEnabled /root/ailongshort/lib/settings.ts | head -5 || echo no_avwap_settings",
    )
    run(
        ssh,
        "grep -c buildMergedDeskAnchoredVwapDualPack /root/ailongshort/app/components/ChartView.tsx || echo 0",
    )
    ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
