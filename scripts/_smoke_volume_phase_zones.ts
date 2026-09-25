/**
 * smoke: TF 모집 창 + 거래량 존 박스 탐지
 * npx tsx scripts/_smoke_volume_phase_zones.ts
 */
import {
  volAccumulateWindowBars,
  detectVolumePhaseZones,
} from '../lib/mergedDeskVolAccumulateExhaust';
import { buildMergedDeskAdvVolumePack } from '../lib/mergedDeskAdvVolumeRead';
import type { Candle } from '../types';

function mk(i: number, o: number, h: number, l: number, c: number, v: number): Candle {
  return {
    time: 1_700_000_000 + i * 900,
    open: o,
    high: h,
    low: l,
    close: c,
    volume: v,
    takerBuyBaseVolume: c >= o ? v * 0.55 : v * 0.4,
  } as Candle;
}

const rows: Candle[] = [];
let px = 100;
for (let i = 0; i < 120; i++) {
  if (i < 25) {
    rows.push(mk(i, px, px + 0.1, px - 0.1, px + 0.02, 70 + (i % 3)));
    px += 0.02;
  } else if (i < 40) {
    rows.push(mk(i, px, px + 0.4, px - 0.05, px + 0.3, 200 + i));
    px += 0.3;
  } else if (i < 70) {
    rows.push(mk(i, px, px + 0.08, px - 0.08, px + 0.01, 65 + (i % 4)));
    px += 0.01;
  } else if (i < 85) {
    rows.push(mk(i, px, px + 0.5, px - 0.1, px + 0.35, 240));
    px += 0.35;
  } else if (i < 100) {
    rows.push(mk(i, px, px + 0.1, px - 0.35, px - 0.25, 300));
    px -= 0.25;
  } else {
    rows.push(mk(i, px, px + 0.05, px - 0.08, px - 0.02, 80));
    px -= 0.02;
  }
}

const win = volAccumulateWindowBars('15m', false);
const zones = detectVolumePhaseZones(rows, { timeframe: '15m', rvolPeriod: 20, maxZones: 4 });
const pack = buildMergedDeskAdvVolumePack(rows, { timeframe: '15m' });

console.log(
  JSON.stringify(
    {
      win,
      zones: zones.map((z) => `${z.displayKo}:${z.endIdx - z.startIdx + 1}봉`),
      packZones: (pack.volumePhaseZones ?? []).map((z) => z.displayKo),
      histOk: pack.sellHist.length > 0,
    },
    null,
    2
  )
);

if (win < 16) {
  console.error('FAIL: TF window still short', win);
  process.exit(1);
}
if (zones.length < 1) {
  console.error('FAIL: no volume phase zones');
  process.exit(1);
}
if (!(pack.volumePhaseZones && pack.volumePhaseZones.length >= 1)) {
  console.error('FAIL: pack missing volumePhaseZones');
  process.exit(1);
}
const tooShort = zones.filter((z) => z.kind === 'accumulate' && z.endIdx - z.startIdx + 1 < 8);
if (tooShort.length) {
  console.error('FAIL: accumulate zone shorter than min', tooShort);
  process.exit(1);
}
console.log('OK volume phase zones (TF창+패널존, 기존 막대 유지)');
