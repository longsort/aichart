/**
 * FalseBreakEngine — fake breakout / breakdown from causal structure + flow.
 * Missing flow fields stay 데이터 없음. No invented confirmation.
 */
import type { Eagle1Bar, StructureEvent, StructureSnapshot } from './structureEngine';
import type { PocState } from './zoneEngine';
import type { Eagle1MoneyPressure } from './moneyPressureBand';

export type FalseBreakKind = 'FAKE_BREAKOUT' | 'FAKE_BREAKDOWN' | 'NONE';

export type FalseBreakEvidence = {
  id: string;
  labelKo: string;
  hit: boolean | null;
  note: string;
};

export type FalseBreakSide = {
  kind: 'FAKE_BREAKOUT' | 'FAKE_BREAKDOWN';
  labelKo: string;
  active: boolean;
  evidence: FalseBreakEvidence[];
};

export type FalseBreakOhlc = { open: number; high: number; low: number; close: number };

export type FalseBreakReport = {
  kind: FalseBreakKind;
  labelKo: string;
  breakout: FalseBreakSide;
  breakdown: FalseBreakSide;
  /** FAILED_BREAK known_at. 미니차트 앵커. 없으면 null */
  anchorIndex: number | null;
  excerpt: FalseBreakOhlc[];
};

export function sliceBarsAround<T>(bars: T[], center: number, before = 8, after = 9): T[] {
  if (!bars.length || !Number.isFinite(center)) return [];
  const i = Math.max(0, Math.min(bars.length - 1, Math.round(center)));
  const from = Math.max(0, i - before);
  const to = Math.min(bars.length, i + after + 1);
  return bars.slice(from, to);
}

function ev(id: string, labelKo: string, hit: boolean | null, missing = false): FalseBreakEvidence {
  return {
    id,
    labelKo,
    hit: missing ? null : hit,
    note: missing ? '데이터 없음' : hit ? '충족' : '미충족',
  };
}

function lastOf(events: StructureEvent[], kind: StructureEvent['kind']): StructureEvent | undefined {
  return [...events].reverse().find((e) => e.kind === kind);
}

export function runFalseBreakEngine(params: {
  candles: Eagle1Bar[];
  structure: StructureSnapshot;
  endExclusive?: number;
  pocState?: PocState | null;
  money?: Eagle1MoneyPressure | null;
}): FalseBreakReport {
  const n = Math.min(params.candles.length, params.endExclusive ?? params.candles.length);
  const last = params.candles[n - 1];
  const fail = lastOf(params.structure.events, 'FAILED_BREAK');
  const sweep = lastOf(params.structure.events, 'SWEEP');
  const resist = params.structure.lastSwingHigh?.price ?? params.structure.rangeHigh;
  const supp = params.structure.lastSwingLow?.price ?? params.structure.rangeLow;
  const money = params.money;

  const sweepHigh = sweep?.bias === 'bearish' || (last != null && resist != null && last.high > resist);
  const sweepLow = sweep?.bias === 'bullish' || (last != null && supp != null && last.low < supp);
  const aggBuy =
    money != null ? money.buyShare >= 0.55 : last?.takerBuyBaseVolume != null && (Number(last.volume) || 0) > 0
      ? last.takerBuyBaseVolume / (Number(last.volume) || 1) >= 0.55
      : null;
  const aggSell = aggBuy == null ? null : !aggBuy && (money != null ? money.buyShare <= 0.45 : true);
  const failUp = last != null && resist != null ? last.close < resist : fail?.bias === 'bearish';
  const failDn = last != null && supp != null ? last.close > supp : fail?.bias === 'bullish';
  const sellAbs = money != null ? money.state === 'SELL_ABSORPTION' || money.absorbed && money.score < 0 : null;
  const buyAbs = money != null ? money.state === 'BUY_ABSORPTION' || money.absorbed && money.score > 0 : null;
  const closeBelowRes = last != null && resist != null ? last.close < resist : null;
  const pocReclaim =
    params.pocState === 'RECLAIMED' || params.pocState === 'CLOSED_ABOVE' || params.pocState === 'HOLD_SUCCESS';

  const breakoutHits = [sweepHigh === true, aggBuy === true, failUp === true, sellAbs === true, closeBelowRes === true];
  const breakdownHits = [sweepLow === true, aggSell === true, failDn === true, buyAbs === true, pocReclaim === true];
  const boActive =
    fail?.bias === 'bearish' || breakoutHits.filter(Boolean).length >= 3;
  const bdActive =
    fail?.bias === 'bullish' || breakdownHits.filter(Boolean).length >= 3;

  const breakout: FalseBreakSide = {
    kind: 'FAKE_BREAKOUT',
    labelKo: '가짜 상방돌파',
    active: boActive && !bdActive,
    evidence: [
      ev('sweepHigh', '상단 Sweep', sweepHigh === true, sweep == null && resist == null),
      ev('aggBuy', '공격매수 증가', aggBuy, aggBuy == null),
      ev('failUp', '가격 상승 실패', failUp === true, last == null),
      ev('sellAbs', 'Sell Absorption', sellAbs === true, sellAbs == null),
      ev('closeRes', '종가 저항 아래 복귀', closeBelowRes === true, closeBelowRes == null),
    ],
  };
  const breakdown: FalseBreakSide = {
    kind: 'FAKE_BREAKDOWN',
    labelKo: '가짜 하방이탈',
    active: bdActive && !boActive,
    evidence: [
      ev('sweepLow', '하단 Sweep', sweepLow === true, sweep == null && supp == null),
      ev('aggSell', '공격매도 증가', aggSell, aggSell == null),
      ev('failDn', '가격 하락 실패', failDn === true, last == null),
      ev('buyAbs', 'Buy Absorption', buyAbs === true, buyAbs == null),
      ev('pocReclaim', 'POC Reclaim', pocReclaim, params.pocState == null),
    ],
  };

  const kind: FalseBreakKind = breakout.active ? 'FAKE_BREAKOUT' : breakdown.active ? 'FAKE_BREAKDOWN' : 'NONE';
  const prefix = params.candles.slice(0, n);
  const anchorIndex = fail != null && Number.isFinite(fail.known_at) ? fail.known_at : null;
  const excerpt =
    anchorIndex == null
      ? []
      : sliceBarsAround(prefix, anchorIndex).map((c) => ({
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
  return {
    kind,
    labelKo: kind === 'FAKE_BREAKOUT' ? '가짜돌파' : kind === 'FAKE_BREAKDOWN' ? '가짜이탈' : '해당 없음',
    breakout,
    breakdown,
    anchorIndex,
    excerpt,
  };
}
