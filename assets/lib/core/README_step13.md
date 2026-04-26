STEP 13 - 무료(Bitget) 데이터 + 차트 밖 롱/숏 HUD

추가:
- BitgetPublicApi: 공식 공개 무료 API (key 불필요)
- BitgetRealtimeCandleRepo: RealtimeBus에 연결
- smc_engine: 가벼운 CHOCH 감지 + OB/FVG 반응구간
- execution_engine: 체결/볼륨/오더북 기반 실행력 점수
- SignalHUD: 미니차트 밖에서 3게이지로 판단
- RealtimePriceText: 캔들 옆 작은 실시간 가격 글자

주의:
- pubspec.yaml에 http 필요 (없으면 추가):
  http: ^1.2.0
