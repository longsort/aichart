#!/usr/bin/env python3
import importlib.util, os, sys
import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("d", os.path.join(ROOT, "deploy_today.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=30)
cmd = (
    "grep -n 'applyMergedDeskTimeScalePreserveRange\\|recentUser\\|barSpacing만\\|scrollToRealTime 금지' "
    "/root/ailongshort/app/components/ChartView.tsx | sed -n '1,25p'; "
    "curl -sS -m 8 -o /dev/null -w 'home=%{http_code}\\n' http://127.0.0.1:3000/; "
    "pm2 jlist | python3 -c \"import sys,json; d=json.load(sys.stdin); print(d[0]['name'], d[0]['pm2_env']['status'])\""
)
_, o, e = ssh.exec_command(cmd, timeout=30)
sys.stdout.buffer.write(o.read())
err = e.read()
if err.strip():
    sys.stdout.buffer.write(err)
ssh.close()
