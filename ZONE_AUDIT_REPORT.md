# ZONE_AUDIT_REPORT — 독수리1호 CORE/STRATEGY Zone

**작성일:** 2026-08-22  
**범위:** `ailongshort` 실제품(TypeScript Next) 중심. Dart/Python은 병렬 스택으로만 기록.  
**원칙:** AUDIT 완료 전 핵심 엔진 재작성 금지. 기존 기능 삭제 금지.  
**관련:** `IMPLEMENTATION_PLAN.md` · 기존 spine `IMPLEMENTATION_PLAN.md` 이력 / `docs/IMPLEMENTATION_PLAN-2026-08-21.md` · `.cursor/skills/{zone,signal,market-structure,non-repaint}-engine`

---

## 0. 요약 판정

| 항목 | 판정 |
|------|------|
| 독수리1호 causal spine | **있음** — `lib/eagle1/pipeline.ts` (structure → zone → risk → plan → path) |
| CORE ZONE Fusion (증거밀도 압축) | **부분** — cluster/`mtfSmartZoneEngine`/`unifiedZoneDesk` 있으나 `CoreZoneFusionEngine`·`ZoneDensityProfile` **미구현** |
| STRATEGY ZONE 10종 독립 엔진 | **부분** — `legendaryStrategyFusion` 내부 family 투표만. Darvas/VCP/OB retest 등 **별도 StrategyZone 객체 없음** |
| A+ Confluence | **부분** — combination promote + sample gate. 독립 Evidence Group 상관 감안 **미완성** |
| Bitget 실데이터 | **있음** — candles WS/REST + collectors(OI/funding/ob/liq/fills) via `dataService` |
| DataQualityGate | **있음** — `qualityGate.ts` / `dataQualityValidator.ts` (이름만 다름) |
| No-repaint / freeze | **있음** — `repaintGate` · `predictionSnapshot` · zone freeze |
| 차트 가격좌표 작도 | **있음** — `zoneOverlays` → ChartView / ChartViewMergedServer |
| 차트 과밀 | **위험** — merged desk가 Eagle1과 **별도 zone 빌더** 다수 동시 렌더 |
| Placeholder / 가짜 확률 | 정책상 `noFakeNumbers.ts` · UNAVAILABLE 경로 존재 — 준수 강제 유지 필요 |

**결론:** 처음부터 새 스택을 만들지 말고, **`lib/eagle1/*`를 MASTER로 합병·강화**하고, merged-desk 중복 zone은 **어댑터 입력 → CORE/STRATEGY 출력만 Practical Mode에 표시**.

---

## 1. 기존 데이터 출처

| 데이터 | 출처 | 경로 |
|--------|------|------|
| OHLCV (Binance spot) | REST | `lib/market.ts` → `app/api/market` |
| OHLCV (Bitget USDT-M) | REST + WS | `lib/bitgetFuturesMarket.ts` · `lib/bitgetCandleWebsocket.ts` → `app/api/market-bitget` |
| Client candle cache | 브라우저 SWR | `lib/clientMarketCandleCache.ts` |
| Trades / fills | REST collectors | `lib/data/collectors/*Trades*` · `bitgetFuturesFillsCollector` |
| Orderbook | REST | `orderbookCollector` · `bitgetFuturesOrderbookCollector` |
| OI / Funding / L-S ratio | REST | `openInterestCollector` · `fundingCollector` · `longShortRatioCollector` |
| Liquidations | REST | `liquidationsCollector` · `bitgetFuturesLiquidationsCollector` |
| Unified live pack | 서버 오케스트레이션 | `lib/data/dataService.ts` → `fetchMarketData` |
| Shared bus | 프로세스 내 | `lib/eagle1/marketDataBus.ts` |
| Eagle1 history / freeze | 파일 JSON | `lib/eagle1/historicalDatabase.ts` · `freezeStore.ts` · `data/eagle1/` |
| Prisma | **WMS only** | `prisma/schema.prisma` — 거래 Zone DB **아님** |

---

## 2. API Endpoint (관련)

| Route | 역할 |
|-------|------|
| `app/api/analyze/route.ts` | 메인 분석 + Eagle1 pipeline 주입 |
| `app/api/market` / `market-bitget` | 캔들 |
| `app/api/eagle1/quality` | quality / coverage / repaint 리포트 |
| `app/api/zone-reaction` | zone 반응 (trades/delta) |
| `app/api/zone-battle-mtf` | MTF zone battle |
| `app/api/mirage-zone-intel` | Mirage zone intel |
| `app/api/path` | path candles |
| `app/api/backtest` | backtest |
| `app/api/telegram/*` · cron | 알림 (Engine snapshot만 사용해야 함) |

**UNAVAILABLE:** 공개 `/api/oi` · `/api/cvd` · `/api/orderbook` 단독 라우트 (analyze/dataService 내부 소비).

---

## 3. WebSocket

| 채널 | 경로 |
|------|------|
| Binance spot candles | `lib/websocket.ts` |
| Bitget futures candles | `lib/bitgetCandleWebsocket.ts` |
| Dart Bitget WS (병렬) | `lib/data/bitget_public_ws.dart` 등 — **웹 ChartView 경로와 분리** |

---

## 4. DB Table

| 저장소 | 내용 |
|--------|------|
| Prisma | WMS — Zone/Setup **미사용** |
| `data/eagle1/` 파일 | coverage · quality · freeze · history |
| Dart SQLite | FU 트레이드 로그 (웹과 분리) |

**MASTER 요구 Historical Event DB:** 스키마는 `zoneExpectancy` / `predictionSnapshot` / `freezeStore`에 **부분 존재**. 정식 SQL 테이블·인덱스(symbol/tf/timestamp/zone_type/…)는 **미구축** → Phase 12에서 파일→구조화 확장 권장 (Prisma WMS 혼용 금지).

---

## 5. 각 Engine (재사용 맵)

### 5.1 Eagle1 MASTER (재사용 최우선)

| Engine | 파일 | MASTER 대응 |
|--------|------|-------------|
| Structure (BOS/CHoCH/Sweep/EQ/Wyckoff) | `structureEngine.ts` | §4·§11·§14 |
| Structure Acceptance | `structureAcceptanceEngine.ts` | §47 Break Acceptance |
| Zones (POC/HVN/LVN/VAH/VAL/OB/FVG/BPR/breaker/D/S/SR/liq) | `zoneEngine.ts` | §5–§6 입력 |
| Zone overlays | `zoneOverlays.ts` | §48 Renderer 입력 |
| Unified zone desk | `unifiedZoneDesk.ts` | CORE 표시 후보 |
| MTF smart zone | `mtfSmartZoneEngine.ts` | A+ 등급 후보 |
| SMC confluence | `smcConfluence.ts` | §24 일부 |
| Combination / mining | `combinationEngine.ts` · `combinationMiningEngine.ts` | §40 |
| Legendary fusion | `legendaryStrategyFusion.ts` | STRATEGY 태그 (이름 비노출) |
| Order flow facade | `orderFlowFacade.ts` · `microstructureSeries.ts` · `moneyPressureBand.ts` | §22 |
| Squeeze radar | `squeezeRadarEngine.ts` | §21 |
| Liq zones | `liqZoneEngine.ts` | Liquidation layer |
| False break | `falseBreakEngine.ts` · `fakeBreakChartOverlay.ts` | §46 |
| Premium/Discount | `premiumDiscountEngine.ts` | §44 |
| Signal / opportunity | `signalEngine.ts` · `tradeOpportunityEngine.ts` | §59 |
| Entry/Stop/TP | `entryOptimizer` · `stopOptimizer` · `targetEngine` · `executionLevels` · `riskEngine` | §33–§34 · §60 |
| Position mgmt | `positionManagementEngine.ts` · `tradeManage.ts` | §29–§32 · §62 |
| Path | `smartPath.ts` · `smartFuturePathEngine.ts` · `historicalSimilarity.ts` | §35–§36 |
| Replay / WF | `replayEngine.ts` · `walkForwardBacktest.ts` · `costAwareWalkForward.ts` | §55–§56 |
| Quality / repaint | `qualityGate.ts` · `dataQualityValidator.ts` · `repaintGate.ts` | §3 · §54 |
| Pipeline compose | `pipeline.ts` | Live/Replay 동일 진입점 |
| HUD | `hudPack.ts` · `app/components/eagle1/Eagle1AiHud.tsx` | UI 언어 유지 |
| No fake numbers | `noFakeNumbers.ts` | §13 · §36 · §93 |

### 5.2 Merged desk (중복 — 삭제 금지, 입력 어댑터화)

| Builder | 파일 | 조치 |
|---------|------|------|
| Mirage OB/VP/pivot | `mergedDeskAdvancedCandleZones.ts` | CORE evidence adapter |
| Core S/R faces | `mergedDeskCoreSrZones.ts` · `mergedAnalysisCoreChartZones.ts` | Practical Mode에서 개별 박스 억제 → CORE만 |
| Key/Critical | `mergedAnalysisKeyZones.ts` · `mergedAnalysisCriticalZones.ts` | DETAIL 또는 evidence |
| Whale auto | `whaleAutoZones.ts` | Whale Defense evidence |
| Hot / pullback | `hotZoneRadar.ts` · `pullbackHotZoneEngine.ts` | DETAIL |
| Volume AI zones | `volumeAiZoneEngine.ts` | DETAIL |
| Strong zone (OB tape) | `lib/zone/*` | Flow/whale evidence |
| Month OB-FVG fusion | `monthDeskObFvgFusion.ts` | Mitigation evidence |
| Desk engine | `mergedAnalysisDeskEngine.ts` | HUD 문자열 — 차트 가격은 Eagle1 VM 우선 |

### 5.3 병렬 스택 (웹 차트에 직접 연결하지 않음)

- Python: `engine/modules/*` · `trading_engine/engine/*`
- Dart: `lib/core/engines/*` · `lib/engine/zone*` · painters

→ 삭제 금지. 웹 MASTER는 TS Eagle1. 필요 시 아이디어만 이식.

---

## 6. Zone 생성 함수 (핵심)

| 함수 | 파일 | 비고 |
|------|------|------|
| `detectZonesCausal` | `zoneEngine.ts` | causal · freeze lifecycle |
| `volumeProfile` · `classifyPocState` | `zoneEngine.ts` | POC state machine 이미 풍부 |
| `applyZoneLifecycle` | `zoneEngine.ts` | CONFIRMED 후 가격 고정 |
| `buildUnifiedZoneDesk` | `unifiedZoneDesk.ts` | cluster VM |
| `runMtfSmartZoneEngine` | `mtfSmartZoneEngine.ts` | A+/A |
| `runLegendaryStrategyFusion` | `legendaryStrategyFusion.ts` | chartTag만 |
| Mirage / whale / hot builders | merged* · whale* · hot* | 다중 박스 과밀 원인 |

**현재 ZoneLifecycle:** `PENDING | CONFIRMED | FRESH | TESTED | WEAK | BROKEN | INVALID | DELETED`  
MASTER 확장 상태(`APPROACHING`, `DEFENDING`, `FLIPPED` 등)는 **부분만 존재** → 상태 매핑 테이블로 합병 (삭제 없이 enum 확장).

---

## 7. Renderer

| 계층 | 경로 |
|------|------|
| Overlay 변환 | `lib/eagle1/zoneOverlays.ts` · `structureOverlays.ts` · `chartUx.ts` · `overlayBudget.ts` |
| Chart | `ChartView.tsx` · `ChartViewMergedServer.tsx` |
| Desk UI | `MergedAnalysisDeskView.tsx` · `Eagle1AiHud.tsx` |
| Fake break pin | `fakeBreakChartOverlay.ts` |

**규칙 준수 여부:** Engine → OverlayItem → LWC `priceToCoordinate` 경로가 기본. UI에서 가격 하드코딩은 금지 유지.

---

## 8. 현재 Zone State (제품)

- Eagle1: causal zones + tier S/A/B/C + POC state + smart zone grades  
- Practical 표시: `overlayBudget` / chart mode 필터 존재하나 **merged desk가 별도 레이어를 대량 추가** → 사용자 체감 “존 남발”  
- Entry/SL/TP: `executionLevels` + priceLines (통합 데스크는 풀폭 가격선 정책)

---

## 9. 중복 기능

1. Eagle1 `zoneEngine` vs Mirage advanced zones vs month OB-FVG vs whale boxes  
2. Structure events: Eagle1 vs `smcDeskOverlay` vs merged CHoCH-OB path  
3. Absorption: `signal-engine/absorption.ts` vs candle ABSORB vs volume bolt confluence  
4. Path: Eagle1 smartPath vs `app/api/path` vs Dart future_path  
5. Signal/risk: Eagle1 vs `lib/signal-engine/*` vs Python signal  

→ **삭제하지 않고** Eagle1 ViewModel로 **표시 우선순위만 합병**.

---

## 10. 재사용 가능 기능 (바로 쓰기)

- Pipeline + quality/repaint gates  
- Zone freeze / expectancy / combination mining  
- Squeeze + liq + false break + premium/discount  
- Entry/Stop/TP1–3 + position management  
- Historical similarity + walk-forward  
- marketDataBus + dataService collectors  
- Chart overlay budget + Eagle1 HUD 디자인 언어  

---

## 11. 수정 대상 파일 (예정 — 구현 전)

- `lib/eagle1/zoneEngine.ts` · `unifiedZoneDesk.ts` · `mtfSmartZoneEngine.ts` · `smcConfluence.ts`  
- `lib/eagle1/pipeline.ts` · `chartUx.ts` · `zoneOverlays.ts` · `overlayBudget.ts` · `hudPack.ts`  
- `lib/eagle1/legendaryStrategyFusion.ts` · `combinationEngine.ts` · `signalEngine.ts` · `executionLevels.ts`  
- `app/api/analyze/route.ts`  
- `ChartView.tsx` / `ChartViewMergedServer.tsx` (렌더 우선순위만)  
- `MergedAnalysisDeskView.tsx` · `mergedAnalysisOverlayIds.ts` · `mergedDeskMirageStyleDraw.ts` (Practical Mode 필터)  
- `types` / settings feature flags  

---

## 12. 신규 파일 (예정)

| 신규 | 역할 |
|------|------|
| `lib/eagle1/marketZone.ts` | 공통 MarketZone 타입 (기존 Eagle1Zone 어댑터) |
| `lib/eagle1/zoneDensityProfile.ts` | Evidence density binning |
| `lib/eagle1/coreZoneFusionEngine.ts` | CORE SUPPORT/RESISTANCE |
| `lib/eagle1/strategyZone.ts` | StrategyZone 계약 |
| `lib/eagle1/strategy/*` | 10종 전략 엔진 (기존 로직 래핑 우선) |
| `lib/eagle1/strategyZoneFusionEngine.ts` | A+ 가격대 압축 |
| `lib/eagle1/flowConfirmationEngine.ts` | orderFlowFacade 파사드 강화 |
| `lib/eagle1/confluenceEngine.ts` | 독립 Evidence Group |
| Tests under `scripts/` or `__tests__/eagle1/` | Acceptance A–J |

기존 모듈이 동일하면 **신규 대신 강화**.

---

## 13. 위험 요소

| 위험 | 설명 |
|------|------|
| 이중 렌더 | Eagle1 + merged Mirage 동시 ON → 차트 가림 |
| 성능 | 1m~1M 전 TF 매 프레임 재계산 |
| 데이터 stale | OI/CVD/OB 없음인데 0점 처리 |
| 텔레그램 역파싱 | 금지 — snapshot만 |
| Dart/Python 혼선 | 웹 경로에 잘못 연결 |
| Scope creep | UI 카드부터 만들면 MASTER 위반 |

---

## 14. Future Leakage 가능성

| 패턴 | 상태 |
|------|------|
| causal structure/zones | 설계상 방어 |
| swing 확인 바 지연 | Acceptance/confirm 시점 이벤트 필요 — 감사 유지 |
| HTF 미마감 봉을 확정으로 사용 | `mergedDesk` shared 15m analyze + 차트 TF 분리 — 혼동 위험 |
| 전체 구간 정규화 / random split | WF 모듈 있음 — 새 캘리브레이션 시 강제 |
| 과거 FAKE BREAK 라벨 소급 | `falseBreakEngine` 확정 시점만 이벤트 |

---

## 15. Repaint 가능성

| 패턴 | 상태 |
|------|------|
| CONFIRMED zone upper/lower 이동 | `freezeZone` — **회귀 테스트 필수** |
| 미마감 봉 CONFIRMED | PREVIEW vs CONFIRMED 분리 강화 필요 |
| Live ≠ Replay | `replayEngine` parity — 신규 fusion도 동일 pipeline |
| merged desk 엔진이 매틱 재버킷 | TF 전환 시 잔존 오버레이 — 최근 TF-sync 수정 유지 |

---

## 16. MASTER 요구 vs 현재 (갭 체크리스트)

| # | 요구 | 현재 |
|---|------|------|
| CORE Fusion + Density | 신규 강화 필요 |
| STRATEGY 10 engines | family 투표만 → 래핑 확장 |
| FlowConfirmation | facade 있음 → 통합 출력 enum |
| A+ density fusion | combination 부분 |
| Entry state machine 풀셋 | positionManagement 부분 |
| Continuation after TP1/TP2 | 부분 |
| Historical Event SQL | 파일 기반 부분 |
| Path UNAVAILABLE | noFakeNumbers 정책 있음 |
| AVWAP | **UNAVAILABLE** |
| Dedicated Depletion engine | factor만 |
| MSS as separate kind | CHOCH 라벨 별칭 |

---

## 17. AUDIT 게이트

- [x] 프로젝트 Zone/구조/플로우/트레이드 엔진 검색  
- [x] 데이터·API·WS·DB·Renderer 기록  
- [x] 중복·재사용·수정/신규·위험·leak/repaint 기록  
- [x] 사용자 승인 후 Phase 2 (`marketZone.ts`) 완료 — 2026-08-22  
- [x] Phase 3–5 CoreZoneFusion + Density + CORE Renderer 1차 — 2026-08-22  
- [x] Phase 6–7 Strategy engines + A+ fusion 1차 — 2026-08-22  
- [x] Phase 8–9 FlowConfirmation + Confluence + A+ gate — 2026-08-22  
- [ ] Phase 10+ Entry/Stop/TP · Position 강화 대기  

**Phase 2 산출:** `lib/eagle1/marketZone.ts` · engines selftest 통과 · 기존 zone 삭제 없음.
