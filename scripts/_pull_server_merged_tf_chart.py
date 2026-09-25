"""Pull unified-mode chart + per-TF candle feature files from VPS → local."""
from __future__ import annotations

import os
import posixpath
import shutil
import time
from pathlib import Path

import paramiko

HOST = "167.179.119.140"
USER = "root"
PASSWORD = "-9iR,D65[{})$%f)"
REMOTE = "/root/ailongshort"
ROOT = Path(__file__).resolve().parents[1]

# 통합모드에 보이는 TF별 캔들·기능 핵심 경로
FILES = [
    "app/components/ChartView.tsx",
    "app/components/mergedAnalysis/MergedAnalysisDeskView.tsx",
    "app/components/mergedAnalysis/MergedAnalysisDesk.module.css",
    "lib/clientMarketCandleCache.ts",
    "lib/market.ts",
    "lib/bitgetFuturesMarket.ts",
    "lib/mergedDesk4hReference.ts",
    "lib/mergedDesk4hReferenceAnalysis.ts",
    "lib/mergedDeskSharedChartView.ts",
    "lib/mergedAnalysisDeskEngine.ts",
    "lib/mergedDeskBtccionCandleDraw.ts",
    "lib/mergedAnalysisSwingChartDraw.ts",
    "lib/mergedDeskBlueRedChannels.ts",
    "lib/mergedDeskAdvancedCandleZones.ts",
    "lib/mergedDeskCandleTrendline.ts",
    "lib/mergedDeskUnifiedCloud.ts",
    "lib/mergedAnalysisDeskVisualCleanup.ts",
    "lib/mergedDeskChartDisplaySettings.ts",
    "lib/mergedAnalysisOverlayTimes.ts",
    "lib/mergedAnalysisOverlayIds.ts",
    "lib/mergedDeskMirageStyleDraw.ts",
    "lib/mergedAnalysisCoreChartZones.ts",
    "lib/mergedDeskSwingSettleCandlePaint.ts",
    "lib/constants.ts",
    "lib/volumeHistogramIntelligence.ts",
]


def main() -> None:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    bak = ROOT / "backups" / f"local-before-server-tf-pull-{stamp}"
    pull = ROOT / "backups" / f"server-tf-chart-pull-{stamp}"
    bak.mkdir(parents=True, exist_ok=True)
    pull.mkdir(parents=True, exist_ok=True)

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print("[ssh] connect", HOST)
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=40)
    sftp = ssh.open_sftp()

    ok = 0
    missing: list[str] = []
    for rel in FILES:
        remote = posixpath.join(REMOTE, rel)
        local_pull = pull / rel.replace("/", os.sep)
        local_pull.parent.mkdir(parents=True, exist_ok=True)
        try:
            sftp.stat(remote)
        except OSError:
            missing.append(rel)
            print("[skip missing]", rel)
            continue
        print("[get]", rel)
        sftp.get(remote, str(local_pull))
        ok += 1

        dest = ROOT / rel.replace("/", os.sep)
        if dest.exists():
            bak_dest = bak / rel.replace("/", os.sep)
            bak_dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(dest, bak_dest)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(local_pull, dest)

        # MERGED 모드는 ChartViewMergedServer 사용 — 서버 ChartView를 그대로 복제
        if rel == "app/components/ChartView.tsx":
            merged = ROOT / "app" / "components" / "ChartViewMergedServer.tsx"
            if merged.exists():
                bak_m = bak / "app" / "components" / "ChartViewMergedServer.tsx"
                bak_m.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(merged, bak_m)
            shutil.copy2(local_pull, merged)
            print("[also] → ChartViewMergedServer.tsx")

    sftp.close()
    ssh.close()
    print(f"[ok] pulled {ok} files → applied")
    print(f"[bak] {bak}")
    print(f"[raw] {pull}")
    if missing:
        print("[missing on server]", ", ".join(missing))


if __name__ == "__main__":
    main()
