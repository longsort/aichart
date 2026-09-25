#!/usr/bin/env python3
"""
오늘 수익패턴·무접속 자동매매 패치를 VPS /root/ailongshort 에 동기화.

자격증명 (환경변수 또는 deploy_today.py):
  VPS_HOST / VPS_USER / VPS_PASSWORD / VPS_PORT(기본22)
  REMOTE_ROOT 기본 /root/ailongshort

  python3 scripts/deploy-profit-pattern-today.py
"""
from __future__ import annotations

import importlib.util
import os
import posixpath
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FILES = [
    # profit pattern core
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
    # VPS bitgetFuturesMarket.ts(663줄) · MixOrder 미사용 — 덮어쓰지 않음
    "lib/mergedDeskServerArmClient.ts",
    "lib/eagle1Tapoint/chartSignals.ts",
    # API
    "app/api/profit-pattern/arm/route.ts",
    "app/api/profit-pattern/journal/route.ts",
    "app/api/profit-pattern/locks/route.ts",
    "app/api/cron/profit-pattern-auto/route.ts",
    # UI: VPS DeskView 이미 PP 패치됨 — 덮어쓰지 않음
    # scripts / data / env hint
    "scripts/install-profit-pattern-cron.sh",
    "scripts/smokeProfitPatternMultiCoin.ts",
    "scripts/smokeProfitPatternServerCron.ts",
    "data/eagle1/profit_pattern_journal/.gitkeep",
    "data/eagle1/profit_pattern_server_arm.json",
    ".env.example",
]


def load_creds():
    host = os.environ.get("VPS_HOST", "").strip()
    user = os.environ.get("VPS_USER", "").strip() or "root"
    password = os.environ.get("VPS_PASSWORD", "").strip()
    port = int(os.environ.get("VPS_PORT", "22") or "22")
    remote = os.environ.get("REMOTE_ROOT", "/root/ailongshort").strip()

    path = os.path.join(ROOT, "deploy_today.py")
    if os.path.isfile(path):
        spec = importlib.util.spec_from_file_location("deploy_today", path)
        mod = importlib.util.module_from_spec(spec)
        assert spec.loader
        spec.loader.exec_module(mod)
        host = host or getattr(mod, "HOST", "")
        user = getattr(mod, "USER", None) or user
        password = password or getattr(mod, "PASSWORD", "")
        port = int(getattr(mod, "PORT", port) or port)
        remote = getattr(mod, "REMOTE_ROOT", remote) or remote

    if not host or not password:
        raise SystemExit(
            "VPS_HOST / VPS_PASSWORD 필요 (또는 로컬 deploy_today.py). "
            "이 Cloud Agent 환경에는 deploy_today.py 가 없습니다."
        )
    return host, user, password, port, remote


def main() -> int:
    try:
        import paramiko
    except ImportError:
        os.system(f"{sys.executable} -m pip install -q paramiko")
        import paramiko

    host, user, password, port, remote = load_creds()
    print(f"Connecting {user}@{host}:{port} → {remote}", flush=True)
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port=port, username=user, password=password, timeout=45)
    sftp = ssh.open_sftp()

    def run(cmd: str, timeout: int = 7200) -> str:
        print(f"\n$ {cmd}", flush=True)
        _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        if out.strip():
            print(out[-12000:] if len(out) > 12000 else out, flush=True)
        if err.strip():
            print(err[-2000:], flush=True)
        code = stdout.channel.recv_exit_status()
        if code != 0:
            raise RuntimeError(f"fail({code}): {cmd}")
        return out

    try:
        for rel in FILES:
            local = os.path.join(ROOT, rel.replace("/", os.sep))
            if not os.path.isfile(local):
                print(f"SKIP missing {rel}", flush=True)
                continue
            rem = posixpath.join(remote, rel)
            run(f"mkdir -p {posixpath.dirname(rem)}")
            print(f"Uploading {rel}", flush=True)
            sftp.put(local, rem)
    finally:
        sftp.close()

    run(f"cd {remote} && mkdir -p data/eagle1/profit_pattern_journal")
    run(f"cd {remote} && npm run build")
    run("pm2 restart ailongshort --update-env")
    run("sleep 3")
    http = run('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/').strip()
    if "200" not in http:
        print(f"WARN http={http}", flush=True)
    # dry cron if secret exists on server
    run(
        f"cd {remote} && (grep -E '^(PROFIT_PATTERN_CRON_SECRET|TELEGRAM_MULTITF_CRON_SECRET)=' "
        f".env.production .env.local .env 2>/dev/null | head -1 || true)"
    )
    print("\nOK deploy profit-pattern → server sync done", flush=True)
    print("다음: 서버에서 bash scripts/install-profit-pattern-cron.sh", flush=True)
    ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
