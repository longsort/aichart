/**
 * smoke: 모집/확장 zone 유지 + 매수·매도 방향 추가
 * npx tsx scripts/_smoke_volume_flow_side.ts
 */
import {
  detectVolumePhaseZones,
  analyzeZoneFlowSide,
  volumePhaseZoneLabel,
} from '../lib/mergedDeskVolAccumulateExhaust';
import type { Candle } from '../types';

function mk(
  i: number,
  o: number,
  h: number,
  l: number,
  c: number,
  v: number,
  tb: number
): Candle {
  return {
    time: 1_700_000_000 + i * 900,
    open: o,
    high: h,
    low: l,
    close: c,
    volume: v,
    takerBuyBaseVolume: tb,
  } as Candle;
}

/** 매수 모집 → 매수 확장 */
const buyRows: Candle[] = [];
let px = 100;
for (let i = 0; i < 70; i++) {
  if (i < 40) {
    const n = px + 0.02;
    buyRows.push(mk(i, px, n + 0.05, px - 0.04, n, 70, 70 * 0.62));
    px = n;
  } else {
    const n = px + 0.35;
    buyRows.push(mk(i, px, n + 0.2, px - 0.05, n, 260, 260 * 0.68));
    px = n;
  }
}

/** 매도 모집(분산) → 매도 확장 */
const sellRows: Candle[] = [];
px = 100;
for (let i = 0; i < 70; i++) {
  if (i < 40) {
    const n = px - 0.02;
    sellRows.push(mk(i, px, px + 0.04, n - 0.05, n, 70, 70 * 0.35));
    px = n;
  } else {
    const n = px - 0.4;
    sellRows.push(mk(i, px, px + 0.05, n - 0.15, n, 280, 280 * 0.32));
    px = n;
  }
}

const buyZ = detectVolumePhaseZones(buyRows, { timeframe: '15m', maxZones: 6 });
const sellZ = detectVolumePhaseZones(sellRows, { timeframe: '15m', maxZones: 6 });
const flowBuy = analyzeZoneFlowSide(buyRows, 10, 35);
const flowSell = analyzeZoneFlowSide(sellRows, 10, 35);

console.log(
  JSON.stringify(
    {
      flowBuy,
      flowSell,
      buyLabels: buyZ.map((z) => `${z.displayKo}|${volumePhaseZoneLabel(z)}|${z.flowSide ?? '-'}|${z.directionKo ?? '-'}`),
      sellLabels: sellZ.map((z) => `${z.displayKo}|${volumePhaseZoneLabel(z)}|${z.flowSide ?? '-'}|${z.directionKo ?? '-'}`),
    },
    null,
    2
  )
);

if (flowBuy.side !== 'buy') {
  console.error('FAIL buy flow', flowBuy);
  process.exit(1);
}
if (flowSell.side !== 'sell') {
  console.error('FAIL sell flow', flowSell);
  process.exit(1);
}

/** displayKo는 모집/확장(또는 폭등/폭락) 유지 — 매수모집으로 교체 금지 */
for (const z of [...buyZ, ...sellZ]) {
  if (z.kind === 'accumulate' && z.displayKo !== '모집') {
    console.error('FAIL accumulate displayKo must stay 모집', z);
    process.exit(1);
  }
  if (z.kind === 'climax' && z.displayKo !== '확장') {
    console.error('FAIL climax displayKo must stay 확장', z);
    process.exit(1);
  }
}

const hasBuyDir = buyZ.some(
  (z) =>
    (z.kind === 'accumulate' || z.kind === 'climax') &&
    (z.flowSide === 'buy' || z.directionKo === '매수모집' || z.directionKo === '매수확장')
);
const hasSellDir = sellZ.some(
  (z) =>
    (z.kind === 'accumulate' || z.kind === 'climax') &&
    (z.flowSide === 'sell' || z.directionKo === '매도모집' || z.directionKo === '매도확장')
);
if (!hasBuyDir || !hasSellDir) {
  console.error('FAIL directional side missing', { buyZ, sellZ });
  process.exit(1);
}

const buyUiOk = buyZ.some((z) => /모집·매수|확장·매수/.test(volumePhaseZoneLabel(z)));
const sellUiOk = sellZ.some((z) => /모집·매도|확장·매도/.test(volumePhaseZoneLabel(z)));
if (!buyUiOk || !sellUiOk) {
  console.error('FAIL UI label must be base·side additive', {
    buy: buyZ.map(volumePhaseZoneLabel),
    sell: sellZ.map(volumePhaseZoneLabel),
  });
  process.exit(1);
}

console.log('OK 모집/확장 유지 + 방향(·매수/·매도) 추가');
