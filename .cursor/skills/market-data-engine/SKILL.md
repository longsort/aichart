---
name: market-data-engine
description: Build, audit, or modify market-data ingestion for a BTC/crypto futures analytics app. Use for Bitget REST/WebSocket candles, historical downloads, trades, order books, mark/index price, funding, open interest, liquidations, CVD inputs, timestamp alignment, data quality, storage schemas, replay feeds, and live-vs-historical parity.
---

# Market Data Engine

Treat market data as the immutable foundation of every downstream signal.

## Core rules

- Preserve raw provider data unchanged; derive features into separate tables/files.
- Store timestamps in UTC; convert timezone only in UI.
- Never forward-fill unavailable derivatives features such as OI, funding, CVD, liquidations, or order-book data across unsupported historical ranges.
- Record source, symbol, market type, timeframe, ingestion time, and feature availability.
- Prevent duplicate candles with a unique key such as `(exchange, symbol, market_type, timeframe, open_time)`.
- Historical and live pipelines must produce the same canonical candle schema.
- If provider/API behavior is uncertain, inspect current official API documentation before changing code.

## Historical collection workflow

1. Audit existing Bitget downloader and storage code before adding a second path.
2. Download BTCUSDT futures data with pagination and resumable checkpoints.
3. Prefer the oldest provider-supported history rather than fabricating a target candle count.
4. Target coverage:
   - 1M/1W/1D/12H/4H: all available history.
   - 1H: all available, target at least 50k-70k if provider coverage allows.
   - 15m: target 150k-250k.
   - 5m: target 200k-300k.
   - 1m: initially 6-18 months, expandable later.
5. Persist download checkpoints and retry transient failures with bounded backoff.
6. Produce a coverage manifest per dataset: first timestamp, last timestamp, row count, missing intervals, source endpoint.

## Canonical candle schema

Require at least:

`exchange, symbol, market_type, timeframe, open_time, close_time, open, high, low, close, base_volume, quote_volume, source, downloaded_at`

Use decimal-safe or sufficiently precise numeric storage for prices and volumes.

## Derivatives layer

Store separately when available:

- mark price and index price
- funding rate
- open interest and OI delta
- long/short ratios
- liquidations
- trades/fills
- aggressive buy/sell volume
- order-book snapshots/deltas

Expose availability flags such as `has_oi`, `has_funding`, `has_cvd`, `has_orderbook`, `has_liquidations`.

## Data quality gate

Before feature generation, detect:

- missing or duplicate candles
- invalid OHLC relationships
- negative volume
- unexpected zero-volume runs
- timestamp gaps and timeframe misalignment
- timezone errors
- pagination holes
- stale derivatives data
- WebSocket disconnect gaps
- source/schema drift

Write a machine-readable quality report. Severe quality failures must block confirmed trading signals for the affected period.

## Resampling validation

When building 5m/15m/1h/4h from 1m data, compare reconstructed OHLCV to provider-native timeframe candles. Do not silently replace native data when mismatches are unexplained.

## Live ingestion

- Separate ingestion, persistence, feature calculation, and UI broadcasting.
- Reconnect WebSocket safely and backfill missed candles after disconnects.
- Mark stale data explicitly rather than presenting it as current.
- Keep Telegram/reporting failures isolated from the trading-analysis pipeline.

## Required tests

Add tests for pagination boundaries, duplicate prevention, gap detection, UTC alignment, resampling, restart recovery, WebSocket backfill, schema migration, and live/replay canonical equivalence.
