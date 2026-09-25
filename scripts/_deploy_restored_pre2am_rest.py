# -*- coding: utf-8 -*-
"""Deploy remaining restored pre-2AM files."""
from __future__ import annotations

import importlib.util
import os
import posixpath

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [
    "lib/mergedAnalysisDeskEngine.ts",
    "lib/mergedDeskChannelMoneyEdge.ts",
    "lib/mergedDeskWavePathCatalog.ts",
    "lib/mergedDeskSharedChartView.ts",
    "app/components/mergedAnalysis/MergedAnalysisDeskView.tsx",
]


def load_creds():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod.HOST, mod.PORT, mod.USER, mod.PASSWORD, mod.REMOTE_ROOT


def run(ssh, cmd, timeout=7200):
    print(f"\n$ {cmd}", flush=True)
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if out.strip():
        print(out[-6000:], flush=True)
    if err.strip():
        print(err[-1500:], flush=True)
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail {code}: {cmd}")


def main():
    host, port, user, password, remote_root = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            local = os.path.join(ROOT, rel.replace("/", os.sep))
            remote = posixpath.join(remote_root, rel)
            print(f"Uploading {rel}", flush=True)
            sftp.put(local, remote)
        run(ssh, f"cd {remote_root} && npm run build", timeout=7200)
        run(ssh, "pm2 restart ailongshort")
        run(ssh, 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/')
        print("\n[done] remaining pre-2am files deployed", flush=True)
    finally:
        sftp.close()
        ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
