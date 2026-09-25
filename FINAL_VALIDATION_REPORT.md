# Eagle1 Final Validation Report

Generated: 2026-08-21T14:05:50.714Z

## Verdict: PASS (gate 1차)

MASTER §57 / IMPLEMENTATION_PLAN PASS 조건 요약. 엔진 삭제 없음. 가짜 CVD·목업 % 없음.

## Checks

| Check | Result | Detail |
|------|--------|--------|
| engines selftest | PASS | eagle1 engines selftest ok { events: 35, regime: 'BULL', zones: 15, wait: 'WAIT' } |
| visual layout contract | PASS | eagle1 visual layout contract ok |
| repaint selftest | PASS | > chart-analysis-step10-bundle@1.0.0 eagle1:repaint:selftest · > node scripts/eagle1-repaint-selftest.mjs |
| no mock % hardcoded in HUD live strip | PASS | formatSamplePct / 데이터 없음 gates |
| heat does not cover candles | PASS | HUD bottom strip + zone heat hidden |
| no whale card UI | PASS | no-whale-card-ui rule |
| AI score ≠ calibrated probability | PASS | scoreCalibrationView |
| live/replay parity hash | PASS | liveReplayParityDetailed |
| overlay budget applied | PASS | applyOverlayBudgetToChartUx |
| label interaction easy KO | PASS | labelInteraction + ExplainKicker |
| MarketDataBus ChartView OHLCV | PASS | subscribeMarketBusCandles + concurrent selftest |
| coverage sidecar ops | PASS | refreshCoverageOnCollect + eagle1:coverage:refresh |
| mark/index lane | PASS | collectBitgetSymbolPrice + has_mark/has_index |

## Phase coverage (파사드 1차)

- Phase 0–1 data/quality (부분)
- Phase 2 HTF status (coverage, no fs client)
- Phase 3 Live/Replay parity
- Phase 4 Profile HVN/LVN
- Phase 5 OrderFlow
- Phase 6 Candle Evidence
- Phase 7 MTF Smart Zone
- Phase 8 Liquidity Defense
- Phase 9 Squeeze
- Phase 10 Legendary Fusion
- Phase 11 Combination Mining
- Phase 12 Score split
- Phase 13 Trade Opportunity
- Phase 14 Execution Levels
- Phase 15 Position Size
- Phase 16 Smart Future Path
- Phase 17 Position Management
- Phase 18 Re-entry
- Phase 19 Cost-aware Walk-Forward
- Phase 20 UI (Heat + Overlay budget + LabelInteraction)
- Phase 21 Visual contract (+ optional pixel diff)
- Phase 22 This report

## Known remaining

- Pixel diff: `npm run eagle1:visual:e2e` (dev 서버 필요) → screenshot + regression
- MarketDataBus ChartView OHLCV + mark/index ✅
- Coverage sidecar 운영 ✅ (`npm run eagle1:coverage:refresh` / collect=1 stale)

## Commands

```bash
npm run eagle1:engines:selftest
npm run eagle1:visual:selftest
npm run eagle1:coverage:refresh
npm run eagle1:visual:e2e
npm run eagle1:final
```

UI 확인: **Ctrl+Shift+R** · HUD 라벨 클릭/길게 누르기 → 쉬운 한글
