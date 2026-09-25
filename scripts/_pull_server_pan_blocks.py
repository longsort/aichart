# -*- coding: utf-8 -*-
from __future__ import annotations
import importlib.util, os, sys, paramiko

ROOT = r"d:\apps\ailongshort"
OUT = os.path.join(ROOT, "tmp-server-chart-pan")

def creds():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod.HOST, mod.PORT, mod.USER, mod.PASSWORD

def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    host, port, user, password = creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    cmd = r"""
python3 - <<'PY'
from pathlib import Path
p = Path('/root/ailongshort/app/components/ChartView.tsx')
lines = p.read_text(encoding='utf-8', errors='replace').splitlines()
# dump ranges
ranges = [
  (3630, 3650),
  (4185, 4225),
  (13040, 13090),
  (13420, 13480),
  (17940, 18010),
]
chunks = []
for a,b in ranges:
  chunks.append(f'===== {a}-{b}')
  for i in range(a-1, min(b, len(lines))):
    chunks.append(f'{i+1}:{lines[i]}')
Path('/tmp/server_pan_blocks.txt').write_text('\n'.join(chunks), encoding='utf-8')

# price scale layout full
p2 = Path('/root/ailongshort/lib/volumeAiZoneEngine.ts')
t2 = p2.read_text(encoding='utf-8', errors='replace')
start = t2.find('export function getChartPriceScaleLayout')
end = t2.find('export function getVolumePanelLayout')
Path('/tmp/server_priceScaleLayout_full.txt').write_text(t2[start:end], encoding='utf-8')
print('ok', len(lines))
PY
"""
    _, stdout, stderr = ssh.exec_command(cmd, timeout=120)
    print(stdout.read().decode("utf-8", "replace"))
    print(stderr.read().decode("utf-8", "replace"))
    sftp = ssh.open_sftp()
    for remote, name in [
        ("/tmp/server_pan_blocks.txt", "pan_blocks.txt"),
        ("/tmp/server_priceScaleLayout_full.txt", "priceScaleLayout_full.txt"),
    ]:
        sftp.get(remote, os.path.join(OUT, name))
        print("got", name)
    sftp.close()
    ssh.close()

if __name__ == "__main__":
    main()
