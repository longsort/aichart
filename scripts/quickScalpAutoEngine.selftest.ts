/**
 * QUICK SCALP 게이트 스모크 — 수익성 검증 아님.
 * npx tsx scripts/quickScalpAutoEngine.selftest.ts
 */
import {
  evaluateQuickScalpAutoEngine,
  QUICK_SCALP_ENGINE_ID,
} from '../lib/eagle1Tapoint/quickScalpAutoEngine';

function assert(ok: boolean, msg: string) {
  if (!ok) throw new Error(msg);
}

const eth = evaluateQuickScalpAutoEngine({
  symbol: 'ETHUSDT',
  timeframe: '3m',
  candles: [],
  structure: null,
  liqMap: null,
  sfp: null,
  qualityOk: true,
});
assert(eth.waitReason === 'NOT_BTC', 'ETH는 BTC 전용이어야 함');
assert(!eth.autoReady, 'ETH autoReady 금지');

const bad = evaluateQuickScalpAutoEngine({
  symbol: 'BTCUSDT',
  timeframe: '3m',
  candles: Array.from({ length: 10 }, (_, i) => ({
    time: i,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1,
  })),
  structure: null,
  liqMap: null,
  sfp: null,
  qualityOk: false,
});
assert(bad.waitReason === 'DATA_BAD', '품질불량 대기');
assert(bad.engine === QUICK_SCALP_ENGINE_ID, '엔진 ID');

const noLiq = evaluateQuickScalpAutoEngine({
  symbol: 'BTCUSDT',
  timeframe: '3m',
  candles: Array.from({ length: 60 }, (_, i) => ({
    time: i * 180_000,
    open: 100_000,
    high: 100_100,
    low: 99_900,
    close: 100_010,
    volume: 10,
  })),
  structure: null,
  liqMap: { above: [], below: [] } as never,
  sfp: null,
  qualityOk: true,
});
assert(noLiq.waitReason === 'NO_LIQUIDITY', `유동성 없음 기대, got ${noLiq.waitReason}`);

const wick = evaluateQuickScalpAutoEngine({
  symbol: 'BTCUSDT',
  timeframe: '3m',
  candles: Array.from({ length: 60 }, (_, i) => ({
    time: i * 180_000,
    open: 100_010,
    high: 100_020,
    low: 99_999,
    close: 100_008,
    volume: 10,
  })),
  structure: null,
  liqMap: {
    nodes: [],
    above: [],
    below: [{ price: 100_000, kind: 'eql', side: 'below', age: 1, strength: 1, labelKo: 't' }],
    summaryKo: '',
    liqZone: null,
  } as never,
  sfp: null,
  qualityOk: true,
});
assert(
  wick.waitReason === 'WICK_TOUCH_ONLY' ||
    wick.waitReason === 'NO_SWEEP' ||
    wick.waitReason === 'NO_RECLAIM',
  `윅터치/스윕실패 기대, got ${wick.waitReason}`
);

console.log('quickScalp selftest OK', {
  eth: eth.waitReason,
  bad: bad.waitReason,
  noLiq: noLiq.waitReason,
  wick: wick.waitReason,
});
