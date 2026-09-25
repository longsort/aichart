#!/usr/bin/env python3
from __future__ import annotations
import importlib.util, os, sys
import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=30)
    cmd = (
        "curl -s -w '\\nHTTP=%{http_code}\\nLEN=%{size_download}\\n' "
        "'http://127.0.0.1:3000/api/eagle1/tapoint-decide?symbol=BTCUSDT&timeframe=3m' "
        "| python3 -c \"import sys; d=sys.stdin.read(); print(d[:1200])\""
    )
    _, so, se = ssh.exec_command(cmd, timeout=120)
    print(so.read().decode("utf-8", "replace"))
    err = se.read().decode("utf-8", "replace")
    if err.strip():
        print("STDERR", err[:400])
    ssh.close()
    return 0

if __name__ == "__main__":
    sys.exit(main())
