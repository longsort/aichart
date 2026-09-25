---
name: chart-ux
description: Design or refactor the chart UI for a BTC futures AI analysis app. Use when simplifying cluttered overlays, converting trading terms to clear Korean labels, drawing clean entry/SL/TP/path visuals, clustering zones, preventing label collisions, adding practical/analysis/research modes, and building explanation panels for confirmed LONG/SHORT/WAIT decisions.
---

# Chart UX

Apply one principle: analysis can be complex internally; the default chart must be simple enough to act on in seconds.

## Default practical mode

Show only:

1. current decision: `확정롱`, `확정숏`, or `대기`
2. one main entry zone
3. core POC
4. one stop level
5. TP1/TP2/TP3
6. main expected path
7. invalidation condition

Do not show every internal indicator, score, and zone at once.

## Three display modes

- 실전모드: decision, entry, SL, TP, POC, path.
- 분석모드: add OB/FVG/BPR, liquidity, BOS/CHoCH, volume/institution bands.
- 연구모드: all debug features and historical diagnostics.

Default to 실전모드 on mobile.

## Korean UI vocabulary

Prefer plain Korean labels while keeping English internally:

- BOS -> 구조돌파
- CHoCH/MSS -> 추세전환
- Sweep -> 유동성털기
- BSL/SSL -> 위쪽/아래쪽 유동성
- OB -> 기관 주문구간
- bullish/bearish OB -> 핵심 매수구간 / 핵심 매도구간
- FVG -> 가격빈틈
- BPR -> 균형가격구간
- Breaker -> 돌파전환구간
- Demand/Supply -> 매수수요 / 매도공급
- Retest -> 재확인
- Reclaim -> 재탈환
- Fake Breakout/Breakdown -> 가짜돌파 / 가짜이탈
- Pullback -> 눌림
- Entry/SL/TP -> 진입 / 손절 / 목표
- Invalidation -> 무효가격
- POC -> 최다거래가격

Offer `한국어`, `전문용어`, `한국어+전문용어` modes if practical.

## Drawing style

- major structure level: clear horizontal line
- main entry: narrow translucent zone
- stop: one clear line/area
- targets: three clear horizontal levels
- sweep: small marker/circle
- BOS/CHoCH: small, non-dominant label
- expected path: thin dashed line/arrow

Do not create large stacks of `초강력/강/중/약` labels. Keep strength as a detail score, not repeated chart text.

## Zone and label decluttering

Render overlapping confluence as one cluster such as `핵심 매수구간`; show components in a detail panel. Use label priority:

1. confirmed decision
2. entry
3. stop
4. targets
5. POC
6. main zone
7. structure shift
8. sweep
9. auxiliary data

Implement collision avoidance. If labels still collide, hide lower-priority labels rather than moving them into misleading price positions.

## Main plan panel

Present a compact panel such as:

`확정롱 | 진입 63,350-63,430 | 손절 62,980 | 목표 64,150 / 64,850 / 65,700 | RR 1:4.2 | 검증확률 72% | 무효: 15m 62,980 아래 마감`

Keep detailed statistics behind a tap/click.

## Why panel

On click, show main reasons, opposing reasons, historical sample size, calibrated probability, TP1 rate, SL-first rate, median MFE/MAE, and target rationale.

## Path behavior

Label paths as `주경로` and `대체경로`, not predictions guaranteed to happen. Path state can be `진행중`, `이탈주의`, `무효`. Never drag the original path to match price after the fact.

## Mobile requirements

Design for portrait first. Keep chart usable with one thumb, avoid horizontal scrolling, reduce text density, and prevent overlays from covering a large share of candles. Use progressive disclosure for advanced data.

## Required tests

Create visual regression/screenshots for mobile practical mode at crowded historical moments. Verify entry/SL/TP remain readable, obsolete zones disappear, and labels do not obscure the current candles.
