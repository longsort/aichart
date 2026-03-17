# assets 분석 자료 → 100% 구현 명세 (트레이딩뷰/LuxAlgo 스타일)

## 자료 위치
- `aicoin/assets/분석 자료/` — Yonsei_dent 스타일 패턴·간 강의 (텍스트)

---

## 1. Flag pattern (깃발) — 5가지 Key-point

| # | 자료 규칙 | 구현 요구사항 |
|---|-----------|----------------|
| 1 | 이전 강한 상승(또는 하락) 확인 — Flag의 '기둥(pole)' | pole 구간: 최소 N봉, 상승/하락 폭 ≥ threshold (예: 20% 이상 또는 설정값) |
| 2 | 하방(또는 상방)으로 향하는 두 **평행** 추세선 — Flag의 '깃발' | 채널 상·하단 추세선 기울기 유사(평행) 검증 |
| 3 | 하락(또는 상승)이 상승분(또는 하락분)의 **50% 미만** — 이상적 38% 이하 (Fib) | retracement = (pole_end - flag_extreme) / pole_range; 0 < retracement ≤ 0.50 (Bull), 0 < retracement ≤ 0.50 (Bear) |
| 4 | 진입: #1 하방 추세선 지지 확인(공격적), #2 상방 추세선 돌파(보수적) | entry_aggressive = 채널 하단 터치 후 반등 / entry_conservative = 상단 돌파 확인 |
| 5 | 두 번째 상승(또는 하락)은 이전보다 **작은 경우 많음** — TP/청산 참고 | target ≈ pole 높이 투영, 실제로는 더 작을 수 있음 — UI에 "목표 참고" 표시 |

**LuxAlgo 스타일**: 차트에 pole 구간 세로 박스, flag 채널 반투명 영역, 상단/하단 추세선, Entry/TP/SL 라벨.

---

## 2. Double Top (M) / Double Bottom (W)

| 항목 | 자료 규칙 | 구현 |
|------|-----------|------|
| 구성 | ① 이전 추세 ② 1st peak/valley ③ 되돌림 10~20% ④ 2nd peak/valley (1st와 ±3~4% 편차) ⑤ Neck line ⑥ Neck 돌파 = 완성 | peak/valley 2개, neck = 두 반전점 연결(가급적 수평), 고점/저점 편차 ≤ 4% |
| TP | 1st peak(또는 valley) ↔ neck 거리만큼 투영 | targetPrice = neck ± (extreme - neck) |
| SL | RR에 따라, 최소 1:1 | stop = 2nd peak 위(M) / 2nd valley 아래(W) 또는 사용자 설정 |
| Entry | Neck line 이탈 또는 이탈 후 리테스트 | confirmed = 가격이 neck 돌파 |

**LuxAlgo 스타일**: M/W 형태 목선 수평선, 목표가 수평선, "Double Top" / "Double Bottom" 라벨, Entry/SL/TP 마커.

---

## 3. Triangle (대칭 / 상승 / 하락)

| 항목 | 자료 규칙 | 구현 |
|------|-----------|------|
| 공통 | 지지·저항에서 각각 2회 이상 변곡, 수렴 80% 근처에서 이탈 다발 | 변곡점 2+ on each side; breakout 시점이 패턴 길이의 2/3~끝 (80%) |
| 대칭 | 위·아래 확률 50:50 | Symmetrical 추가 타입, 방향 = 돌파 방향 |
| 상승 | 수평 저항 + 상승 지지 → 상방 돌파 우세 | 기존 ASCENDING 유지, 80% 규칙 |
| 하락 | 수평 지지 + 하락 저항 → 하방 돌파 우세 | 기존 DESCENDING 유지, 80% 규칙 |
| 거래량 | 수렴 시 거래량 감소, 돌파 시 거래량 증가 시 신뢰도 상승 | optional: volume slope 검사 |

**LuxAlgo 스타일**: 삼각형 내부 반투명 채우기, 상단/하단 추세선, "Ascending Triangle" 등 라벨, 돌파 시 Entry/TP.

---

## 4. Head & Shoulders / Inverse H&S — 6가지 Key-point

| # | 규칙 | 구현 |
|---|------|------|
| 1 | 전반적 시장 동향 — H&S는 이전 상승, IHS는 이전 하락 | 추세 방향 확인 후 패턴 검색 |
| 2 | Head, Lt/Rt Shoulders 구분 | 고점 3개 중 가운데가 최고(H&S), 저점 3개 중 가운데가 최저(IHS) |
| 3 | Head와 양쪽 Shoulders **거리** 가능한 같을 것 | time/price 거리 비슷한지 검증 |
| 4 | Neck line = 양쪽 Shoulders 사이 저점(H&S) 또는 고점(IHS) 연결, 가급적 수평 | necklinePrice = (저점1+저점2)/2 또는 (고점1+고점2)/2 |
| 5 | Stop = Rt shoulder 고점(H&S) / Rt shoulder 저점(IHS) | stopPrice 필드 |
| 6 | Limit(목표) = Head ~ Neck 거리, Entry에서 동일 거리 투영 | targetPrice = neck ± (head - neck) |

**LuxAlgo 스타일**: 목선, Head/Shoulders 라벨, Entry/TP/SL 수평선 및 라벨.

---

## 5. Gann (간) — 기초편

| 항목 | 자료 규칙 | 구현 (선택) |
|------|-----------|-------------|
| 개념 | 시간(가로) × 가격(세로), 각도 = 기울기 | Gann Fan: 저점(또는 고점)에서 1:1, 2:1, 1:2 등 각도선 |
| 45° | 1:1 = 1타임당 1가격단위 | 기준 각도 |
| 활용 | 각도선 = 지지/저항, 이탈 시 다음 각도로 회전 | 지지/저항 구간으로 사용, Fib와 결합 시 보정 |
| 한계 | 시간·가격 단위 주관적 → 백테스트로 검증 | 설정(scale) 파라미터화 |

**LuxAlgo 스타일**: 고점/저점에서 뻗는 각도선 여러 개, 색상으로 구분 (기존 gannFan 연동).

---

## 6. LuxAlgo 스타일 UI 요구사항

- **차트 위**: 패턴별 반투명 **존**(깃발 채널, 삼각형 내부, M/W 구간 등), **추세선**(목선, 채널선, 각도선).
- **라벨**: 패턴 이름("Flag Bull", "Double Bottom", "Ascending Triangle", "H&S"), 필요 시 **Entry / TP / SL** 가격 또는 구간.
- **마커**: 진입 추천 위치에 세로선 또는 화살표, TP/SL 수평선.
- **옵션**: 패턴별 on/off, 진입/TP/SL 표시 on/off (트레이딩뷰 지표처럼 설정 패널).

---

## 7. 구현 순서 제안

1. **패턴 규칙 100% 반영** — `pattern_detection.dart` (및 서버 보조 로직)에 Flag 5점, M/W 10~20%·±4%, 삼각 80%, H&S 6점 반영.
2. **LuxAlgo 스타일 오버레이** — `chart_overlay.dart` 또는 전용 위젯에서 `PatternDetectionResult` 사용해 존·선·라벨·Entry/TP/SL 그리기.
3. **Gann Fan** — 기존 `gannFan` 연동 강화 또는 Gann 각도선 전용 레이어 추가.

이 명세를 기준으로 코드 수정 시 "자료 100% 반영 + 트레이딩뷰/LuxAlgo 스타일"로 통일.
