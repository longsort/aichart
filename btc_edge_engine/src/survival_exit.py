"""생존 청산 시뮬 — 부분익절 + 넓은 손절 + 시간청산 (수수료/슬리피지 포함)."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .cost_engine import roundtrip_cost_fraction


def simulate_survival_trade(
    high: np.ndarray,
    low: np.ndarray,
    close: np.ndarray,
    i: int,
    side: str,
    sl_pct: float,
    tp1_pct: float,
    hold: int,
    partial: float = 0.5,
    move_sl_to_be: bool = True,
    trail_pct: float | None = None,
) -> dict:
    """
    진입: close[i] (신호봉 종가). 실전 대조는 호출측에서 next-open 정렬 가능.
    반환 code: 1=부분+이익, 0=손절, 2=시간, -1=애매(같은봉 TP1+SL)
    pnl_price: 가격수익률(사이드 부호 반영, 부분청산 가중)
    trail_pct: 부분익절 후 ATR 트레일 (가격%). None이면 본절만.
    """
    n = len(close)
    entry = float(close[i])
    if side == "LONG":
        sl = entry * (1 - sl_pct)
        tp1 = entry * (1 + tp1_pct)
    else:
        sl = entry * (1 + sl_pct)
        tp1 = entry * (1 - tp1_pct)

    rem = 1.0
    realized = 0.0
    hit_partial = False
    code = 2
    last_px = entry

    for j in range(i + 1, min(n, i + 1 + hold)):
        hi, lo, cl = float(high[j]), float(low[j]), float(close[j])
        hit_tp = hi >= tp1 if side == "LONG" else lo <= tp1
        hit_sl = lo <= sl if side == "LONG" else hi >= sl

        if (not hit_partial) and hit_tp and hit_sl:
            return {
                "code": -1,
                "pnl_price": 0.0,
                "bars": j - i,
                "partial": False,
                "reason": "AMBIGUOUS",
            }

        if (not hit_partial) and hit_tp:
            # 부분 익절
            part = partial
            ret = tp1_pct
            realized += part * ret
            rem -= part
            hit_partial = True
            if move_sl_to_be:
                sl = entry  # 본절
            # 같은 봉에서 나머지 손절도 가능
            hit_sl = lo <= sl if side == "LONG" else hi >= sl
            if rem <= 1e-12:
                return {
                    "code": 1,
                    "pnl_price": realized,
                    "bars": j - i,
                    "partial": True,
                    "reason": "TP1_FULL",
                }

        if hit_partial and rem > 0 and trail_pct:
            if side == "LONG":
                trail_sl = cl * (1 - trail_pct)
                sl = max(sl, trail_sl)
                hit_sl = lo <= sl
            else:
                trail_sl = cl * (1 + trail_pct)
                sl = min(sl, trail_sl)
                hit_sl = hi >= sl

        if hit_sl and rem > 0:
            if side == "LONG":
                ret_rest = (sl - entry) / entry
            else:
                ret_rest = (entry - sl) / entry
            realized += rem * ret_rest
            rem = 0.0
            code = 0 if not hit_partial else 1
            return {
                "code": code,
                "pnl_price": realized,
                "bars": j - i,
                "partial": hit_partial,
                "reason": "SL" if not hit_partial else "TP1_THEN_SL",
            }

        last_px = cl

    if rem > 0:
        if side == "LONG":
            ret_rest = (last_px - entry) / entry
        else:
            ret_rest = (entry - last_px) / entry
        realized += rem * ret_rest
        code = 1 if realized > 0 else 2
        return {
            "code": code,
            "pnl_price": realized,
            "bars": hold,
            "partial": hit_partial,
            "reason": "TIMEOUT",
        }
    return {"code": 1, "pnl_price": realized, "bars": hold, "partial": hit_partial, "reason": "DONE"}


def run_survival_on_mask(
    ohlc: pd.DataFrame,
    mask: np.ndarray,
    side: str,
    leverage: float,
    sl_pct: float,
    tp1_pct: float,
    hold: int,
    entry_fee: float,
    exit_fee: float,
    slippage_bps: float,
    entry_mode: str = "close",
    sl_pct_arr: np.ndarray | None = None,
    trail_atr_mult: float | None = None,
    atr_pct: np.ndarray | None = None,
) -> dict:
    """
    entry_mode:
      close — 신호봉 종가
      next_open — 다음봉 시가 (지연 스트레스)
    """
    high = ohlc["high"].to_numpy(float)
    low = ohlc["low"].to_numpy(float)
    close = ohlc["close"].to_numpy(float)
    open_ = ohlc["open"].to_numpy(float)
    cost = roundtrip_cost_fraction(entry_fee, exit_fee, slippage_bps)
    idxs = np.where(mask)[0]
    pnls = []
    codes = []
    reasons = []
    for i in idxs:
        if i >= len(close) - 2:
            continue
        row_sl = float(sl_pct_arr[i]) if sl_pct_arr is not None else float(sl_pct)
        row_sl = float(np.clip(row_sl, 0.0015, 0.025))
        trail = None
        if trail_atr_mult is not None and atr_pct is not None:
            trail = float(max(0.001, atr_pct[i] * trail_atr_mult))
        if entry_mode == "next_open":
            # shift path by using i as signal, enter at i+1 open ≈ rebuild mini arrays
            # approximate: treat entry price as open[i+1], scan from i+2
            entry_i = i + 1
            if entry_i >= len(close) - 1:
                continue
            # temporarily patch close[entry_i] as entry reference by custom loop
            entry = float(open_[entry_i])
            # manual inline using entry override
            res = _survival_from_entry(
                high, low, close, entry_i, entry, side, row_sl, tp1_pct, hold, trail_pct=trail
            )
        else:
            res = simulate_survival_trade(
                high, low, close, i, side, row_sl, tp1_pct, hold, trail_pct=trail
            )
        if res["code"] == -1:
            continue  # ambiguous exclude from EV
        net = res["pnl_price"] * leverage - cost * leverage
        pnls.append(net)
        codes.append(res["code"])
        reasons.append(res["reason"])

    if not pnls:
        return {"side": side, "n": 0, "leverage": leverage, "sl_pct": sl_pct, "tp1_pct": tp1_pct, "hold": hold}

    arr = np.array(pnls, dtype=float)
    eq = 1.0
    peak = 1.0
    mdd = 0.0
    streak = max_streak = 0
    for r in arr:
        eq *= 1.0 + float(r)
        peak = max(peak, eq)
        mdd = max(mdd, (peak - eq) / peak if peak > 0 else 0)
        if r <= 0:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 0
    wins = (arr > 0).sum()
    gw = arr[arr > 0].sum()
    gl = -arr[arr <= 0].sum()
    pf = float(gw / gl) if gl > 1e-12 else float("inf")
    return {
        "side": side,
        "n": int(len(arr)),
        "win_rate": float(wins / len(arr)),
        "net_ev": float(arr.mean()),
        "sum_net": float(arr.sum()),
        "profit_factor": pf,
        "max_dd": float(mdd),
        "longest_loss_streak": int(max_streak),
        "leverage": leverage,
        "sl_pct": sl_pct,
        "tp1_pct": tp1_pct,
        "hold": hold,
        "entry_mode": entry_mode,
        "partial_rate": float(sum(1 for r in reasons if "TP1" in r) / len(reasons)),
    }


def _survival_from_entry(
    high, low, close, entry_i, entry, side, sl_pct, tp1_pct, hold, partial=0.5, move_sl_to_be=True, trail_pct=None
):
    n = len(close)
    if side == "LONG":
        sl = entry * (1 - sl_pct)
        tp1 = entry * (1 + tp1_pct)
    else:
        sl = entry * (1 + sl_pct)
        tp1 = entry * (1 - tp1_pct)
    rem = 1.0
    realized = 0.0
    hit_partial = False
    last_px = entry
    for j in range(entry_i + 1, min(n, entry_i + 1 + hold)):
        hi, lo, cl = float(high[j]), float(low[j]), float(close[j])
        hit_tp = hi >= tp1 if side == "LONG" else lo <= tp1
        hit_sl = lo <= sl if side == "LONG" else hi >= sl
        if (not hit_partial) and hit_tp and hit_sl:
            return {"code": -1, "pnl_price": 0.0, "bars": j - entry_i, "partial": False, "reason": "AMBIGUOUS"}
        if (not hit_partial) and hit_tp:
            realized += partial * tp1_pct
            rem -= partial
            hit_partial = True
            if move_sl_to_be:
                sl = entry
            hit_sl = lo <= sl if side == "LONG" else hi >= sl
            if rem <= 1e-12:
                return {"code": 1, "pnl_price": realized, "bars": j - entry_i, "partial": True, "reason": "TP1_FULL"}
        if hit_partial and rem > 0 and trail_pct:
            if side == "LONG":
                trail_sl = cl * (1 - trail_pct)
                sl = max(sl, trail_sl)
                hit_sl = lo <= sl
            else:
                trail_sl = cl * (1 + trail_pct)
                sl = min(sl, trail_sl)
                hit_sl = hi >= sl
        if hit_sl and rem > 0:
            ret_rest = (sl - entry) / entry if side == "LONG" else (entry - sl) / entry
            realized += rem * ret_rest
            return {
                "code": 0 if not hit_partial else 1,
                "pnl_price": realized,
                "bars": j - entry_i,
                "partial": hit_partial,
                "reason": "SL" if not hit_partial else "TP1_THEN_SL",
            }
        last_px = cl
    if rem > 0:
        ret_rest = (last_px - entry) / entry if side == "LONG" else (entry - last_px) / entry
        realized += rem * ret_rest
        return {
            "code": 1 if realized > 0 else 2,
            "pnl_price": realized,
            "bars": hold,
            "partial": hit_partial,
            "reason": "TIMEOUT",
        }
    return {"code": 1, "pnl_price": realized, "bars": hold, "partial": hit_partial, "reason": "DONE"}
