#!/usr/bin/env python3
from __future__ import annotations
import importlib.util, os, posixpath, sys, time
import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [
    "app/api/merged-desk/server-arm/route.ts",
    "lib/mergedDeskServerArmClient.ts",
    "app/components/eagle1Tapoint/Eagle1TapointDeskView.tsx",
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
            print(safe(out[-3500:] if len(out) > 3500 else out), flush=True)
        if err.strip():
            print(safe(err[-500:]), flush=True)
        if stdout.channel.recv_exit_status() != 0:
            raise RuntimeError(f"fail {cmd}")

    run(f"cd {remote} && npm run build", timeout=7200)
    run("pm2 restart ailongshort --update-env || pm2 restart all --update-env", timeout=120)
    time.sleep(4)
    _, o, _ = ssh.exec_command("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/")
    print("home=" + o.read().decode().strip(), flush=True)
    # peek arm files if any
    _, o2, _ = ssh.exec_command(
        f"ls -la {remote}/data/auto-trade-arm 2>/dev/null | head -20; "
        f"for f in {remote}/data/auto-trade-arm/*.json; do "
        f"[ -f \"$f\" ] && echo \"=== $f\" && python3 -c "
        f"\"import json;d=json.load(open('$f'));"
        f"print('liveArmed',d.get('liveArmed'),'tapOnly',d.get('tapOnly'),"
        f"'tick',d.get('lastTickAt'),'status', (d.get('lastStatusKo') or '')[:80])\"; done"
    )
    print(o2.read().decode("utf-8", errors="replace")[-2500:], flush=True)
    ssh.close()
    print("server-arm-health OK", flush=True)

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"FAIL: {e}", flush=True)
        sys.exit(1)
