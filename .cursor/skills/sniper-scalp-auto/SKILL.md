---
name: sniper-scalp-auto
description: >-
  BTC 독립 SNIPER_SCALP_AUTO_ENGINE — S1~S5 병렬 셋업, 3m SETUP_READY + 마이크로 트리거 FIRE, 실행SL≠테제SL, 리스크→레버.
  Trigger: SNIPER, 스나이퍼, 정밀타격, S1 liquidity, micro trigger, btcQuickScalp.
---

# SNIPER SCALP (BTC 1순위 보강)

기존 CONFIRMED/밴드 판정에 묶지 않는 **독립 신호 모듈**. 봉·구조이벤트·유동성 데이터만 재사용.

우선순위: **SNIPER FIRE → QUICK SCALP → 밴드/캔들**. 기존 UI 숨김·삭제 금지.

- 3m에서 SETUP_READY. 주문은 마이크로 트리거(1m 있으면 1m 마감, 없으면 3m 마감)만.
- HTF는 위치/테제. 진입 트리거 아님.
- TP1 가격% 전량. 실행SL과 1H 테제 무효화 분리. 레버는 리스크/SL거리.
- 표본 없으면 TP-FIRST·Fast Green %를 만들지 않음. 가짜 70% 금지.

코드: `lib/eagle1Tapoint/sniperScalpAutoEngine.ts`
---
