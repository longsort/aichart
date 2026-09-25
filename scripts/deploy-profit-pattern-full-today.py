#!/usr/bin/env python3
"""Redeploy ALL today's profit-pattern patches to VPS (merge-safe)."""
from __future__ import annotations

import hashlib
import os
import posixpath
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Full PP day patch set. Skip only VPS-authoritative market stack.
FILES = [
    "lib/profitPattern15m/skill.ts",
    "lib/profitPattern15m/paperPolicy.ts",
    "lib/profitPattern15m/costMath.ts",
    "lib/profitPattern15m/features.ts",
    "lib/profitPattern15m/liveSignal.ts",
    "lib/profitPattern15m/dayCap.ts",
    "lib/profitPattern15m/lockedLevels.ts",
    "lib/profitPattern15m/tradeJournal.ts",
    "lib/profitPattern15m/chartLines.ts",
    "lib/profitPattern15m/autoEntry.ts",
    "lib/profitPattern15m/serverArm.ts",
    "lib/profitPattern15m/serverPersist.ts",
    "lib/profitPattern15m/serverRunner.ts",
    "lib/profitPattern15m/index.ts",
    "lib/mergedDeskServerArmClient.ts",
    "lib/eagle1Tapoint/chartSignals.ts",
    "app/api/profit-pattern/arm/route.ts",
    "app/api/profit-pattern/journal/route.ts",
    "app/api/profit-pattern/locks/route.ts",
    "app/api/cron/profit-pattern-auto/route.ts",
    "app/components/eagle1Tapoint/Eagle1TapointDeskView.tsx",
    "scripts/install-profit-pattern-cron.sh",
    "scripts/smokeProfitPatternMultiCoin.ts",
    "scripts/smokeProfitPatternServerCron.ts",
    "data/eagle1/profit_pattern_journal/.gitkeep",
    "data/eagle1/profit_pattern_server_arm.json",
    ".env.example",
]


def main() -> int:
    try:
        import paramiko
    except ImportError:
        os.system(f"{sys.executable} -m pip install -q paramiko")
        import paramiko

    host = os.environ.get("VPS_HOST", "167.179.119.140").strip()
    user = os.environ.get("VPS_USER", "root").strip() or "root"
    password = os.environ.get("VPS_PASSWORD", "").strip()
    port = int(os.environ.get("VPS_PORT", "22") or "22")
    remote = os.environ.get("REMOTE_ROOT", "/root/ailongshort").strip()
    if not password:
        raise SystemExit("VPS_PASSWORD required")

    print(f"Connecting {user}@{host}:{port} → {remote}", flush=True)
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port=port, username=user, password=password, timeout=45)
    sftp = ssh.open_sftp()

    def run(cmd: str, timeout: int = 900) -> str:
        print(f"\n$ {cmd}", flush=True)
        _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
        out = stdout.read().decode("utf-8", errors="replace")
        code = stdout.channel.recv_exit_status()
        print(out[-10000:] if len(out) > 10000 else out, flush=True)
        if code != 0:
            raise RuntimeError(f"fail({code}): {cmd}")
        return out

    uploaded = 0
    skipped = 0
    try:
        for rel in FILES:
            local = os.path.join(ROOT, rel.replace("/", os.sep))
            if not os.path.isfile(local):
                print(f"SKIP missing {rel}", flush=True)
                skipped += 1
                continue
            rem = posixpath.join(remote, rel)
            run(f"mkdir -p {posixpath.dirname(rem)}")
            # skip identical
            lh = hashlib.md5(open(local, "rb").read()).hexdigest()
            try:
                with sftp.open(rem, "rb") as rf:
                    rh = hashlib.md5(rf.read()).hexdigest()
                if lh == rh:
                    print(f"SAME {rel}", flush=True)
                    skipped += 1
                    continue
            except Exception:
                pass
            print(f"Uploading {rel}", flush=True)
            sftp.put(local, rem)
            uploaded += 1
    finally:
        sftp.close()

    print(f"\nuploaded={uploaded} skipped_same_or_missing={skipped}", flush=True)
    run(f"cd {remote} && mkdir -p data/eagle1/profit_pattern_journal")
    run(f"cd {remote} && npm run build", timeout=900)
    run("pm2 restart ailongshort --update-env")
    run("sleep 5")
    http = run('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/').strip()
    print("HTTP", http, flush=True)
    run(
        f"cd {remote} && set -a && . ./.env.local && set +a && "
        f"bash scripts/install-profit-pattern-cron.sh"
    )
    run(
        f"cd {remote} && set -a && . ./.env.local && set +a && "
        f'curl -sS -X POST -H "Authorization: Bearer ${{PROFIT_PATTERN_CRON_SECRET}}" '
        f'"http://127.0.0.1:3000/api/cron/profit-pattern-auto?dry=1" | head -c 2500; echo'
    )
    run("test -f /root/ailongshort/.next/BUILD_ID && echo BUILD=$(cat /root/ailongshort/.next/BUILD_ID)")
    run("crontab -l | grep profit-pattern || true")
    print("\nOK full profit-pattern day patch deploy done", flush=True)
    ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
