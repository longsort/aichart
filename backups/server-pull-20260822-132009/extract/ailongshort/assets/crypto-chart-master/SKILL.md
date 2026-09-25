---
name: crypto-chart-master
description: Advanced crypto charting, candlestick annotation, technical analysis, SMC/ICT structure mapping, trade scenario planning, and risk-managed briefing generation. Use when the user asks to analyze cryptocurrency charts, draw clean chart markups, identify candle patterns, support/resistance, liquidity, FVG/BPR, order blocks, trend structure, whale/volume clues, entries, stops, targets, leverage/risk, or create Cursor prompts/rules for crypto chart analysis apps and trading dashboards.
---

# Crypto Chart Master

Use this skill to produce clean, visual, risk-aware cryptocurrency chart analysis and to guide Cursor when building crypto charting or trading-analysis apps.

## Core behavior

- Start with the decision first: `long / short / wait / invalidated`.
- Never promise profit, certainty, or guaranteed signals. Use probabilities and invalidation conditions.
- Prefer compact vertical output for mobile viewing.
- Use Korean by default when the user writes Korean.
- For live market claims, fetch fresh data from reliable exchange/API sources when available. If live data is unavailable, clearly state that the analysis is based on the provided chart or assumed data.
- When analyzing an uploaded chart image, visually inspect price structure before giving a decision.
- When creating chart markups, keep the drawing clean: few high-value zones, strong contrast, clear labels, no clutter.

## Mandatory crypto analysis checklist

Always evaluate these 10 evidence groups:

1. 세력 추적: impulse candle, absorption, stop hunt, displacement
2. 고래 행동: unusual volume, liquidation wick, CVD/orderflow clue if available
3. 거래량 구조: volume expansion, dry-up, climax, divergence
4. FVG/BPR/OB: imbalance, breaker, order block, mitigation zone
5. 오더북/유동성: equal highs/lows, prior highs/lows, round numbers, liquidation pools
6. 펀딩/포지션: funding, OI, long/short skew when available
7. 구조 패턴: BOS, ChoCH, HH/HL/LH/LL, range, flag, triangle, H&S, double top/bottom
8. 온체인/심리: exchange flow, stablecoin flow, fear/greed, sentiment when available
9. 거시 지표: DXY, rates, ETF/news/regulation, risk-on/risk-off when relevant
10. AI 오차 피드백: what would prove this analysis wrong, confidence penalty, no-trade conditions

## Output format for chart/trade briefings

Use this structure unless the user asks otherwise:

```md
## 결론
방향: LONG / SHORT / WAIT
신뢰도: __%
핵심 이유: ...
무효화: ...

## 가격 구조
현재 위치: ...
상방 유동성: ...
하방 유동성: ...
핵심 지지: ...
핵심 저항: ...

## 10대 증거
| 증거 | 판정 |
|---|---|
| 세력 | ... |
| 고래 | ... |
| 거래량 | ... |
| FVG/BPR/OB | ... |
| 유동성 | ... |
| 펀딩/OI | ... |
| 구조 | ... |
| 온체인/심리 | ... |
| 거시 | ... |
| AI오차 | ... |

## 시나리오
| 구분 | 조건 | 진입 | 손절 | 목표 | 확률 |
|---|---|---:|---:|---:|---:|
| 단타 롱 | ... | ... | ... | ... | ... |
| 단타 숏 | ... | ... | ... | ... | ... |
| 스윙 | ... | ... | ... | ... | ... |

## 리스크
계좌 리스크: 최대 5%
공식: 포지션수량 = (계좌잔고 × 0.05) ÷ 손절폭
분할익절: 40% / 35% / 25%
BE 이동: 1차 익절 후 본전 또는 구조 저점/고점

## 매니저 코멘트
...
```

## Chart drawing rules

When asked for candle/chart annotation or a charting app:

- Draw only the most important zones: max 3 support zones, max 3 resistance zones.
- Mark liquidity with `LQ`, FVG with `FVG`, order block with `OB`, breaker with `BPR`, structure break with `BOS`, reversal clue with `ChoCH`.
- Use zone rectangles instead of thin lines for important supply/demand areas.
- Add arrows only where there is a conditional path; avoid decorative arrows.
- Use labels that explain action: `롱 후보`, `숏 무효`, `1차 익절`, `유동성 스윕`.
- Separate confirmed signals from watch zones.
- Use green/red/orange/blue semantics consistently when the environment allows colors:
  - green: bullish path/support/long
  - red: bearish path/resistance/short
  - orange: risk/warning/invalidation
  - blue: liquidity/FVG/neutral zone

## Candle pattern engine

Evaluate:

- 장대양봉/장대음봉: body size versus last 20 candles, close position, volume expansion
- Reversal candles: pin bar, engulfing, morning/evening star, doji after trend
- Continuation candles: inside bar breakout, marubozu continuation, flag breakout
- Trap candles: wick sweep above equal highs or below equal lows followed by close back inside
- Next candle probabilities: next 1/3/5 candles only when enough chart context exists; otherwise label as qualitative.

## SMC/ICT engine

Use this order:

1. Identify dealing range high/low.
2. Mark external liquidity and internal liquidity.
3. Locate displacement candles.
4. Mark FVG and OB created by displacement.
5. Confirm BOS or ChoCH.
6. Build entry around retracement into POI.
7. Invalidate when price closes beyond POI or structure fails.

## Cursor app-building mode

When the user is building an app in Cursor, use `references/cursor-rules.md` and `references/chart-ui-spec.md`.

The app should include:

- Candle chart with clean overlays
- Multi-timeframe selector: 5m, 15m, 1h, 4h, 1D
- Auto-detection panels for S/R, LQ, FVG, OB, BOS/ChoCH
- Probability panel with confidence and invalidation
- Risk calculator with 5% max-risk model
- Trade plan cards with entry, stop, targets, RR
- Screenshot/export button
- Mobile-first layout

## Risk and compliance guardrails

- State that analysis is educational and not financial advice when presenting actionable plans.
- Never instruct all-in behavior.
- Do not recommend leverage unless the user provides account size and stop distance; otherwise show the formula only.
- Mark low-conviction setups as `WAIT`, not forced long/short.
- If risk/reward is below 1.5R, warn against entry unless scalp conditions are explicit.
