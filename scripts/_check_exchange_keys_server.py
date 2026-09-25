# -*- coding: utf-8 -*-
import importlib.util
from pathlib import Path
import paramiko

p = Path(r"d:\apps\ailongshort\deploy_today.py")
s = importlib.util.spec_from_file_location("d", p)
m = importlib.util.module_from_spec(s)
s.loader.exec_module(m)
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(m.HOST, port=m.PORT, username=m.USER, password=m.PASSWORD, timeout=20)
cmds = [
    "grep -E 'EXCHANGE|APP_SESSION|ENCRYPTION|KEYS' /root/ailongshort/.env.local 2>/dev/null | sed 's/=.*/=***/' | head -40",
    "curl -s -w '\\nHTTP:%{http_code}' -X POST http://127.0.0.1:3000/api/merged-desk/exchange-keys -H 'Content-Type: application/json' -d '{}'",
    "pm2 logs ailongshort --lines 30 --nostream 2>/dev/null | tail -35",
]
for cmd in cmds:
    print("===", cmd[:70], flush=True)
    _, o, e = c.exec_command(cmd, timeout=90)
    print(o.read().decode("utf-8", "replace")[-3500:], flush=True)
    err = e.read().decode("utf-8", "replace")
    if err.strip():
        print("ERR", err[-800:], flush=True)
c.close()
