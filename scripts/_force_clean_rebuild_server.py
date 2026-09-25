#!/usr/bin/env python3
"""Force clean rebuild on server — sources already synced; bust stale .next."""
from __future__ import annotations

import importlib.util
import os
import sys
import time

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE = "/root/ailongshort"

# 폭락 MTF 관련 + 차트 코어 (로컬=서버 소스 재확인 후 덮어쓰기)
FILES = [
    "lib/mergedDeskMtfDumpZoneBridge.ts",
    "lib/mergedDeskMtfDumpZoneRegistry.ts",
    "lib/mergedDeskChartOnlyUi.ts",
    "app/components/mergedAnalysis/MergedAnalysisDeskView.tsx",
    "app/components/mergedAnalysis/MergedAnalysisDesk.module.css",
    "app/globals.css",
    "app/page.tsx",
    "app/HomePageContent.tsx",
    "app/components/ChartView.tsx",
]


def out(s: str) -> None:
    sys.stdout.buffer.write((s + "\n").encode("utf-8", errors="replace"))
    sys.stdout.buffer.flush()


def load_creds():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 7200) -> str:
    out("$ " + cmd)
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    chunks: list[str] = []
    while True:
        if stdout.channel.recv_ready():
            data = stdout.channel.recv(65536).decode("utf-8", errors="replace")
            chunks.append(data)
            sys.stdout.buffer.write(data.encode("utf-8", errors="replace"))
            sys.stdout.buffer.flush()
        if stdout.channel.exit_status_ready() and not stdout.channel.recv_ready():
            break
        time.sleep(0.05)
    rest = stdout.read().decode("utf-8", errors="replace")
    if rest:
        chunks.append(rest)
        sys.stdout.buffer.write(rest.encode("utf-8", errors="replace"))
        sys.stdout.buffer.flush()
    err = stderr.read().decode("utf-8", "replace")
    if err.strip():
        out(err.strip())
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail {code}: {cmd}")
    return "".join(chunks)


def main() -> int:
    d = load_creds()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    out(f"[ssh] {d.HOST}")
    ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=30)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            local = os.path.join(ROOT, rel.replace("/", os.sep))
            if not os.path.isfile(local):
                out(f"[skip] {rel}")
                continue
            remote = f"{REMOTE}/{rel}"
            run(ssh, f"mkdir -p '{os.path.dirname(remote)}'")
            out(f"[put] {rel}")
            sftp.put(local, remote)

        # 완전 클린 빌드 — 옛 청크/캐시 제거
        run(
            ssh,
            f"cd {REMOTE} && rm -rf .next && "
            f"rm -rf node_modules/.cache 2>/dev/null; true",
        )
        run(ssh, f"cd {REMOTE} && npm run build", timeout=7200)
        # 빌드 산출물에 최신 마커 존재 확인
        run(
            ssh,
            f"cd {REMOTE} && "
            r"grep -R -l 'forceSwingDumpZone\|visualDumpMid\|merged-desk-mtf-dump-tf-1d' "
            r".next/static/chunks .next/server 2>/dev/null | head -8 || "
            r"grep -R -l '1일 폭락' .next/static/chunks 2>/dev/null | head -5",
        )
        run(
            ssh,
            f"cd {REMOTE} && pm2 delete ailongshort 2>/dev/null || true; "
            f"pm2 start ecosystem.config.cjs && pm2 save",
        )
        run(
            ssh,
            "sleep 3; curl -sf -o /dev/null -w 'home=%{http_code}\\n' "
            "http://127.0.0.1:3000/; "
            "curl -sf http://127.0.0.1:3000/ | head -c 400; echo; "
            "cat .next/BUILD_ID; echo; pm2 list | sed -n '1,12p'",
            timeout=60,
        )
        out("[done] clean rebuild sync OK — hard refresh phone (캐시삭제)")
    finally:
        sftp.close()
        ssh.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        out(f"[FAIL] {e}")
        raise SystemExit(1)
