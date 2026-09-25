# -*- coding: utf-8 -*-
import importlib.util
import time
from pathlib import Path
import paramiko

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("d", ROOT / "deploy_today.py")
mod = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(mod)
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=30)
for i in range(8):
    time.sleep(3)
    _, o, _ = ssh.exec_command(
        'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/', timeout=20
    )
    code = o.read().decode("utf-8", errors="replace").strip()
    print(f"try{i+1}={code}", flush=True)
    if code == "200":
        break
ssh.close()
