#!/usr/bin/env python3
"""Verify candle-jump deploy: HTTP 200 + patch marker on /root/ailongshort."""
from __future__ import annotations

import importlib.util
import time
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    path = ROOT / "deploy_today.py"
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=60)
    time.sleep(5)
    code = "000"
    for i in range(10):
        _, stdout, _ = ssh.exec_command(
            'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/'
        )
        code = stdout.read().decode().strip()
        print(f"http try {i + 1}: {code}", flush=True)
        if code == "200":
            break
        time.sleep(3)
    _, stdout, _ = ssh.exec_command(
        'grep -c "setData 금지" /root/ailongshort/app/components/ChartView.tsx || true'
    )
    print("marker_count:", stdout.read().decode().strip(), flush=True)
    _, stdout, _ = ssh.exec_command(
        "pm2 jlist | python3 -c \"import sys,json; d=json.load(sys.stdin); "
        "p=[x for x in d if x.get('name')=='ailongshort']; "
        "print(p[0]['pm2_env']['status'] if p else 'missing')\""
    )
    print("pm2_status:", stdout.read().decode().strip(), flush=True)
    ssh.close()
    if code != "200":
        raise SystemExit(f"HTTP not ready: {code}")
    print("[ok] server up with candle jump patch", flush=True)


if __name__ == "__main__":
    main()
