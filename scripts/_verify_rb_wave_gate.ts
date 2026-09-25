/**
 * 파랑빨강띠 파동LOCK + 합류게이트 스모크 (채널 빌더 의존 최소화)
 */
import { applyMergedDeskRbWaveLock, clearMergedDeskRbWaveLock } from '../lib/mergedDeskRbWaveLock';
import {
  computeMergedDeskRbEdgeConfluenceGate,
  computeRbFixedVolumePoc,
  detectRbRailSfp,
} from '../lib/mergedDeskRbEdgeConfluenceGate';
import type { Candle } from '../types';
import type { MergedDeskBlueRedChannelPack, MergedDeskChannelGeom } from '../lib/mergedDeskBlueRedChannels';

function synth(n = 120): Candle[] {
  const out: Candle[] = [];
  let px = 100_000;
  const t0 = 1_700_000_000;
  for (let i = 0; i < n; i++) {
    const drift = i < 60 ? -40 : 35;
    const o = px;
    const c = px + drift + ((i % 7) - 3) * 12;
    const h = Math.max(o, c) + 80 + (i % 5) * 10;
    const l = Math.min(o, c) - 80 - (i % 4) * 8;
    out.push({
      time: t0 + i * 900,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: 100 + (i % 11) * 17,
    });
    px = c;
  }
  const last = out[out.length - 1]!;
  out[out.length - 1] = { ...last, low: last.low - 220, close: last.close + 40 };
  return out;
}

function fakePack(candles: Candle[]): MergedDeskBlueRedChannelPack {
  const i0 = 20;
  const i1 = candles.length - 1;
  const up1 = 101_200;
  const up2 = 99_400;
  const lo1 = 100_400;
  const lo2 = 98_600;
  const geom: MergedDeskChannelGeom = {
    horizon: 'short',
    horizonKo: '단기',
    descending: true,
    useBearFill: true,
    tipUpper: up2,
    tipLower: lo2,
    tipMid: (up2 + lo2) / 2,
    width: up2 - lo2,
    tStart: Number(candles[i0]!.time),
    tEnd: Number(candles[i1]!.time),
    up1,
    up2,
    lo1,
    lo2,
    quality: 72,
    touchHigh: 3,
    touchLow: 3,
    primary: true,
    slopePct: -0.02,
    swingCount: 6,
  };
  return {
    overlays: [
      {
        id: 'merged-desk-rb-short-band',
        kind: 'channelBand',
        label: '하락채널',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 0,
        time1: geom.tStart,
        time2: geom.tEnd,
        price1: up2,
        price2: lo2,
        confidence: 72,
        color: 'rgba(239,68,68,0.2)',
        channelBand: {
          priceHigh1: up1,
          priceHigh2: up2,
          priceLow1: lo1,
          priceLow2: lo2,
        },
        overlayZoneExtraClass: 'merged-desk-rb-channel merged-desk-rb-primary merged-desk-rb-bear',
      },
    ],
    geoms: [geom],
    summaryKo: '테스트채널',
    confluence: null,
  };
}

clearMergedDeskRbWaveLock();
const candles = synth();
const raw = fakePack(candles);
const a = applyMergedDeskRbWaveLock({ pack: raw, candles, lockKey: 'test:15m' });
const b = applyMergedDeskRbWaveLock({ pack: raw, candles, lockKey: 'test:15m' });
const g = a.wave.lockedGeom;
const gate = computeMergedDeskRbEdgeConfluenceGate({
  candles,
  geom: g,
  volSync: {
    side: 'down',
    confirm: 'confirm',
    buyPct: 0.38,
    sellPct: 0.62,
    rvol: 1.5,
    volTrend: 'grow',
    whaleHint: 'none',
    fromIdx: 0,
    toIdx: candles.length - 1,
    upPalette: { upperHex: '#16A34A', lowerHex: '#4ADE80', fillHex: '#22C55E' },
    downPalette: { upperHex: '#EF4444', lowerHex: '#FB7185', fillHex: '#E11D48' },
    volUp: '#22C55E',
    volDown: '#E11D48',
    volMix: '#94A3B8',
    volHotUp: '#4ADE80',
    volHotDown: '#FB7185',
    summaryKo: '테스트수급',
    compareKo: '',
  },
  vrvpPoc: g?.tipMid ?? null,
  wavePhase: a.wave.phase,
  masterSide: 'SHORT',
});

const fixed = g ? computeRbFixedVolumePoc(candles, g) : null;
const sfp = g ? detectRbRailSfp(candles, g, 120) : null;

const tipStable =
  Math.abs((a.wave.lockedGeom?.tipUpper ?? 0) - (b.wave.lockedGeom?.tipUpper ?? 0)) < 1e-6;
const ok = a.wave.phase === 'LOCK' && b.wave.phase === 'LOCK' && tipStable && gate.hits.length >= 6;

console.log(
  JSON.stringify(
    {
      ok,
      phaseA: a.wave.phase,
      phaseB: b.wave.phase,
      tipStable,
      tip: a.wave.lockedGeom?.tipUpper,
      gateShort: gate.shortKo,
      coreHits: gate.coreHitCount,
      placeRefOk: gate.placeRefOk,
      fixed,
      sfp,
      summary: a.wave.summaryKo,
    },
    null,
    2
  )
);
if (!ok) process.exit(1);
