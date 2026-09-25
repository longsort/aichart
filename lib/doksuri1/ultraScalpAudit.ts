/**
 * [ULTRA SCALPING AUDIT] — 코드 수정 전 맵핑 (2026-09-19)
 * 전체 재작성·기존 삭제 금지. 아래를 재사용·확장한다.
 */

export const ULTRA_SCALP_AUDIT = {
  reuse: {
    candleWs: ['lib/clientMarketCandleCache.ts', 'ChartView TF load'],
    zones: [
      'lib/mergedDeskMtfDumpZoneBridge.ts',
      'lib/mergedDeskHotZoneEntry.ts',
      'lib/zone-engine (skills)',
    ],
    entry: [
      'lib/mergedDeskAutoScalpEngine.ts (Arm→SFP→로켓→FIRE)',
      'lib/mergedDeskRbLiveEntryHub.ts',
      'lib/mergedDeskEntryHardGates.ts',
      'lib/mergedDeskScalp200Plan.ts',
    ],
    paper: [
      'lib/mergedDeskVirtualTradeSession.ts',
      'lib/mergedDeskAutoScalpStore.ts',
      'lib/serverAutoScalpPaperStore.ts',
    ],
    riskCost: ['lib/mergedDeskScalpNetRoe.ts', 'lib/assets/riskCalc.ts'],
    autoTrade: [
      'lib/mergedDeskAutoTradeConfig.ts',
      'lib/mergedDeskAutoTradeRunner.ts',
      'MergedDeskAutoTradePanel.tsx',
    ],
    doksuri1: ['lib/doksuri1/*', 'Doksuri1BattleCard.tsx'],
    bitget: ['exchange-keys API', 'mergedDeskLiveOrderClient'],
  },
  missingWiredNow: [
    'ULTRA TF gate 1m/3m/5m/15m',
    'TradingMode PAPER default / LIVE locked',
    'StrategySpeed ULTRA_SCALP',
    'TP1/TP2 ROE 5~10% × user leverage',
    'Cost gate before FIRE',
  ],
  stillLaterPhases: [
    'Strategy A–G parallel consensus',
    'Orderbook slippage/spread extreme kill',
    'Shadow fill simulator',
    'Walk-forward / strategy auto-disable',
    'Bitget position sync hard halt',
    'Correlation exposure BTC/ETH/SOL',
  ],
  doNotTouch: [
    'engine/ trading_engine/ core analyzers delete',
    'ChartView candle pipeline rewrite',
    'Existing zone/dump life cycle removal',
  ],
  phaseOrder: [
    '1 AUDIT(done)',
    '2 State+TF+ROE wire(done this pass)',
    '3 Signal enrich',
    '4 Risk harden',
    '5 Order mock',
    '6 Paper parity',
    '7 Shadow',
    '8 Test order',
    '9 Small live',
    '10 Normal live',
  ],
} as const;
