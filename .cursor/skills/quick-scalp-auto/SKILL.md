---
name: quick-scalp-auto
description: >-
  독수리1호 BTC 1순위 QUICK_SCALP_AUTO_ENGINE — 3분봉 초단타, TP1 단일 전량청산.
  Trigger: QUICK SCALP, 초단타, TP1 only, MAE, 3m auto, btcQuickScalp.
---

# QUICK SCALP AUTO (BTC 1순위)

확정 수익·고정 승률 금지. 표본 없으면 수익성 검증됨이라고 쓰지 않는다.

## 역할

- BTC 타점엔진 자동진입 **1순위 레인**. SNIPER FIRE가 있으면 더 앞. 스킬 OFF이거나 게이트 실패 시 **기존 밴드1·2·캔들합류**가 그대로 동작한다.
- 기존 신호감지·팩터·기관밴드 UI는 숨기지 않는다.
- 주문: ENTRY → TP1 또는 SL → 100% CLOSE. TP2/Runner/추격 없음.
- 기본 TP1 = **가격 +0.50%**(ROE 8%와 혼동 금지). Calibration 전까지 하드코딩 영구값으로 취급하지 말 것.

## 5+ 필수 게이트 (보강)

Liquidity · Sweep(윅터치 제외) · Reclaim · Confirmed Structure Shift · First Retest · Target space · Data quality

A+/ULTRA만 자동주문. ImmediateAdverseRisk > 30 WAIT. 유동성 이벤트당 신호 1개(`eventId`). 5봉 만료.

기존 밴드/캔들/신호감지 UI 숨김·삭제 금지. 백테스트 없으면 수익성 보고 금지.

## 코드

- `lib/eagle1Tapoint/quickScalpAutoEngine.ts`
- `resolveInstBandTripleEntry` 가 BTC+스킬ON+autoReady면 이 레인 먼저 반환
- 실행: DeskView `tryTapExecute` · 서버 `scanTapointServer` (`qs-auto-` signalId)
- 스킬칩: `btcQuickScalp` / BTC초단타 (`mergedDeskCoinExclusiveSkills.ts`)

## 에이전트

기능 삭제 금지. 백테스트/Walk-forward/OOS 수치 없으면 수익성 보고 금지.
---
