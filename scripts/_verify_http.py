#!/usr/bin/env python3
import importlib.util
import time
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("dt", ROOT / "deploy_today.py")
mod = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(mod)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=60)
time.sleep(10)
cmd = "pm2 jlist | head -c 400; echo; curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/; echo"
_, stdout, _ = ssh.exec_command(cmd, get_pty=True, timeout=60)
print(stdout.read().decode("utf-8", errors="replace"))
ssh.close()
