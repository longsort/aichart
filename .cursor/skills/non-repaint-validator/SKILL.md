---
name: non-repaint-validator
description: Audit and test a trading/chart codebase for future-data leakage, repainting, hindsight labels, mutable historical zones, backtest/live divergence, unsafe data splitting, and misleading performance. Use before accepting any new indicator, signal, probability, zone, backtest, or AI-model change.
---

# Non-Repaint Validator

Treat any unexplained change to a past signal after future candles arrive as a release blocker.

## Core invariants

At timestamp T, calculations may use only information that was available at or before T. If an event requires N confirming bars, its known time is T+N; do not paint it back at T as an actionable signal.

Freeze every issued prediction with:

`signal_id, timestamp, engine_version, price, features, POC, zones, scores, entry, SL, TP, reasons, invalidation`

Future candles may update outcome records, never the frozen prediction.

## Common leakage patterns to detect

- centered rolling windows
- future shift/negative lag
- swing labels using future pivots but timestamped at pivot candle
- resampling that leaks incomplete higher-timeframe close
- normalization fitted on full dataset
- random train/test shuffle for time series
- future extrema used to choose zones or stops
- backfilled labels rendered as if known live
- recomputing old POC/zones with future range and overwriting history

## Replay parity test

Feed historical candles one by one through the exact same core engine used live. At selected timestamps, serialize outputs. Re-run with additional future candles and assert serialized past outputs are byte-equivalent except explicitly allowed outcome/status fields.

## Live/replay parity

Given the same canonical data snapshot, live and replay must produce identical POC, regime, zones, scores, entry, SL, TP, and decision state.

## Train/validation/holdout

Use chronological splits. No random shuffle. Keep final holdout untouched during feature/weight selection. Add walk-forward tests for rolling retraining or retuning.

## Backtest realism audit

Verify fees, funding, spread/slippage assumptions, signal timing, candle-close availability, intrabar TP/SL ordering policy, missing data handling, and survivorship/source changes.

## Regression gate

For every engine version, compare net expectancy, profit factor, max drawdown, MFE/MAE, signal frequency, false-break rate, and calibration. A higher win rate alone is not sufficient for promotion.

## Failure behavior

If repaint, leakage, or parity tests fail, mark the build/test as failed and block confirmed signals in validation environments until fixed. Do not hide failed historical signals from performance statistics.
