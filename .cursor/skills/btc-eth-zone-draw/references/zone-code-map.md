# Zone 코드 맵 (빠른 조회)

## 생성

| Zone 종류 | 파일 | id / class 힌트 |
|-----------|------|-----------------|
| Mirage 저항/지지/횡보/FVG | `lib/mergedAnalysisMirageTvVisual.ts` | `merged-ares-mlsp-tv-*` |
| key zone | `lib/mergedAnalysisKeyZones.ts` | `merged-ares-key-*` / `merged-ares-key-zone` |
| critical zone | `lib/mergedAnalysisCriticalZones.ts` | `merged-ares-critical-*` |
| HotZone | `lib/mergedDeskHotZoneEntry.ts` | `merged-desk-hotzone-*` |
| core S/R | `lib/mergedDeskCoreSrZones.ts` | `merged-desk-core-sr-*` |
| HQ entry | `lib/mergedDeskHqEntryZones.ts` | `merged-desk-hq-*` |
| 합류 | `lib/mergedDeskMirageEnhancePack.ts` | `merged-ares-mlsp-tv-confluence-zone` |
| 지지반등 | `lib/mergedDeskSupportReboundAnalysis.ts` | `merged-desk-support-rebound-*` |

## 정렬·렌더

| 단계 | 파일 |
|------|------|
| 엔진 합치기 | `lib/mergedAnalysisDeskEngine.ts` |
| 시간 스냅·span | `lib/mergedAnalysisOverlayTimes.ts` |
| 화이트리스트 | `lib/mergedDeskMirageStyleDraw.ts` → `keepMirageDeskOverlay` |
| Mirage 픽셀 | `lib/mergedDeskMirageZoneScreen.ts` |
| HTML zone 면 | `app/components/ChartView.tsx` (`screenOverlays`) |
| id 판별 | `lib/mergedAnalysisOverlayIds.ts` |

## 작도 체크리스트

- [ ] `tradePack.overlays` + `coreSr.overlays` 엔진에 주입됨
- [ ] `finalize`가 zone을 버리지 않음
- [ ] time2 = 마지막 캔들, time1 = 형성봉
- [ ] 화면 우측 X = `mergedDeskSeriesLastBarScreenX` (가격축 과연장 없음)
- [ ] 라벨이 존 우측·캔들과 동행
