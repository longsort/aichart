#!/usr/bin/env python3
from __future__ import annotations
import importlib.util, os, sys
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

    def run(cmd: str) -> str:
        _, so, se = ssh.exec_command(cmd, timeout=90)
        out = so.read().decode("utf-8", "replace")
        err = se.read().decode("utf-8", "replace")
        return out + (("\nERR " + err) if err.strip() else "")

    print(
        run(
            "grep -n 'tapOnly\\|scanTapointServer' /root/ailongshort/lib/mergedDeskServerAutoTradeRunner.ts | sed -n '1,25p'"
        )
    )
    print(
        run(
            "python3 -c \"import json,os; j=json.load(open('/root/ailongshort/data/auto-trade-arm/aichart1.json')); "
            "print('ARM', {k:j.get(k) for k in ['liveArmed','tapOnly','enabledSymbols','leverage','scalpTp1RoePct','strategyScalp','updatedAt','lastStatusKo']}); "
            "f='/root/ailongshort/data/auto-trade-arm/aichart1.fired.json'; "
            "print('fired_exists', os.path.exists(f)); "
            "x=json.load(open(f)) if os.path.exists(f) else None; "
            "print('fired_tail', (list(x.keys())[-25:] if isinstance(x,dict) else (x[-25:] if isinstance(x,list) else x)))\""
        )
    )
    ssh.close()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print("FAIL", e)
        sys.exit(1)
