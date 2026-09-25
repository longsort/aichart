/**
 * 호칭 15분밴드자동 · 구스킬 주문 금지 · 리스크 5%
 * npx tsx scripts/instBand15m.selftest.ts
 */
import { resolveInstBandTripleEntry } from '../lib/eagle1Tapoint/instBandTripleEntry';
import { MAX_TOTAL_TRADE_RISK_PCT } from '../lib/eagle1Tapoint/aiAutopilotRiskGovernor';
import {
  BAND15_AUTO_CALLSIGN,
  BAND15_AUTO_ENGINE_ID,
  BAND15_AUTO_HOCHUNG,
} from '../lib/eagle1Tapoint/band15AutoSkill';
import type { TapointDecisionReport } from '../lib/eagle1Tapoint/types';

function assert(ok: boolean, msg: string) {
  if (!ok) throw new Error(msg);
}

assert(MAX_TOTAL_TRADE_RISK_PCT === 5, '리스크 상한 5%');
assert(BAND15_AUTO_HOCHUNG === '15분밴드자동', '호칭');
assert(BAND15_AUTO_CALLSIGN === 'BAND15_AUTO', '영문호칭');

const readyPlan = {
  band1Dir: 'long' as const,
  band2Dir: 'long' as const,
  bandDir: 'long' as const,
  direction: 'LONG' as const,
  actionable: true,
  entry: 100,
  sl: 99.6,
  tp1: 100.4,
  status: 'READY',
  grade: 'READY',
  reasonKo: '정렬',
};

const base = {
  qualityOk: true,
  direction: 'LONG' as const,
  decision: 'WAIT' as const,
  instBandPlan: readyPlan,
};

const allMap = {
  BTC: { band15Auto: true, btcQuickScalp: true },
  ETH: { band15Auto: true, ethAutopilot: true },
  SOL: { band15Auto: true },
  XRP: { band15Auto: true },
  BNB: { band15Auto: true },
} as never;

const btc15 = resolveInstBandTripleEntry(
  { ...base, symbol: 'BTCUSDT', timeframe: '15m' } as TapointDecisionReport,
  { exclusiveMap: allMap }
);
assert(btc15.ok && btc15.paperOnly && btc15.allowLive === false, 'BTC 15m Paper');
assert(btc15.lane === BAND15_AUTO_ENGINE_ID, '레인 BAND15');
assert(String(btc15.reasonKo).includes(BAND15_AUTO_HOCHUNG), '호칭 문구');

const btc3qs = resolveInstBandTripleEntry(
  {
    ...base,
    symbol: 'BTCUSDT',
    timeframe: '3m',
    quickScalp: {
      ok: true,
      autoReady: true,
      direction: 'LONG',
      entry: 100,
      sl: 99.7,
      tp: 100.45,
      reasonKo: 'QS',
      eventId: 'qs-1',
    },
  } as TapointDecisionReport,
  { exclusiveMap: allMap }
);
assert(!btc3qs.ok, 'BTC 3m QS 자동주문 금지');

const eth5 = resolveInstBandTripleEntry(
  {
    ...base,
    symbol: 'ETHUSDT',
    timeframe: '5m',
    sniperScalp: {
      fire: true,
      autoReady: true,
      direction: 'LONG',
      entry: 100,
      executionSl: 99.7,
      tp: 100.4,
      reasonKo: 'AP',
      eventId: 'ap-1',
    },
  } as TapointDecisionReport,
  { exclusiveMap: allMap }
);
assert(!eth5.ok, 'ETH 오토 자동주문 금지');

const sol15 = resolveInstBandTripleEntry(
  { ...base, symbol: 'SOLUSDT', timeframe: '15m' } as TapointDecisionReport,
  { exclusiveMap: allMap }
);
assert(sol15.ok && sol15.paperOnly, 'SOL 15분밴드자동 Paper');

const off = resolveInstBandTripleEntry(
  { ...base, symbol: 'BTCUSDT', timeframe: '15m' } as TapointDecisionReport,
  { exclusiveMap: { BTC: { band15Auto: false } } as never }
);
assert(!off.ok, '스킬 OFF면 주문 없음');

console.log(
  JSON.stringify({
    ok: true,
    hochung: BAND15_AUTO_HOCHUNG,
    callsign: BAND15_AUTO_CALLSIGN,
    maxRiskPct: MAX_TOTAL_TRADE_RISK_PCT,
    btc15: btc15.lane,
    btc3: btc3qs.reasonKo,
    eth5: eth5.reasonKo,
    sol15: sol15.ok,
  })
);
