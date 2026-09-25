# -*- coding: utf-8 -*-
"""타점엔진 동기화 배포 → /root/ailongshort + build + pm2"""
from __future__ import annotations

import importlib.util
import os
import posixpath
import sys
import time
from pathlib import Path

import paramiko

ROOT = Path(r"d:\apps\ailongshort")
REMOTE = "/root/ailongshort"

# 타점엔진 전체 동기화 (캔들색·TP중복·우측세트·5m15m볼륨폭발 포함)
FILES = [
    "app/HomePageContent.tsx",
    "app/api/eagle1/tapoint-decide/route.ts",
    "app/api/merged-desk/server-arm/route.ts",
    "app/components/eagle1Tapoint/Eagle1TapointDeskView.tsx",
    "app/components/eagle1Tapoint/TapointCleanChart.tsx",
    "app/components/eagle1Tapoint/VmaxPanel.tsx",
    "app/components/mergedAnalysis/MergedDeskAutoTradePanel.tsx",
    "app/components/ChartVolBarLabels.tsx",
    "lib/eagle1/riskEngine.ts",
    "lib/eagle1/targetEngine.ts",
    "lib/eagle1Tapoint/orchestrator.ts",
    "lib/eagle1Tapoint/chartSignals.ts",
    "lib/eagle1Tapoint/briefing.ts",
    "lib/eagle1Tapoint/types.ts",
    "lib/eagle1Tapoint/requiredGate.ts",
    "lib/eagle1Tapoint/scores.ts",
    "lib/eagle1Tapoint/entryStateMachine.ts",
    "lib/eagle1Tapoint/config.ts",
    "lib/eagle1Tapoint/symbolEntryTf.ts",
    "lib/eagle1Tapoint/sharedMergedDeskSignals.ts",
    "lib/eagle1Tapoint/volRoeBurstSignal.ts",
    "lib/eagle1Tapoint/sharedMergedDeskCandlePaint.ts",
    "lib/eagle1Tapoint/slRoeByTf.ts",
    "lib/eagle1Tapoint/sanitizeExecLevels.ts",
    "lib/eagle1Tapoint/vmaxPanelPrefs.ts",
    "lib/eagle1Tapoint/index.ts",
    "lib/eagle1Tapoint/causalSimilarity.ts",
    "lib/eagle1Tapoint/extremeEventEngine.ts",
    "lib/eagle1Tapoint/rejectLedger.ts",
    "lib/mergedDeskServerAutoTradeRunner.ts",
    "lib/mergedDeskServerArmClient.ts",
    "lib/serverMergedDeskAutoTradeStore.ts",
    "lib/mergedDeskUnifiedAnalysisEntry.ts",
    "lib/mergedDeskAutoTradeConfig.ts",
    "lib/mergedDeskAdvVolumeRead.ts",
    "lib/chartSparkleCandles.ts",
    "lib/chartCandleOptions.ts",
    "lib/mergedDeskAiTonePalette.ts",
    "lib/proximityLineZoneSparkle.ts",
    "lib/volumeAiZoneEngine.ts",
    "lib/useSettingsChangeTick.ts",
]


def out(s: str) -> None:
    sys.stdout.buffer.write((s + "\n").encode("utf-8", errors="replace"))
    sys.stdout.buffer.flush()


def load_creds():
    path = ROOT / "deploy_today.py"
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod.HOST, mod.PORT, mod.USER, mod.PASSWORD


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 7200) -> None:
    out(f"$ {cmd}")
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
    err = stderr.read().decode("utf-8", errors="replace")
    if err.strip():
        out(err.strip())
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail ({code}): {cmd}")


def sftp_mkdirs(sftp: paramiko.SFTPClient, remote_dir: str) -> None:
    parts = remote_dir.strip("/").split("/")
    cur = ""
    for part in parts:
        cur = f"{cur}/{part}" if cur else f"/{part}"
        try:
            sftp.stat(cur)
        except OSError:
            try:
                sftp.mkdir(cur)
            except OSError:
                pass


def main() -> int:
    host, port, user, password = load_creds()
    missing = [f for f in FILES if not (ROOT / f.replace("/", os.sep)).is_file()]
    if missing:
        out("[FAIL] missing:")
        for m in missing:
            out(f"  - {m}")
        return 1

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    out(f"[ssh] {host} → {REMOTE} · {len(FILES)} files")
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    sftp = ssh.open_sftp()
    try:
        for rel in FILES:
            local = ROOT / rel.replace("/", os.sep)
            remote = posixpath.join(REMOTE, rel)
            sftp_mkdirs(sftp, posixpath.dirname(remote))
            out(f"[put] {rel}")
            sftp.put(str(local), remote)
        run(ssh, f"cd {REMOTE} && npm run build", timeout=7200)
        run(ssh, "pm2 restart ailongshort --update-env")
        run(
            ssh,
            "sleep 6 && curl -sf -o /dev/null -w 'home=%{http_code}\\n' http://127.0.0.1:3000/ "
            "&& grep -n \"sharedMergedDeskCandlePaint\\|rightSet\\|익절1\\|tapOnly\" "
            "/root/ailongshort/lib/eagle1Tapoint/chartSignals.ts "
            "/root/ailongshort/lib/eagle1Tapoint/vmaxPanelPrefs.ts "
            "/root/ailongshort/lib/eagle1Tapoint/sharedMergedDeskCandlePaint.ts "
            "/root/ailongshort/lib/mergedDeskServerAutoTradeRunner.ts 2>/dev/null | head -30 "
            "&& pm2 list | sed -n '1,15p'",
        )
        out("[done] tip-engine full sync → /root/ailongshort")
    finally:
        sftp.close()
        ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
