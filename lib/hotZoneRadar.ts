import type { Candle, OverlayItem } from '@/types';

type HotZoneRadarOptions = {
  enabled: boolean;
  lookback: number;
  resolution: number;
  srThresholdPct: number;
  srLayers: number;
  predictLabels?: boolean;
  horizonBars?: number;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return `rgba(239,68,68,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function buildHotZoneRadarOverlays(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  options: HotZoneRadarOptions;
}): OverlayItem[] {
  const { symbol, timeframe, candles, options } = params;
  if (!options.enabled) return [];
  if (!candles.length) return [];
  const lookback = clamp(Math.round(options.lookback || 200), 50, 1000);
  const resolution = clamp(Math.round(options.resolution || 30), 10, 60);
  const thresholdPct = clamp(Number(options.srThresholdPct || 80), 50, 100);
  const layers = clamp(Math.round(options.srLayers || 3), 1, 5);
  const predictLabels = options.predictLabels !== false;
  const horizon = clamp(Math.round(options.horizonBars || 3), 2, 8);
  const arr = candles.slice(-Math.min(lookback, candles.length));
  if (arr.length < 30) return [];

  const hi = Math.max(...arr.map((c) => c.high));
  const lo = Math.min(...arr.map((c) => c.low));
  const range = Math.max(1e-9, hi - lo);
  const binSize = range / resolution;
  const profile = new Array<number>(resolution).fill(0);

  const binOf = (p: number) => clamp(Math.floor((p - lo) / binSize), 0, resolution - 1);

  for (const c of arr) {
    const s = binOf(c.low);
    const e = binOf(c.high);
    const share = Number(c.volume || 0) / Math.max(1, e - s + 1);
    for (let i = s; i <= e; i++) profile[i] += share;
  }

  const maxV = Math.max(1e-9, ...profile);
  const threshold = maxV * (thresholdPct / 100);
  const t1 = arr[0].time;
  const t2 = arr[arr.length - 1].time;
  const close = arr[arr.length - 1].close;

  const out: OverlayItem[] = [];
  const clusters: Array<{
    startBin: number;
    endBin: number;
    top: number;
    bot: number;
    center: number;
    fullH: number;
    strength: number;
    inside: boolean;
  }> = [];
  let i = 0;
  while (i < resolution) {
    if (profile[i] < threshold) {
      i++;
      continue;
    }
    const s = i;
    while (i < resolution && profile[i] >= threshold) i++;
    const e = i - 1;
    const top = lo + (e + 1) * binSize;
    const bot = lo + s * binSize;
    const center = (top + bot) / 2;
    const fullH = Math.max(1e-9, top - bot);
    const inside = close <= top && close >= bot;
    const base = inside ? '#FFFF00' : '#EF4444';
    const strength = profile[Math.floor((s + e) / 2)] / maxV;
    clusters.push({ startBin: s, endBin: e, top, bot, center, fullH, strength, inside });

    for (let layer = 1; layer <= layers; layer++) {
      const layerScale = layer / layers;
      const h = fullH * layerScale;
      const lTop = center + h / 2;
      const lBot = center - h / 2;
      /** 차트 뒤 레이어에서 softenZoneFill이 알파를 ~0.23배 더 줄이므로, 원천 알파를 충분히 둔다 */
      const alpha = 0.22 + (layers - layer) * 0.09;
      out.push({
        id: `hotzone-${symbol}-${timeframe}-${s}-${e}-l${layer}`,
        kind: 'zone',
        label: inside ? 'HOT-ZONE(내부)' : 'HOT-ZONE',
        x1: t1,
        y1: lTop,
        x2: t2,
        y2: lBot,
        time1: t1,
        price1: lTop,
        time2: t2,
        price2: lBot,
        confidence: Math.round(strength * 100),
        color: rgba(base, alpha),
        category: 'zones',
        zoneFillPreserve: true,
        overlayZoneExtraClass: 'overlay-zone--hotzone-radar',
      });
    }
  }

  // Optional probability labels per strongest zones, based on historical touches.
  if (predictLabels && arr.length > horizon + 20 && clusters.length > 0) {
    const topZones = [...clusters]
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 3);
    for (const z of topZones) {
      let longCnt = 0;
      let shortCnt = 0;
      const rets: number[] = [];
      for (let j = 0; j < arr.length - horizon; j++) {
        const c = arr[j];
        const inZone = c.close >= z.bot && c.close <= z.top;
        if (!inZone) continue;
        const ret = (arr[j + horizon].close - c.close) / Math.max(1e-9, c.close);
        rets.push(ret);
        if (ret >= 0) longCnt++;
        else shortCnt++;
      }
      const n = rets.length;
      if (n < 8) continue;
      const longProb = longCnt / n;
      const shortProb = shortCnt / n;
      const expPct = (rets.reduce((s, x) => s + x, 0) / n) * 100;
      const dirLong = longProb >= shortProb;
      out.push({
        id: `hotzone-prob-${symbol}-${timeframe}-${z.startBin}-${z.endBin}`,
        kind: 'label',
        label: `HZ ${dirLong ? 'LONG' : 'SHORT'} ${(Math.max(longProb, shortProb) * 100).toFixed(0)}% · 예상 ${expPct >= 0 ? '+' : ''}${expPct.toFixed(2)}%`,
        x1: t2,
        y1: z.center,
        time1: t2,
        price1: z.center,
        confidence: Math.round(Math.max(longProb, shortProb) * 100),
        color: dirLong ? '#22C55E' : '#EF4444',
        lineLabelColor: dirLong ? '#22C55E' : '#EF4444',
        labelBackgroundColor: 'rgba(8,15,25,0.66)',
        labelTextColor: '#E2E8F0',
        category: 'labels',
      });
    }
  }
  return out;
}

