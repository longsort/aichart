#!/usr/bin/env python3
import importlib.util
import os
import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("d", os.path.join(ROOT, "deploy_today.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=30)
cmd = r"""
cd /root/ailongshort
echo BUILD=$(cat .next/BUILD_ID)
echo '--- css class ---'
grep -a -c 'mtf-dump-tf-1d' .next/static/css/*.css || true
grep -a -c 'merged-desk-mtf-dump-zone' .next/static/css/*.css || true
echo '--- source ---'
grep -c 'visualDumpMid' lib/mergedDeskMtfDumpZoneBridge.ts || true
grep -c 'forceSwingDumpZone' lib/mergedDeskMtfDumpZoneBridge.ts || true
echo '--- js string ---'
grep -a -R -l 'mtf-dump-tf-1d' .next/static/chunks 2>/dev/null | head -5 || true
grep -a -R -c 'dump-tf-1d' .next/static/chunks/*.js 2>/dev/null | grep -v ':0$' | head -8 || true
"""
_, stdout, stderr = ssh.exec_command(cmd, timeout=120)
print(stdout.read().decode("utf-8", "replace"))
err = stderr.read().decode("utf-8", "replace")
if err.strip():
    print("ERR", err[:400])
ssh.close()
