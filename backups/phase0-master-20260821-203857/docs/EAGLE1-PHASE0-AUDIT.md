# PHASE 0 AUDIT — 독수리1호 / ailongshort

기준일: 2026-08-14  
HEAD: `d4045b754d770d6f6b40ea4b9be306acdd37925a` (`main`)  
백업 태그: `eagle1-phase0-committed-20260814`  
WIP 스냅샷 태그: `eagle1-phase0-wip-20260814` (생성 시)

코드 대규모 수정 없음. 엔진/기능 삭제 없음.

---

## 1. Architecture

Next.js 14 App Router (`app/`) + `lib/`(500+ 모듈) + `engine/`(TS MVP + Python FastAPI) + `trading_engine/`(독립 Python) + Express `server/`(3001) + Dart `lib/engine/`(모바일).

운영: PM2 `start.js` → Next 3000 + Express 3001. 배포 경로 **`/root/ailongshort`만**.

Prisma는 WMS 재고용. 트레이딩 런타임 저장은 `data/*.json` + `data/bitget-futures/*.csv`.

핵심 진입점:

- `app/api/analyze/route.ts`
- `lib/analyze.ts`
- `lib/mergedAnalysisDeskEngine.ts`
- `app/components/mergedAnalysis/MergedAnalysisDeskView.tsx`
- `app/components/ChartView.tsx`
- `lib/market.ts` / `lib/bitgetFuturesMarket.ts`
- `app/api/cron/telegram-auto-alert/route.ts`

---

## 2. Data Flow

```
Bitget REST candles (lib/bitgetFuturesMarket.ts)
  + CSV merge (lib/bitgetFuturesCsv.ts)
  + Bitget WS (lib/bitgetCandleWebsocket.ts)
Binance REST/WS (lib/market.ts, lib/websocket.ts)  ← 기본 현물 경로
        ↓
GET /api/market-bitget  /  /api/market
        ↓
GET /api/analyze  (collect=1 시 microstructure)
        ↓
lib/analyze.ts + engine/index.ts + (옵션) Python engine
        ↓
runMergedAnalysisDeskEngine → OverlayItem[]
        ↓
ChartView (lightweight-charts + HTML zone)
```

microstructure (`lib/data/dataService.ts`, collect=1):

포함: Binance/Bybit/OKX trades, orderbook, funding, OI, liquidations, CVD.  
미연결: `longShortRatioCollector.ts`.  
없음: 거래소 Mark Price / Index Price 수집기.

---

## 3. 현재 Feature 목록

| 영역 | 상태 |
|------|------|
| SMC BOS/CHoCH/OB/FVG/BPR | 구현 (`lib/analyze.ts`, `lib/bpr.ts`) |
| Supply/Demand | 구현 |
| POC/VAH/VAL (VRVP) | 구현 (`lib/mergedAnalysisTradeLayer.ts`) |
| HVN/LVN 전용 엔진 | 부분(POC 근사) |
| VWAP | 부분(SAS 등, 데스크 전역 아님) |
| 기관밴드 | 구현 (`lib/institutionalSuperBand.ts` LineSeries) |
| 파랑빨강 채널 | 구현 |
| $$$$ / HotZone / HQ | 구현 |
| Wyckoff cycle/schematic | 구현 |
| Bitget 고래 DNA | 구현 (캔들·거래량만, 카드 UI 금지) |
| Telegram 자동스캔 | 구현 (2분 cron) |
| Backtest | 구현 (`lib/backtest.ts`) |
| 웹 메인경로 Internal ML | 미연결 (`trading_engine` XGBoost는 독립) |
| Confirmed LONG/SHORT/WAIT 단일 결정기 | 없음 (허브/휴리스틱 다수) |
| Historical Similarity 실측 엔진 | 부분(도식 비교·휴리스틱) |
| Calibration / OOD / Walk-forward | 없음 |
| StorageManager 50GB | 없음 |

---

## 4. 모든 Zone

Supply, Demand, OB, FVG, HotZone, HQ Entry, $$$$ keep, Rail bounce, Core SR, AI Force, ARES numbered, Volume AI, Wyckoff 면.

분류 허브: `lib/mergedAnalysisOverlayIds.ts`.

---

## 5. 모든 Label

4계층: HTML zone 캡션 / `zoneFaceBase`+`zoneFaceSignal` / compact clean / priceLines 축.

중복 원인: label+face 동시 설정, polish→stamp→clean 다회, ChartView face≠text 이중 등록, CSS `face-minimal` vs `label-on` vs `labels-off`.

---

## 6. 중복 기능

Confluence 6계통이 같은 $$$$ 면을 순차 덮음:

- `mergedDeskRbFullConfluence.ts`
- `mergedDeskRbMasterStance.ts`
- `mergedDeskRbLiveEntryHub.ts`
- money confluence stamp
- HQ zones
- HotZone entry

polish는 엔진(`mergedAnalysisDeskEngine.ts`)과 View `finalizeCoreMoneyZones`에서 **이중 실행**.

---

## 7. 화면 과밀 원인

한 패스에 Mirage + HQ + HotZone + CoreSR + RB + swing + stamp kit 4종이 합류.  
긴 설명 라벨이 차트에 남는 구간과 compact 규칙이 혼재.

---

## 8. Zone 이동 원인

- **time2**: `extendOverlayFromAnalyzedCandleToLast` — 매 갱신 마지막 봉으로 우측 연장 (가격대와 별개).
- **$$$$ keep 세로폭**: `polishMergedDeskChartOverlays` → `tightEntryBand` — 중심은 zone mid, 폭은 ATR/close 스케일로 **매 polish 재계산**. 스펙의 “Confirmed 이후 가격범위 이동 금지”와 충돌 가능.
- OB/FVG/FluidTrades 원본 가격: 형성봉 기준 고정.

---

## 9. Repaint 위험

- FVG mitigation이 이후 봉(j>i) 터치로 valid 판정 (`lib/analyze.ts`).
- Early OB가 `visible[i+1]` 사용.
- Mirage bounce stats가 i+1..i+3 사용.
- SMC 리플레이는 엔진 재분석 없이 선택 봉 종가 근사 (`lib/smcDeskCompositeModel.ts`) — Live/Replay 패리티 없음.

---

## 10. 미래 데이터 누출 위험

위 lookahead + 마지막 봉 기준 시그널 재계산.  
백테스트/학습에 그대로 쓰면 leakage. PHASE 2에서 Replay 봉 절단이 필수.

---

## 11. Historical Data 연결 구조

다운로더: `scripts/download-bitget-futures-candles.mjs` (페이지·rate-limit·limit≤360).  
리더: `lib/bitgetFuturesCsv.ts` → live merge.

로컬 CSV 실측 (헤더 포함 line 수, 2026-08-14):

| TF | lines | 시작 | 비고 |
|----|------:|------|------|
| 1M | 82 | 2019-09 | 장기 OK, 최신 2026-05로 다소 stale |
| 1W | 356 | 2019-09 | 장기 OK |
| 1D | 1441 | 2022-07 | 스펙 “가능한 가장 오래” 미달 |
| 4H | 1441 | 2025-10 | 약 8개월만 |
| 1H | 1441 | 2026-04 | 약 2개월 (목표 5만~7만 봉 대비 심각 부족) |
| 15m | 2977 | 2026-05 | 약 1개월 (목표 15만+ 대비 심각 부족) |
| 12H / 5m / 1m | 없음 | | PHASE 1 수집 대상 |

다운로드 로그(`download-full-*.log`)는 있으나 CSV가 짧은 윈도로 덮인 상태로 보임.

---

## 12. Live / Replay 분리

부분만 존재. Bitget `recentOnly` vs CSV+live merge.  
스펙의 봉 단위 ReplayEngine(Pause/1x/5x/20x/100x, 미래 봉 차단)은 **없음**.  
SMC `replayBarOffset`은 UI 근사.

---

## 13. 수정 파일 (PHASE 1 예상, 아직 미착수)

- `scripts/download-bitget-futures-candles.mjs` (checkpoint/resume, 1m/5m/12H)
- `lib/bitgetFuturesCsv.ts` / `lib/bitgetFuturesMarket.ts`
- 신규 quality/storage 모듈 연결부만. 기존 엔진 삭제 없음.

---

## 14. 추가 파일 (PHASE 1)

예정 (미생성):

- `lib/eagle1/historicalDatabase.ts`
- `lib/eagle1/dataQualityValidator.ts`
- `lib/eagle1/storageManager.ts`
- raw schema (parquet 또는 sqlite, Prisma 트레이딩 분리)
- checkpoint 파일

---

## 15. 삭제 후보 (삭제하지 않음)

사용자 지시 전 삭제 금지. 후보만 기록:

- 차트 위 긴 설명 라벨 (PHASE 15에서 compact로 대체, 기능 제거 아님)
- polish 이중 호출 중 한 경로 (통합)
- 하드코딩 `confidence: 70` UI 노출

엔진(`engine/`, `trading_engine/`, `lib/analyze.ts`) 삭제 후보 아님.

---

## 16. 통합 후보

1. $$$$ polish 단일 진입점
2. 라벨 파이프 최종 1회 clean
3. LiveHub를 read-model, 나머지 compute-only
4. Zone time/price 정책 표 (kind별)
5. Stamp kit 4종 → 단일 stamp 함수

---

## 17. 기존 재사용 코드

다운로더, CSV merge, collectors, VRVP, SMC analyze, Wyckoff, whale DNA, telegram runners, backtest, MTF statistics store, hotZoneRadar 표본 확률.

---

## 18. Backup 방법

1. 커밋 HEAD 태그: `eagle1-phase0-committed-20260814`
2. 워킹트리 스냅샷 태그: `eagle1-phase0-wip-20260814` (`git stash create` 결과 태그)
3. 서버 운영본은 `/root/ailongshort`만. 서버에 tar/복제본을 만들지 않음.

---

## 19. Rollback 방법

```bash
# 커밋 기준
git checkout eagle1-phase0-committed-20260814

# WIP 스냅샷 복구 (작업 트리로)
git stash apply eagle1-phase0-wip-20260814
```

서버는 해당 태그의 파일만 `/root/ailongshort`에 덮어쓴 뒤 `npm run build` + `pm2 restart ailongshort`.

---

## 20. Phase별 구현계획

| Phase | 목표 | 게이트 |
|-------|------|--------|
| 0 | Audit+Backup | 본 문서 + 태그 |
| 1 | Bitget BTCUSDT.P 장기 OHLCV + quality + 50GB StorageManager | 중복/갭 검사, checkpoint resume, 인위 생성 금지 |
| 2 | Live/Replay 동일 코어, 봉 절단 | Live/Replay parity + repaint test |
| 3 | Feature + Structure + Regime | UNKNOWN이면 confirmed 제한 |
| 4 | POC/Volume Profile | touch≠success |
| 5 | Big Money / Absorption / Microstructure | 가짜 % 금지 |
| 6 | SMC + Liquidity + Wyckoff | 기존 엔진 재사용 |
| 7 | Zone Intelligence + reaction % | Confirmed 후 가격 고정 |
| 8 | Snapshot + Outcome + incremental stats | |
| 9 | Historical Similarity | 모양만 비교 금지 |
| 10 | Internal ML | 시간순 split, shuffle 금지 |
| 11 | Consensus + Calibration + OOD | UI는 검증확률 우선 |
| 12 | Entry/SL/TP/RR/EV | RR 필터 |
| 13 | Smart Path 3시나리오 | geometry 고정 |
| 14 | Backtest + walk-forward | holdout으로 weight 금지 |
| 15 | Compact label + click card | 기존 기능 숨김/모드화, 삭제 아님 |
| 16 | 통계 메뉴 | 실측만 |
| 17 | Telegram report + version | 엔진은 TG 장애와 독립 |

---

## 가짜 숫자 플래그

`confidence: 70` / `0.7x`가 overlay·시나리오 기본값으로 다수 존재 (`lib/analyze.ts` 등).  
운영 UI에 실측처럼 보이면 PHASE 15에서 `데이터 없음`으로 바꿔야 함. 지금은 삭제하지 않음.
