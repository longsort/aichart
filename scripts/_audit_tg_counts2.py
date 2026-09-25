#!/usr/bin/env python3
import importlib.util, os, sys
import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("d", os.path.join(ROOT, "deploy_today.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=30)
cmd = r"""
python3 - <<'PY'
from pathlib import Path
import re, collections
p=Path('/var/log/ailongshort-tg.log')
print('tglog_exists', p.exists(), 'bytes', p.stat().st_size if p.exists() else 0)
text=p.read_text(encoding='utf-8', errors='replace') if p.exists() else ''
# also pm2 out
outs=[]
for f in Path('/root/.pm2/logs').glob('ailongshort-out*.log'):
  outs.append(f.read_text(encoding='utf-8', errors='replace')[-800000:])
blob='\n'.join(outs)+'\n'+text
kinds=collections.Counter(re.findall(r"\[telegram-([a-z0-9-]+)\] sent", blob))
dump=collections.Counter(re.findall(r"kind: '(dump|precision-e|vol-burst-[12])'", blob))
tfs=collections.Counter(re.findall(r"timeframe: '([^']+)'", blob))
print('sent_by_runner', dict(kinds))
print('precision_kinds', dict(dump))
print('timeframes_sample', dict(tfs.most_common(20)))
print('errors', len(re.findall(r'telegram.*(fail|error|401|503)', blob, re.I)))
PY
grep -n "MERGED_DESK_SHARED_TELEGRAM_TFS" -A20 /root/ailongshort/lib/mergedDeskSharedTfFeatures.ts | head -30
"""
_, o, e = ssh.exec_command(cmd, timeout=60)
sys.stdout.buffer.write(o.read())
sys.stdout.buffer.write(e.read())
ssh.close()
