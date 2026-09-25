/**
 * Smoke: REAL CANDLE BATTLE — 실캔들 패턴(하락→스윕→회수→상승→리테스트)
 */
import { buildCandleBattlePack } from '../lib/candleBattle/buildPack';
import type { Candle } from '../types';

function synthBattle(): Candle[] {
  const out: Candle[] = [];
  let px = 76800;
  const t0 = Math.floor(Date.now() / 1000) - 140 * 300;
  let swingLow = 0;
  for (let i = 0; i < 140; i++) {
    let open = px;
    let close = px;
    let high = px;
    let low = px;
    let vol = 50;
    let tb = 20;
    if (i < 45) {
      close = px - 22 - (i % 5 === 0 ? 8 : 0);
      open = px;
      high = Math.max(open, close) + 6;
      low = Math.min(open, close) - 6;
      vol = 60 + (i % 7) * 3;
      tb = vol * 0.3;
    } else if (i === 48) {
      open = px;
      close = px + 4;
      high = px + 8;
      low = px - 4;
      vol = 70;
      tb = 30;
      swingLow = low;
    } else if (i > 48 && i < 55) {
      close = px - 10;
      open = px;
      high = Math.max(open, close) + 4;
      low = Math.min(open, close) - 4;
      vol = 80;
      tb = 25;
    } else if (i === 55) {
      open = px;
      low = (swingLow || px) - 90;
      close = px - 40;
      high = px + 5;
      vol = 420;
      tb = 90;
    } else if (i === 56) {
      open = px - 20;
      close = Math.max(px + 40, (swingLow || px) + 20);
      high = close + 10;
      low = open - 5;
      vol = 260;
      tb = 190;
    } else if (i >= 57 && i <= 62) {
      close = px + 70;
      open = px;
      high = close + 15;
      low = open - 4;
      vol = 240;
      tb = 180;
    } else if (i >= 63 && i <= 68) {
      /** 이전저 근처 리테스트 */
      const target = swingLow || px - 80;
      close = target + 8;
      open = px;
      high = Math.max(open, close) + 6;
      low = Math.min(target - 5, close - 10);
      vol = 110;
      tb = 55;
    } else {
      close = px + 18;
      open = px;
      high = close + 8;
      low = open - 4;
      vol = 80;
      tb = 48;
    }
    out.push({
      time: t0 + i * 300,
      open,
      high,
      low,
      close,
      volume: vol,
      takerBuyBaseVolume: tb,
    } as Candle);
    px = close;
  }
  return out;
}

const pack = buildCandleBattlePack({
  symbol: 'BTCUSDT',
  timeframe: '5m',
  candles: synthBattle(),
  hasTrades: true,
  hasOrderbook: false,
  hasCvd: true,
  hasOrderbookHistory: false,
  volumeDelta: 18,
  oiState: 'decreasing',
});

const info = {
  quality: pack.quality,
  status: pack.decision.status,
  gates: `${pack.decision.gatePassed}/${pack.decision.gateTotal}`,
  direction: pack.decision.direction,
  phases: pack.phases.map((p) => p.labelKo),
  markerTypes: pack.markers.map((m) => m.type),
  overlays: pack.overlays.map((o) => o.id),
  panes: pack.panes.map((p) => `${p.key}:${p.availability}`),
  replenishment: pack.availability.replenishment,
  summary: pack.summaryKo,
};
console.log(JSON.stringify(info, null, 2));

if (pack.availability.replenishment !== 'NOT_AVAILABLE') {
  console.error('FAIL: REP must be NOT_AVAILABLE');
  process.exit(1);
}
if (!pack.markers.some((m) => m.type === 'SFP' || m.type === 'SWEEP')) {
  console.error('FAIL: expected SWEEP/SFP');
  process.exit(1);
}
if (!pack.overlays.some((o) => String(o.id).startsWith('candle-battle-'))) {
  console.error('FAIL: expected overlays');
  process.exit(1);
}
console.log('OK candle-battle smoke');
