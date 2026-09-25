# -*- coding: utf-8 -*-
from __future__ import annotations
import importlib.util
from pathlib import Path
import paramiko

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("d", ROOT / "deploy_today.py")
mod = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(mod)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=30)
cmds = [
    r'test -d /root/ailongshort/app/\(wms\) && echo WMS_APP_EXISTS || echo WMS_APP_MISSING',
    r'test -d /root/ailongshort/components/wms && echo WMS_COMP_EXISTS || echo WMS_COMP_MISSING',
    r'test -f /root/ailongshort/lib/utils/cn.ts && echo CN_EXISTS || echo CN_MISSING',
    r"grep -E 'lucide-react|clsx|tailwind-merge|prisma' /root/ailongshort/package.json || echo NO_WMS_DEPS",
]
for cmd in cmds:
    _, o, e = ssh.exec_command(cmd, timeout=30)
    out = (o.read() + e.read()).decode("utf-8", errors="replace").strip()
    print(f"{cmd}\n  -> {out}\n")
ssh.close()
