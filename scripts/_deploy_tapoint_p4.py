#!/usr/bin/env python3
"""P4 SFP/Breakout/Corr/Missed/Paper deploy."""
from __future__ import annotations
import importlib.util, os, posixpath, sys, time
import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [
    "lib/eagle1Tapoint/CHECKLIST.md",
    "lib/eagle1Tapoint/types.ts",
    "lib/eagle1Tapoint/requiredGate.ts",
    "lib/eagle1Tapoint/entryStateMachine.ts",
    "lib/eagle1Tapoint/orchestrator.ts",
    "lib/eagle1Tapoint/briefing.ts",
    "lib/eagle1Tapoint/index.ts",
    "lib/eagle1Tapoint/sfpQualityTap.ts",
    "lib/eagle1Tapoint/breakoutStrategyTap.ts",
    "lib/eagle1Tapoint/correlationClusterTap.ts",
    "lib/eagle1Tapoint/rejectLedgerWire.ts",
    "lib/eagle1Tapoint/paperLiveGateTap.ts",
    "lib/eagle1Tapoint/backtestSuiteTap.ts",
    "lib/eagle1Tapoint/overfitGuardTap.ts",
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
            print(safe(out[-8000:] if len(out) > 8000 else out), flush=True)
        if err.strip():
            print(safe(err[-1200:]), flush=True)
        if stdout.channel.recv_exit_status() != 0:
            raise RuntimeError(f"fail {cmd}")
        return out

    run(f"cd {remote} && npm run build", timeout=7200)
    run("pm2 restart ailongshort --update-env || pm2 restart all --update-env", timeout=120)
    time.sleep(5)
    code = "000"
    for i in range(10):
        _, o, _ = ssh.exec_command(
            "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/"
        )
        code = o.read().decode().strip()
        print(f"home try {i+1}={code}", flush=True)
        if code == "200":
            break
        time.sleep(3)
    if code != "200":
        raise RuntimeError(f"home={code}")
    _, o, _ = ssh.exec_command(
        f"grep -n buildTapSfpQuality {remote}/lib/eagle1Tapoint/orchestrator.ts | head -3"
    )
    print(o.read().decode(), flush=True)
    ssh.close()
    print("P4 deploy OK", flush=True)

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"FAIL: {e}", flush=True)
        sys.exit(1)
