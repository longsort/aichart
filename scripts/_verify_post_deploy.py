#!/usr/bin/env python3
"""Post-deploy verify: home/API status + AVWAP presence (no secrets)."""
from __future__ import annotations

import importlib.util
import os
import sys

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_creds():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("d", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    d = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=30)
    cmds = [
        "pm2 jlist | python3 -c \"import sys,json;d=json.load(sys.stdin);print([(p.get('name'),p.get('pm2_env',{}).get('status')) for p in d])\"",
        "curl -s -o /dev/null -w 'home=%{http_code}\\n' http://127.0.0.1:3000/",
        "curl -s -o /dev/null -w 'api_market=%{http_code}\\n' 'http://127.0.0.1:3000/api/market?symbol=BTCUSDT&timeframe=1h&depth=recent'",
        "curl -s 'http://127.0.0.1:3000/api/market?symbol=BTCUSDT&timeframe=1h&depth=recent' | head -c 180; echo",
        "curl -s -o /dev/null -w 'api_analyze=%{http_code}\\n' 'http://127.0.0.1:3000/api/analyze?symbol=BTCUSDT&timeframe=15m&collect=0'",
        "grep -c chartMergedDeskAnchoredVwapEnabled /root/ailongshort/lib/settings.ts || echo 0",
        "grep -c buildMergedDeskAnchoredVwapDualPack /root/ailongshort/app/components/ChartView.tsx || echo 0",
        "test -f /root/ailongshort/lib/mergedDeskAnchoredVwap.ts && echo avwap_ok",
        "python3 - <<'PY'\nfrom pathlib import Path\np=Path('/root/ailongshort/.env.local')\nok=False\nfor line in p.read_text(encoding='utf-8',errors='replace').splitlines():\n s=line.strip()\n if s.startswith('APP_SESSION_SECRET=') and len(s.split('=',1)[1].strip())>20: ok=True\nprint('app_session_secret_configured', 'YES' if ok else 'NO')\nPY",
    ]
    for c in cmds:
        _, stdout, stderr = ssh.exec_command(c, timeout=90)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        sys.stdout.buffer.write((out + ("\n" if not out.endswith("\n") else "")).encode("utf-8", "replace"))
        if err.strip() and "Warning" not in err:
            sys.stdout.buffer.write(("ERR:" + err[:300] + "\n").encode())
        sys.stdout.buffer.flush()
    ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
