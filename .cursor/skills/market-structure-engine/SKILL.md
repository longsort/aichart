---
name: market-structure-engine
description: Implement or audit BTC market-structure analysis for a futures chart app. Use for HH/HL/LH/LL, BOS, CHoCH/MSS, liquidity sweeps, support/resistance, Wyckoff phases, price-action patterns, multi-timeframe confirmation, regime detection, and non-repainting structure state machines.
---

# Market Structure Engine

Model structure as explicit states and events, not hindsight labels.

## Structure primitives

Detect and persist:

- HH / HL / LH / LL
- BOS (UI: 구조돌파)
- CHoCH/MSS (UI: 추세전환)
- range high/low and failed breaks
- support/resistance role reversal
- liquidity pools, equal highs/lows, BSL/SSL
- sweep / stop hunt / fake breakout / fake breakdown

A swing or structure event must only use candles available at that timestamp. If confirmation requires future bars, emit the event only when confirmation becomes knowable; never backdate it as though it was known earlier.

## Regime engine

Classify each point into a small stable set:

`STRONG_BULL, BULL, RANGE, BEAR, STRONG_BEAR, ACCUMULATION, DISTRIBUTION, VOLATILITY_EXPANSION, UNKNOWN`

Use regime to select/weight downstream logic. Do not force a classification when evidence is weak; prefer `UNKNOWN` or `RANGE` with low confidence.

## Wyckoff layer

Support AR, SOW, Spring, UT, UTAD, LPSY, accumulation, and distribution as contextual features. Never make a trade from a single Wyckoff label.

Useful confluences:

- Spring + SSL sweep + bullish CHoCH + POC reclaim -> strengthen long case.
- UTAD/LPSY + BSL sweep + bearish CHoCH + POC loss -> strengthen short case.

## Price-action layer

Detect as secondary evidence:

- bullish/bearish engulfing
- harami
- pin/rejection candles
- double bottom/top
- flag/triangle
- breakout-retest and pullback structures

Do not let decorative candlestick names override higher-timeframe structure.

## Multi-timeframe hierarchy

Default roles:

- 1D/4H: macro direction and major zones/liquidity.
- 1H: intermediate structure.
- 15m: setup formation.
- 5m: entry confirmation.
- 1m: optional execution refinement only.

Support sequences such as `4H sweep -> 15m/5m shift -> FVG/OB retest -> entry -> 4H liquidity target`.

## State-machine behavior

Track setup progression instead of printing repeated labels:

`IDLE -> SETUP -> SWEEP -> SHIFT -> RETEST -> CONFIRMED -> INVALID`

Persist event timestamps and the exact levels used for confirmation.

## Output contract

Return structured features/events, including direction, timeframe, level, confidence, evidence, opposing evidence, and invalidation. Rendering belongs to chart-ux; entry decisions belong to signal-engine.

## Required tests

Test known sequences with candle-by-candle replay. Verify no event changes after future candles arrive, no backdated CHoCH/BOS appears, and the same input history yields identical structure in live and replay modes.
