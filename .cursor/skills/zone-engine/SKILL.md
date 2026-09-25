---
name: zone-engine
description: Build or refine zone logic for a crypto futures chart app. Use for POC/volume-profile zones, HVN/LVN, OB, FVG, BPR, breaker blocks, demand/supply, institutional/volume bands, zone clustering, zone lifecycle, strength scoring, invalidation, and preventing moving/repainting zones.
---

# Zone Engine

The goal is fewer, higher-quality, fixed zones with explicit lifecycle and statistical evidence.

## POC and volume profile

Treat POC (UI: 최다거래가격) as a core reference. Support POC states:

`BELOW, ABOVE, APPROACH, BREAK_ATTEMPT, CLOSED_ABOVE, CLOSED_BELOW, RETEST, HOLD_SUCCESS, REJECTION, RECLAIMED, LOST`

A POC touch alone is not confirmation. Use close, hold/retest, volume, and structure context.

Also calculate HVN, LVN, VAH, VAL when the data model supports them.

## Supported zones

Represent independently in data but cluster for UI:

- volume zones / institutional bands
- bullish/bearish order blocks
- FVG
- BPR
- breaker blocks
- demand/supply
- support/resistance
- liquidity zones

Each zone must record `zone_id, source_type, timeframe, created_at, lower, upper, midpoint, strength, reason, status, test_count, last_test_at`.

## Lifecycle

Use:

`PENDING -> CONFIRMED -> FRESH -> TESTED -> WEAK -> BROKEN -> INVALID -> DELETED`

Once confirmed, zone price boundaries are immutable. Never slide a confirmed zone with current price. New evidence creates a new zone or changes lifecycle status.

Downgrade/invalidate on evidence such as:

- decisive close through the zone
- BOS/CHoCH against it
- repeated mitigation/tests
- FVG fully filled
- OB fully mitigated
- meaningful POC relocation
- declining reaction volume
- excessive age without reaction

## Zone clustering

If multiple zones overlap materially, combine them for presentation. Example:

`POC + bullish OB + FVG + demand + institutional volume band` -> one `핵심 매수구간`.

Preserve the component list and scores in the zone object so the detail panel can explain the cluster.

## Tiering

Assign display tier based on statistical expectancy and context:

- S: main-entry candidate
- A: secondary zone
- B: analysis mode only
- C: hidden/debug only

Consider historical expectancy, freshness, test count, HTF alignment, POC/volume, liquidity, regime, MFE/MAE, and confluence.

## Zone expectancy

Track each setup family separately, e.g. POC hold, POC reclaim, POC+OB, POC+FVG, sweep+POC, OB-only, FVG-only. Store sample size, TP-before-SL rate, median MFE, median MAE, and net expectancy.

Do not label a zone "초강력" from hand-written rules alone. Strength labels must be backed by out-of-sample statistics or shown as heuristic confidence.

## Output contract

Return fixed zones and lifecycle updates. Do not render directly. Provide one recommended cluster only when the caller asks for a main entry candidate.

## Required tests

Replay through zone creation, first touch, repeated tests, break, invalidation, and deletion. Assert confirmed boundaries never move and old opposing zones disappear from default UI after invalidation.
