#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import os
import sys

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def out(s: str) -> None:
    sys.stdout.buffer.write((s + "\n").encode("utf-8", errors="replace"))
    sys.stdout.buffer.flush()


def main() -> int:
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=30)
    cmds = [
        "ls -l --time-style=long-iso /root/ailongshort/app/components/ChartView.tsx /root/ailongshort/app/globals.css /root/ailongshort/lib/mergedDeskMirageStyleDraw.ts",
        "cd /root/ailongshort && (git log -8 --format='%h %ci %s' || echo NOGIT)",
        "ls -ld /tmp/*ailongshort* /tmp/*.tgz 2>/dev/null || echo NOTMP",
        "ls -ld /root/ailongshort.bak /root/ailongshort-* /root/*.tgz 2>/dev/null || echo NOBAK",
        "grep -n OVERLAY_ZONE_FILL_BEHIND_CHART /root/ailongshort/app/components/ChartView.tsx | head",
        "grep -n 'candleAnalysisLikeUi' /root/ailongshort/app/components/ChartView.tsx | head",
    ]
    try:
        for c in cmds:
            out("==== " + c)
            _, stdout, stderr = ssh.exec_command(c, timeout=45)
            out(stdout.read().decode("utf-8", errors="replace"))
            err = stderr.read().decode("utf-8", errors="replace").strip()
            if err:
                out("ERR " + err[:500])
    finally:
        ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
