# -*- coding: utf-8 -*-
"""Pull ChartView pan/scroll behavior from server /root/ailongshort."""
from __future__ import annotations

import importlib.util
import os
import sys

import paramiko

ROOT = r"d:\apps\ailongshort"
OUT_DIR = os.path.join(ROOT, "tmp-server-chart-pan")


def load_creds():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod.HOST, mod.PORT, mod.USER, mod.PASSWORD


def run(ssh: paramiko.SSHClient, cmd: str) -> bytes:
    _, stdout, stderr = ssh.exec_command(cmd, timeout=180)
    out = stdout.read()
    err = stderr.read()
    code = stdout.channel.recv_exit_status()
    if code != 0 and not out.strip():
        raise RuntimeError(f"fail({code}): {cmd}\n{err.decode('utf-8', 'replace')}")
    return out + (b"\n" + err if err.strip() else b"")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    os.makedirs(OUT_DIR, exist_ok=True)
    host, port, user, password = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"[ssh] {host}")
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    try:
        extract = r"""
python3 - <<'PY'
from pathlib import Path
import re
p = Path('/root/ailongshort/app/components/ChartView.tsx')
text = p.read_text(encoding='utf-8', errors='replace')
Path('/tmp/server_chartview_meta.txt').write_text(
  f'bytes={len(text)}\nmtime={p.stat().st_mtime}\n', encoding='utf-8'
)
# key hits
lines = text.splitlines()
keys = [
  'shiftVisibleRangeOnNewBar',
  'scrollToRealTime',
  'handleScroll',
  'pressedMouseMove',
  'fixRightEdge',
  'fixLeftEdge',
  'rightOffset',
  'lockVisibleTimeRangeOnResize',
  'applyFocusLatestBars',
  'setVisibleLogicalRange',
  'mergedDeskUserPanLock',
  'MERGED_ANALYSIS_DESK',
  'createChart(',
]
hit_lines = []
for i, line in enumerate(lines, 1):
  if any(k in line for k in keys):
    hit_lines.append(f'{i}:{line}')
Path('/tmp/server_chartview_hits.txt').write_text('\n'.join(hit_lines), encoding='utf-8')

m = re.search(r'function applyFocusLatestBars\([\s\S]*?\n\}', text)
if m:
  Path('/tmp/server_applyFocus.txt').write_text(m.group(0), encoding='utf-8')

# createChart block
m2 = re.search(r'const chart = createChart\([\s\S]{0,4500}\}\);', text)
if m2:
  Path('/tmp/server_createChart.txt').write_text(m2.group(0), encoding='utf-8')

# TF focus effect around applyFocusLatestBars calls with context
chunks = []
for m in re.finditer(r'.{0,120}applyFocusLatestBars\([\s\S]{0,220}', text):
  chunks.append(m.group(0))
  if len(chunks) >= 25:
    break
Path('/tmp/server_applyFocus_calls.txt').write_text('\n\n====\n\n'.join(chunks), encoding='utf-8')

# getChartPriceScaleLayout if present in volumeAiZoneEngine
p2 = Path('/root/ailongshort/lib/volumeAiZoneEngine.ts')
if p2.exists():
  t2 = p2.read_text(encoding='utf-8', errors='replace')
  m3 = re.search(r'export function getChartPriceScaleLayout\([\s\S]*?\n\}', t2)
  if m3:
    Path('/tmp/server_priceScaleLayout.txt').write_text(m3.group(0), encoding='utf-8')
print('ok')
PY
"""
        out = run(ssh, extract)
        print(out.decode("utf-8", "replace"))

        sftp = ssh.open_sftp()
        for remote, local_name in [
            ("/tmp/server_chartview_meta.txt", "meta.txt"),
            ("/tmp/server_chartview_hits.txt", "hits.txt"),
            ("/tmp/server_applyFocus.txt", "applyFocus.txt"),
            ("/tmp/server_createChart.txt", "createChart.txt"),
            ("/tmp/server_applyFocus_calls.txt", "applyFocus_calls.txt"),
            ("/tmp/server_priceScaleLayout.txt", "priceScaleLayout.txt"),
        ]:
            local = os.path.join(OUT_DIR, local_name)
            try:
                sftp.get(remote, local)
                print("got", local_name)
            except FileNotFoundError:
                print("skip", remote)
        sftp.close()
    finally:
        ssh.close()
    print("[done]", OUT_DIR)


if __name__ == "__main__":
    main()
