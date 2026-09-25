#!/usr/bin/env python3
import importlib.util, json, os, paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("d", os.path.join(ROOT, "deploy_today.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=30)

def hit(url: str, timeout: int = 180):
    cmd = f"curl -sS -m {timeout} '{url}'"
    _, o, e = ssh.exec_command(cmd, timeout=timeout + 30)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    print("URL", url)
    if err.strip():
        print("ERR", err[:300])
    try:
        d = json.loads(out)
        print("keys", list(d.keys())[:15])
        print("ok", d.get("ok"), "error", d.get("error"))
        st = d.get("stats")
        if isinstance(st, dict):
            print("eventCount", st.get("eventCount"), "sampleLowTrust", st.get("sampleLowTrust"))
        print("statsAttached", d.get("statsAttached"), "sampleLowTrust", d.get("sampleLowTrust"))
        pack = d.get("pack")
        if isinstance(pack, dict):
            print("packKeys", list(pack.keys())[:12], "clusters", len(pack.get("clusters") or []))
    except Exception as ex:
        print("parse fail", ex, "raw", out[:400])
    print("---")

hit("http://127.0.0.1:3000/api/ai-market-zone-stats?symbol=BTCUSDT&timeframe=4h&rebuild=1", 180)
hit("http://127.0.0.1:3000/api/ai-market-zone?symbol=BTCUSDT&timeframe=4h", 90)
ssh.close()
