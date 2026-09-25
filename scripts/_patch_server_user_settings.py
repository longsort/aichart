#!/usr/bin/env python3
"""Patch /root/ailongshort/data/user-settings.json — MTF+telegram shared phone/PC."""
from __future__ import annotations

import importlib.util
import json
import os
import sys

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def out(s: str) -> None:
    sys.stdout.buffer.write((s + "\n").encode("utf-8", errors="replace"))
    sys.stdout.buffer.flush()


def load_creds():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("d", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    d = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=30)
    py = r"""
import json
from pathlib import Path
p = Path('/root/ailongshort/data/user-settings.json')
if not p.exists():
    print('[settings] no file')
else:
    data = json.loads(p.read_text(encoding='utf-8'))
    keys = {
        'chartMergedDeskMtfDumpZoneEnabled': True,
        'chartMergedDeskMtfDumpDisplayMode': 'mtf',
        'telegramMergedDeskAutoEnabled': True,
        'telegramZoneTouchAlertEnabled': True,
        'telegramPrecisionTouchEnabled': True,
        'telegramMoneyEntryTouchEnabled': True,
        'telegramMergedDeskUiCaptureEnabled': True,
        'telegramConfirmChartImageEnabled': True,
        'telegramMultiTfTimeframes': ['15m', '1h', '4h', '1d', '1w', '1M'],
    }
    if any(isinstance(v, dict) for v in data.values()):
        for user, st in data.items():
            if isinstance(st, dict):
                st.update(keys)
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        print('[settings] patched per-user', list(data.keys()))
    else:
        data.update(keys)
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        print('[settings] patched root')
"""
    _, stdout, _ = ssh.exec_command(f"python3 - <<'PY'\n{py}\nPY")
    out(stdout.read().decode("utf-8", errors="replace"))
    ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
