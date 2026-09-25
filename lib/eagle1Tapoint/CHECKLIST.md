# 독수리1호 타점엔진 — 지시서 §1–39 체크리스트

**지시서 핵심 패치 완료 (P1–P5 + AUDIT follow-up · Dual브리지·라이프사이클·Flow스캘프차단·NormalSetup).**

원칙: 기존 기능 삭제 금지 · 모듈 추가만 · 가짜 승률 금지 · 확정 수익 아님.

| § | 항목 | 상태 |
|---|------|------|
| 0–13 | AUDIT~HISTORICAL | DONE/PARTIAL |
| 14 | SFP QUALITY | DONE |
| 15 | ENTRY STATE | DONE (+ TRIGGERED · EXECUTED/MANAGE/OUTCOME) |
| 16–17 | SCALP/SNIPER | DONE |
| 18 | BREAKOUT | DONE |
| 19 | ORDER FLOW | DONE (+ MARKET_SCALP UNAVAILABLE 차단) |
| 20 | RSI/DIV | DONE |
| 21 | ENTRY DECISION | DONE |
| 22–24 | SL/TP/NETEV | DONE |
| 25 | 상관 클러스터 | DONE |
| 26–28 | 신호소스·BNB·품질 | DONE (+ Dual→setupSources 힌트만) |
| 29 | 백테스트 A–H | DONE |
| 30 | 평가지표 | DONE |
| 31 | OVERFIT/WF | DONE |
| 32 | 브리핑 §32 | DONE |
| 33–34 | REJECT/MISSED | DONE |
| 35 | PAPER→LIVE 게이트 | DONE (+ 디스크 영속) |
| 36–39 | 철학·흐름 | DONE |
| 9 | NORMAL SETUP | DONE (`normalSetupEngine`) |

## 이력

1. P1 점수·게이트·이벤트·상태머신
2. P2 MACRO·유동성·Battle
3. P3 실행·구조SL·NETEV·Flow
4. P4 SFP·Breakout·상관·Missed·Paper
5. 잔여 RSI·A–H백테스트·지표·브리핑§32·승격게이트
6. AUDIT follow-up: tapoint-decide 품질·리페인트 · Paper 영속 · TRIGGERED 상태
7. P5: Dual/S급→setupSources 브리지 · entryLifecycle 체결연동 · Flow스캘프차단 · NormalSetup

- 초록=롱 · 빨강=숏 · 회색=대기 · 파랑=통과/참고 (게이지 숫자=강도, 색=방향)
- 카드 중앙 브리핑 한 줄 · 게이지 위 롱/숏 뱃지
- 폰(≤700px): 차트 위 신호감지 오버레이 · PC는 우측 유지
- CHANNEL≠ENTRY · Dual tapOnly=힌트만 · 즉시주문 금지
