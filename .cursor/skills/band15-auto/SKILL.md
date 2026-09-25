---
name: band15-auto
description: >-
  호칭 「15분밴드자동」(BAND15_AUTO, skill id band15Auto).
  전 코인 자동주문 본체는 15m 기관밴드1·2 정렬+READY Paper.
  구 QS/SNIPER/ETH오토/세판정/캔들합류/로켓/PPL 자동주문 금지(카드·차트 유지).
  Trigger: 15분밴드자동, BAND15_AUTO, band15Auto, 15m 밴드 자동, INST_BAND_15M.
---

# 호칭: 15분밴드자동

- **호칭(한국어):** `15분밴드자동`
- **호칭(영문):** `BAND15_AUTO`
- **스킬 id:** `band15Auto`
- **엔진 id:** `INST_BAND_15M_PAPER`

사용자가 「15분밴드자동 수정해줘」「BAND15_AUTO 손절」처럼 부르면 이 스킬만 연다.

## 본체

1. TF **15m만**. BTC/ETH/SOL/XRP/BNB 진입 TF도 15m.
2. 밴드1 방향 = 밴드2 방향 + READY(터치/재탈환) → Paper FIRE.
3. 스윕 2회는 **합류 집계만**. 주문 OR 금지.
4. TP/SL 기본 8% ROE @ 20배(가격 ~0.40%). Paper n≥30 · Net EV>0 전에 목표 바꾸지 않음.
5. 계좌 리스크 상한 5%.
6. **LIVE 금지.** 서버 스캔은 wait. 가상매매만 Paper 체결 가능.

## 구 스킬 (주문 금지 · 삭제 아님)

카드·차트·엔진 코드는 유지한다. 자동주문 레인은 타지 않는다.

- BTC초단타 / QUICK SCALP / SNIPER
- ETH오토파일럿
- 세판정 · 캔들합류 · 신호B/C · Dual 자동주문

## 코드

- `lib/eagle1Tapoint/band15AutoSkill.ts` — 호칭 상수
- `lib/eagle1Tapoint/instBandTripleEntry.ts` — 주문 게이트
- `lib/eagle1Tapoint/instBand15mEventBacktester.ts` — 이벤트 BT
- `lib/eagle1Tapoint/ingestAiTradeJournalFromDesk.ts` — AI기록부 Paper

확정 수익·고정 승률 문구 금지.
