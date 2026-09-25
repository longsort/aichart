# IMPLEMENTATION_PLAN — CORE ZONE + STRATEGY ZONE + Smart Money / Orderflow

**기준:** 사용자 MASTER Implementation Command (2026-08-22) + `ZONE_AUDIT_REPORT.md`  
**방식:** 合并 · 强化 · 优化 (재작성·삭제 금지)  
**MASTER 엔진:** TypeScript `lib/eagle1/*` + `pipeline.ts`  
**선행 spine:** `docs/IMPLEMENTATION_PLAN-2026-08-21.md`  
**게이트:** Phase 테스트 FAIL → 다음 Phase 금지 · NO FAKE DATA · NO REPAINT · NO PLACEHOLDER

## UI 배선 (중요 · 2026-08-22)

이전 Phase 2–9는 `lib/eagle1/pipeline` + selftest에만 있고 **통합분석 차트에 안 붙었음**.

표시 경로(수정 후):

`/api/analyze` → `eagle1CoreZoneFusion` / `eagle1StrategyFusion`  
→ `buildMergedDeskEagle1CoreInject`  
→ `MergedAnalysisDeskView` deskPack.overlays / priceLines  
→ `ChartViewMergedServer`

확인: 통합·분석에서 분석 로드 후 CORE SUPPORT/RESISTANCE · A+ 면·가격선.

---

## 목표 한 줄

기존 Zone을 **CORE SUPPORT/RESISTANCE**로 밀도 합병하고, 검증 가능한 매매 원리만 **STRATEGY ZONE**으로 분리한 뒤, 겹치면 **A+ ZONE**으로 압축하여 **캔들 가격좌표**에 Entry/SL/TP1–3·Break/Retest·Path를 그린다.

---

## 철학

| 순서 | 내용 |
|------|------|
| 1 | PRICE FIRST — 차트 좌표 |
| 2 | ZONE — CORE / STRATEGY / A+ |
| 3 | EVIDENCE — 독립 그룹 |
| 4 | SIGNAL — WAIT/CONFIRM |
| 5 | UI LAST — Eagle1 HUD 언어 유지, 카드 남발 금지 |

비교 후: OLD vs NEW → MERGE / ENHANCE / OPTIMIZE. 성능·정확성 저하 변경 금지.

---

## 재사용 맵 (삭제 금지)

| MASTER 개념 | 기존 | 조치 |
|-------------|------|------|
| MarketZone | `Eagle1Zone` (`zoneEngine.ts`) | 어댑터 + 상태 enum 확장 |
| DataQualityGate | `qualityGate` · `dataQualityValidator` | 이름 정렬 또는 alias |
| MarketDataRepository | `marketDataBus` · `dataService` | 공통화 문서화 |
| Core fusion 후보 | `unifiedZoneDesk` · `mtfSmartZoneEngine` | Density 엔진으로 강화 |
| Strategy 후보 | `legendaryStrategyFusion` · combination families | StrategyZone 객체 + 10 래퍼 |
| Flow | `orderFlowFacade` · microstructure · moneyPressure | `FlowConfirmationEngine` 파사드 |
| Squeeze | `squeezeRadarEngine` | 연결만 |
| Confluence | `smcConfluence` · `combinationEngine` | `ConfluenceEngine` 독립그룹 |
| Entry/SL/TP | executionLevels · risk · target | Practical 가격선 |
| Position | positionManagement · tradeManage | TP1/TP2 Continuation 강화 |
| Path | smartPath · historicalSimilarity | 표본 없으면 UNAVAILABLE |
| Renderer | zoneOverlays · chartUx · overlayBudget | 레이어 우선순위 |
| Merged desk zones | Mirage/whale/hot/coreSr | **어댑터 입력** · Practical에서 개별 박스 억제 |

---

## Practical Mode 표시 (기본)

최대:

- CORE SUPPORT ×1 · CORE RESISTANCE ×1  
- A+ LONG ×1 · A+ SHORT ×1  
- 최근 Liquidation Zone  
- 활성 Entry / Stop / TP1–3  
- 중요 Structure Event (BOS/CHoCH/SWEEP/FAKE BREAK)  

DETAIL MODE에서만 OB/FVG/BPR/POC/Whale/개별 Strategy 박스.

---

## Phase 로드맵

### PHASE 1 — AUDIT ✅

**산출:** `ZONE_AUDIT_REPORT.md` · 본 계획서  
**테스트:** 문서 존재 · 기존 selftest 회귀(구현 전 스냅샷)

---

### PHASE 2 — MarketZone 공통화 ✅ (2026-08-22)

**완료:**

- `lib/eagle1/marketZone.ts` — MASTER `MarketZone` + lifecycle alias (`TESTED↔TESTING`, `WEAK↔WEAKENING`, …)
- `eagle1ZoneToMarketZone` / `marketZoneToEagle1Zone` round-trip
- `sourceTimeframe` 필수 · 점수 없으면 `null` (0 위장 금지)
- `applyMarketZoneStateWithoutMovingBounds` — CONFIRMED/frozen 가격 고정
- export: `lib/eagle1/index.ts`
- selftest: `scripts/eagle1-engines-selftest.ts` (`marketZoneAdapterSelftest` + zone sample round-trip)

**삭제 파일:** 없음  
**테스트:** `npm run eagle1:engines:selftest`  
**다음:** PHASE 3 CoreZoneFusionEngine

---

### PHASE 3 — CoreZoneFusionEngine ✅ (2026-08-22)

**완료:**

- `lib/eagle1/coreZoneFusionEngine.ts` — CORE SUPPORT/RESISTANCE (각 최대 1)
- Density peak 압축 (full Demand min/max 금지)
- `pipeline.ts` → `coreZoneFusion` + CORE midpoint priceLines
- Practical overlays: CORE 있으면 cluster 다수 박스 대신 CORE face
- Acceptance A selftest 통과

**삭제:** 없음 (기존 zoneEngine/cluster/unified 유지)  
**테스트:** `npm run eagle1:engines:selftest`  
**다음:** PHASE 6 Strategy Engines (5 Renderer는 CORE overlays로 1차 포함)

---

### PHASE 4 — ZoneDensityProfile ✅ (2026-08-22)

**완료:**

- `lib/eagle1/zoneDensityProfile.ts` — bin density · peakBand
- CORE fusion 입력으로 사용
- 소스 가중치는 휴리스틱 초기값 (승률 아님)

**테스트:** Acceptance A에 포함

---

### PHASE 5 — CORE Renderer ✅ (1차, 2026-08-22)

**완료:**

- `coreZoneToOverlay` / `coreZoneFusionToOverlays` in `zoneOverlays.ts`
- Practical Mode: CORE face + POC line
- ChartUx CORE SUPPORT/RESISTANCE 가격선

**남은:** CSS 톤 미세조정 · DETAIL MODE에서 raw evidence 복원 UI

---

### PHASE 6 — Strategy Engines (래핑 우선) ✅ (1차, 2026-08-22)

**완료:**

- `lib/eagle1/strategyZone.ts` — StrategyZone 계약
- `lib/eagle1/strategyEngines.ts` — Trend/LiqReversal/OB/Mitigation/POC/VCP/Asym 래핑
- pipeline `strategyPack`
- Whale/Accum-Distrib/Darvas 전용은 후속(어댑터)

**테스트:** engines selftest  
**다음:** PHASE 7 완료분과 함께 Flow/Confluence

---

### PHASE 7 — StrategyZoneFusionEngine ✅ (1차, 2026-08-22)

**완료:**

- `lib/eagle1/strategyZoneFusionEngine.ts` — 방향별 A+ density fusion
- Acceptance B selftest
- A+ midpoint priceLines on chartUx

**테스트:** Acceptance B 통과

---

### PHASE 8 — FlowConfirmationEngine ✅ (2026-08-22)

**완료:**

- `lib/eagle1/flowConfirmationEngine.ts` — STRONG_BUY…STRONG_SELL / UNAVAILABLE
- orderFlowFacade 재사용 · 점수 없으면 null (Acceptance I)
- pipeline `flowConfirmation`

**테스트:** flowConfirmationAcceptanceI

---

### PHASE 9 — ConfluenceEngine + A+ ✅ (1차, 2026-08-22)

**완료:**

- `lib/eagle1/confluenceEngine.ts` — 8 Evidence Group · SMC dampen
- Setup Score ≠ Historical Win Rate 분리
- A+ priceLines는 confluence 게이트 통과 시에만
- pipeline `confluence`

**테스트:** confluenceSmcDampSelftest + engines selftest

---

### PHASE 10 — Entry / Stop / TP1–3 ✅ (2026-08-22)

**완료:**

- `executionLevels` — `practicalPriceLines` · structure anchors (CORE/liq/POC)
- 통합 desk inject 전폭 E/SL/TP 가격선 + thin MAIN ENTRY (`eagle1-exec-entry`)
- Acceptance `executionLevelsAcceptancePriceCoords`

**테스트:** executionLevelsAcceptancePriceCoords + engines selftest

---

### PHASE 11 — Position Management + Continuation ✅ (2026-08-22)

**완료:**

- `continuationEngine` — CONTINUE / HOLD / REDUCE / EXIT (`autoBeForbidden`)
- pipeline `continuation` after positionManagement · analyze `eagle1Continuation`
- Acceptance G·H (`continuationAcceptanceGH`)

**테스트:** continuationAcceptanceGH + engines selftest

---

### PHASE 12 — Historical Event DB ✅ (2026-08-22)

**완료:**

- `lib/eagle1/historicalEventStore.ts` — file store under `data/eagle1/events/{symbol}_{timeframe}.json`
- Fields: `event_id` · `evidence` · frozen entry/stop/tp1 · `outcome.mfe/mae` (outcome layer only)
- Index: `by_event_id` · `by_family` · `by_timeframe` · `updated_at` (documented in store header; **no Prisma/WMS**)
- Immutability: re-append same `event_id` is no-op; `updateHistoricalEventOutcome` cannot touch frozen fields
- Adapter: `setupOutcomeToHistoricalEvent` · freezeStore thin wrappers (`appendHistoricalEvent` / `loadHistoricalEvents` / `updateHistoricalEventOutcome`)
- Pipeline/analyze: no per-request event I/O (disk thrash 방지); selftest uses temp root

**Index fields (file store):**

| Field | Meaning |
|-------|---------|
| `by_event_id` | event_id → row array index |
| `by_family` | family → event_id[] |
| `by_timeframe` | timeframe → event_id[] |
| `updated_at` | last index rebuild (unix ms) |

**테스트:** `historicalEventStoreAcceptance` + engines selftest

---

### PHASE 13 — Replay 동일 엔진 ✅ (2026-08-22)

**완료:**

- `liveReplayParityHash` / `snapshotKey` 확장 — coreZoneFusion · strategyFusion · flowConfirmation · confluence · executionLevels.practicalPriceLines · continuation
- 동일 `runEagle1Pipeline` 경로 (Live/Replay) · deterministic string join · no Date.now/random
- Acceptance D: `replayFusionParityAcceptanceD` — checkpoint parity + prefix vs `endExclusive=T` (미래 봉 누수 금지)

**테스트:** replayFusionParityAcceptanceD + engines selftest

---

### PHASE 14 — Calibration ✅ (2026-08-22)

**완료:**

- `calibrationGate.ts` — Setup Score ≠ Historical Win Rate · `LOW_SAMPLE` / `WALK_FORWARD` / `UNAVAILABLE`
- Equality strip: `round(hist*100)===setupScore` → hist null (`scoresEqualForbidden: true`)
- Walk-forward label only when `sample ≥ EAGLE1_MIN_STAT_SAMPLE` · no invented rates
- pipeline `calibrationGate` · analyze `eagle1CalibrationGate`
- confluence: refuse hist copy of setupScore; scoreCalibrationView 문서 링크

**테스트:** calibrationGateAcceptance + engines selftest

---

### PHASE 15 — Historical Path ✅ (2026-08-22)

**완료:**

- `historicalPathGate.ts` — LOW_SAMPLE / NO_OUTCOMES / NO_STRUCTURE → `PATH UNAVAILABLE`
- `smartPath` uiState `PATH_UNAVAILABLE` · empty points (no invented zigzag)
- Evidence-backed points only (ENTRY/TP/STOP…) · `isEvidenceBackedPathPoints` rejects decorative zigzags
- pipeline `historicalPathGate` · analyze `eagle1HistoricalPathGate`
- Acceptance J: `historicalPathAcceptanceJ`

**테스트:** historicalPathAcceptanceJ + engines selftest

---

### PHASE 16 — UI Integration ✅

- Practical Mode 필터 (merged Mirage 개별 박스 OFF 기본)
- Zone 클릭 Detail Panel (영문 라벨 + 한국어 설명)
- Eagle1 HUD 디자인 유지 · 고래 **카드 UI 금지** 규칙 준수
- Debug Mode: Raw / Merged / Density / Strategy / A+

**완료 기록:** `lib/eagle1/mergedDeskPracticalUi.ts` · settings `chartMergedDeskEagle1UiMode`/`DebugLayer` · `MergedAnalysisDeskView` 실전/디버그 칩 · compact zone detail strip · selftest `mergedDeskPracticalUiAcceptance`
---

### PHASE 17 — Performance ✅

새 봉·TF 변경·live batch에서만 재계산 · Historical Zone cache

**완료 기록:** `lib/eagle1/historicalZoneCache.ts` (LRU·`shouldRecomputeEagle1Zones`) · `lib/eagle1/pipelineMemo.ts` (`runEagle1PipelineMemoized` 2s TTL, closedBar 키) · analyze route 메모 연결 · freezeStore/zoneFreeze/endExclusive 유지 · selftest acceptance

---

### PHASE 18 — Screenshot 비교 ✅

가격좌표·투명도·가독성 — 숫자 하드코딩 금지

**완료 기록:** `lib/eagle1/screenshotVisualContract.ts` — Practical max · price-space roles · opacity · no whale card · source에 BTC 가격 리터럴 금지 acceptance

---

### PHASE 19 — Final Acceptance ✅

MASTER §94 체크리스트 전부 통과 시에만 “완료” 보고.

**완료 기록:** `lib/eagle1/masterAcceptanceChecklist.ts` · `runMasterAcceptanceChecklist` · selftest 게이트. **완료 보고는 master checklist ALL PASS 시에만**

---

## Phase 완료 시 필수 기록

각 Phase 종료 로그:

1. 변경/신규/삭제(삭제=0 원칙) 파일  
2. 구현 내용  
3. 사용 실데이터  
4. 테스트 결과 · 실패  
5. 남은 TODO · 다음 Phase  

---

## 즉시 하지 않을 것

- 프로젝트 전체 재작성  
- merged/Mirage/whale 엔진 삭제  
- Placeholder UI / 하드코딩 가격 / 임의 승률  
- Telegram → Engine 역파싱  
- AUDIT 없이 Strategy 10종 일괄 신규 작성  

---

## 다음 실행 (사용자 승인 후)

**PHASE 2만:** `marketZone.ts` 어댑터 + lifecycle alias + selftest  
승인 없이 Phase 3+ 코드 대량 변경 금지.
