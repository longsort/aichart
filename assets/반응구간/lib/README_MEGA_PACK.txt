FULINK PRO MEGA PACK v1 (토글형 메가팩)

✅ 포함된 기능
[UI]
1) 미래모드 AI PROJECTION 오버레이 (반응/무효 확률 표시 + 글로우)
2) 지지/저항/OB/FVG 박스 안 '반응확률 %' 라벨
3) 롱/숏 엔트리 마커(확률% + RR) 차트 위 표기
4) 무효화 라인(InvalidationLineOverlay)

[ENGINE]
5) SQLite trade_logs 테이블
6) AutoJudge: TP/SL/TIMEOUT 자동 판정 + MAE/MFE
7) Rolling hit-rate -> AI confidence 자동 반영
8) NO-TRADE LOCK: 연속손실/과열/방향불일치 차단
9) Auto-Tune: 근거 가중치/임계값 자기학습 + 로그 DB + UI 패널

---
⭐ 핵심: 한 ZIP로 묶되, 기능은 FeatureFlags로 한 개씩 ON/OFF.

📌 추가된 토글 파일
- lib/ui/ai/feature_flags.dart
- lib/ui/ai/ff.dart

---
✅ 적용 방법
1) 이 ZIP 풀고 프로젝트 루트에 그대로 덮어쓰기(경로 유지)
2) 컴파일
3) 기능이 이미 연결된 곳은 즉시 적용됨
4) 연결이 필요한 곳은 아래 체크대로 감싸서 ON/OFF

---
🔌 연결(필수) 체크리스트
A) 미래 차트 Stack 위
- FutureModeOverlay(enabled: isFutureMode, ...)
- (무효화 라인도 Stack 위)

B) 확률/마커
- ZoneProbLabel / EntryMarker를 Stack에 올림
- 확률<20%면 마커 표시 금지(FeatureFlags.strictWatchUnder20 사용)

C) DB/엔진
- AutoJudge 실행 -> outcome -> TradeLogRepo.updateOutcome
- RollingMetrics.hitRatePct -> AiConfidenceController.fromHitRate
- NoTradeLockEngine.update -> locked면 WATCH로 강등/버튼 비활성
- EvidenceAutoTuner.updateFromOutcome(outcome.result)

---
⚠️ 주의
- 이 ZIP은 "패치 파일 모음 + 토글"이다.
- 실제 호출부가 아직 없다면, PATCH_NOTES.txt 문서대로 Stack/호출부에 3~6줄을 추가해야 활성화된다.

---
다음(원하면):
- '활성화 체크 위젯' : 지금 앱 화면에 ON/OFF 상태를 한 줄로 보여주는 패치
- 'TF 프리셋' : 15m/1h/4h/1D/1W/1M/1Y 별 표기 룰 자동 전환