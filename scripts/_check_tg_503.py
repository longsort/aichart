#!/usr/bin/env python3
import importlib.util, os, sys, time
import paramiko
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("d", os.path.join(ROOT, "deploy_today.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=30)

def run(cmd, t=130):
    print("\n===", cmd[:100])
    _, o, e = ssh.exec_command(cmd, timeout=t)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    print(out)
    if err.strip():
        print("ERR:", err[:800])

run("curl -s -o /dev/null -w 'home=%{http_code}\\n' http://127.0.0.1:3000/")
run("bash -lc 'cd /root/ailongshort && set -a && [ -f .env.production ] && source .env.production; source .env.local; set +a; curl -sS -m 180 -w \"\\ncode=%{http_code}\\n\" -H \"Authorization: Bearer ${TELEGRAM_MULTITF_CRON_SECRET}\" http://127.0.0.1:3000/api/cron/telegram-auto-alert' | tail -c 1200")
run("pm2 logs ailongshort --nostream --lines 25 2>/dev/null | tail -20")
ssh.close()
