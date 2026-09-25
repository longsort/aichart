/**
 * smoke: 스윕/고점소진 구간에 준비롱이 같이 뜨면 FAIL
 * npx tsx scripts/_smoke_volume_conflict.ts
 */
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
    takerBuyBaseVolume: c >= o ? v * 0.35 : v * 0.3,
  } as Candle;
}

const rows: Candle[] = [];
let px = 100;
for (let i = 0; i < 70; i++) {
  if (i < 50) {
    const n = px + 0.2;
    rows.push(mk(i, px, n + 0.1, px - 0.05, n, 120));
    px = n;
  } else if (i === 55) {
    const n = px - 1.5;
    rows.push(mk(i, px, px + 0.2, n, n + 0.2, 480));
    px = n + 0.2;
  } else if (i === 58) {
    rows.push(mk(i, px, px + 1.1, px - 0.2, px - 0.1, 520));
  } else {
    const n = px - 0.25;
    rows.push(mk(i, px, px + 0.05, n, n, 70));
    px = n;
  }
}

const pack = buildMergedDeskAdvVolumePack(rows, { timeframe: '15m' });
const texts = (pack.markers || []).map((m) => String(m.text));
const swing = pack.swingAnchorEvents.map((e) => `${e.markerKo}:${e.phase ?? ''}`);
const div = (pack.sectionDividers || []).map((d) => d.labelKo);

console.log(JSON.stringify({ texts, swing, div }, null, 2));

const hasLongPrep = swing.some((s) => s.includes('준비롱') || s.includes('예고롱'));
const hasBearStory = texts.some((t) => /스윕|고점소진|폭락/.test(t));
if (hasLongPrep && hasBearStory) {
  console.error('FAIL: 준비롱/예고롱 beside dump story');
  process.exit(1);
}
if (div.length < 1) {
  console.error('FAIL: missing section dividers');
  process.exit(1);
}
console.log('OK conflict gate + dividers');
