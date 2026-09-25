/**
 * [4-STRATEGY AUTO SCALP AUDIT]
 * 삭제·전체 재작성 금지. 아래 재사용 + 신규 연동.
 */
export const FOUR_STRATEGY_AUDIT = {
  reuse: {
    sfpSweep: ['lib/mergedDeskRbEdgeConfluenceGate.ts#detectRbRailSfp', 'autoScalp Arm→SFP'],
    structure: ['structureRocketSignals', 'mergedDeskStructureVerdict', 'eagle1/structureEngine'],
    zones: ['mergedDeskMtfDumpZoneBridge', 'hotZone', 'scalp200'],
    obFvg: ['settings SMC OB/FVG', 'institutional bands'],
    flow: ['whaleVolumeBeamIntel', 'doksuri1/absorptionBridge', 'aiMarketZone/orderflow'],
    paper: ['mergedDeskAutoScalpEngine', 'virtualTradeSession', 'autoScalpStore'],
    memory: ['lib/patternMemory/*'],
    cost: ['mergedDeskScalpNetRoe', 'doksuri1/ultraScalpEngine'],
  },
  newFiles: [
    'lib/doksuri1/fourStrategyTypes.ts',
    'lib/doksuri1/fourStrategyDetect.ts',
    'lib/doksuri1/fourStrategyStats.ts',
    'lib/doksuri1/fourStrategyEngine.ts',
    'lib/doksuri1/fourStrategyAudit.ts',
  ],
  modify: [
    'MergedAnalysisDeskView.tsx (scan+tag FIRE)',
    'MergedDeskAutoTradePanel.tsx (4 strategy cards)',
    'mergedDeskAutoScalpEngine.ts (strategyId meta)',
  ],
  doNotTouch: ['engine/ trading_engine delete', 'zone lifecycle wipe', 'LIVE default ON'],
  phase: 'mandatory3+bonus40 · XRP four-strategy only · candle-ls XRP soft-skip',
} as const;
