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


def main() -> int:
    host, port, user, password = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    _, o, _ = ssh.exec_command(
        "curl -sf -o /dev/null -w home=%{http_code} http://127.0.0.1:3000/; echo; "
        "pm2 jlist | python3 -c \"import sys,json; d=json.load(sys.stdin); a=d[0]; "
        "print(a['name'], a['pm2_env']['status'], 'restarts', a['pm2_env'].get('restart_time',0))\""
    )
    sys.stdout.buffer.write(o.read())
    ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
