# Fulink Pro — 구조/미래차트 자동분석 설계 (V1)

## 0) 목표(사용자 요구 그대로)
- **차트 위**에 구조 이벤트(EQL/EQH/BOS/MSB/CHOCH)와 **해당 가격**을 찍는다.
- 이벤트가 찍힌 **가격을 키로** 해서 거래소 데이터(체결/오더북/유동성)를 수집 → **반응 확률**을 만든다.
- 1m~1Y(=1m/5m/15m/1h/4h/1D/1W/1M + 1Y는 1M 12개 롤업) **모든 TF**에 동일 UX(화면 비율 고정)로 표시.

## 1) 데이터 파이프라인(서버 없이)
1) 캔들: Bitget public(REST) + WS cache
2) 오더북: books5/REST orderbook
3) 체결: trade channel/REST recent fills
4) 저장: SQLite(+ jsonl 백업)

## 2) 구조 이벤트 정의(표준화)
- **SwingHigh / SwingLow**: fractal(좌2/우2) 기본
- **EQH/EQL**: 스윙 고/저점이 `tol = ATR*k` 이내(기본 k=0.18)
- **BOS**: 종가가 직전 SwingHigh(또는 SwingLow) + tol 이상 돌파/이탈
- **MSB**: 하락추세(LH+LL)에서 상방 BOS(=MSB↑), 상승추세(HH+HL)에서 하방 BOS(=MSB↓)
- **CHOCH**: 추세 유지 중(예: HH+HL)에서 반대 방향 첫 구조 깨짐(추후 V2에서 BOS/MSB와 분리)

## 3) “미래차트”의 핵심 = 이벤트를 ‘존’으로 승격
각 이벤트는 1회성이 아니라 **재방문/반응 확률이 높은 가격대**다.
- EQH/EQL → 유동성 풀(스윕/리테스트)
- BOS/MSB → 리테스트 반응(지지/저항 역할 전환)

## 4) 반응 확률(통계) 모델 V1
### 4-1) 정의
- 이벤트 가격 `L` 기준으로 `touch`를 기록한다.
- touch 이후 **N캔들(1/3/5)** 동안:
  - 목표(예: +x ATR) 도달 = 성공
  - 무효(예: -y ATR) 도달 = 실패
  - 둘 다 아니면 타임아웃

### 4-2) 피처(저장)
- symbol, tf, eventType, level(L), ts
- 당시 flow: orderbookImb, bid/ask notional, tapeBuyPct, spreadBp
- 당시 구조: trend, lastSwingDist, vwapDist

### 4-3) 출력
- 차트 라벨: `EQH 62%`, `BOS↑ 71%` 같이 **확률+가격**
- 우측 패널: 시나리오 확률(메인/대체/무효)

## 5) UI 반영 포인트
- MiniChartV4: (이미 패치됨)
  - EQH/EQL 수평 점선 + 태그
  - BOS/MSB 돌파 레벨 점선 + 태그
- FutureWavePanel:
  - event zones(리스트)를 받아서 “경로 후보”로 사용
  - 히트맵(TF×증거)과 결합

## 6) 다음 구현(우선순위)
1) **구조 이벤트 리스트를 FuState에 추가**: `List<FuStructEvent>`
2) 엔진에서 멀티TF로 eventZones 생성 → UI 모든 TF에 동일 표시
3) 이벤트 레벨별 orderflow 샘플링(WS) + SQLite 저장
4) touch→결과 판정(자동 복기) + 확률 업데이트


## 2) 구조 이벤트 검출(차트 기반)
- **Swing High/Low**: fractal(좌2/우2)
- **EQH/EQL**: 스윙 고점/저점이 `tol` 이내로 반복되면 유동성 풀로 간주
  - `tol = clamp(avgRange*0.18, (hi-lo)*0.0015, (hi-lo)*0.02)`
- **BOS**: 현재 종가가 마지막 스윙(고/저)을 `tol` 이상 돌파/이탈
- **MSB**: 직전 추세가 하락(LH+LL)인데 상방 BOS → MSB↑ / 상승(HH+HL)인데 하방 이탈 → MSB↓

> ✅ 이번 패치(v0.1): MiniChartV4 Painter에서 **즉시 표시**(서버/엔진 의존 없음)

## 3) 이벤트→확률(반응 통계)
- 이벤트가 찍힌 가격 `L`을 기준으로, 이후 N캔들에서:
  - (A) 최초 반응 방향(상/하)
  - (B) 최대 역방향 드로다운
  - (C) 목표 구간(예: 다음 EQH/EQL, OB/FVG 상단/하단, SR) 도달 여부
- 출력은 TF마다:
  - `P(bounce)` / `P(break)` / `P(sweep)` + 표본수

### 최소 구현(권장)
- `reaction_stats.dart`:
  - 입력: candles, levels(List<double>), horizon(1/3/5/12/24)
  - 출력: level별 확률 DTO
- `future_path_db.dart`에 levelKey(가격+tf+eventType)로 저장

## 4) 오더북/체결 기반 '세력 반응'
- level L 근처(±tol)에서:
  - obImbalance(0~100), tapeBuyPct(0~100), absorption(0~100), spreadBp
- 확률 보정:
  - `P(bounce)` += (absorption↑ & 반대방향 tape↑) 가점
  - `P(break)` += (동방향 tape↑ & obImbalance↑) 가점

## 5) 화면/UI(사용자 스샷 비율 고정)
- 이미 적용됨: Fullscreen 차트 16:9 비율 고정
- 추가 권장:
  - TF 스트립(1m~1M)에서 선택한 TF의 **EQH/EQL/BOS/MSB 목록**을 우측 패널 상단에 1줄 요약
  - 레벨 라벨: `타입 + 가격 + 확률(%) + 표본n`

## 6) 다음 작업(우선순위)
1) (DONE) 차트에 **EQH/EQL + BOS/MSB** 자동 표시
2) 이벤트 목록을 엔진으로 승격(FuState에 events 리스트) → 우측 패널/브리핑 로그와 연결
3) level 기반 통계 DB 저장/가중치 자동보정(성공/실패 로그)
4) TF별 Zone(74~76 / 68~70 같은 박스) 자동 생성: 과거 반응 밀집 구간(클러스터)
- 이벤트가 찍힌 가격 `L`을 기준으로, 이후 N캔들에서:
  - **반응 성공**: (롱) `L` 재터치 후 `+k*ATR` 도달 / (숏) `L` 재터치 후 `-k*ATR` 도달
  - **무효**: 반대 방향으로 `m*ATR` 이탈
  - **타임아웃**: N캔들 내 미충족
- 확률 표기: `P = success / (success+fail)` (timeout은 별도 표기)
- 권장 기본값: `N=5/12/24` (TF에 따라 자동), `k=0.8`, `m=0.6`

## 4) 오더북/체결 결합(가격 L에서만)
- 이벤트가 발생하면 `L` 주변 ±(0.15%~0.30%) 구간을 버킷으로 만들어:
  - orderbook: bid/ask notional, imbalance
  - tape: buyRatio, tradeNotional
  - absorption proxy: depth/trade 비율
- 이 피처들을 이벤트 로그에 저장하고, 확률 계산 시 **가중치**로 사용

## 5) UI/UX
- 좌: 차트(존+구조 라벨+가격)
- 우: FutureWavePanel(3시나리오+확률+무효+TP/SL) + TF 히트맵
- TF별 화면 비율 고정(16:9) 유지

## 6) 다음 패치(바로 이어서)
- [ ] 구조 이벤트를 Painter가 아니라 **Core Engine**으로 올려서: 다중 이벤트/가격라벨/알림/로그 통합
- [ ] 이벤트 가격별 **ReactionStats(SQLite)** 집계 + 히트맵/랭킹
- [ ] "zone 구간"(OB/FVG/BPR/MB)마다 동일한 반응 확률 계산
- [ ] 1Y 구조: 1M*12 롤업 + 연간 EQH/EQL(대형 유동성)
  - tape: buyRatio, tradeNotional
  - liquidity: depthNotional/tradeNotional(흡수/방어 지표)
- 위 피처로 **반응 확률 보정치**를 곱해 최종 P를 만들면 됨.

## 5) UI 표시 규칙(가독성)
- 차트 상단: 현재가
- 차트 내부:
  - EQH/EQL: 점선 수평선 + 라벨(EQH/EQL)
  - BOS/MSB: 점선 수평선(레벨→우측) + 라벨(BOS↑/BOS↓/MSB↑/MSB↓)
  - 기존 OB/FVG/BPR/MB, react band 유지
- 우측 FutureWavePanel:
  - (현재) 휴리스틱 → (다음) 이벤트 기반 확률/오더북 결합으로 교체

## 6) 다음 패치(바로 이어서)
1) FuState에 `List<FuStructEvent>` 추가 → Painter가 "계산"이 아니라 "표시"만 하도록 분리
2) 이벤트마다 `level/zone`에 대해 DB에 반응 통계 누적
3) "미래차트" = TF별 이벤트/존/확률을 한 화면에 쌓는 ZoneMap 패널 추가
