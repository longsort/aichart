"""
DATA ENGINE
-----------
Loads OHLCV data for crypto and stocks.
Format: timestamp, open, high, low, close, volume
"""

import pandas as pd
import numpy as np
from pathlib import Path
from typing import Literal, Optional, Union


def load_ohlcv(
    source: Union[str, pd.DataFrame],
    asset_type: Literal["crypto", "stocks"] = "crypto",
    timestamp_col: Optional[str] = None,
    freq: Optional[str] = None,
) -> pd.DataFrame:
    """
    Load OHLCV data from file or DataFrame.

    Args:
        source: Path to CSV/file or DataFrame
        asset_type: 'crypto' or 'stocks'
        timestamp_col: Override timestamp column name
        freq: Resample frequency (1m, 5m, 15m, 1h, 4h, 1d)

    Returns:
        DataFrame with columns: timestamp, open, high, low, close, volume
    """
    if isinstance(source, pd.DataFrame):
        df = source.copy()
    else:
        path = Path(source)
        if path.suffix in (".csv", ".txt"):
            df = pd.read_csv(path)
        elif path.suffix == ".parquet":
            df = pd.read_parquet(path)
        else:
            raise ValueError(f"Unsupported file: {path.suffix}")

    # Normalize column names (lowercase, strip)
    df.columns = [c.lower().strip() for c in df.columns]

    col_map = {
        "ts": "timestamp",
        "time": "timestamp",
        "date": "timestamp",
        "o": "open",
        "h": "high",
        "l": "low",
        "c": "close",
        "v": "volume",
    }
    for old, new in col_map.items():
        if old in df.columns:
            df = df.rename(columns={old: new})

    ts_col = timestamp_col or ("timestamp" if "timestamp" in df.columns else "date")
    if ts_col not in df.columns:
        raise ValueError(f"Timestamp column '{ts_col}' not found. Columns: {list(df.columns)}")

    df["timestamp"] = pd.to_datetime(df[ts_col], utc=True)
    required = ["open", "high", "low", "close", "volume"]
    for c in required:
        if c not in df.columns:
            raise ValueError(f"Required column '{c}' not found")

    df = df[["timestamp", "open", "high", "low", "close", "volume"]].copy()
    df = df.sort_values("timestamp").reset_index(drop=True)
    df = df.dropna(subset=["open", "high", "low", "close"])

    if "volume" in df.columns:
        df["volume"] = df["volume"].fillna(0)
    else:
        df["volume"] = 0

    if freq and freq != "raw":
        df = df.set_index("timestamp")
        resampled = df.resample(freq).agg({
            "open": "first",
            "high": "max",
            "low": "min",
            "close": "last",
            "volume": "sum",
        }).dropna()
        df = resampled.reset_index()

    return df


def generate_sample_data(bars: int = 5000, seed: int = 42) -> pd.DataFrame:
    """Generate synthetic OHLCV for testing."""
    np.random.seed(seed)
    dates = pd.date_range("2023-01-01", periods=bars, freq="1h", tz="UTC")
    close = 50000 + np.cumsum(np.random.randn(bars) * 50)
    high = close + np.abs(np.random.randn(bars) * 30)
    low = close - np.abs(np.random.randn(bars) * 30)
    open_ = np.roll(close, 1)
    open_[0] = close[0]
    volume = np.abs(np.random.randn(bars) * 1e6).astype(int)
    return pd.DataFrame({
        "timestamp": dates,
        "open": open_,
        "high": high,
        "low": low,
        "close": close,
        "volume": volume,
    })
