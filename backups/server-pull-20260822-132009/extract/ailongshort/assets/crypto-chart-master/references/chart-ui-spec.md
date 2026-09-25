# Crypto chart UI spec

## Main screens

1. Market dashboard
- Symbol selector
- Current price
- 24h change
- Volatility state
- Funding/OI if available
- Signal state: LONG / SHORT / WAIT

2. Chart analysis screen
- Candle chart
- Overlay toggles
- Timeframe tabs
- Evidence score panel
- Trade plan cards

3. Risk calculator
- Account equity
- Risk percent
- Entry
- Stop
- Leverage optional
- Position size
- RR table

4. Signal journal
- Screenshot
- Setup type
- Entry/stop/targets
- Result
- Mistake tag
- AI error feedback

## Component tree

- AppShell
- MarketHeader
- TimeframeTabs
- CandleChart
- OverlayLayerControls
- EvidenceScorePanel
- ScenarioCards
- RiskCalculator
- TradeJournal
- ExportButton

## Overlay model

```ts
type OverlayKind = 'support' | 'resistance' | 'liquidity' | 'fvg' | 'ob' | 'bpr' | 'bos' | 'choch' | 'target' | 'stop';

type ChartOverlay = {
  id: string;
  kind: OverlayKind;
  timeframe: '5m' | '15m' | '1h' | '4h' | '1D';
  priceLow?: number;
  priceHigh?: number;
  timeStart?: number;
  timeEnd?: number;
  label: string;
  confidence: number;
  invalidation?: string;
};
```

## Signal model

```ts
type Direction = 'LONG' | 'SHORT' | 'WAIT';

type TradeScenario = {
  direction: Direction;
  setup: string;
  entry: number | null;
  stop: number | null;
  targets: number[];
  probability: number;
  rr: number | null;
  invalidation: string;
  evidence: Record<string, string>;
};
```
