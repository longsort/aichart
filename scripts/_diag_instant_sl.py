#!/usr/bin/env python3
from __future__ import annotations
import importlib.util, os, sys
import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("d", os.path.join(ROOT, "deploy_today.py"))
mod = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(mod)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=30)

cmds = [
    "ls -lt /root/.pm2/logs/ | head -20",
    "grep -E 'presetStop|DIR_SL|ORDER|SL=|open LONG|open SHORT|BLOCK|손절|ROE' /root/.pm2/logs/ailongshort-out.log 2>/dev/null | tail -80",
    "tail -n 40 /root/.pm2/logs/ailongshort-error.log 2>/dev/null",
    "ls -lt /root/ailongshort/data/ | head -30",
    "find /root/ailongshort/data -type f -mtime -1 2>/dev/null | head -40",
]
for c in cmds:
    print("====", c[:70], flush=True)
    _, o, e = ssh.exec_command(c, timeout=90)
    print(o.read().decode("utf-8", "replace")[-6000:], flush=True)
ssh.close()
