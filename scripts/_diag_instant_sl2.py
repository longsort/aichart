#!/usr/bin/env python3
from __future__ import annotations
import importlib.util, json, os
import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("d", os.path.join(ROOT, "deploy_today.py"))
mod = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(mod)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=30)

cmds = [
    "tail -n 200 /root/.pm2/logs/ailongshort-out-0.log | grep -iE 'SL=|TP=|preset|DIR_|open |LONG|SHORT|BLOCK|PASS.*Order|entry|손절|ROE|live-order' | tail -80",
    "python3 - <<'PY'\nimport json\np='/root/ailongshort/data/trade-learning.json'\ntry:\n d=json.load(open(p))\n print(type(d), list(d)[:20] if isinstance(d,dict) else len(d))\n if isinstance(d,dict):\n  for k in list(d)[:5]:\n   print(k, str(d[k])[:300])\n elif isinstance(d,list):\n  for x in d[-8:]:\n   print(json.dumps(x,ensure_ascii=False)[:400])\nexcept Exception as e:\n print('err',e)\nPY",
    "cat /root/ailongshort/data/auto-trade-arm/aichart1.json",
    "tail -n 30 /root/ailongshort/data/auto-scalp-paper/aichart1_BTCUSDT.jsonl 2>/dev/null",
    "python3 - <<'PY'\nimport json\np='/root/ailongshort/data/trade-event-journal.json'\ntry:\n d=json.load(open(p))\n items=d if isinstance(d,list) else d.get('events') or d.get('items') or []\n print('n',len(items))\n for x in items[-15:]:\n  print(json.dumps(x,ensure_ascii=False)[:450])\nexcept Exception as e:\n print('err',e)\nPY",
]
for c in cmds:
    print("==== CMD", flush=True)
    _, o, e = ssh.exec_command(c, timeout=120)
    out = o.read().decode("utf-8", "replace")
    print(out[-7000:], flush=True)
ssh.close()
