/**
 * SNIPER/AUTOPILOT 게이트 스모크 — 수익성 검증 아님.
 */
import {
  evaluateSniperScalpAutoEngine,
  sniperRiskSize,
  SNIPER_SCALP_ENGINE_ID,
} from '../lib/eagle1Tapoint/sniperScalpAutoEngine';
import { governIdeaRisk, MAX_TOTAL_TRADE_RISK_PCT } from '../lib/eagle1Tapoint/aiAutopilotRiskGovernor';

function assert(ok: boolean, msg: string) {
  if (!ok) throw new Error(msg);
}

const bnb = evaluateSniperScalpAutoEngine({
  symbol: 'BNBUSDT',
  timeframe: '3m',
  candles: [],
  structure: null,
  qualityOk: true,
});
assert(bnb.waitReason === 'NOT_ALLOWED', 'BNB 오토파일럿 아님');
assert(!bnb.fire, 'BNB fire 금지');

const eth = evaluateSniperScalpAutoEngine({
  symbol: 'ETHUSDT',
  timeframe: '3m',
  candles: [],
  structure: null,
  qualityOk: true,
});
assert(eth.waitReason === 'DATA_BAD', `ETH 데이터부족, got ${eth.waitReason}`);
assert(eth.engine === SNIPER_SCALP_ENGINE_ID, '엔진 ID');

const bad = evaluateSniperScalpAutoEngine({
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
  qualityOk: false,
});
assert(bad.waitReason === 'DATA_BAD', '품질불량');

const sized = sniperRiskSize({ entry: 100000, sl: 99700, equityUsdt: 1000, riskPct: 0.5, maxLev: 20 });
assert(sized.leverage >= 2 && sized.leverage <= 20, '레버는 리스크/SL에서 산출');

const over = governIdeaRisk({
  equityUsdt: 1000,
  worstCaseLossUsdt: 80,
  requestedRiskPct: 8,
});
assert(!over.ok, '5% 초과 거절');
assert(MAX_TOTAL_TRADE_RISK_PCT === 5, '헌법 5%');

const widen = governIdeaRisk({
  equityUsdt: 1000,
  worstCaseLossUsdt: 10,
  slWidenRequested: true,
});
assert(!widen.ok, 'SL 확대 거절');

console.log('sniper/autopilot selftest OK', {
  bnb: bnb.waitReason,
  eth: eth.waitReason,
  bad: bad.waitReason,
  lev: sized.leverage,
});
