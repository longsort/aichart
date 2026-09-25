# -*- coding: utf-8 -*-
"""Check remote server still has BPR entry OFF."""
import importlib.util
from pathlib import Path
import paramiko

p = Path(r"d:\apps\ailongshort\deploy_today.py")
s = importlib.util.spec_from_file_location("d", p)
m = importlib.util.module_from_spec(s)
s.loader.exec_module(m)
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(m.HOST, port=m.PORT, username=m.USER, password=m.PASSWORD, timeout=20)
cmd = r"""
echo '=== server runner bpr ==='
grep -n 'bpr\|BPR' /root/ailongshort/lib/mergedDeskServerAutoTradeRunner.ts | head -20
echo '=== unified entry bpr ==='
grep -n 'bpr-retest\|BPR재터치' /root/ailongshort/lib/mergedDeskUnifiedAnalysisEntry.ts | head -20
echo '=== deskview bpr ==='
grep -n 'bpr-retest\|bpr-retest-scan' /root/ailongshort/app/components/mergedAnalysis/MergedAnalysisDeskView.tsx | head -20
echo '=== built chunk mention ==='
grep -Rnl 'bpr-retest-scan' /root/ailongshort/.next/server 2>/dev/null | head -5
echo '=== recent logs ==='
pm2 logs ailongshort --lines 80 --nostream 2>/dev/null | grep -iE 'bpr|BPR|ETH.*진입|ORDER' | tail -25
"""
_, o, e = c.exec_command(cmd, timeout=90)
print(o.read().decode("utf-8", "replace"))
c.close()
