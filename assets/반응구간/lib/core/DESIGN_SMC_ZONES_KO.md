# SMC 구간 설계 (Bu/Be + OB/BB/MB)

## 1. 구간 타입 (TradingView 동일 컨셉)

| 타입 | 설명 | 표기 |
|------|------|------|
| **OB** (Order Block) | 구조가 꺾인 직전 마지막 반대색 캔들(공급/수요 블럭) | Bu-OB / Be-OB |
| **BB** (Breaker Block) | OB가 깨지고 반대 역할로 전환된 블럭 | Bu-BB / Be-BB |
| **MB** (Mitigation Block) | 큰 임펄스 후 되돌림이 자주 닿는 "완화(재진입)" 구간 | Bu-MB / Be-MB |

- **Bu** (Bullish): 초록, 롱 우세
- **Be** (Bearish): 빨강, 숏 우세

## 2. 색(초록/빨강) 결정 로직

색은 **"구간에서의 매수/매도 우위"**로 결정.

- **구조**: BOS/ChoCH 방향, 스윕 고점/저점 갱신(HTF 우선)
- **오더플로우**:
  - CVD(Δ): 구간 진입 시 Δ 상승 → Bu, 하락 → Be
  - 체결강도(aggressive buy/sell 비율)
  - 오더북 불균형(imbalance) + 스푸핑 필터
  - 리퀴디티 스윕 시 반대쪽 신호 강화

현재 구현: 캔들 구조(변위 직전 반대색)로 dir 결정 → 라벨 Bu-OB/Be-OB. 추후 `obImbalance`/`tapeBuyPct`로 오버라이드 가능.

## 3. 상태머신 (Valid ~ Flipped)

| 상태 | 설명 |
|------|------|
| **Valid** | 가격이 구간에 처음 들어오거나 근처 |
| **Tapped** | 1회 이상 반응 |
| **Mitigated** | 거래량/Δ로 흡수 확인(반응 성공) |
| **Broken** | 종가 기준(HTF) 박스 완전 이탈 |
| **Flipped** | Broken 후 반대로 재테스트 성공 → OB→BB 전환 |

`FuZone.zoneState` (optional) 에 저장. 실시간 업데이트는 가격/캔들 스트림으로 상태 전이 계산 시 사용.

## 4. 신호 출력 (구간 + 확률 + 플랜)

- **진입(Entry)**: 박스 상단/중단/하단 중 레벨(OB/MB는 중단이 자주 핵심)
- **손절(SL)**: 박스 하단(롱)/상단(숏) + ATR buffer
- **TP**: 다음 상위 TF 박스/유동성 풀/스윕 레벨
- **확률**: 구간 과거 반응 횟수/성공률 + 오더플로우 합의도 + MTF 합의도

## 5. 데이터 요구사항

- **필수**: 캔들(OHLCV) TF별, 체결(Trades) buy/sell 분리 가능 시 베스트, 오더북(Depth)
- **CVD**: trades에 buyer_maker/side 있으면 계산 가능
- **선택**: 펀딩/미결제약정(OI)

## 6. 구현 현황 (라벨 zip 기준)

- `FuZone`: `label` (Bu-OB/Be-OB/Bu-BB/Be-BB/Bu-MB/Be-MB), `dir` (1/-1), `zoneState`, `prob`, `isSmcZone`/`isBu`/`isBe`
- `FuEngine`: `_detectObZones` → Bu-OB/Be-OB, `_detectMuMbZones` → Bu-MB/Be-MB, `_detectBbZones` → Bu-BB/Be-BB (OB 깨짐 후 반대 전환)
- **오더플로우 보정**: `_recolorSmcZonesByFlow(zones, obBuyPct, tapeBuyPct)` — 매수 우세(62%+)면 Be→Bu, 매도 우세(38%-)면 Bu→Be
- **구간 상태 전이**: `_applyZoneStates(zones, closePrice, candles)` —  
  **Flipped**: BB 구간(OB 깨진 뒤 반대 역할).  
  **Broken**: 종가가 구간 완전 이탈.  
  **Mitigated**: 구간 터치 후 유리 이탈(Bu: close > zoneHigh, Be: close < zoneLow).  
  **Tapped**: 최근 lookback(25캔들) 내 구간 터치 1회 이상.  
  **Valid**: 그 외.
- `FuturePathPainter`: `_drawSmcZoneBox` — 초록(Bu)/빨강(Be) 반투명 박스 + 라벨 + prob%
- 미래경로 차트: `FuturePathOverlay`에 `obZones`, `mbZones` 전달 → ChoCH/BOS/MSB와 함께 SMC 구간 박스 표시

추가 예정: 구간별 CVD/체결강도, 진입/SL/TP 자동 플랜, UI에 zoneState 표기(Valid/Tapped/Mitigated/Broken/Flipped).
