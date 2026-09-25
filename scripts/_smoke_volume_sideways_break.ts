/**
 * smoke: 횡보→방향·현물%
 * npx tsx scripts/_smoke_volume_sideways_break.ts
 */
import { buildSidewaysBreakForecast, sidewaysWindowForTf } from '../lib/volumeSidewaysBreakForecast';
import { buildMergedDeskAdvVolumePack } from '../lib/mergedDeskAdvVolumeRead';
import type { Candle } from '../types';

function mk(i: number, o: number, h: number, l: number, c: number, v: number, tb: number): Candle {
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

/** 조용한 횡보 후 상승 돌파 */
const rows: Candle[] = [];
let px = 100;
for (let i = 0; i < 90; i++) {
  if (i < 55) {
    const wiggle = ((i % 5) - 2) * 0.08;
    const n = 100 + wiggle;
    rows.push(mk(i, px, n + 0.12, n - 0.12, n, 80, 80 * 0.58));
    px = n;
  } else if (i < 70) {
    const n = px + 0.02;
    rows.push(mk(i, px, n + 0.1, px - 0.08, n, 70, 70 * 0.6));
    px = n;
  } else {
    const n = px + 0.55;
    rows.push(mk(i, px, n + 0.25, px - 0.05, n, 280, 280 * 0.7));
    px = n;
  }
}

const win = sidewaysWindowForTf('15m');
const fc = buildSidewaysBreakForecast(rows, { timeframe: '15m' });
const pack = buildMergedDeskAdvVolumePack(rows, { timeframe: '15m' });

console.log(
  JSON.stringify(
    {
      win,
      fc: {
        active: fc.active,
        stageKo: fc.stageKo,
        biasKo: fc.biasKo,
        rangeBars: fc.rangeBars,
        boxHeightPct: fc.boxHeightPct,
        expectedSpotKo: fc.expectedSpotKo,
        histSamples: fc.histSamples,
        chipKo: fc.chipKo,
      },
      packChip: pack.currentSection?.ko,
      packSideways: pack.sidewaysBreak?.chipKo,
      hasSidewaysMark: pack.markers.some((m) => /횡보/.test(String(m.text || ''))),
      zonesKeep: (pack.volumePhaseZones ?? []).map((z) => z.displayKo),
    },
    null,
    2
  )
);

if (!fc.active) {
  console.error('FAIL expected sideways active');
  process.exit(1);
}
if (win.win < 16) {
  console.error('FAIL 15m win should be >=16', win);
  process.exit(1);
}
if (!pack.sidewaysBreak?.active) {
  console.error('FAIL pack missing sidewaysBreak');
  process.exit(1);
}
console.log('OK 횡보→방향·현물% (기존 존 유지·추가)');
