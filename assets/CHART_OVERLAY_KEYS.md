# 차트 오버레이 키 설명 문서

`assets/chart/index.html`의 `updateOverlay(payload)` 함수에 전달되는 payload의 키별 설명입니다.

## 구조 (Structure Engine)

| 키 | 타입 | 설명 |
|----|------|------|
| `bos` | number | Break of Structure - 구조 돌파 가격 |
| `choch` | number | Change of Character - 전환 가격 |
| `levelFlips` | array | 지지↔저항 전환. 각 요소: `{price, type: "RES_TO_SUP"\|"SUP_TO_RES", time}` |
| `trendlineSegments` | array | 대각선 추세선. 각 요소: `{t1, p1, t2, p2, label}` |

## 패턴 (Pattern Engine)

| 키 | 타입 | 설명 |
|----|------|------|
| `triangleType` | "ASCENDING" \| "DESCENDING" | 삼각형 패턴 타입 |
| `triangleLine` | number | 삼각형 돌파 라인 |
| `triangleTarget` | number | 삼각형 목표가 |
| `triangleBreakoutAtTwoThirds` | boolean | 2/3 지점 돌파 여부 |
| `flagType` | "BULL" \| "BEAR" | 깃발 패턴 타입 |
| `flagTop` | number | 깃발 상단 |
| `flagBottom` | number | 깃발 하단 |
| `flagTarget` | number | 깃발 목표가 |
| `flagBreakoutAtTwoThirds` | boolean | 2/3 지점 돌파 여부 |
| `boxTop` | number | 박스 상단 |
| `boxBottom` | number | 박스 하단 |
| `hsType` | "H&S" \| "IHS" | Head & Shoulders / Inverse H&S |
| `hsNeckline` | number | 목선 가격 |
| `hsTarget` | number | 목표가 |
| `neckline` | number | M/W 패턴 목선 (범용) |
| `target` | number | M/W 패턴 목표가 (범용) |
| `vTurns` | array | V형 전환점. 각 요소: `{price, time, isBottom}` |

## 진입/리스크 (Smart Decision Engine)

| 키 | 타입 | 설명 |
|----|------|------|
| `entryLow` | number | 진입 구역 하한 |
| `entryHigh` | number | 진입 구역 상한 |
| `stop` | number | 손절가 |
| `tp1` | number | 목표가 1 |
| `tp2` | number | 목표가 2 |
| `tp3` | number | 목표가 3 |
| `side` | "LONG" \| "SHORT" | 매수/매도 |
| `sweep` | number | 유동성 털기 가격 |

## 타이롱 (Tailong Engine)

| 키 | 타입 | 설명 |
|----|------|------|
| `tailongLevels` | array | OHLC 레벨. 요소: `{high, low, close, open, tf, verdict}` |
| `tailongTailLevels` | object | 꼬리 레벨. 키별 `{entryLow, entryHigh}` |
| `tailongSupport` | number | 지지(매물대) |
| `tailongResistance` | number | 저항(매물대) |
| `tailongBreakPrice` | number | 돌파가 |
| `tailongBreakDirection` | "bullish" \| "bearish" | 돌파 방향 |

## 기타

| 키 | 타입 | 설명 |
|----|------|------|
| `eql` | array | 같은 저점 배열 (EQ Lows) |
| `eqh` | array | 같은 고점 배열 (EQ Highs) |
| `confirmedMarkers` | array | TF별 BUY/SELL 마커. 요소: `{time, side, tf}` |
| `gannFan` | object | Gann Fan: `{t0, p0, slope1x1, isFromLow}` |
| `futurePathTarget` | number | 미래 경로 목표가 |
| `futurePathPrice` | number | 미래 경로 현재가 |
| `stopLabel` | string | 손절 라벨 문구 |

## 이미지 스타일 차트 작도 (SMC/ICT)

| 키 | 타입 | 설명 |
|----|------|------|
| `supportLines` | array | 지지선. 요소: `{price, label, dashed?: boolean}` — dashed true 시 점선 경로 | 
| `resistanceLines` | array | 저항선. 요소: `{price, label, dashed?: boolean}` — dashed true 시 점선 |
| `horizontalDottedLines` | array | **이미지 점선 경로**(수평). 요소: `{price, label?}` — 전부 점선으로 표시 |
| `trendlineSegments` | array | 대각 추세선. 요소: `{t1, p1, t2, p2, label?, dashed?: boolean}` — dashed true 시 점선 경로 |
| `attackZones` | array | 공격 구간. 요소: `{top, bottom, label: "attackZone"}` — 이미지와 동일하게 차트에 표시 |
| `highPointZones` | array | 고점 구간·축적. 요소: `{top, bottom, label: "highPointZone"}` 또는 `{..., label: "accumulation"}` |
| `liquidityZones` | array | 유동성 구역 밴드. 요소: `{type: "buy"\|"sell", top, bottom, label}` |
| `bprZones` | array | BPR(균형가격구간). 요소: `{top, bottom, label}` (예: "BPR 1") |
| `liquidityGrabs` | array | Liquidity Grab 마커. 요소: `{time, price, label}` |
| `sweepTime` | number | Sweep 발생 봉 타임스탬프 (초/ms, 엔진 내부용) |

**차트 자동 구현**: 위 키들을 가진 overlay(캔들 파이프라인 출력, assets JSON, 이미지 overlay JSON)가 병합되면, 차트가 이 명세대로 스스로 동일하게 작도합니다. TXT 브리핑은 진입/손절/TP만 파싱해 병합됩니다.

**331개 이미지 적용**: `assets/image_analysis/_manifest.json`의 `entries`에 331개 항목을 넣거나, `assets/image_analysis/_list.txt`에 한 줄에 JSON 파일명 하나씩(예: `img001`, `img002` … 확장자 생략 가능) 331줄을 적으면, 해당 JSON들의 overlay가 전부 병합되어 차트에 이미지와 동일하게 반영됩니다.

## 전부 반영 (이미지 340+)

| 키 | 타입 | 설명 |
|----|------|------|
| `rsiDivergences` | array | RSI 다이버전스. 요소: `{time1, time2, price1, price2, rsi1, rsi2, bullish, regular, label}` |
| `candlestickPatterns` | array | 캔들 패턴. 요소: `{time, price, pattern}` (Hammer, Doji, Morning Star 등) |
| `po3Phases` | array | PO3 단계. 요소: `{phase, startTime, endTime, priceTop, priceBottom, label}` |
| `harmonicPoints` | object | 하모닉 XABCD. `{type, x, a, b, c, d, timeX, timeA, timeB, timeC, timeD, target, ratios}` |
| `harmonicPrzLines` | array | **이미지와 동일 PRZ 수평선.** 요소: `{price, label?, color?: "blue"|"red"|"black"}` — 1.27XA=파란선, 1.27AB=CD=빨간선, 2.0/2.24=검은선 |
| `supplyDemandZones` | array | Supply/Demand 구역. 요소: `{type, priceTop, priceBottom, label, patternType}` |
| `fibGoldenPocket` | object | Fib Golden Pocket. `{top, bottom, label}` |
| `confluenceZones` | array | Confluence 구역. 요소: `{top, bottom, label}` |
| `trendlineSegments` | array | 대각 추세선. 요소: `{t1, p1, t2, p2, label}` |
| `gannFan` | object | Gann Fan. `{t0, p0, slope1x1, isFromLow}` |
