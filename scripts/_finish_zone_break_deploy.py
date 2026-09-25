# -*- coding: utf-8 -*-
from __future__ import annotations
import importlib.util
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


def run(cmd: str, timeout: int = 7200) -> int:
    print(f"$ {cmd}", flush=True)
    _, o, e = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    out = (o.read() + e.read()).decode("utf-8", errors="replace")
    code = o.channel.recv_exit_status()
    print(out[-5000:].encode("ascii", errors="replace").decode("ascii"), flush=True)
    print(f"EXIT {code}", flush=True)
    return code


c1 = run(f"cd {mod.REMOTE_ROOT} && npm run build")
if c1 == 0:
    run("pm2 restart ailongshort")
    run('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/')
ssh.close()
raise SystemExit(0 if c1 == 0 else 1)
