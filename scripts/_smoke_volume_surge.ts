/**
 * smoke: 모집 → 고RVOL 폭등(롱빔) 탐지
 * npx tsx scripts/_smoke_volume_surge.ts
 */
import { detectVolumePhaseZones, resolveCurrentVolumeSection } from '../lib/mergedDeskVolAccumulateExhaust';
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
    takerBuyBaseVolume: c >= o ? v * 0.65 : v * 0.35,
  } as Candle;
}

/** 조용한 모집 → 수직 롱빔(고RVOL) */
const rows: Candle[] = [];
let px = 100;
for (let i = 0; i < 90; i++) {
  if (i < 55) {
    rows.push(mk(i, px, px + 0.08, px - 0.08, px + 0.01, 70 + (i % 3)));
    px += 0.01;
  } else if (i < 58) {
    const n = px + 2.2;
    rows.push(mk(i, px, n + 0.3, px - 0.05, n, 420 + (i - 55) * 40));
    px = n;
  } else if (i < 70) {
    const n = px + 0.4;
    rows.push(mk(i, px, n + 0.15, px - 0.05, n, 180));
    px = n;
  } else {
    rows.push(mk(i, px, px + 0.1, px - 0.15, px - 0.05, 90));
    px -= 0.05;
  }
}

const zones = detectVolumePhaseZones(rows, { timeframe: '15m', rvolPeriod: 20, maxZones: 6 });
const pack = buildMergedDeskAdvVolumePack(rows, { timeframe: '15m' });
const surge = zones.filter((z) => z.kind === 'surge' || z.displayKo === '폭등');
const acc = zones.filter((z) => z.kind === 'accumulate');
const cur = resolveCurrentVolumeSection({
  zones,
  storyKinds: zones.map((z) => z.displayKo),
  lastBarIdx: 57,
});

console.log(
  JSON.stringify(
    {
      zones: zones.map(
        (z) => `${z.displayKo}:${z.endIdx - z.startIdx + 1}봉${z.afterAccumulate ? '·모집후' : ''}`
      ),
      surge: surge.length,
      acc: acc.length,
      curAtBeam: cur.ko,
      packMarks: (pack.markers || [])
        .filter((m) => /폭등|폭락|확장|모집/.test(String(m.text)))
        .map((m) => m.text),
      packCur: pack.currentSection?.ko,
    },
    null,
    2
  )
);

if (!surge.length) {
  console.error('FAIL: expected 폭등/surge after accumulate');
  process.exit(1);
}
if (!acc.length && !surge.some((z) => z.afterAccumulate)) {
  console.error('FAIL: expected 모집 or 모집→폭등');
  process.exit(1);
}
if (!/폭등|확장/.test(cur.ko)) {
  console.error('FAIL: beam section not analyzed', cur);
  process.exit(1);
}
const onlyExpand = zones.every(
  (z) => z.kind === 'surge' || z.kind === 'dump' || z.kind === 'climax' || z.kind === 'accumulate'
);
if (!onlyExpand) {
  console.error('FAIL: non-expand zone leaked', zones.map((z) => z.kind));
  process.exit(1);
}
console.log('OK 확장거래량만: 폭등·확장·폭락 (+모집→폭등)');
