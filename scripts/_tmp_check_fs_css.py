#!/usr/bin/env python3
import importlib.util
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("d", os.path.join(ROOT, "deploy_today.py"))
m = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(m)
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(m.HOST, port=m.PORT, username=m.USER, password=m.PASSWORD, timeout=30)
cmd = (
    "grep -n 'mergedChartWrap:not\\|62dvh\\|max-height: none !important' "
    "/root/ailongshort/app/components/mergedAnalysis/MergedAnalysisDesk.module.css "
    "| head -n 50"
)
_, o, _ = ssh.exec_command(cmd)
print(o.read().decode())
ssh.close()
