# AUDIT_REPORT — 독수리1호 AI FUTURES DECISION SYSTEM

**기준일:** 2026-08-21  
**엔진 버전:** `eagle1-core-0.23.1`  
**Git HEAD:** `d4045b7` (`main`)  
**Backup:** `backups/phase0-master-20260821-203857/`  
**Reference UI:** `public/mockups/eagle1-ai-hud-reference.png`  
**현재 화면 스냅샷:** `public/mockups/eagle1-master-spec-current-ui-2026-08-21.png`  
**상위 요구사항:** 본 MASTER SPEC (합并强化优化 VERSION) + Reference 이미지

> PHASE 0 전용. 이 단계에서 엔진/기능 코드는 대규모 수정하지 않았다.  
> 기존 정상 기능 삭제 없음. 프로젝트 재작성 없음.

---

## 0. Executive Verdict

| 항목 | 판정 |
|------|------|
| Eagle1 파이프라인 (`lib/eagle1` → `/api/analyze` → HUD/Chart) | **실연결 (Production-wired)** |
| Bitget REST/WS + CSV 히스토리 | **구현** |
| Confirmed Zone freeze / no-fake-% | **구현** |
| StructureAcceptance + Break Rail + Trade Plan HUD | **구현** |
| MarketDataBus (단일 구독 버스) | **없음** |
| SqueezeRadarEngine (Eagle1 네이티브) | **없음** (레거시 regime/텔레와 분산) |
| LegendaryStrategyFusion / A+ Zone 표기 | **부분** (combination/expert만) |
| PositionManagement (TP1 후 수익보호·EARLY_EXIT·STOPPED_PROFIT) | **부분** (`tradeManage` 상태 제한적) |
| Re-entry (새 trade_id) | **없음** |
| UI Pixel Match vs Reference | **FAIL** (히트맵이 캔들을 가림) |
| 전체 MASTER SPEC PASS | **미달성** — Phase별 합병·강화 필요 |

**핵심 전략:** 처음부터 다시 만들지 않는다. `lib/eagle1/*` + `/api/analyze` + `Eagle1AiHud`를 **척추**로 두고, 레거시(merged-desk / monthDesk / whale / telegram)는 **어댑터·구독자**로 합병한다.

---

## 1. Architecture

```
app/page.tsx
  → HomePageContent.tsx
       → Eagle1StructureDesk (= Eagle1AiHud)
            → ChartView (children / chartStage)
       → /api/analyze  ← runEagle1Pipeline + freeze/outcomes
       → /api/market-bitget | /api/market  ← 차트 캔들
```

| 레이어 | 경로 | 역할 |
|--------|------|------|
| HUD | `app/components/eagle1/Eagle1AiHud.tsx` | Big Move / MTF / Break / Battle / Trade Plan / Status |
| Chart | `app/components/ChartView.tsx` | lightweight-charts + overlays + priceLines |
| Pipeline | `lib/eagle1/pipeline.ts` | 구조→존→수용→시그널→리스크→HUD 팩 |
| Analyze API | `app/api/analyze/route.ts` | 캔들+라이브+Eagle1+레거시 데스크 동시 실행 |
| Data | `lib/bitgetFuturesMarket.ts`, `lib/data/dataService.ts` | Bitget OHLCV / OB / fills / OI… |
| Store | `data/eagle1/{freeze,combo,stats,series,coverage}/` | JSON 스냅샷 |
| Parallel | `engine/`, `trading_engine/`, `lib/engine`(Dart), `lib/mergedDesk*`, `lib/monthDesk*` | 유지·삭제 금지 |

`lib/eagle1/` 모듈 57개 (구조·존·시그널·리스크·히트·콤보·리플레이·리페인트 등). 상세 1줄 목록은 `docs/EAGLE1-PHASE0-AUDIT.md` 및 본 감사의 §3.

---

## 2. Data Flow

```
Bitget REST (candles) + CSV merge
Bitget WS (candle tip)
Bitget REST collectors (OB / fills / liq / OI / funding)
        ↓  (버스 없음 — 중복 fetch 가능)
clientMarketCandleCache  → ChartView
analyzeCandleSource      → /api/analyze
dataService.fetchMarketData → availability + OFI seriesStore
        ↓
analyzeCandles + runChartMvpEngine + (옵션) Python
runEagle1Pipeline → MainPlan / Zones / Hud / Acceptance / Snapshot
saveEagle1Freeze / outcomes
        ↓
HomePageContent state → Eagle1AiHud + ChartView overlays
```

### Bitget 커버리지 (감사)

| 데이터 | 상태 |
|--------|------|
| OHLCV | REST + WS + CSV |
| Mark / Index | 부분·미통일 |
| Trades / Aggressive | collectors + OFI |
| Orderbook | collectors + availability |
| OI / Funding | collectors (게이트) |
| Long/Short Ratio | 수집기 존재, 메인 파이프 미연결 |
| Liquidation | collectors + series |

### Historical CSV (`data/bitget-futures/`)

| TF | 대략 크기 | 비고 |
|----|-----------|------|
| 5m | ~62 MB | 상대적 풍부 |
| 1min | ~22 MB | 최근 구간 |
| 15m | ~21 MB | 목표 150k~250k 대비 확장 여지 |
| 1H | ~5 MB | 전기간 목표 미달 가능 |
| 4H / 12H / 1D | 소량 | HTF 보강 필요 |
| 1W / 1M | 거의 비어 있음 | 우선 다운로드 |

---

## 3. 현재 Feature (존재 / 부분 / 없음)

### ZONE FAMILY → 목표: MTFSmartZoneEngine

| 기능 | 상태 | 위치 |
|------|------|------|
| POC/VAH/VAL/HVN/LVN | **E** | `zoneEngine.ts` |
| OB/FVG/BPR/Breaker/Demand/Supply | **E** | `zoneEngine.ts`, `causalFvg.ts` |
| Confirmed freeze | **E** | `zoneFreeze.ts` |
| HotZone / 기관밴드 정체성 | **L / 주의** | mergedDesk HotZone; `moneyPressureBand`는 기관 주장 금지 |
| MTF 동일가격 합병 → 단일 A+ Zone | **부분** | combination + unifiedZoneDesk |

### STRUCTURE FAMILY

| 기능 | 상태 |
|------|------|
| HH/HL/LH/LL, BOS, CHOCH, Sweep, EQH/EQL | **E** `structureEngine.ts` |
| StructureAcceptance (APPROACH…FAKE_BREAKOUT) | **E** `structureAcceptanceEngine.ts` |
| MSS | **E** 이벤트 라벨 수준 |

### FLOW / LIQUIDITY / REACTION

| 기능 | 상태 |
|------|------|
| CVD/OFI/OB 게이트 | **E** (데이터 없으면 `데이터 없음`) |
| 빨강/파랑 압력 띠 | **E** `moneyPressureBand.ts` |
| Pressure heatmap | **E** — **UI BUG: 캔들 가림** |
| 강반등/DUMP/롱빔 | **L** whale DNA (카드 UI 금지 유지) |
| SqueezeRadar | **없음** (Eagle1) |

### TRADE FAMILY

| 기능 | 상태 |
|------|------|
| Entry/SL/TP/RR | **E** `riskEngine` + `chartUx` priceLines |
| WAIT + 감시 레벨 | **E** (확정≠감시) |
| FrozenTrade | **E** 확정 후에만 |
| PositionManagement 풀스펙 | **부분** |
| Re-entry 새 trade_id | **없음** |

### HUD (Reference 대비)

| 위젯 | 현재 |
|------|------|
| BIG MOVE / MTF COMPASS / BREAK RAIL / BATTLE | 있음 |
| TRADE PLAN / TRADE STATUS | 있음 |
| RANGE PRESSURE / FLOW | 있음 |
| 실전·연구·전체 모드 | 있음 |
| 캔들 본체 + 존 + ENTRY/STOP/TP 가로선 | **깨짐(히트 오버레이)** |
| 영문 라벨 + 클릭 한글 설명 | **부분** (호버/더블클릭 스펙 미완성) |
| BOTTOM MARKET STATE…ENTRY QUALITY | 라벨 영역 존재 |

---

## 4. Signal / Zone / UI 요약

**Signal:** `signalEngine` → MainPlan (`WAIT` / `*_WATCH` / `CONFIRMED_*` / `*_MISSED`). 확정은 qualityGate + repaintGate + RR/표본/합의.

**Zone:** Eagle1 freeze 존 + 레거시 merged/month 존 동시 주입 가능 → **과밀·이중 진실**.

**UI:** HUD 레이아웃은 Reference에 근접. 차트 스테이지가 pressure heat full-bar fill로 **바코드형 세로줄**이 되어 캔들 비가시 → Visual FAIL.

---

## 5. 중복 기능 (합병 대상)

| 목적 | Eagle1 | 병렬 | 합병 방향 |
|------|--------|------|-----------|
| Structure | `structureEngine` | `engine/structure`, signal-engine | Eagle1 causal 기준 |
| Zone | `zoneEngine` | `lib/zone`, HotZone, monthDesk zones | Eagle1 freeze + 어댑터 |
| Reaction | `zoneReaction` | `signal-engine/zoneReaction` | 계약 통일 |
| Risk/Signal | eagle1 risk/signal | tradePlanner, confirmedSignal | analyze에서 Eagle1 MainPlan 우선 |
| Telegram | `telegramReporter` | 다수 runner | 포맷터 단일화 |
| Replay | `replayEngine` | SMC desk replay | Eagle1 cursor 단일 |

**비활성 후보(삭제 아님):** Dart `lib/engine`, 미사용 Python 경로 — 사용자 지시 전 유지.

---

## 6. Repaint / Future Leakage 위험

| 위험 | 판정 | 비고 |
|------|------|------|
| Confirmed zone 좌표 이동 | 완화됨 | `zoneFreeze` |
| Prediction snapshot | 구현 | `predictionSnapshot` |
| Repaint audit/gate | 구현 | analyze + scripts |
| Live/Replay 전 필드 직렬화 패리티 | 부분 | FVG/합성 중심 |
| 레거시 overlay | 위험 | Eagle1 freeze 규칙 미공유 |
| Heat overlay 매 틱 재계산 | UI 리페인트 체감 | 기하 freeze와 별개 |

---

## 7. 화면 과밀 / Zone 이동 원인

1. ChartView에 Eagle1 + merged-desk + whale + monthDesk 오버레이 동시 가능  
2. Heat를 **봉 전체 높이 면**으로 그림 → 캔들 소실 (현재 스크린샷)  
3. HUD heat strip + 차트 heat 이중  
4. POC relocate 시 구존 INVALID + 신존 생성(의도) vs 레거시 존 슬라이드(위험)  
5. 라벨 HTML face + priceLine + compact 다층

---

## 8. 재사용 코드 (삭제·재작성 금지)

- `lib/eagle1/pipeline.ts` 및 family engines  
- `zoneFreeze.ts`, `predictionSnapshot.ts`, `repaintGate.ts`, `noFakeNumbers.ts`  
- `analyzeCandleSource.ts`, `bitgetFuturesMarket.ts`, `bitgetCandleWebsocket.ts`  
- `dataService` + Bitget collectors  
- `Eagle1AiHud` / `chartUx` / overlay mappers  
- `data/bitget-futures/*`, `data/eagle1/*`  
- selftest: `scripts/eagle1-*-selftest.*`, `eagle1-visual-regression.mjs`

---

## 9. 수정 / 신규 / 통합 대상

### 수정 (우선)

- `structureDeskDraw.ts` + HUD CSS — heat를 캔들 아래/얇은 strip으로  
- `ChartView.tsx` — overlay budget, E/SL/TP priceLine 우선  
- `chartUx.ts` — 영문 라벨 + interaction 한글  
- `tradeManage.ts` — PositionManagement 상태 확장  
- `app/api/analyze/route.ts` — 이중 엔진 정리(삭제 없이 우선순위)  
- Historical downloader — HTF/1H/15m 보강  

### 신규 (MASTER에 없고 척추에 필요)

- `MarketDataBus` (또는 CandleHub)  
- `SqueezeRadarEngine` (텔레 스퀴즈 공통화)  
- `LegendaryStrategyFusionEngine` (내부 모듈, 차트에는 A+/BREAKOUT 등만)  
- `ReEntryEngine`  
- `LabelInteractionManager` (hover/dblclick/long-press 한글)  
- Pixel Diff 파이프라인 강화  

### 통합

- Zone family → MTFSmartZoneEngine 파사드  
- Flow family → OrderFlowEngine 파사드  
- Telegram → Eagle1 MainPlan payload 단일  

---

## 10. Backup / Rollback

| 항목 | 경로 |
|------|------|
| PHASE 0 스냅샷 | `backups/phase0-master-20260821-203857/` |
| Manifest | 동 폴더 `BACKUP_MANIFEST.txt` |
| Rollback | 해당 경로 파일을 워크스페이스 동일 상대경로로 덮어쓰기 |
| 이전 Phase0 | `docs/EAGLE1-PHASE0-AUDIT.md` (2026-08-14), git tags `eagle1-phase0-*` |

포함: `lib/eagle1`, `app/components/eagle1`, analyze/eagle1/market-bitget API, ChartView/HomePageContent, docs, mockups, 핵심 data helpers.

---

## 11. Reference UI vs 현재 (Visual)

| 요소 | Reference | 현재 스크린샷 | 판정 |
|------|-----------|---------------|------|
| TOP gauges | 있음 | 있음 | OK~ |
| TRADE PLAN 수치 | 있음 | 있음 (실엔진) | OK |
| TRADE STATUS rail | 있음 | 있음 | OK |
| 캔들 차트 | 보임 | **히트 바코드로 가려짐** | **FAIL** |
| ENTRY/STOP/TP 가로선 | 보임 | 확인 불가 | FAIL |
| A+ ZONE / Path | 보임 | 확인 불가 | FAIL |
| 영문+클릭 한글 | 스펙 | 미완 | FAIL |

---

## 12. 에이전트 보강 설계 (기존과 묶음, 삭제 없음)

MASTER와 충돌하지 않는 추가 설계:

1. **Decision Spine 단일화** — 화면의 유일한 진실은 Eagle1 MainPlan + FrozenTrade. 레거시는 evidence 구독만.  
2. **Overlay Budget** — 실전: 캔들 + MAIN ZONE 1 + ENTRY/STOP/TP1-3 + Path + Event≤2. 연구/전체만 확장.  
3. **Heat as underlay** — 캔들 z 아래 10~20% 투명도 또는 하단 스트립만 (현재 FAIL 수정).  
4. **Label Lexicon** — 차트 영문 고정; PC hover 한줄 / dblclick 상세; Mobile tap / long-press pin.  
5. **Trade ID lifecycle** — OPEN→…→CLOSED 후 재진입은 새 `trade_id`+`prediction_id`만.  
6. **Calibrated vs Score** — HUD에 AI Score와 Calibrated Probability 칸 분리 (표본 없으면 `통계 부족`).  
7. **Visual Regression gate** — Phase UI마다 Reference pixel diff; FAIL 시 다음 Phase 금지.

---

## 13. PHASE 0 완료 체크

- [x] 전체 Architecture / Data / Feature / Zone / Signal / UI 감사  
- [x] 중복·Repaint·과밀·재사용·수정/신규 정리  
- [x] Backup 생성  
- [x] AUDIT_REPORT.md  
- [ ] IMPLEMENTATION_PLAN.md (동시 작성)  
- [ ] 코드 Phase 1+ 시작 (테스트 게이트 후)

---

*이 보고서는 MASTER SPEC PHASE 0 산출물이다. 다음 문서는 `IMPLEMENTATION_PLAN.md`.*
