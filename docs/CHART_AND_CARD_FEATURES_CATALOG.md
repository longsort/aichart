# ailongshort — 차트·분석·카드 기능 카탈로그

> **용도**: 외부 LLM(예: ChatGPT)과 논의할 때 이 문서를 붙여 넣어 “지금 앱에 무엇이 있는지” 공유하기 위함.  
> **주의**: 교육·기능 설명용이며 투자 권유가 아님. 수치·신호는 검증 전제 없이 참고용.

---

## 1. 데이터 흐름 (한 줄)

1. 브라우저가 **`/api/analyze`** (쿼리: 심볼, 타임프레임, 기능 플래그 등) 호출  
2. 서버가 **`lib/analyze.ts`** 중심으로 캔들·구조·지표·존·시나리오 등을 계산 → JSON  
3. **`types/index.ts`의 `AnalyzeResponse`** 형태로 프론트에 전달  
4. **`app/components/ChartView.tsx`** 가 `overlays`·지표·마커를 그림  
5. **`app/HomePageContent.tsx`** 가 우측 패널 카드·탭에 같은 `analysis`를 넘김  
6. 사용자 설정은 **`lib/settings.ts`** + localStorage(로그인 시 서버 동기 옵션 있음)

---

## 2. UI 모드 (`UIModeSwitcher`)

| 모드 코드 | 라벨 | 요지 |
|-----------|------|------|
| `FULL` | 전체 | OB/갭/구조/구간 등 분석용 전부 표시 |
| `FOCUS` | 포커스 | 매수·매도 구간 중심 |
| `EXECUTION` | 실행 | 진입·손절·목표 중심 |
| `SMART` | 스마트 | 가이드형(돌파·지지·무효화·추세선·강한구간·거래량 등) |
| `MAX_ANALYSIS` | 최강분석 | **수집 극대화·화면은 읽기 쉽게** — `/api/analyze`·`amx=1`은 고래 모드와 동일. 차트 오버레이 경로는 FULL과 동일하되 `getEffectiveFeatureToggles` 기본값은 **잡음 레이어 OFF**(하모닉·PO3·LVRB·비전 깃발·레인지·VTS·고래 예측박스·핫존·하이퍼·타이롱 몸통·플로우 등); 구조·존·시나리오·피보·RSI·캔들·BPR·반응·고래구간·CP채널·비전 삼각·쐐기·반전·타이롱 돌파·꼬리는 ON. ⚙ 모드별 토글로 확장 가능. 실행/타점 오버레이·우측 트레이드 탭은 실행 모드군과 동일 |
| `CANDLE_ANALYSIS` | 캔들분석 | 캔들분석 전용 레이어 + 설정에 따라 스마트/실행 엔진 오버레이 병합 |
| `TAPPOINT` | 타점 | 스윙 타점·리스크·레버리지 |
| `EVOLUTION` | 진화 | 통합 그래프 + 실행 + 학습 강조 |
| `WHALE` | 고래 | 세력·예측·핫존·하이퍼트렌드 등 고래 전용 오버레이 |

`getEffectiveFeatureToggles(settings, uiMode)` 로 모드별 차트 레이어 ON/OFF가 달라질 수 있음 (`lib/settings.ts`).

---

## 3. 차트(ChartView) 쪽 — 무엇을 그리나

### 3.1 오버레이·구조 (설정 `show*` 계열)

대표 항목 (전부 나열은 `lib/settings.ts`의 `UserSettings` 참고):

- **구조/존/라벨**: `showStructure`, `showZones`, `showLabels`, `showScenario`, `showFib`
- **지표 패널(차트 하위)**: `showRsiPanel`, `showMacdPanel`, `showBbPanel`, `showRsi`
- **패턴·비전**: `showHarmonic`, `showVision` + 삼각/깃발/쐐기/반전/레인지 세분
- **PO3, 캔들 패턴, BPR**, **반응구간** `showReactionZone`, **고래구간** `showWhaleZone`
- **LVRB**, **변동성 트렌드 스코어** `showVolatilityTrendScore`
- **타이롱 종가** `showTailongClose` + 브레이크아웃/위크/몸통/플로우 세부
- **Prime 트렌드 채널** `showChartPrimeTrendChannels` + 채널 옵션
- **통합 캔들 마커** `showUnifiedCandleMarkers`, `candleAnalysisMarkerMax`
- **일괄 숨김**: `chartBulkHideLabels`, `chartBulkHideHLines`, `chartBulkHideZones`
- **구조 로켓 HUD**: `lsRocketScalePct`
- **마커 밀도 A/B/C**: `chartMarkerMetaA`, `chartMarkerClickDetailB`, `chartMarkerDensityC` + 레이어 `chartMarkerLayerLs/Rocket/Aux/FrontRun`
- **존 면 색**: `zoneFillSupplyHex`, `zoneFillDemandHex` 등

### 3.2 캔들분석 모드 전용·유사 옵션 (`candleAnalysis*`)

- **해설만 / 핵심 뷰**: `candleAnalysisAutoCommentaryOnly`, `candleAnalysisExecutiveView`
- **유사 과거 경로(청록 등)**: `candleAnalysisPathMinMatches`, `HorizonBars`, `TopMatches`, 가중치·기울기·`candleAnalysisDirectTheoryPath`
- **Hash Auto Fib (Pine 포팅)**: `candleAnalysisHashFib*` 일련
- **BOSWaves / Institutional Delta**: `candleAnalysisBosWaves*`
- **VIFVG (역 FVG + 거래량)**: `candleAnalysisVifvg*`
- **Breaker Blocks**: `candleAnalysisBreakerBlocks*`
- **존형 레이어 표시**: `candleAnalysisZoneChartVisible`, `candleAnalysisCoreSdZones`
- **엔진 오버레이 병합**: `candleAnalysisMergeEngineOverlays`, `candleAnalysisShowSmartGuide`, `ShowElliottMvp`, `ShowPlaybookPath`, `ShowAutoZones`, `ShowEngineFvg`, `ShowTrendPattern`
- **알림·AI 코멘트**: `candleAnalysisBrowserNotify`, `candleAnalysisAiComment`

### 3.3 고래 모드 (`whale*`)

예: 예측 박스, 매집/분배, MSB-OB 지그재그, 색상, Precomputed memory, Hot Zone Radar, HyperTrend, `aiCompression*` (압축→장대 프리셋) 등 — 전부 `lib/settings.ts` 주석 참고.

### 3.4 차트 마커 의미 (인앱 도움말과 동일 계열)

- **L / S**: 롱·숏 메인 마커  
- **🚀 / 📉**: 구조 로켓  
- **C↑ / C↓ / 점수**: 캔들 엔진 점수 (`engine/candles/candleEngine.ts`의 `scoreCandles` 등)  
- **T↑ / T↓**: 타이롱 종가 힌트  

상세 표: **`/help/chart-candle-analysis`** (`app/help/chart-candle-analysis/page.tsx`).

---

## 4. API 응답(`AnalyzeResponse`) — 카드·차트가 쓰는 주요 필드

| 구분 | 필드 예시 | 설명 |
|------|-----------|------|
| 방향·요약 | `verdict`, `confidence`, `summary`, `longScore`, `shortScore` | 상단 판정·신뢰도 |
| 실행 텍스트 | `entry`, `stopLoss`, `targets[]` | 진입·손절·목표 문자열 |
| 차트 그리기 | `overlays[]`, `engine` | 라인·존·라벨 등 |
| 지표 시계열 | `indicators.rsi`, `macdLine/Signal/Hist`, `bb*`, `atr`, `stoch*` | 패널·보조 |
| MTF·국면 | `mtf`, `regime` | 상위/하위 편향, 레짐 문자열 |
| 확률·경로 | `probability`, `futurePaths`, `beamPathForecast` | 확률·시나리오 |
| 키 레벨 | `breakoutLevel`, `supportLevel`, `resistanceLevel`, `invalidationLevel`, `mustHold`, `mustBreak` | 돌파·지지·저항·무효화 |
| OB·존 | `nearestSupportOb`, `nearestResistanceOb`, `nearestBuyZone`, `nearestSellZone`, 확률·함정 등 | 고래/존 카드 |
| 확정 신호 | **`confirmedSignal`** | 구조+RSI+SR+종가+FVG 등 게이트 (`lib/confirmedSignalEngine.ts`) |
| RSI 다이버전스 | `rsiDivergenceSignal` | 스윙 신호 패널(실행계열 모드에서 상세 UI) |
| 브리핑·유사 | `similarBriefing`, `briefingContext`, `generateAutoBriefing` 입력 | 브리핑 탭 |
| 참고 라이브러리 | `topReferences`, `learnedPatternsTop5` | 참조 탭·패턴 요약 |
| 비전 | `detectedVisionPatterns`, `dominantPattern`, `patternVisionSummary` | 패턴 비전 |
| 수집 데이터 | `unifiedMarketMetrics`, `orderbookImbalance`, `oiState`, `fundingState` … | `collect=1` 등 조건부 |
| AI/고래 요약 | `aiModeAutoAnalysis` | 고래 모드 자동 헤드라인·불릿·압축 박스 |

타입 전체: **`types/index.ts`**.

---

## 5. 확정 신호 (`confirmedSignal`)

- **엔진**: `lib/confirmedSignalEngine.ts`  
- **의도**: 구조·RSI(기본 85+)·지지/저항 근접·종가(라칭)·FVG 존·(옵션) MTF 반대 시 억제 등 **다요소 AND**에 가까운 “확정” 배지  
- **결과 필드**: `confirmed`, `direction`, 플래그 `structure/rsi/supportResistance/close/fvgZone`, `reasons[]`  
- **UI**: `ExecutionBriefingCard`, `ChartView`, 웹훅/타점 모드 게이트 등에서 참조 (`HomePageContent.tsx`)

---

## 6. 우측 패널 — 탭 & 칩 (트레이드 탭 위주)

### 6.1 탭 ID → 한글 라벨

| tab | 라벨 |
|-----|------|
| `trade` | 트레이드 |
| `market` | 시장 |
| `briefing` | 브리핑 |
| `pattern` | 패턴 |
| `ref` | 참조 |
| `etc` | 기타 |
| `learning` | 자율학습 |
| `virtual` | 가상매매 |
| `candle` | 캔들비교 |

### 6.2 기능 칩 (`panelFeatures` — localStorage `ailongshort-panel-features`)

- 통합그래프 (`TradeUnifiedGraph`)
- 신호박스 (`SignalBox`)
- 실행카드 (`ExecutionBriefingCard`)
- 포커스 (`FocusOverlay`)
- 자율학습 (`AutonomousLearningCard`)
- 가상매매 (`VirtualTradeCard`)
- 캔들비교 (`CandleCompareCard`)

“기능 전체 ON/OFF” 버튼으로 일괄 제어.

### 6.3 탭별 요약

- **트레이드**: 통합 그래프, 신호 박스, 실행 브리핑, (실행계열 시) RSI 다이버전스 대형 패널 + Zone 민감도·ParkF 색/옵션·Major Zone 슬라이더·구조 로켓 옵션 등, 고래 구간 미니 카드, WHALE 시 `aiModeAutoAnalysis`, 비실행 모드 시 RSI 다이버전스 요약, 타이롱/돌파·무효화 등
- **시장**: 매수/매도 압력 섹션(제목 수준 — 상세는 분석 필드 연동)
- **브리핑**: 유사도 임계·유사 케이스 경로 재작도, `generateAutoBriefing` 텍스트
- **패턴**: 엔진 점수 섹션
- **참조**: `topReferences` 리스트 → 클릭 시 참조 상세
- **가상매매**: `VirtualTradeCard` (TP/SL auto|manual 등 설정 연동)
- **자율학습**: `AutonomousLearningCard`
- **캔들비교**: `CandleCompareCard`
- **기타**: 잔고·리스크, 백테스트 버튼, 멀티 심볼 칩, 최근 기록, 용어 “메뉴판”

---

## 7. 기타 UI

- **`AIChatPanel`**: 동일 `analysis`·스냅샷·심볼·TF로 채팅
- **`AppDisclaimerBanner`**, **`PageLayoutFab`**: 레이아웃·고정 패널 (`PageLayoutSettings`: 툴바/MTF 스트립 플로팅 등)
- **`ExecutionModeStrip` / `ExecutionOverlay`**: 실행 모드 시각 강조 (코드 내 연동)
- **`AppSiteLogin`**: 사이트 로그인

---

## 8. 관련 API (참고만)

- **`/api/analyze`**: 메인 분석  
- **`/api/market`**, **`/api/backtest`**, **`/api/user-settings`**, **`/api/trade-learning`**, **`/api/chart-explain`**, **`/api/candle-analysis-*`** 등 — 기능 확장 시 라우트별 확인

---

## 9. 주요 파일 경로 (빠른 점프)

| 역할 | 경로 |
|------|------|
| 메인 페이지 조립 | `app/HomePageContent.tsx` |
| 차트 | `app/components/ChartView.tsx` |
| 모드 스위치 | `app/components/UIModeSwitcher.tsx` |
| 설정·모드별 토글 | `lib/settings.ts` |
| 분석 코어 | `lib/analyze.ts` |
| 확정 신호 | `lib/confirmedSignalEngine.ts` |
| 지표(RSI/MACD 등) | `lib/indicators.ts` |
| 응답 타입 | `types/index.ts` |
| 분석 API | `app/api/analyze/route.ts` |
| 차트 도움말 페이지 | `app/help/chart-candle-analysis/page.tsx` |

---

## 10. 문서 갱신 시점

코드 변경 후 이 목록과 어긋날 수 있음. 갱신하려면 `lib/settings.ts`의 새 필드와 `HomePageContent.tsx` / `ChartView.tsx`의 신규 컴포넌트를 기준으로 이 파일을 수정하면 됨.

---

*생성 목적: 사용자 외부 논의용 카탈로그. 버전 고정 없음.*
