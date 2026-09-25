#!/usr/bin/env python3
"""P2 MACRO/Liquidity/Battle Zone deploy."""
from __future__ import annotations
import importlib.util, os, posixpath, sys
import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [
    "lib/eagle1Tapoint/CHECKLIST.md",
    "lib/eagle1Tapoint/types.ts",
    "lib/eagle1Tapoint/scores.ts",
    "lib/eagle1Tapoint/requiredGate.ts",
    "lib/eagle1Tapoint/orchestrator.ts",
    "lib/eagle1Tapoint/briefing.ts",
    "lib/eagle1Tapoint/entryStateMachine.ts",
    "lib/eagle1Tapoint/index.ts",
    "lib/eagle1Tapoint/sessionCloseKst.ts",
    "lib/eagle1Tapoint/pdhPdlLevels.ts",
    "lib/eagle1Tapoint/macroFrames.ts",
    "lib/eagle1Tapoint/liquidityMap.ts",
    "lib/eagle1Tapoint/battleZoneEngine.ts",
    "lib/eagle1Tapoint/regimeMap.ts",
    "lib/eagle1Tapoint/htfCandleLoader.ts",
    "app/api/eagle1/tapoint-decide/route.ts",
    "lib/mergedDeskServerAutoTradeRunner.ts",
]

def main():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    remote = getattr(mod, "REMOTE_ROOT", "/root/ailongshort")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting {mod.HOST} ...", flush=True)
    ssh.connect(mod.HOST, port=mod.PORT, username=mod.USER, password=mod.PASSWORD, timeout=30)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            local = os.path.join(ROOT, rel.replace("/", os.sep))
            rem = posixpath.join(remote, rel)
            _, so, _ = ssh.exec_command(f"mkdir -p {posixpath.dirname(rem)}")
            so.channel.recv_exit_status()
            print(f"Uploading {rel}", flush=True)
            sftp.put(local, rem)
    finally:
        sftp.close()

    def run(cmd, timeout=7200):
        print(f"\n$ {cmd}", flush=True)
        _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        safe = lambda s: s.encode("cp949", errors="replace").decode("cp949", errors="replace")
        if out.strip():
            print(safe(out[-12000:] if len(out) > 12000 else out), flush=True)
        if err.strip():
            print(safe(err[-2000:]), flush=True)
        if stdout.channel.recv_exit_status() != 0:
            raise RuntimeError(f"fail {cmd}")
        return out

    run(f"cd {remote} && npm run build", timeout=7200)
    run("pm2 restart ailongshort --update-env || pm2 restart all --update-env", timeout=120)
    run("curl -s -o /dev/null -w 'home=%{http_code}\\n' http://127.0.0.1:3000/", timeout=60)
    ssh.close()
    print("P2 deploy OK", flush=True)

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"FAIL: {e}", flush=True)
        sys.exit(1)
