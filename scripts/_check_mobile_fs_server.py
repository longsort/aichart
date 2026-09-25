# -*- coding: utf-8 -*-
import importlib.util
import os
import paramiko

p = os.path.join(r"d:\apps\ailongshort", "deploy_today.py")
spec = importlib.util.spec_from_file_location("d", p)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=20)

checks = [
    "grep -c 'merged-desk-mobile-fs' /root/ailongshort/app/globals.css",
    "grep -c 'eagle1-chart-fs-active' /root/ailongshort/app/globals.css",
    "grep -n 'mergedChartColMobileFs' /root/ailongshort/app/components/mergedAnalysis/MergedAnalysisDesk.module.css | sed -n '1,8p'",
    "grep -c 'ResizeObserver' /root/ailongshort/app/components/ChartView.tsx",
    "test -f /root/ailongshort/scripts/_deploy_mobile_fs_fill.py && echo deploy_script=yes || echo deploy_script=no",
]
for c in checks:
    _, stdout, stderr = ssh.exec_command(c)
    out = stdout.read().decode("utf-8", "replace").strip()
    err = stderr.read().decode("utf-8", "replace").strip()
    print(f"$ {c}")
    print(out or err or "(empty)")
    print()
ssh.close()
