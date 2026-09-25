from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from .utils import ENGINE_ROOT, load_config, write_json


REQUIRED = ["timestamp", "open", "high", "low", "close", "volume"]


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    colmap = {
        "time_ms": "timestamp",
        "time": "timestamp",
        "volume_base": "volume",
        "volume_quote": "quote_volume",
        "turnover": "quote_volume",
    }
    out = df.rename(columns={c: colmap.get(c, c) for c in df.columns})
    # timestamp to ms int
    if np.issubdtype(out["timestamp"].dtype, np.datetime64):
        out["timestamp"] = (out["timestamp"].astype("int64") // 10**6).astype(np.int64)
    else:
        ts = out["timestamp"].astype(np.int64)
        # seconds → ms
        if ts.median() < 1e12:
            ts = ts * 1000
        out["timestamp"] = ts
    return out


def load_raw_csv(path: Path | None = None) -> pd.DataFrame:
    cfg = load_config()
    path = path or (ENGINE_ROOT / cfg["raw_csv"])
    df = pd.read_csv(path)
    df = _normalize_columns(df)
    for c in ["open", "high", "low", "close", "volume"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    if "quote_volume" in df.columns:
        df["quote_volume"] = pd.to_numeric(df["quote_volume"], errors="coerce")
    df = df.sort_values("timestamp").reset_index(drop=True)
    return df


def validate_ohlcv(df: pd.DataFrame) -> dict:
    report: dict = {"ok": True, "errors": [], "warnings": [], "n_rows": int(len(df))}
    for c in REQUIRED:
        if c not in df.columns:
            report["errors"].append(f"missing_column:{c}")
            report["ok"] = False
    if not report["ok"]:
        return report

    dups = int(df["timestamp"].duplicated().sum())
    if dups:
        report["errors"].append(f"duplicate_timestamps:{dups}")
        report["ok"] = False

    if df["timestamp"].is_monotonic_increasing is False:
        report["errors"].append("timestamp_not_sorted")
        report["ok"] = False

    # 15m gaps
    dt = df["timestamp"].diff().dropna()
    expected = 15 * 60 * 1000
    gap_mask = dt != expected
    n_gaps = int(gap_mask.sum())
    report["n_gaps"] = n_gaps
    if n_gaps:
        report["warnings"].append(f"interval_gaps:{n_gaps}")

    o, h, l, c = df["open"], df["high"], df["low"], df["close"]
    bad_hl = int((h < l).sum())
    bad_h = int((h + 1e-12 < np.maximum(o, c)).sum())
    bad_l = int((l - 1e-12 > np.minimum(o, c)).sum())
    if bad_hl:
        report["errors"].append(f"high_lt_low:{bad_hl}")
        report["ok"] = False
    if bad_h:
        report["warnings"].append(f"high_lt_max_oc:{bad_h}")
    if bad_l:
        report["warnings"].append(f"low_gt_min_oc:{bad_l}")

    if int((df["volume"] < 0).sum()):
        report["errors"].append("negative_volume")
        report["ok"] = False

    if int(df[REQUIRED].isna().any(axis=1).sum()):
        report["errors"].append("nan_in_ohlcv")
        report["ok"] = False

    if not np.isfinite(df[["open", "high", "low", "close", "volume"]].to_numpy()).all():
        report["errors"].append("inf_in_ohlcv")
        report["ok"] = False

    report["from_ts"] = int(df["timestamp"].iloc[0]) if len(df) else None
    report["to_ts"] = int(df["timestamp"].iloc[-1]) if len(df) else None
    report["from_iso"] = pd.to_datetime(report["from_ts"], unit="ms", utc=True).isoformat() if report["from_ts"] else None
    report["to_iso"] = pd.to_datetime(report["to_ts"], unit="ms", utc=True).isoformat() if report["to_ts"] else None
    return report


def clean_and_save(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df = df.drop_duplicates("timestamp", keep="last").sort_values("timestamp").reset_index(drop=True)
    expected = 15 * 60 * 1000
    dt = df["timestamp"].diff()
    df["gap_flag"] = ((dt != expected) & dt.notna()).astype(np.int8)
    # do NOT invent missing candles
    out = ENGINE_ROOT / "data" / "cleaned" / "BTCUSDT_15m.parquet"
    df.to_parquet(out, index=False)
    report = validate_ohlcv(df)
    write_json(ENGINE_ROOT / "outputs" / "reports" / "data_quality_report.json", report)
    return df
