# 독수리1호 AI CORE MASTER

이 문서는 2026-08-14 사용자 MASTER SPEC을 프로젝트 최상위 요구사항으로 고정한다.

## 최종 출력

내부 엔진만으로 `CONFIRMED LONG` / `CONFIRMED SHORT` / `WAIT` 중 하나를 결정한다.  
외부 ChatGPT/Gemini는 필수 의존성이 아니다.

## 절대 원칙 (요약)

- 가짜 숫자 금지. 실측 없으면 `데이터 없음` / `통계 부족` / `신뢰도 낮음`.
- Repaint 금지. 미래 봉을 과거 Feature에 쓰지 않는다.
- Confirmed Zone 가격 범위를 현재가에 맞춰 이동하지 않는다.
- 방향이 불명확하면 거래하지 않는다. 신호 개수 증가가 목적이 아니다.
- 기존 정상 기능을 임의 삭제하거나 프로젝트를 처음부터 재작성하지 않는다.

## 구현 순서

PHASE 0 Audit+Backup → 1 Historical/DB/Quality/Storage → 2 Live/Replay → 3 Feature/Regime → 4 POC → 5 Big Money → 6 SMC/Wyckoff → 7 Zone Intelligence → 8 Snapshot/Stats → 9 Similarity → 10 ML → 11 Consensus → 12 Entry/SL/TP → 13 Path → 14 Backtest → 15 UI compact → 16 Statistics → 17 Telegram/Review.

각 Phase는 필수 테스트 통과 후에만 다음으로 진행한다.

## 상세 감사

`docs/EAGLE1-PHASE0-AUDIT.md`
