# 독수리1호 타점엔진 — 지시서 §1–39 체크리스트

상태: `DONE` 반영됨 · `PARTIAL` 골격/래핑 · `TODO` 미구현  
원칙: 기존 앱 기능 삭제 금지 · 모듈 추가만.

| § | 항목 | 상태 | 비고 |
|---|------|------|------|
| 0 | AUDIT·기존 재사용 | DONE | Dual/Zone/eagle1/주문 유지 |
| 1 | 절대금지(점수합산·AI단독 등) | PARTIAL | 게이트·BNB§27 반영, 전경로 감사 계속 |
| 2 | 전체 엔진 파이프 | PARTIAL | orchestrator 골격 |
| 3 | TF 3계층 MACRO/SETUP/ENTRY | PARTIAL | UI TF레일, MACRO 프레임 출력 약함 |
| 4 | KST 주/월/일 마감규칙 | TODO | |
| 5 | MACRO MAP 다축 출력 | TODO | |
| 6 | MARKET REGIME | PARTIAL | eagle1 regime 재사용 |
| 7 | LIQUIDITY MAP | PARTIAL | zone 재사용, 풀맵 미완 |
| 8 | BATTLE ZONE | PARTIAL | cluster/권장존 픽 |
| 9 | NORMAL LONG/SHORT SETUP | PARTIAL | 게이트로 근사 |
| 10 | REQUIRED + SUPPORTING | PARTIAL | 이벤트경로 완화 추가 |
| 11 | 점수 분리 | DONE | scores.ts |
| 12 | EXTREME EVENT 분리 | PARTIAL | extremeEventEngine P1 |
| 13 | HISTORICAL SIMILARITY | PARTIAL | causalSimilarity P1 |
| 14 | SFP QUALITY | TODO | |
| 15 | ENTRY STATE MACHINE | PARTIAL | entryStateMachine P1 |
| 16 | MARKET SCALP | PARTIAL | execKind만 |
| 17 | ZONE SNIPER | PARTIAL | execKind만 |
| 18 | BREAKOUT 전략 | TODO | |
| 19 | ORDER FLOW | PARTIAL | pipe moneyFlow |
| 20 | RSI/DIVERGENCE 규칙 | TODO | |
| 21 | ENTRY DECISION 15문 | PARTIAL | decision/reason |
| 22 | STRUCTURAL SL 순서 | PARTIAL | plan SL 사용 |
| 23 | TP ENGINE 다후보 | PARTIAL | plan TP1–3 |
| 24 | 거래비용 NET EV | TODO | |
| 25 | 상관 클러스터 리스크 | TODO | |
| 26 | 신호A/B/C/S = Setup | PARTIAL | setupSources |
| 27 | BNB AI단독진입금지 | DONE | |
| 28 | DATA QUALITY | PARTIAL | qualityOk |
| 29 | 백테스트 분리 A–H | TODO | |
| 30 | 평가지표 세트 | TODO | |
| 31 | OVERFIT 방지 | TODO | |
| 32 | 브리핑 확장 | PARTIAL | briefing.ts |
| 33 | REJECTED 기록 | PARTIAL | rejectLedger |
| 34 | MISSED OPPORTUNITY | PARTIAL | tag 함수만 |
| 35 | PAPER→LIVE 승격 | TODO | |
| 36 | 철학(WHERE/WHY…) | PARTIAL | reason 한줄 |
| 37 | 최종 전체 흐름 | PARTIAL | |
| 38 | 구현원칙(로그·중복방지) | PARTIAL | signalId |
| 39 | 최종 행동 예시 | PARTIAL | |

## 패치 우선순위
1. P1 §10·11·12·13·15 · UI 반영 · 배포
2. P2 §3–8 MACRO/Liquidity/Battle 강화
3. P3 §16–19·22–24 실행·비용
4. P4 §14·18·20·25·29–31·35 연구/백테스트
