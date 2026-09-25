/**
 * smoke: TF별 모집창 + WATCH/SETUP/TRIGGER/CONFIRMED 레더
 * npx tsx scripts/_smoke_volume_ladder.ts
 */
import {
  volAccumulateWindowBars,
  volumeAccumulationOk,
  volumeQuietBuildProbe,
} from '../lib/mergedDeskVolAccumulateExhaust';
import { detectSwingAnchorVolumeEvents } from '../lib/mergedDeskSwingAnchorVolumeEvents';
import { buildMergedDeskAdvVolumePack } from '../lib/mergedDeskAdvVolumeRead';
import type { Candle } from '../types';

function mk(
  i: number,
  o: number,
  h: number,
  l: number,
  c: number,
  v: number
): Candle {
  return {
    time: 1_700_000_000 + i * 900,
    open: o,
    high: h,
    low: l,
    close: c,
    volume: v,
    takerBuyBaseVolume: c >= o ? v * 0.62 : v * 0.38,
  } as Candle;
}

/** 조용한 모집 16~20봉 → 확장 → 상승 */
const rows: Candle[] = [];
let px = 100;
for (let i = 0; i < 80; i++) {
  if (i < 50) {
    const v = 90 + (i % 5) * 2;
    const next = px + ((i % 7) - 3) * 0.04;
    rows.push(mk(i, px, Math.max(px, next) + 0.12, Math.min(px, next) - 0.1, next, v));
    px = next;
  } else if (i < 65) {
    /** 모집: 저거래·좁은 레인지 */
    const v = 70 + (i % 4);
    const next = px + 0.02;
    rows.push(mk(i, px, next + 0.08, px - 0.06, next, v));
    px = next;
  } else if (i === 65) {
    /** 확장봉 */
    const next = px + 0.55;
    rows.push(mk(i, px, next + 0.15, px - 0.05, next, 220));
    px = next;
  } else {
    const next = px + 0.22;
    rows.push(mk(i, px, next + 0.12, px - 0.04, next, 150 + (i - 65) * 4));
    px = next;
  }
}

const win15 = volAccumulateWindowBars('15m', false);
const win1m = volAccumulateWindowBars('1m', false);
if (win15 < 16 || win1m < 16) {
  console.error('FAIL: TF windows too short', { win15, win1m });
  process.exit(1);
}

const mid = 64;
const quiet = volumeQuietBuildProbe(rows, mid, 20, '15m');
const acc = volumeAccumulationOk(rows, 65, 20, false, '15m');
const events = detectSwingAnchorVolumeEvents(rows, { timeframe: '15m', rvolPeriod: 20 });
const pack = buildMergedDeskAdvVolumePack(rows, { timeframe: '15m', rvolPeriod: 20 });

const phases = events.map((e) => `${e.phase ?? '?'}:${e.markerKo}`);
const packSwing = (pack.markers || []).filter((m) =>
  /빅롱|빅숏|예고|준비/.test(String(m.text || ''))
);

console.log(
  JSON.stringify(
    {
      win15,
      win1m,
      quietOk: quiet.ok,
      accumOk: acc.ok,
      expand: Number(acc.expandRatio.toFixed(2)),
      phases,
      packSwing: packSwing.map((m) => m.text),
      histOk: pack.sellHist.length > 0,
    },
    null,
    2
  )
);

if (!acc.ok && !events.some((e) => e.tier === 'big-long')) {
  console.error('FAIL: expected accum or big-long after build');
  process.exit(1);
}
if (!(pack.sellHist.length > 0 && pack.buyHist.length > 0)) {
  console.error('FAIL: volume hist broken');
  process.exit(1);
}
console.log('OK volume ladder + TF windows (기존 거래량 유지·레더 추가)');
