---
name: signal-engine
description: Build, audit, or improve the decision layer of a BTC futures AI chart app. Use for LONG/SHORT/WAIT state machines, confluence scoring, historical-similarity statistics, probability calibration, multi-model agreement, no-trade filters, scenario paths, late-entry detection, and selecting one main trade plan from many signals.
---

# Signal Engine

Optimize for signal quality, not signal count. `WAIT` is a valid and often preferred output.

## Decision states

Use only:

`WAIT, LONG_WATCH, SHORT_WATCH, CONFIRMED_LONG, CONFIRMED_SHORT, LONG_MISSED, SHORT_MISSED`

Default UI should emphasize only confirmed direction or wait.

## Inputs

Consume structured outputs from market data, market structure, zone, risk, and historical engines. Typical evidence:

- market regime and HTF alignment
- POC state and distance
- volume profile and relative volume
- liquidity sweep/failed break
- BOS/CHoCH/MSS
- OB/FVG/BPR/breaker/demand/supply
- CVD/OI/funding/liquidation when available
- order-flow/microstructure confirmation
- historical expectancy and sample size

Do not duplicate indicator calculations inside this skill.

## Confluence and disagreement

Calculate separate `LongScore`, `ShortScore`, `Confidence`, `EntryQuality`, and model-agreement metrics. Preserve opposing evidence.

Prefer independent expert votes such as structure, POC/volume, liquidity/SMC, derivatives, microstructure, and historical similarity. Strong disagreement should force WAIT.

## Historical similarity

Compare the current snapshot to past snapshots with regime-first filtering. Report sample size, calibrated probability, TP-before-SL, median MFE/MAE, and expected move by horizon.

Never present raw model confidence as historical probability. Calibrate probabilities out-of-sample and track calibration error.

## No-trade gate

Force WAIT on conditions including:

- range midpoint / poor location
- strong HTF conflict
- unresolved POC state
- low volume or contradictory flow
- stale/missing critical data
- weak historical sample
- low RR or non-positive net expectancy
- abnormal volatility / unknown regime
- repaint audit failure
- live/replay mismatch
- small long-vs-short score gap

## Confirmation sequence

Prefer sequences such as:

`SETUP -> SWEEP -> STRUCTURE_SHIFT -> POC/ZONE_REACTION -> CLOSE -> RETEST -> VOLUME_CONFIRM -> TRIGGER -> CONFIRMED`

Not every strategy needs every event. Use historical expectancy to define valid strategy families.

## Late-entry protection

If price has already moved materially away from the validated entry, output `LONG_MISSED` or `SHORT_MISSED` and wait for a new pullback/retest. Do not chase because confidence rose after the move.

## Scenario output

Always maintain conditional paths rather than deterministic prophecy:

- Main scenario: entry condition, path, TP levels, invalidation.
- Alternative scenario: what must happen before the opposite setup becomes valid.

Do not instantly flip direction just because invalidation was crossed; require the opposite setup's own confirmation.

## Required output

One `MainPlan` object containing direction/status, entry zone, SL/TP from risk engine, RR, net expectancy, calibrated probability, sample size, reasons, opposing reasons, invalidation, expected path, and data-quality state.

## Required tests

Test WAIT behavior aggressively. Add cases for score disagreement, stale data, missed entry, insufficient sample, low RR, and invalidation without immediate reverse signal.
