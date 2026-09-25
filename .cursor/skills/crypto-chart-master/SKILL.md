---
name: crypto-chart-master
description: Advanced crypto charting, candlestick annotation, technical analysis, SMC/ICT structure mapping, trade scenario planning, and risk-managed briefing. Use for cryptocurrency chart analysis, clean chart markups, FVG/BPR/OB, liquidity, entries/stops/targets, and ailongshort merged-analysis desk (통합·분석) TF-unified chart behavior.
---

# Crypto Chart Master (ailongshort)

`assets/crypto-chart-master` 마스터 스킬. 통합·분석 데스크는 **4h 참조형**으로 분·시·일·주·월 전 TF 동일 정책을 따른다.

## Core behavior

- Start with the decision first: `long / short / wait / invalidated`.
- Never promise profit, certainty, or guaranteed signals.
- Korean by default when the user writes Korean.
- Chart markups: max 3 support + 3 resistance zones, strong contrast, no clutter.

## Mandatory crypto analysis checklist (10 evidence groups)

1. 세력 추적  2. 고래 행동  3. 거래량 구조  4. FVG/BPR/OB  5. 유동성
6. 펀딩/포지션  7. 구조 패턴  8. 온체인/심리  9. 거시 지표  10. AI 오차 피드백

## ailongshort 통합·분석 (공유 분석 TF + zone 작도)

코드 출처: `lib/mergedDesk4hReference.ts`, `lib/mergedDesk4hReferenceAnalysis.ts`  
**Zone 작도 전용:** `.cursor/skills/btc-eth-zone-draw/SKILL.md`

| 항목 | 정책 | 적용 TF |
|------|------|---------|
| 공유 분석 TF | `MERGED_DESK_SHARED_ANALYZE_TF` (현재 15m) | 1m~1M 공동 |
| zone 좌 | 분석/형성 캔들 (`mergedDeskAnalyzedZoneSpanTimes`) | 전 TF |
| zone 우 | **마지막 생신 캔들** (가격축 과연장 금지) | 전 TF |
| numbered / S·R cap | 지지·저항 각 ≤3 | 전 TF |
| 스윙 채널·regime | 공유 엔진 경로 | 전 TF (스윙 토글 시) |

구현 시 우선 확인: `lib/mergedAnalysisOverlayTimes.ts`, `lib/mergedAnalysisDeskEngine.ts`, `lib/mergedDeskMirageStyleDraw.ts`, `app/components/ChartView.tsx`.

## Chart drawing rules

- LQ, FVG, OB, BPR, BOS, ChoCH 라벨
- Zone rectangles for supply/demand
- Green/red/orange/blue semantics consistently

## Risk guardrails

- Educational only, not financial advice
- Max account risk 5% default in trade plans
- Mark low conviction as WAIT
- RR below 1.5R → warn

## References

- `assets/crypto-chart-master/references/analysis-playbook.md`
- `assets/crypto-chart-master/references/chart-ui-spec.md`
- `assets/crypto-chart-master/references/cursor-rules.md`
