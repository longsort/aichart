# -*- coding: utf-8 -*-
import importlib.util, time
from pathlib import Path
import paramiko

p = Path(r"d:\apps\ailongshort\deploy_today.py")
s = importlib.util.spec_from_file_location("d", p)
m = importlib.util.module_from_spec(s)
s.loader.exec_module(m)
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(m.HOST, port=m.PORT, username=m.USER, password=m.PASSWORD, timeout=30)
time.sleep(3)
_, o, _ = c.exec_command('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/', timeout=30)
print("http", o.read().decode(), flush=True)
_, o2, _ = c.exec_command("pm2 list | sed -n '1,8p'", timeout=30)
print(o2.read().decode("utf-8", "replace"), flush=True)
c.close()
