STEP - 엔진 잠금(캔들마감 + MTF 위계)
- 15m: 상위TF(4H/1D) 방향이 LONG/SHORT로 합의되면 역방향 신호 차단
- 5m : 상위 혼조/중립 시 5m 단독 신호 차단(과매매 방지)
- 캔들 마감 기준은 기존 로직 유지(마지막 캔들 ts 변화 시만 확정 갱신)

덮어쓰기: lib/core/services/fu_engine.dart
