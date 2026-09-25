/** smoke: 파동경로 엔진 — 명확한 스윙 피벗 캔들 */
import { buildMergedDeskWavePathPack } from '../lib/mergedDeskWavePathEngine';
import { detectZigzagPivots } from '../lib/candleAnalysisElliottMvp';
import type { Candle } from '../types';

function makeSwingCandles(): Candle[] {
  const candles: Candle[] = [];
  const t0 = 1_700_000_000;
  /** 명확한 HLHLHL 스윙 — impulse bull 근사 */
  const anchors = [
    100000, 102500, 101200, 104800, 103400, 106200, 105000, 107500, 106400, 108800,
  ];
  let ai = 0;
  for (let i = 0; i < 100; i++) {
    const seg = Math.floor(i / 10);
    const a0 = anchors[Math.min(seg, anchors.length - 2)]!;
    const a1 = anchors[Math.min(seg + 1, anchors.length - 1)]!;
    const f = (i % 10) / 10;
    const mid = a0 + (a1 - a0) * f;
    const noise = (i % 3) * 5;
    const o = mid - 10;
    const c = mid + noise;
    const h = Math.max(o, c) + 40;
    const l = Math.min(o, c) - 40;
    candles.push({
      time: t0 + i * 900,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: 1000 + i * 10,
    });
    ai = seg;
  }
  void ai;
  return candles;
}

const candles = makeSwingCandles();
const pivots = detectZigzagPivots(candles, 2, 2);
const pack = buildMergedDeskWavePathPack({
  candles,
  enabled: true,
  timeframe: '1d',
  bouncePx: 104000,
  resistPx: 109500,
  dumpPx: 102000,
  schoolSummaryKo: '와이코프·엘리엇 합류',
});
const tLive = candles[candles.length - 1]!.time;
const futureOk = pack.pathPoints
  .filter((pt) => !pt.confirmed)
  .every((pt) => pt.time >= tLive);
const confirmedOk = pack.pathPoints
  .filter((pt) => pt.confirmed)
  .every((pt) => pt.time <= tLive);
const padOk =
  !pack.pathPoints.some(
    (pt) => !pt.confirmed && pt.time > tLive + 900 * 20 + 1
  );
const waveOverlayN = pack.overlays.filter((o) =>
  String(o.overlayZoneExtraClass || '').includes('merged-desk-wave-path')
).length;
const pathHighs = pack.pathPoints.filter((pt) => pt.confirmed);
const firstPt = pathHighs[0];
const maxConfirmedPx = Math.max(
  -Infinity,
  ...pack.pathPoints.filter((pt) => pt.confirmed).map((pt) => pt.price)
);
/** 1번 고점: 확정 경로가 창 최고가에서 시작(2번 고점 잘림 방지). 조정 템플릿은 저점 시작일 수 있음 */
const startsAtExtreme =
  !firstPt ||
  pack.bias !== 'bearish' ||
  firstPt.price >= maxConfirmedPx * 0.999;

console.log(
  JSON.stringify(
    {
      pivotN: pivots.length,
      ok: pack.ok,
      templateId: pack.templateId,
      phaseKo: pack.phaseKo,
      waveLabel: pack.waveLabel,
      nextTarget: pack.nextTarget,
      expectBars: pack.expectBars,
      pathN: pack.pathPoints.length,
      overlayN: pack.overlays.length,
      lineN: pack.priceLines.length,
      shortKo: pack.shortKo,
      futureOk,
      confirmedOk,
      padOk,
      waveOverlayN,
      startsAtExtreme,
      firstLabel: firstPt?.label ?? null,
      firstPrice: firstPt?.price ?? null,
      summaryKo: pack.summaryKo.slice(0, 160),
    },
    null,
    2
  )
);

if (pivots.length < 3) {
  console.error('FAIL: need pivots');
  process.exit(1);
}
if (!futureOk || !confirmedOk || !padOk) {
  console.error('FAIL: time invariants');
  process.exit(1);
}
if (pack.ok && waveOverlayN < 1) {
  console.error('FAIL: wave path overlays missing', { waveOverlayN });
  process.exit(1);
}
if (pack.ok && !startsAtExtreme) {
  console.error('FAIL: bearish path not starting at peak 1', {
    firstPrice: firstPt?.price,
    maxConfirmedPx,
  });
  process.exit(1);
}
console.log('OK wave-path smoke');
