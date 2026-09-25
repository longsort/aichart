# -*- coding: utf-8 -*-
"""Upload 통합모드(merged*) local → /root/ailongshort, then build + pm2 restart."""
from __future__ import annotations

import importlib.util
import os
import posixpath
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]

# Same surface as scripts/_sync_merged_desk_from_server.py (local find)
LOCAL_GLOBS = [
    "lib/**/*[Mm]erged*",
    "lib/telegram*.ts",
    "lib/volume*.ts",
    "lib/candleBattle/**/*",
    "app/**/*[Mm]erged*",
    "app/components/ChartView.tsx",
    "app/components/ChartViewMergedServer.tsx",
    "app/components/ChartVolBarLabels.tsx",
    "app/components/mergedAnalysis/**/*",
    "app/api/merged-desk/**/*",
    "app/api/merged-*/**/*",
    "app/api/cron/telegram-*/**/*",
    "app/telegram-merged-capture/**/*",
]

EXTRA_REL = [
    "app/components/ChartView.tsx",
    "app/components/ChartViewMergedServer.tsx",
    "app/components/mergedAnalysis/MergedAnalysisDeskView.tsx",
    "app/components/mergedAnalysis/MergedAnalysisDesk.module.css",
    "app/components/ChartVolBarLabels.tsx",
    "app/components/CandleAnalysisHeader.tsx",
    "app/components/MonthDeskClickPrecisionBar.tsx",
    "app/components/ui/FoldCard.tsx",
    "app/globals.css",
    "public/globals.css",
    "lib/mergedDeskChartOnlyUi.ts",
    # 통합모드 성능·캔들캐시 (merged* 글롭에 안 잡힘)
    "lib/visibleInterval.ts",
    "lib/chartPerfBudget.ts",
    "lib/clientMarketCandleCache.ts",
    # 연간리플레이 API 의존 (doksuri1 — merged 글롭 밖)
    "lib/doksuri1/bnbSfpYearReplay.ts",
    "lib/doksuri1/btc3mRocketYearReplay.ts",
    "lib/doksuri1/ethDumpYearReplay.ts",
    "lib/doksuri1/xrpFourStrategyYearReplay.ts",
    "lib/doksuri1/coinYearReplayShared.ts",
    "lib/doksuri1/bitgetApiAudit.ts",
    "lib/doksuri1/fourStrategyCandidateLog.ts",
    "lib/doksuri1/fourStrategyDetect.ts",
    "lib/doksuri1/fourStrategyTypes.ts",
    "lib/mtfStructureRocket.ts",
    "lib/bitgetFuturesCsv.ts",
    "instrumentation.ts",
    "next.config.mjs",
    "start.js",
    "lib/settings.ts",
    "lib/stubs/emptyPlaywright.js",
    "lib/volumeSidewaysBreakForecast.ts",
    "lib/volumeRangeAccumDist.ts",
    "lib/volumeBurstSequenceIntel.ts",
    "lib/volumeHistogramIntelligence.ts",
    "lib/mergedDeskSpotReactionPct.ts",
    "lib/mergedDeskVolAccumulateExhaust.ts",
    "lib/mergedDeskAdvVolumeRead.ts",
    "lib/mergedDeskVolumeSectionStory.ts",
    "lib/mergedDeskSwingAnchorVolumeEvents.ts",
    "lib/telegramAutoAlertSelfScheduler.ts",
    "lib/telegramMergedDeskUiCapture.ts",
    "lib/telegramMergedDeskAutoRunner.ts",
    "lib/telegramMergedDeskPhotoSend.ts",
    "lib/telegramServerConfirmRunner.ts",
    "lib/telegramSfpAlertRunner.ts",
    "lib/telegramZoneTouchAutoRunner.ts",
    "lib/telegramPrecisionTouchRunner.ts",
    "lib/telegramMultiTfPairList.ts",
    "lib/telegramEventDedupServer.ts",
    "lib/telegramBotSendHtml.ts",
    "app/api/cron/telegram-auto-alert/route.ts",
    "scripts/telegram-auto-alert-run.sh",
]


def load_creds():
    path = ROOT / "deploy_today.py"
    spec = importlib.util.spec_from_file_location("deploy_today", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod.HOST, mod.PORT, mod.USER, mod.PASSWORD, mod.REMOTE_ROOT


def collect_local_files() -> list[str]:
    found: set[str] = set()
    for pattern in LOCAL_GLOBS:
        for p in ROOT.glob(pattern):
            if not p.is_file():
                continue
            rel = p.relative_to(ROOT).as_posix()
            # skip parked / backups / node_modules
            if rel.startswith("_parked/") or "/node_modules/" in rel or rel.startswith("backups/"):
                continue
            if rel.startswith("docs/") or rel.startswith(".next/"):
                continue
            found.add(rel)
    for rel in EXTRA_REL:
        if (ROOT / rel).is_file():
            found.add(rel)
    return sorted(found)


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 7200) -> None:
    print(f"\n$ {cmd}", flush=True)
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")

    def safe(s: str) -> str:
        return s.encode("cp949", errors="replace").decode("cp949", errors="replace")

    if out.strip():
        chunk = out[-10000:] if len(out) > 10000 else out
        print(safe(chunk), flush=True)
    if err.strip():
        print(safe(err[-3000:]), flush=True)
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"fail {code}: {cmd}")


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
    host, port, user, password, remote_root = load_creds()
    files = collect_local_files()
    print(f"Local merged-desk files: {len(files)}", flush=True)
    if not files:
        raise RuntimeError("no local merged files found")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting {host}...", flush=True)
    ssh.connect(host, port=port, username=user, password=password, timeout=30)
    sftp = ssh.open_sftp()
    try:
        ok = 0
        for rel in files:
            local = ROOT / rel.replace("/", os.sep)
            remote = posixpath.join(remote_root, rel)
            sftp_mkdirs(sftp, posixpath.dirname(remote))
            print(f"Uploading {rel}", flush=True)
            sftp.put(str(local), remote)
            ok += 1
            if ok % 25 == 0:
                print(f"  ... {ok}/{len(files)}", flush=True)

        print(f"\nUploaded {ok} files. Building...", flush=True)
        run(ssh, f"chmod +x {remote_root}/scripts/telegram-auto-alert-run.sh || true")
        run(
            ssh,
            "python3 - <<'PY'\n"
            "import json\n"
            "from pathlib import Path\n"
            "p = Path('/root/ailongshort/data/user-settings.json')\n"
            "if p.exists():\n"
            "  d = json.loads(p.read_text(encoding='utf-8'))\n"
            "  tfs = ['15m','1h','4h','1d','1w','1M']\n"
            "  for user, st in d.items():\n"
            "    if not isinstance(st, dict): continue\n"
            "    st['telegramMergedDeskAutoEnabled'] = True\n"
            "    st['telegramZoneTouchAlertEnabled'] = True\n"
            "    st['telegramPrecisionTouchEnabled'] = True\n"
            "    st['telegramMultiTfTimeframes'] = tfs\n"
            "  p.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding='utf-8')\n"
            "  print('settings ok')\n"
            "PY",
        )
        run(ssh, f"cd {remote_root} && npm run build", timeout=7200)
        run(ssh, "pm2 restart ailongshort --update-env")
        run(ssh, "pm2 list | sed -n '1,12p'")
        run(ssh, 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/')
        print(f"\n[done] merged desk deploy ok={ok} → {remote_root}", flush=True)
    finally:
        sftp.close()
        ssh.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print(f"[FAIL] {e}", flush=True)
        raise SystemExit(1)
