#!/usr/bin/env python3
from __future__ import annotations
import importlib.util, json, os, sys
import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=30)
    pairs = [
        ("BTCUSDT", "3m"),
        ("ETHUSDT", "5m"),
        ("SOLUSDT", "15m"),
        ("XRPUSDT", "1H"),
        ("BNBUSDT", "1m"),
    ]
    for s, t in pairs:
        cmd = f"curl -s 'http://127.0.0.1:3000/api/eagle1/tapoint-decide?symbol={s}&timeframe={t}'"
        _, so, _ = ssh.exec_command(cmd, timeout=120)
        raw = so.read().decode("utf-8", "replace")
        try:
            j = json.loads(raw)
            r = j.get("report") or {}
            sw = r.get("sweepLive") or {}
            gate = r.get("gate") or {}
            fails = ",".join((gate.get("failReasons") or [])[:3])
            reason = (r.get("reasonOneLineKo") or "")[:80]
            print(
                f"{s} {t} dec={r.get('decision')} dir={r.get('direction')} "
                f"entry={r.get('entry')} gateOk={gate.get('ok')} fail=[{fails}] "
                f"sweep={sw.get('fired')}/{sw.get('direction')}/align={sw.get('alignsWithDir')} "
                f"exec={r.get('execKind')} scoreE={((r.get('scores') or {}).get('entry'))} :: {reason}"
            )
        except Exception as e:
            print(s, "PARSE", e, raw[:160])

    _, so, _ = ssh.exec_command(
        "python3 - <<'PY'\n"
        "import json,glob,os\n"
        "files=sorted(glob.glob('/root/ailongshort/data/auto-trade-arm/*.json'))\n"
        "print('arm_files', len(files))\n"
        "for f in files[:3]:\n"
        "  if f.endswith('.fired.json'): continue\n"
        "  try:\n"
        "    j=json.load(open(f))\n"
        "    print(os.path.basename(f), 'armed', j.get('liveArmed'), 'tapOnly', j.get('tapOnly'), 'syms', j.get('enabledSymbols'), 'lev', j.get('leverage'), 'tp', j.get('scalpTp1RoePct'))\n"
        "  except Exception as e:\n"
        "    print(f, e)\n"
        "PY"
    )
    print(so.read().decode("utf-8", "replace"))
    ssh.close()
    return 0

if __name__ == "__main__":
    sys.exit(main())
