---
name: btc-eth-zone-draw
description: >
  BTC/ETH(및 알트) Supply·Demand·OB·FVG·HotZone 네모 작도 구현용 스킬.
  통합·분석 데스크 zone 복구·앵커·TF 공용 작도, ChartView HTML zone 면, lightweight-charts
  좌표 스냅 작업 시 사용. Trigger: zone, 존, supply, demand, OB, FVG, HotZone, 작도,
  BTC zone, ETH zone, 통합분석 zone, 마지막 캔들, 형성봉.
---

# BTC/ETH Zone 작도 (ailongshort)

외부 스킬(market-structure-ta · longbridge-technical SMC · mmt-tradingview-charts ·
crypto-chart-master · chart-analysis-core)을 **이 앱 코드 경로에 맞게** 압축한 구현 스킬.

## 언제 읽나

- 사용자가 zone 네모·작도·복구·앵커·TF 공용 적용을 요청할 때
- 통합·분석(`MERGED_ANALYSIS_DESK`) zone이 사라지거나 좌/우가 어긋날 때
- BTC/ETH 차트에 Supply/Demand/OB/FVG를 추가·수정할 때

## 절대 규칙 (앱)

1. **기능 삭제 금지** — 사용자 명시 지시 전 zone/엔진/오버레이 제거 금지.
2. **고정 승률·수익 보장 문구 금지**.
3. **다중 TF** — 상위 구조 → 하위 타이밍. 단정은 단일 TF만으로 하지 않음.
4. 통합·분석 공유 분석 TF: `lib/mergedDesk4hReferenceAnalysis.ts` (`MERGED_DESK_SHARED_ANALYZE_TF`, 현재 15m).
5. Zone UI는 **캔들 면 네모 + 가격선/라벨**. 고래 DNA 카드/HUD 금지 규칙은 whale 작업에만 적용.

## Zone 작도 모델 (TV식)

| 축 | 규칙 |
|----|------|
| **좌(time1)** | 분석/형성 캔들 (스윙고·저 정의봉, OB 형성봉, Mirage formation) |
| **우(time2)** | 차트 **마지막 생신 캔들** — 가격축(빈 오른쪽)까지 과연장 금지 |
| **상·하(price)** | 형성봉 wick~body 허그 또는 key/critical top·bot |
| **줌/패닝** | 절대시각 → 현재 TF 캔들 스냅 (`snapMergedOverlayTimeToCandles`). 빈 축 x=0 외삽 금지 |
| **심볼** | BTC/ETH/알트 동일 파이프 — 심볼별 분기 없이 캔들 시계열만 다름 |
| **TF** | 1m~1M 공동. 사용자가 고른 분봉이 아니라 **차트에 올라간 봉** 기준 |

## 품질 캡 (차트 가독성)

외부 SMC/PA 스킬 + crypto-chart-master 합의:

- 기본 표시: **지지 ≤3 · 저항 ≤3** (고신뢰만). 나머지는 토글/약화.
- 색: Demand/지지 녹·청, Supply/저항 빨·주황. 반투명 fill + 얇은 border.
- 라벨: 존·가로선 모두 **우측(마지막 캔들 쪽)**에 짧게 (예: 지지1, Entry, TP1).  
  좌측(`minX+4` / align left) 세로 스택 금지 — 15m 등에서 HQ·손절·진입 라벨이 왼쪽에 몰리면 ChartView `getLabelAlign`·`lineLabelLeft`·`isMergedAresZoneLabel` 확인.
- 캔들이 항상 위에 읽혀야 함 — zone alpha 과다 금지.

## POI 우선순위 (무엇을 zone으로 그릴지)

`market-structure-ta` / longbridge SMC 기준, 앱에 매핑:

1. **HotZone** 위1(저항)·아래1(지지) — `lib/mergedDeskHotZoneEntry.ts`
2. **key + critical** — `lib/mergedAnalysisKeyZones.ts`, `lib/mergedAnalysisCriticalZones.ts`
3. **coreSr** — `lib/mergedDeskCoreSrZones.ts`
4. **Mirage TV** Resistance-level / Major-Support / Consolidation / FVG — `lib/mergedAnalysisMirageTvVisual.ts`
5. **HQ / 시나리오 / 지지반등** — 병행 주입, 화이트리스트 통과 필수

A+ 겹침(Unicorn급): OB+FVG+미테스트+BOS 원인 → 합류 zone (`merged-ares-mlsp-tv-confluence-zone`).

## 코드 진입점 (수정 시 이 순서)

```
runMergedAnalysisDeskEngine          lib/mergedAnalysisDeskEngine.ts
  ├ buildMergedDeskMirageStyleDrawPack
  ├ buildMergedDeskMirageEnhanceOverlays
  ├ tradePack.overlays          ← key/critical/confirm/시나리오 (삭제 금지)
  ├ coreSr.overlays / hqEntryZones.overlays
  ├ hotZoneEntry.overlays
  ├ alignMergedDeskOverlaysToAnalysisWindow   lib/mergedAnalysisOverlayTimes.ts
  └ finalizeMergedDeskMirageChartOverlays     lib/mergedDeskMirageStyleDraw.ts
       └── keepMirageDeskOverlay 화이트리스트 (zone 복구 시 여기 확인)

ChartView screenOverlays             app/components/ChartView.tsx
  ├ mergedDeskAnalyzedZoneScreenSpan / resolveMirageZoneScreenSpan
  └ 우측 X = mergedDeskSeriesLastBarScreenX (마지막 봉)
```

### 삭제되면 안 되는 주입 목록

엔진 `chartOverlays`에 반드시 포함:

- Mirage TV overlays
- `tradePack.overlays`
- `coreSr.overlays`
- `hqEntryZones.overlays` (있을 때)
- HotZone · downside · swingMid

`finalize` 화이트리스트에 confirm / `merged-smc-*` / settle·bounce·scenario 허용 유지.

## 앵커 헬퍼

| 함수 | 역할 |
|------|------|
| `mergedDeskAnalyzedZoneSpanTimes` | time1=형성 · time2=마지막 봉 |
| `extendOverlayFromAnalyzedCandleToLast` | zone 면 시간 연장 |
| `isMergedDeskAnalyzedCandleSpanOverlay` | TV식 span 대상 판별 |
| `isMergedDeskLastCandleAnchorOverlay` | E/SL/TP **짧은 레일만** (zone 면 제외) |
| `resolveMirageZoneFacePixels` | Mirage 픽셀 좌·우 (logical 봉) |

## Lightweight Charts 작도 주의 (mmt-tradingview-charts)

- series/refs는 `useRef` — zone HTML 오버레이도 차트 timeScale과 동기.
- TF/심볼 전환 시: 캔들 `setData`와 overlay remap을 **같은 캔들 배열**로.
- `logicalToCoordinate(lastIndex)` = 우측 끝. `chartRightPx`(가격축)로 zone을 늘리지 말 것.
- 줌 시 time→X 실패하면 빈 축(x≈0)으로 밀림 → first/last bar X로 클램프.

## 분석 렌즈 (작도 전 판단)

1. HTF 구조 (1D/4h) → BOS/CHoCH
2. Liquidity (BSL/SSL, EQH/EQL)
3. POI (OB/FVG/Supply/Demand)
4. LTF 확인 후 zone time1 확정
5. 차트에 네모: 형성봉 → 마지막 봉

출력/브리핑은 `chart-analysis-core` 시나리오 형식. 확정 수익 금지.

## 참조 (학습 원본)

- `.cursor/skills/market-structure-ta/` — Wyckoff/SMC/PA, POI, Unicorn
- `.cursor/skills/longbridge-technical/references/smc.md` — BOS/FVG/OB
- `.cursor/skills/mmt-tradingview-charts/` — LWC React/실시간
- `.cursor/skills/crypto-chart-master/` + `assets/crypto-chart-master/references/`
- `.cursor/skills/chart-analysis-core/`
- `.cursor/skills/technical-analysis/` (Bitget 지표)
- `.cursor/skills/trading-visualization/`

## 배포

서버 반영 경로: `/root/ailongshort` 만. zone 패치 시 최소:

- `lib/mergedAnalysisDeskEngine.ts`
- `lib/mergedDeskMirageStyleDraw.ts`
- `lib/mergedAnalysisOverlayTimes.ts`
- `lib/mergedDeskMirageZoneScreen.ts`
- `app/components/ChartView.tsx`
