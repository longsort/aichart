#!/usr/bin/env python3
from __future__ import annotations
import importlib.util, os, posixpath, sys, time
import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [
    "lib/mergedDeskCoinSkillRisk.ts",
    "lib/serverCoinSkillRiskStore.ts",
    "app/api/merged-desk/coin-skill-risk/route.ts",
    "lib/mergedDeskUnifiedAnalysisEntry.ts",
    "lib/mergedDeskServerAutoTradeRunner.ts",
    "app/components/mergedAnalysis/MergedDeskAutoTradePanel.tsx",
    "app/components/mergedAnalysis/MergedAnalysisDesk.module.css",
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
        def ensure_remote_dir(rem_file: str) -> None:
            d = posixpath.dirname(rem_file)
            parts = d.strip("/").split("/")
            cur = ""
            for p in parts:
                cur = f"{cur}/{p}" if cur else f"/{p}"
                try:
                    sftp.stat(cur)
                except OSError:
                    try:
                        sftp.mkdir(cur)
                    except OSError:
                        pass

        for rel in FILES:
            local = os.path.join(ROOT, rel.replace("/", os.sep))
            rem = posixpath.join(remote, rel)
            ensure_remote_dir(rem)
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
            print(safe(out[-4000:] if len(out) > 4000 else out), flush=True)
        if err.strip():
            print(safe(err[-800:]), flush=True)
        if stdout.channel.recv_exit_status() != 0:
            raise RuntimeError(f"fail {cmd}")

    run(f"cd {remote} && npm run build", timeout=7200)
    run("pm2 restart ailongshort --update-env || pm2 restart all --update-env", timeout=120)
    time.sleep(3)
    _, o, _ = ssh.exec_command("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/")
    print("home=" + o.read().decode().strip(), flush=True)
    run(
        f"grep -n 'coin-skill-risk\\|skillRisk\\|resolveCoinSkillRiskForSymbol\\|스킬비중' "
        f"{remote}/lib/mergedDeskCoinSkillRisk.ts "
        f"{remote}/lib/mergedDeskServerAutoTradeRunner.ts "
        f"{remote}/app/api/merged-desk/coin-skill-risk/route.ts "
        f"| sed -n '1,25p'"
    )
    print("coin skill risk OK", flush=True)
    ssh.close()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"FAIL: {e}", flush=True)
        sys.exit(1)
