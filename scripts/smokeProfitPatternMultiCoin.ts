/**
 * Smoke: 전코인 모니터 · 락 · 저널 (브라우저 없는 서버 스모크)
 */
import {
  resolveProfitPatternMonitor,
} from '../lib/profitPattern15m/liveSignal';
import { buildProfitPatternChartLines } from '../lib/profitPattern15m/chartLines';
import { PP_PAPER_POLICY_KO } from '../lib/profitPattern15m/paperPolicy';
import { ppSymbolAllowed } from '../lib/profitPattern15m/skill';
import type { Candle } from '../types';

function fakeBars(n: number, close0: number): Candle[] {
  const out: Candle[] = [];
  let c = close0;
  const t0 = Math.floor(Date.now() / 1000) - n * 900;
  for (let i = 0; i < n; i++) {
    const o = c;
    const drift = (i % 7 === 0 ? -1 : 1) * c * 0.0015;
    const close = o + drift;
    const low = Math.min(o, close) * (1 - 0.0045);
    const high = Math.max(o, close) * (1 + 0.001);
    out.push({
      time: t0 + i * 900,
      open: o,
      high,
      low,
      close,
      volume: 100 + (i % 5) * 40,
    });
    c = close;
  }
  return out;
}

const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'SOLUSDT', 'ADAUSDT'];
const rows = symbols.map((symbol) => {
  const allowed = ppSymbolAllowed(symbol);
  const mon = resolveProfitPatternMonitor({
    symbol,
    timeframe: '15m',
    candles: fakeBars(100, symbol.startsWith('BTC') ? 80000 : 2000),
  });
  const lines = buildProfitPatternChartLines({
    locked: {
      symbol,
      direction: 'LONG',
      entry: 100,
      sl: 99.6,
      tp: 100.16,
      lockedAt: Math.floor(Date.now() / 1000),
      eventId: `smoke-${symbol}`,
      source: 'profitPattern',
      lineEntryKo: '50x고정',
      lineSlKo: '50x고정스탑',
      lineTpKo: '50x고정목표',
    },
    monitor: mon,
  });
  return {
    symbol,
    allowed,
    status: mon.status,
    direction: mon.direction,
    lockedLineTitles: lines.map((l) => l.title),
    lockedPrices: lines.map((l) => l.price),
  };
});

console.log(
  JSON.stringify(
    {
      policyKo: PP_PAPER_POLICY_KO,
      noteKo: '진입 락 시 차트선은 모니터 대신 고정 E/SL/TP',
      rows,
    },
    null,
    2
  )
);
