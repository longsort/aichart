# Doksuri-1 AUDIT (재사용 / 미연결 / 누락)

## 재사용 (존재)
- 구조: `lib/mergedDeskStructureVerdict.ts`, `lib/eagle1/structureEngine.ts`
- 폭락 MTF: `lib/mergedDeskMtfDumpZoneBridge.ts`, `lib/mergedDeskDumpSupportResistPath.ts`
- 고래빔: `lib/whaleVolumeBeamIntel.ts` (+ `/api/bitget-whale-volume-beam-intel`)
- 스윙·데스크: `lib/telegramServerMergedDeskEval.ts`, `lib/mergedDeskSwingMidEntry.ts`
- 흡수: `lib/aiMarketZone/orderflowEngine.ts` (`estimateAbsorptionAtZone`)
- 전황 포맷: `lib/telegramRealBattleBriefing.ts`

## 미연결 (전황에 미반영이던 것)
- 텔레그램 러너 `whale: null`
- 구조 판정 · CVD/OI CASE · 양맵 동시 플랜 · FACT 기반 LIVE

## 누락 시 정책
- Iceberg/청산맵 등 실측 없으면 섹션 생략 (창작 금지)
- DataQuality BAD 2개↑ → WAIT

## 신규
- `lib/doksuri1/*` — FACT → Market Story → UI/Telegram
