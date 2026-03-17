cd D:\apps\btccion
mkdir skills -Force | Out-Null

@'
---
name: btc-market-data-stack
description: Bitget-first realtime+history ingestion for BTC (ticks/trades/orderbook/oi/funding), normalize to SQLite, gap backfill, health monitoring.
version: 1.0.0
tags: [bitcoin, bitget, ingestion, orderbook, trades, sqlite]
---

# BTC MARKET DATA STACK (Bitget-first)

## Goal
- Collect: tickers, trades, L2 orderbook snapshots, funding, open interest
- Store raw + normalized (replay-safe)
- Auto backfill gaps
- Never block UI thread

## Must
- Time = UTC ms
- Raw tables preserved
- Backfill on start/resume

## Tables (minimum)
- trades(t_ms, price, qty, side, source)
- orderbook_snapshots(t_ms, bids_json, asks_json, mid, spread)
- candles_{tf}(t_open_ms, o,h,l,c, volume, source)
- deriv_metrics(t_ms, funding, open_interest, long_short_ratio)
- stream_health(stream, last_ms, lag_ms, degraded)

## Pipelines
1) start/resume -> open DB -> load last_ms -> backfill gap
2) realtime loop -> insert raw -> build candles/features async
3) if degraded -> reduce polling rate, keep DB consistent

## Bitget endpoints (concept)
- tickers
- trades
- orderbook depth
- funding/OI
'@ | Set-Content -Encoding UTF8 .\skills\btc-market-data-stack.md


@'
---
name: btc-feature-engine
description: Build features per TF: delta, CVD, orderbook imbalance/walls, VWAP, ATR, volatility; stored in SQLite for replay.
version: 1.0.0
tags: [bitcoin, cvd, delta, vwap, atr, features]
---

# BTC FEATURE ENGINE

## Inputs
- trades, candles_{tf}, orderbook_snapshots, deriv_metrics

## Outputs (tables)
- delta_{tf}(t_open_ms, buy_vol, sell_vol, delta)
- cvd_{tf}(t_open_ms, cvd, delta)
- ob_imbalance_{tf}(t_ms, bid_vol, ask_vol, imbalance, wall_bid, wall_ask)
- vwap_{tf}(t_open_ms, vwap)
- volatility_{tf}(t_open_ms, atr, range_pct)

## Core formulas
- delta = Σ(buy_qty) - Σ(sell_qty)
- cvd[t] = cvd[t-1] + delta[t]
- imb = (bidVol-askVol)/(bidVol+askVol)
- vwap = Σ(price*qty)/Σ(qty)

## Rules
- Per TF computed deterministically
- Never recompute differently in replay vs live
- Store results in DB (no in-memory-only)
'@ | Set-Content -Encoding UTF8 .\skills\btc-feature-engine.md


@'
---
name: btc-structure-zones
description: Multi-timeframe structure (BOS/CHoCH/MSB) + dynamic zones (Bu/Be-OB/BB/MB), lifecycle states, auto appear/disappear per TF.
version: 1.0.0
tags: [bitcoin, structure, bos, choch, msb, zones, orderblock]
---

# BTC STRUCTURE + ZONE ENGINE

## Events
- structure_events(t_ms, tf, type[BOS|CHOCH|MSB], dir[UP|DOWN], price, strength)

## Zones
- zones(id, tf, type[OB|BB|MB], side[BUY|SELL], top, bottom, created_t, state[ACTIVE|MITIGATED|INVALID], strength)

## Detection (per TF)
1) pivots (fractal/ATR pivot)
2) BOS: close beyond last swing with continuation
3) CHoCH: first break against prevailing structure
4) MSB: HTF confirmation flip

## Zone creation
- must originate from displacement after BOS/CHoCH
- body+imbalance+volume confirmation
- zone inherits TF
- auto update: ACTIVE -> MITIGATED -> INVALID

## UI contract
- Switching TF => redraw from DB for that TF only
- Zones MUST appear/disappear automatically (no fixed levels)
'@ | Set-Content -Encoding UTF8 .\skills\btc-structure-zones.md


@'
---
name: btc-replay-backtest
description: Replay/backtest engine that rebuilds candles/features/structure/zones at any timestamp; guarantees identical state live vs replay.
version: 1.0.0
tags: [bitcoin, replay, backtest, determinism]
---

# BTC REPLAY / BACKTEST

## Goal
Given timestamp T:
- reconstruct chart state exactly:
  candles + features + structure + zones
- repeatable (same input => same output)

## Requirements
- Raw data always stored
- Derivations stored OR deterministically reproducible
- No hidden randomness

## API contract
- setReplayTime(t_ms)
- buildState(tf, t_ms) -> {candles, features, zones, events}

## Acceptance tests
- same T rebuilt twice = identical outputs
- TF switch in replay uses DB-only (no network)
- gaps auto backfilled before replay run
'@ | Set-Content -Encoding UTF8 .\skills\btc-replay-backtest.md


# ✅ IMPORTANT: 로컬 파일 경로로 add 해야 함 (repo로 인식 방지)
npx skills add .\skills\btc-market-data-stack.md --yes
npx skills add .\skills\btc-feature-engine.md --yes
npx skills add .\skills\btc-structure-zones.md --yes
npx skills add .\skills\btc-replay-backtest.md --yes