#!/usr/bin/env python3
"""Deploy Doksuri risk/emoji briefing + desk bleed layout to /root/ailongshort."""
from __future__ import annotations

import importlib.util
import os
import sys
import time

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE = "/root/ailongshort"
FILES = [
    "lib/doksuri1/riskBriefing.ts",
    "lib/doksuri1/marketStory.ts",
    "lib/doksuri1/buildDoksuri1Pack.ts",
    "lib/doksuri1/telegramBridge.ts",
    "lib/doksuri1/factBuilder.ts",
    "lib/doksuri1/bigMoneyFlow.ts",
    "lib/doksuri1/nextBattle.ts",
    "lib/doksuri1/dualPlanBuilder.ts",
    "lib/doksuri1/whaleFetchServer.ts",
    "lib/telegramMergedDeskAutoRunner.ts",
    "lib/settings.ts",
    "app/HomePageContent.tsx",
    "app/globals.css",
    "app/components/eagle1/Eagle1AiHud.module.css",
    "app/components/mergedAnalysis/MergedAnalysisDesk.module.css",
    "app/components/mergedAnalysis/MergedAnalysisDeskView.tsx",
]


def out(s: str) -> None:
    sys.stdout.buffer.write((s + "\n").encode("utf-8", errors="replace"))
    sys.stdout.buffer.flush()


def load():
    path = os.path.join(ROOT, "deploy_today.py")
    spec = importlib.util.spec_from_file_location("d", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    return mod


def run(ssh, cmd: str, timeout: int = 7200) -> None:
    out("$ " + cmd)
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    while True:
        if stdout.channel.recv_ready():
            sys.stdout.buffer.write(stdout.channel.recv(65536))
            sys.stdout.buffer.flush()
        if stdout.channel.exit_status_ready() and not stdout.channel.recv_ready():
            break
        time.sleep(0.05)
    rest = stdout.read()
    if rest:
        sys.stdout.buffer.write(rest)
        sys.stdout.buffer.flush()
    err = stderr.read().decode("utf-8", "replace")
    if err.strip():
        out(err.strip()[:2000])
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail {code}: {cmd}")


def main() -> int:
    d = load()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    out(f"[ssh] {d.HOST}")
    ssh.connect(d.HOST, port=d.PORT, username=d.USER, password=d.PASSWORD, timeout=30)
    sftp = ssh.open_sftp()
    try:
        run(ssh, f"mkdir -p '{REMOTE}/lib/doksuri1'")
        for rel in FILES:
            local = os.path.join(ROOT, rel.replace("/", os.sep))
            if not os.path.isfile(local):
                raise FileNotFoundError(local)
            remote = f"{REMOTE}/{rel}"
            out(f"[put] {rel}")
            sftp.put(local, remote)
        run(
            ssh,
            f"grep -n 'riskBriefing\\|maxNotionalUsdt\\|chartMergedDeskDoksuri1RiskPct\\|main--desk-bleed' "
            f"{REMOTE}/lib/doksuri1/riskBriefing.ts "
            f"{REMOTE}/lib/doksuri1/marketStory.ts "
            f"{REMOTE}/lib/doksuri1/telegramBridge.ts "
            f"{REMOTE}/lib/settings.ts "
            f"{REMOTE}/app/globals.css "
            f"{REMOTE}/app/HomePageContent.tsx | head -n 40",
        )
        run(ssh, f"cd {REMOTE} && npm run build", timeout=7200)
        run(
            ssh,
            "pm2 delete ailongshort 2>/dev/null || true; "
            f"cd {REMOTE} && (pm2 start ecosystem.config.cjs || pm2 start ecosystem.config.js --only ailongshort || "
            "pm2 start npm --name ailongshort -- start); pm2 save",
        )
        out("[done] doksuri risk+emoji briefing + desk bleed → /root/ailongshort")
    finally:
        sftp.close()
        ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
