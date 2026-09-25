#!/usr/bin/env python3
import importlib.util, os, sys
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
    "grep -n '도구OFF' /root/ailongshort/app/components/mergedAnalysis/MergedAnalysisDeskView.tsx | sed -n '1,5p'",
    "grep -n 'mobileToolsOpen || fsActive' /root/ailongshort/app/components/mergedAnalysis/MergedAnalysisDeskView.tsx | sed -n '1,5p' || echo 'no_auto_fs_tools_ok'",
    "grep -c appendAvwapUserPin /root/ailongshort/app/components/ChartView.tsx",
    "grep -c chartMergedDeskAvwapUserPins /root/ailongshort/lib/settings.ts",
]
for c in cmds:
    _, o, _ = ssh.exec_command(c, timeout=60)
    sys.stdout.buffer.write(o.read())
    sys.stdout.buffer.write(b"\n")
ssh.close()
