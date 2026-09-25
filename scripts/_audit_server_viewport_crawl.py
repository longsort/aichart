#!/usr/bin/env python3
"""Audit server ChartView for rightward-crawl sources."""
from __future__ import annotations

import importlib.util
import os
import sys

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("d", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    d = load()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=30)
    cmd = r"""
python3 - <<'PY'
from pathlib import Path
p = Path('/root/ailongshort/app/components/ChartView.tsx')
lines = p.read_text(encoding='utf-8', errors='replace').splitlines()
keys = [
  'applyFocusLatestBars',
  'scrollToRealTime',
  'setVisibleLogicalRange',
  'scrollToLatest',
  'shiftVisibleRangeOnNewBar',
  'preserveLr',
  '새 봉마다',
  '가시구간 유지',
  'fitContent',
  'rightBarStaysOnScroll',
]
for i, line in enumerate(lines, 1):
  if any(k in line for k in keys):
    print(f'{i}:{line[:180]}')
print('---')
print('pinAbs', sum(1 for l in lines if 'pinAbsX' in l))
print('lines', len(lines))
PY
curl -sS -m 10 -o /dev/null -w 'home=%{http_code}\n' http://127.0.0.1:3000/
"""
    _, stdout, stderr = ssh.exec_command(cmd, timeout=60)
    sys.stdout.buffer.write(stdout.read())
    err = stderr.read()
    if err.strip():
        sys.stdout.buffer.write(b"ERR " + err[:1500])
    ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
