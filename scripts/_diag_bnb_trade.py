#!/usr/bin/env python3
from __future__ import annotations
import importlib.util, json, os
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
    "cat /root/ailongshort/data/auto-trade-arm/aichart1.json",
    "grep -n 'BNB_PPL\\|scanBnbPpl\\|bnb-ppl\\|BNBUSDT' /root/ailongshort/lib/mergedDeskServerAutoTradeRunner.ts | head -25",
    "ls /root/ailongshort/app/api/merged-desk/ | grep bnb",
    "tail -n 200 /root/.pm2/logs/ailongshort-out-0.log | grep -iE 'BNB|bnb-ppl|BNBPPL|PPL' | tail -40",
]
for c in cmds:
    print("====", flush=True)
    _, o, e = ssh.exec_command(c, timeout=60)
    print(o.read().decode("utf-8", "replace")[-5000:], flush=True)
ssh.close()
