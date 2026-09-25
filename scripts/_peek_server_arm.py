#!/usr/bin/env python3
from __future__ import annotations
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
cmd = r"""python3 <<'PY'
import json, time, glob
for f in sorted(glob.glob("/root/ailongshort/data/auto-trade-arm/*.json")):
    if f.endswith(".fired.json") or "exit-phase" in f:
        continue
    d = json.load(open(f))
    tick = d.get("lastTickAt")
    age = int((time.time()*1000 - tick)/1000) if tick else None
    chips = ",".join(x.replace("USDT","") for x in (d.get("enabledSymbols") or []))
    print("file", f)
    print("liveArmed", d.get("liveArmed"))
    print("tapOnly", d.get("tapOnly"))
    print("chips", chips)
    print("tickAgeSec", age)
    print("status", d.get("lastStatusKo") or "")
    print("lev", d.get("leverage"), "tpRoe", d.get("scalpTp1RoePct"))
    print("---")
PY"""
_, o, e = ssh.exec_command(cmd)
print(o.read().decode("utf-8", errors="replace"))
err = e.read().decode("utf-8", errors="replace")
if err.strip():
    print(err)
ssh.close()
