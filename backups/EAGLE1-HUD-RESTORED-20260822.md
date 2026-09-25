# 독수리1호 테두리 HUD 복원 (서버 베이스 위)

## 통합모드에 다시 넣음
- HomePageContent: MERGED_ANALYSIS_DESK → wrapEagle1Hud + shareMergedServerChart
- MergedAnalysisDeskView: Eagle1StructureDesk(Eagle1AiHud) 래핑
- analyze/route.ts: phase0 runEagle1Pipeline + eagle1Hud 응답
- dataService: eagle1Availability / moneyLive
- types: eagle1* 필드
- ChartView: shiftVisibleRangeOnNewBar false (패닝 우측 끌림 완화)

## 보관본
- backups/eagle1-border-hud-keep-20260822-132009/
