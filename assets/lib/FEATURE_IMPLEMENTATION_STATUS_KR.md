# assets/lib 기능 정밀 분석 및 구현 상태

## 1. 이전 구현이 “정밀 분석 후 전부 구현”이 아닌 이유

**아니요. 정밀 분석 후 전부 구현한 것이 아닙니다.**

이전 작업에서는 다음만 수행했습니다.

- **요청 해석**: “차트 캔들에 스스로 분석·작도” + “브리핑 카드로 분리”
- **실제 적용 범위**:
  1. **차트**: `MiniChartV4`에 `StructureMarksEngineFu` 결과(`structureMarks`) 전달 및 캔들 위에 EQL/EQH/BOS/CHOCH/MSB 작도
  2. **메인 화면**: `UltraHomeScreen`의 메인 차트에 `structureTag`, `reactLow/High`, `showBOS/CHoCH`, `tfKey`, `bias`, `prob` 연동 + 차트 바로 아래 `CsvChipRowV1`(캔들 확률 칩) 배치
  3. **브리핑**: `BriefingCardJudge`, `BriefingCardConfidence`, `BriefingCardRisk`, `BriefingCardNextCandle`, `BriefingCardPrices`로 카드 분리 후 `BriefingSheetV1` / `BriefingFullScreenPage`에서 사용
  4. **전체화면 차트**: `BriefingFullScreenPage`·`ChartFullScreenPage` 등에서 `MiniChartV4`에 `structureMarks` 등 동일하게 전달

**다루지 않은 것** (아래 “전체 기능 목록” 대부분):

- RootShell 3탭(차트/플랜/통계) 외의 모든 화면·쉘·대시보드
- 플랜 탭(SignalsScreenV82), 통계 탭(StatsSQLiteScreen) 내부 기능 검증·연동
- Zone, Trade/Paper, Stats, Settings, Engine/Evidence, Data 레이어의 “현재 앱 실행 방식”별 정밀 연동
- 백테스트·리포트·대시보드·HUD·War·진단 등 나머지 기능 전수 검토 및 구현

즉, **일부 기능(차트 자체 분석·작도 + 브리핑 카드 분리)만**, 현재 쓰이는 진입점(UltraHomeScreen → MiniChartV4, BriefingSheet, BriefingFullScreen) 기준으로 구현한 상태입니다.

---

## 2. 전체 기능 규모 (정밀 분석 기준)

- **UI 진입점**: RootShell 3탭 + Navigator.push로 여는 화면 10개 이상 + 모달/시트 + 대체 쉘(SuperAiShell, FutureShell, UltraHomeLayoutV1, DashboardV82, HudDashboardLive 등) + 레거시/백테스트/설정/도움말 등 **40개 이상** 화면·패널
- **주요 기능 영역**:
  - **Chart/Candle**: MiniChartV4, FutureWavePanel, path 차트, 캔들 엔진·이벤트 분석, CandleProbEngine, StructureMarks 등
  - **Briefing**: 풀스크린/시트/카드/주기 브리핑, TF 브리핑, 엔진·DB
  - **Decision/Signal**: Decision 패널·HUD·허브, 신호 엔진·합의·최종신호, EngineSignal 시트, DB
  - **Zone**: Zone 패널·게이지·입력 화면, zone 엔진·evidence 연동
  - **Trade/Paper**: 포지션·페이퍼·매니저 패널, trade/paper 엔진·저널·가드
  - **Stats**: StatsSQLiteScreen, 리포트·대시보드·백테스트·튜닝 DAO·학습 엔진
  - **Settings**: 설정 화면·앱 설정·repo
  - **Engine/Analysis**: core/analysis, core/engines, engine/* (central, evidence, consensus, paper, trade, learning, analyzer 등)
  - **Data**: Bitget(client, live_store), snapshot(hub/store/reader/evidence), core/db(여러 DAO), trade_log 등
  - **Core AI**: super_agi_v6/v7, core/ai

- **Dart 파일**: 약 **763개** (문서 등 포함 시 889개 이상)

---

## 3. 이전에 실제로 구현·연동한 항목만 정리

| 구분 | 항목 | 내용 |
|------|------|------|
| 차트 | MiniChartV4 | `structureMarks` 파라미터 추가, StructureMarksEngineFu 결과 작도(EQL/EQH/BOS/CHOCH/MSB) |
| 차트 | UltraHomeScreen | 메인 차트에 structureTag, reactLow/High, showBOS/CHoCH, structureMarks, tfKey, bias, prob 전달 + 차트 하단 CsvChipRowV1 |
| 차트 | BriefingFullScreenPage | MiniChartV4에 structureMarks, tfKey, bias, prob 전달 |
| 브리핑 | briefing_cards.dart | BriefingCardJudge, Confidence, Risk, NextCandle, Prices + BriefingHelpers (신규) |
| 브리핑 | BriefingSheetV1 | 위 카드 위젯으로 전면 교체 |
| 브리핑 | BriefingFullScreenPage | 상단 결론/차트 유지, 차트 아래 스크롤 영역에 분리된 브리핑 카드 5종 추가 |

**그 외 모든 화면·패널·엔진·데이터 레이어**는 “현재 앱 실행 방식으로 전부 구현했다”고 볼 수 없고, 개별 정밀 분석과 요구사항이 필요합니다.

---

## 4. “전부 현재 앱 실행 방식으로 구현”하려면 필요한 작업

1. **진입점·흐름 정리**  
   - main → RootShell → 3탭 + 각 탭에서 push하는 화면 목록 확정  
   - 실제로 사용하는 쉘/레이아웃(UltraHome만 vs SuperAiShell 등) 결정  

2. **기능 영역별 정밀 분석**  
   - Chart, Briefing, Decision/Signal, Zone, Trade/Paper, Stats, Settings, Engine, Data, Core AI 각각에 대해:  
     - 어떤 화면/위젯이 “현재 실행 방식”인지  
     - 어떤 엔진·서비스·DB를 쓰는지  
     - 빠진 연동·미구현·레거시 분리할 부분이 있는지  

3. **영역별 구현**  
   - 위 분석 결과대로 “지금 사용하는 앱 실행 방식”만 남기고,  
     각 기능을 해당 방식에 맞게 연동·정리·구현(또는 제거/대체 계획 수립)  

원하시면 “특정 탭/화면만” 또는 “특정 영역(예: 플랜 탭, 통계 탭, Zone)”만 골라서 정밀 분석 + 구현 범위를 더 쪼개서 진행할 수 있습니다.
