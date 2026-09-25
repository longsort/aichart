#!/usr/bin/env python3
from __future__ import annotations
import importlib.util, os, posixpath, sys
import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [
    "lib/mergedDeskRbScalpDriveTrade.ts",
    "lib/mergedDeskCoinTradeProgress.ts",
    "app/components/mergedAnalysis/MergedDeskCoinTradeProgressStrip.tsx",
]

def main():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("d", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    remote = getattr(mod, "REMOTE_ROOT", "/root/ailongshort")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=30)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            rem = posixpath.join(remote, rel)
            _, so, _ = ssh.exec_command(f"mkdir -p {posixpath.dirname(rem)}")
            so.channel.recv_exit_status()
            print("Uploading", rel, flush=True)
            sftp.put(os.path.join(ROOT, rel.replace("/", os.sep)), rem)
    finally:
        sftp.close()

    def run(cmd, t=7200):
        print("$", cmd, flush=True)
        _, o, e = ssh.exec_command(cmd, get_pty=True, timeout=t)
        out = o.read().decode("utf-8", "replace")
        print(out[-8000:].encode("cp949", "replace").decode("cp949", "replace") if out else "", flush=True)
        if o.channel.recv_exit_status() != 0:
            raise RuntimeError(cmd)

    run(f"cd {remote} && npm run build")
    run("pm2 restart ailongshort --update-env")
    run("sleep 3")
    run('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/')
    run(f"grep -n rbScalpPlaceFastOk {remote}/lib/mergedDeskRbScalpDriveTrade.ts | head -2")
    print("OK", flush=True)
    ssh.close()

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("ERROR", e, file=sys.stderr)
        sys.exit(1)
