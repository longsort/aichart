---
name: risk-engine
description: Design or audit entry, stop-loss, target, execution-quality, and trade-management logic for a BTC/crypto futures analytics app. Use for low-stop/high-RR setups, MAE/MFE-aware stops, target selection, expected value, fees/funding/slippage, position sizing, partial exits, breakeven/trailing logic, and execution gating.
---

# Risk Engine

Aim for small *structurally valid* losses and asymmetric upside, not artificially tight stops.

## Entry candidates

Evaluate candidates such as POC reclaim/retest, OB retest, FVG retest, breaker retest, pullback, and liquidity-sweep reversal. Score each by location, history, stop distance, target distance, HTF alignment, and execution quality.

Return one best candidate or no trade.

## Stop optimizer

Generate candidate invalidation levels from:

- sweep high/low
- swing high/low
- OB/breaker/zone boundary
- POC loss/reclaim failure
- FVG/structure boundary where meaningful
- ATR buffer

Compare candidates to historical MAE distribution for the same setup/regime. Reject stops that sit inside normal adverse excursion merely to inflate RR.

Store both structural stop and final executable stop.

## Target engine

Targets must come from market structure, not arbitrary fixed percentages. Candidate targets include:

- previous high/low
- BSL/SSL liquidity
- next POC/HVN/LVN
- HTF OB/FVG/breaker
- major supply/demand
- measured expansion where statistically validated

Choose TP1 as realistic near target, TP2 as intermediate structure target, TP3 as expansion target. Record the reason for each.

## RR and expectancy gate

Compute net RR and net expectancy after estimated fees, funding, spread, and slippage.

Reasonable defaults before backtest tuning:

- RR < 1.8: reject.
- RR 1.8-2.5: watch only.
- RR >= 2.5: confirmed-signal candidate.
- RR >= 3.0 with strong evidence: prioritize.

These are configurable, not universal truths; promote changes only with walk-forward evidence.

## Execution quality

Before confirmation, inspect current spread, depth, estimated slippage, latency, and order-size impact when data is available. If setup is valid but execution is poor, return `SIGNAL_VALID_EXECUTION_WAIT`.

## Trade management

Track:

`OPEN -> TP1_HIT -> BREAKEVEN/TRAILING -> TP2_HIT -> TP3_HIT/EXIT -> INVALIDATED`

Backtest alternative management policies. Example candidates: partial TP1, move stop to entry/structure, trail only after structure continuation. Do not hard-code one policy as optimal without evidence.

## Metrics

Evaluate at least net expectancy, profit factor, max drawdown, return/drawdown, realized RR, MFE/MAE efficiency, slippage, stop-first rate, and calibration by setup.

## Position sizing

Keep sizing separate from signal confidence. Size from account risk, stop distance, contract specs, and maximum allowed exposure. Never increase size merely because the model says 90% confidence.

## Required tests

Test fees/funding/slippage, gap-through stops, partial fills where simulated, MAE-aware stop rejection, missed entries, TP/SL ordering, and trade-management state transitions.
