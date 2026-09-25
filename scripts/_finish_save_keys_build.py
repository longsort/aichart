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
c.connect(m.HOST, port=m.PORT, username=m.USER, password=m.PASSWORD, timeout=30)

def run(cmd, timeout=7200):
    print("$", cmd[:100], flush=True)
    _, stdout, stderr = c.exec_command(cmd, get_pty=True, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    safe = out[-6000:].encode("ascii", "replace").decode("ascii")
    print(safe, flush=True)
    print("exit", code, flush=True)
    return code

# panel already uploaded; finish build+restart
code = run(f"cd {m.REMOTE_ROOT} && npm run build", 7200)
if code == 0:
    run("pm2 restart ailongshort --update-env", 120)
    run('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/', 30)
    print("[done]", flush=True)
else:
    print("[FAIL] build", flush=True)
c.close()
