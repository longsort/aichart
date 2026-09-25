#!/usr/bin/env python3
from __future__ import annotations
import importlib.util, os, posixpath, sys
import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [
    "lib/mergedDeskCoinTradeProgress.ts",
    "lib/mergedDeskBtcSignalRace.ts",
    "lib/mergedDeskBtcRocketCartSignal.ts",
    "lib/mergedDeskDualBgRaceEntry.ts",
    "lib/mergedDeskUnifiedAnalysisEntry.ts",
    "lib/mergedDeskAiZoneFeeGate.ts",
    "app/components/mergedAnalysis/MergedDeskCoinTradeProgressStrip.tsx",
    "app/components/mergedAnalysis/MergedAnalysisDesk.module.css",
    "app/components/mergedAnalysis/MergedAnalysisDeskView.tsx",
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
            print(safe(out[-9000:] if len(out) > 9000 else out), flush=True)
        if err.strip():
            print(safe(err[-1500:]), flush=True)
        if stdout.channel.recv_exit_status() != 0:
            raise RuntimeError(f"fail {cmd}")
        return out

    run(f"cd {remote} && npm run build")
    run("pm2 restart ailongshort --update-env")
    run("sleep 3")
    http = run('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/').strip()
    if "200" not in http:
        raise RuntimeError(http)
    run(f"grep -n 'signalPassN\\|tickDualBgRaceEntries\\|Dual {{' {remote}/lib/mergedDeskDualBgRaceEntry.ts | head -5")
    run(f"grep -n 'coinProgressFracSig\\|grid-template-columns: repeat(4' {remote}/app/components/mergedAnalysis/MergedAnalysisDesk.module.css | head -5")
    run(f"grep -n 'tickDualBgRaceEntries\\|Dual레이스' {remote}/app/components/mergedAnalysis/MergedDeskCoinTradeProgressStrip.tsx {remote}/app/components/mergedAnalysis/MergedAnalysisDeskView.tsx | head -8")
    print("\nOK sep-gauge race-entry deploy", flush=True)
    ssh.close()
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
