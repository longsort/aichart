"""
MARKET DATA MODULE
Fetch OHLCV from Binance and Bitget.
Pairs: BTCUSDT, ETHUSDT, major futures.
Timeframes: 1m, 5m, 15m, 1h, 4h, 1d
"""

import pandas as pd
import httpx
from typing import Literal

TF_MAP = {"1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d"}
EXCHANGES = ("binance", "bitget")


def fetch_binance(symbol: str, interval: str, limit: int = 1000) -> list:
    url = "https://api.binance.com/api/v3/klines"
    params = {"symbol": symbol, "interval": interval, "limit": limit}
    with httpx.Client(timeout=15) as c:
        r = c.get(url, params=params)
        r.raise_for_status()
        return r.json()


def fetch_bitget(symbol: str, interval: str, limit: int = 1000) -> list:
    # Bitget spot: symbol format BTCUSDT, granularity 1m/1H/4H/1D
    url = "https://api.bitget.com/api/v2/spot/market/candles"
    granularity = {"1m": "1m", "5m": "5m", "15m": "15m", "1h": "1H", "4h": "4H", "1d": "1D"}.get(interval, "4H")
    params = {"symbol": symbol, "granularity": granularity, "limit": str(min(limit, 500))}
    with httpx.Client(timeout=15) as c:
        r = c.get(url, params=params)
        r.raise_for_status()
        data = r.json()
        if data.get("code") != "00000":
            raise RuntimeError(data.get("msg", "Bitget error"))
        rows = data.get("data", [])
        return list(reversed(rows))  # Bitget returns newest first


def to_dataframe(rows: list, source: str = "binance") -> pd.DataFrame:
    if source == "binance":
        df = pd.DataFrame(rows, columns=["ts", "open", "high", "low", "close", "volume", "close_time", "qav", "trades", "taker_buy_base", "taker_buy_quote", "ignore"])
        df["timestamp"] = pd.to_datetime(df["ts"], unit="ms", utc=True)
    else:
        df = pd.DataFrame(rows, columns=["ts", "open", "high", "low", "close", "volume", "quote_vol"])
        df["timestamp"] = pd.to_datetime(df["ts"].astype(int), unit="ms", utc=True)
    for c in ["open", "high", "low", "close", "volume"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    return df[["timestamp", "open", "high", "low", "close", "volume"]].dropna()


def fetch_ohlcv(
    symbol: str,
    timeframe: str,
    exchange: Literal["binance", "bitget"] = "binance",
    limit: int = 1000,
) -> pd.DataFrame:
    interval = TF_MAP.get(timeframe, "4h")
    if exchange == "binance":
        rows = fetch_binance(symbol, interval, limit)
        return to_dataframe(rows, "binance")
    else:
        rows = fetch_bitget(symbol, interval, limit)
        return to_dataframe(rows, "bitget")
