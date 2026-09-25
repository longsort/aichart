---
name: tapoint-institutional-band
description: >-
  타점엔진 모드에서 기관밴드(SuperTrend 엔벨로프)·밴드터치·캔들 반응을 중심으로
  LONG/SHORT WAIT·진입(E)·손절(SL)·익절1(T1) 타점 스킬·카드·자동매매 합류를 설계/구현한다.
  Trigger: 기관밴드, institutional band, 타점엔진, E/SL/T1, 밴드터치, 3분봉 타점, 자동매매 롱숏 스킬.
---

# 타점엔진 · 기관밴드 중심 타점 스킬

확정 수익·고정 승률 표현 금지. 조건·무효화·검증 필요만 말한다.

## 목적

- BTC(및 알트) **기관밴드1/2** 를 주축으로 타점엔진에서 **진입·손절·익절1** 을 잡는다.
- 자동매매는 기존 `CONFIRMED_*` + 실시간활동 합류를 **유지**하고, 기관밴드 스킬은 **합류·필터·카드**로 얹는다.
- UI는 **카드**(E / SL / T1 / 캔들분석) + 차트 **전폭 가격선**(createPriceLine).

## 코어 규칙 (3m · A안 ROE)

1. **추세 = 밴드1 방향** · **밴드2** 플립 시 청산 권장.
2. **진입 = 터치 + 캔들 반응** → READY 시 **CONFIRMED 없이도** 자동주문.
3. **A안 레벨**: 손절 **8%ROE** · 익절 **8%ROE**(계산 15는 8로) · `roeTargetPrice`.
4. 코인칩 ON · ARM/가상 · 진입 시 **텔레그램** (`entry-telegram` / 서버 notify).
5. 코드: `institutionalBandTapPlan.ts` · `instBandScalpA.ts` · DeskView `tryTapExecute` · 서버 `scanTapointServer`.

## 에이전트 작업 시

1. 기능 삭제 금지. 기존 CONFIRMED·스윕 합류 유지.  
2. 카드·가격선 추가/보강 시 라벨은 한국어 compact.  
3. 변경 후 타점엔진 3m에서 밴드 ON → 카드 E/SL/T1·선 표시 확인.
