#!/usr/bin/env python3
"""Pull trade-event-journal from server and summarize."""
from __future__ import annotations

import importlib.util
import json
import os
import sys
from collections import Counter
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_deploy():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("d", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    import paramiko

    d = load_deploy()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=30)

    cmds = [
        "ls -la /root/ailongshort/data/trade-event-journal.json",
        "find /root/ailongshort /tmp /root -maxdepth 4 -name 'trade-journal-BTCUSDT*' 2>/dev/null | head -20",
        "wc -c /root/ailongshort/data/trade-event-journal.json",
    ]
    for c in cmds:
        print("$", c)
        _, stdout, stderr = ssh.exec_command(c, timeout=60)
        print(stdout.read().decode("utf-8", "replace"))
        err = stderr.read().decode("utf-8", "replace").strip()
        if err:
            print(err[:500])

    sftp = ssh.open_sftp()
    local = os.path.join(ROOT, "tmp-trade-event-journal-server.json")
    try:
        sftp.get("/root/ailongshort/data/trade-event-journal.json", local)
        print("[saved]", local)
    except Exception as e:
        print("[no server journal]", e)
        local = None
    finally:
        sftp.close()
        ssh.close()

    if not local or not os.path.isfile(local):
        return 1

    with open(local, "r", encoding="utf-8") as f:
        store = json.load(f)

    print("users:", list(store.keys()))
    for user, blob in store.items():
        events = blob.get("events") or []
        print(f"\n=== user={user} updatedAt={blob.get('updatedAt')} count={len(events)} ===")
        kinds = Counter(e.get("kind") for e in events)
        print("kinds:", dict(kinds.most_common(20)))
        # recent 15 by at
        recent = sorted(events, key=lambda e: e.get("at") or 0, reverse=True)[:15]
        for e in recent:
            at = e.get("at") or 0
            ts = datetime.fromtimestamp(at / 1000, tz=timezone.utc).isoformat() if at else "?"
            print(
                f"- {ts} {e.get('kind')} {e.get('direction')} px={e.get('price')} "
                f"lvl={e.get('levelPrice')} {e.get('levelLabel')} | {str(e.get('noteKo') or '')[:60]}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
