#!/usr/bin/env python3
"""페이퍼 설정을 active_mode로 고정하고, 최신 15분 봉 기준 신호를 방출."""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.live_signal_engine import signal_from_frame, write_active_mode_from_paper
from src.utils import ensure_dirs


def main():
    ensure_dirs()
    mode = write_active_mode_from_paper(prefer_m5=True)
    print("active_mode →", ROOT / "outputs/thresholds/active_mode.json")
    print(
        f"  promote={mode.get('promote_to_paper')} lev={mode.get('leverage')} "
        f"m5={mode.get('m5')} thr={mode.get('threshold')} real_order={mode.get('real_order')}"
    )

    ohlc_path = ROOT / "data/cleaned/BTCUSDT_15m.parquet"
    ohlc = pd.read_parquet(ohlc_path)
    # 워밍업용 충분한 봉
    frame = ohlc.tail(500).reset_index(drop=True)
    sig = signal_from_frame(frame, mode, append_journal=True)
    print("latest_live_signal →", ROOT / "outputs/reports/latest_live_signal.json")
    print(
        f"  {sig.get('statusKo')} · side={sig.get('selected_side')} · "
        f"L={sig.get('cleanProbLong')} S={sig.get('cleanProbShort')} · "
        f"lev={sig.get('leverage')} · {sig.get('reasonKo')}"
    )


if __name__ == "__main__":
    main()
