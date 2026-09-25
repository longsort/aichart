# 자율 탐색 결과 (다국 매매학교 × 1년 15분)

## 목표
- A) 거래당 **평균** 순ROE ≥ 7%
- B) OOS 구간 **복리 누적** ≥ 7%

## Val
- 조합 수: 2448
- 평균ROE≥7%: **0개**
- +EV·DD≤35%·n≥30: **80개**
- 그중 누적≥7%: **52개**

## OOS (Val 상위만 1회)
- desk_vwap_revert · SHORT · 20배 · 평균 0.65% · 누적 7.33% · WR 50.0% · DD 37.6% · n=32
- desk_vwap_revert · SHORT · 20배 · 평균 -0.28% · 누적 -17.52% · WR 53.1% · DD 38.8% · n=32
- desk_vwap_revert · SHORT · 15배 · 평균 1.00% · 누적 26.90% · WR 50.0% · DD 27.9% · n=32
- desk_vwap_revert · SHORT · 10배 · 평균 0.97% · 누적 31.03% · WR 50.0% · DD 18.4% · n=32
- desk_vwap_revert · SHORT · 15배 · 평균 0.46% · 누적 7.63% · WR 50.0% · DD 28.4% · n=32

## 판정
- A 평균7%: **불가** (Val hits=0)
- B OOS누적7%: **가능** (promote=9)
- 채택: desk_vwap_revert · SHORT · 20배 · OOS누적 7.33% · 평균 0.65% · WR 50.0% · DD 37.6%
- 설정: `outputs/thresholds/paper_autonomous_v1.json`
- 규칙: VWAP±1.8ATR 이탈 후 회귀 숏
- 실주문 OFF · 50배 고정 없음
- 선택: Val 순위 첫 OOS통과 (OOS 재정렬 없음)

## 해석
- 평균 7%/트레이드는 이 데이터·비용구조에서 자율탐색으로도 안 나옴.
- 누적 7%는 ‘구간 복리’라 가능하면 페이퍼로만 승격.
