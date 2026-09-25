#!/usr/bin/env python3
import importlib.util, os, time
import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = os.path.join(ROOT, "deploy_today.py")
spec = importlib.util.spec_from_file_location("deploy_today", path)
mod = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(mod)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=30)
time.sleep(4)
code = "000"
for i in range(10):
    _, o, _ = ssh.exec_command(
        "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/"
    )
    code = o.read().decode().strip()
    print(f"try {i+1} home={code}", flush=True)
    if code == "200":
        break
    time.sleep(3)

_, o, _ = ssh.exec_command(
    "grep -n buildTapMacroFrames /root/ailongshort/lib/eagle1Tapoint/orchestrator.ts | head -5"
)
print(o.read().decode(), flush=True)
_, o, _ = ssh.exec_command(
    "test -f /root/ailongshort/lib/eagle1Tapoint/battleZoneEngine.ts && echo battle=OK"
)
print(o.read().decode(), flush=True)
ssh.close()
if code != "200":
    raise SystemExit(f"home not ready: {code}")
print("P2 verify OK", flush=True)
