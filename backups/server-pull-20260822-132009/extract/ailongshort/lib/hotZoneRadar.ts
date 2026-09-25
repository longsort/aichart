import type { Candle, OverlayItem } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { isMonthDeskHtfTimeframe } from '@/lib/monthDeskZonePrecision';
import {
  hotZoneFillForSignal,
  hotZoneLabelForSignal,
  resolveHotZoneClusterSignal,
} from '@/lib/monthDeskZoneSignalPalette';

type HotZoneRadarOptions = {
  enabled: boolean;
  lookback: number;
  resolution: number;
  srThresholdPct: number;
  srLayers: number;
  predictLabels?: boolean;
  horizonBars?: number;
  /** 마감·안착: 롱=초록 / 숏=빨강 / 대기=노랑 (실시간 이탈+통계) */
  monthDeskDirectional?: boolean;
  analyzeVerdict?: 'LONG' | 'SHORT' | null;
  /** 성능: 클러스터·레이어 상한 */
  maxClusters?: number;
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

/** 고래 Hot Zone과 동일 볼륨 프로파일 클러스터 — 가격대별 체결 분포 기반 */
export type HotZoneVolumeCluster = {
  startBin: number;
  endBin: number;
  top: number;
  bot: number;
  center: number;
  /** 구간 내 거래량 피크 — 타점 헌팅 중심 */
  poc: number;
  fullH: number;
  strength: number;
  inside: boolean;
  /** 구간 내 종가 후 horizon 수익률 분포 — 표본 부족 시 미설정 */
  longProb?: number;
  shortProb?: number;
  probSampleN?: number;
};

export function buildVolumeHotZoneClustersFromArr(
  arr: Candle[],
  resolution: number,
  thresholdPct: number
): HotZoneVolumeCluster[] | null {
  if (arr.length < 30) return null;
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
  const close = arr[arr.length - 1].close;

  const clusters: HotZoneVolumeCluster[] = [];
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
    let peakI = s;
    let peakV = -1;
    for (let k = s; k <= e; k++) {
      const v = profile[k] ?? 0;
      if (v > peakV) {
        peakV = v;
        peakI = k;
      }
    }
    const poc = lo + (peakI + 0.5) * binSize;
    const fullH = Math.max(1e-9, top - bot);
    const inside = close <= top && close >= bot;
    const strength = profile[Math.floor((s + e) / 2)] / maxV;
    clusters.push({ startBin: s, endBin: e, top, bot, center, poc, fullH, strength, inside });
  }
  return clusters;
}

function enrichHotZoneClustersWithHorizonProb(
  clusters: HotZoneVolumeCluster[],
  arr: Candle[],
  horizon: number
): void {
  if (arr.length < horizon + 20 || clusters.length === 0) return;
  const topZones = [...clusters].sort((a, b) => b.strength - a.strength).slice(0, 3);
  for (const z of topZones) {
    let longCnt = 0;
    let shortCnt = 0;
    for (let j = 0; j < arr.length - horizon; j++) {
      const c = arr[j];
      const inZone = c.close >= z.bot && c.close <= z.top;
      if (!inZone) continue;
      const ret = (arr[j + horizon].close - c.close) / Math.max(1e-9, c.close);
      if (ret >= 0) longCnt++;
      else shortCnt++;
    }
    const n = longCnt + shortCnt;
    if (n < 8) continue;
    z.longProb = longCnt / n;
    z.shortProb = shortCnt / n;
    z.probSampleN = n;
  }
}

/**
 * Hot Zone 볼륨 클러스터 + horizon 통계 → 봉별 편향(롱 쪽 매집/숏 쪽 매집 근사). 마감 밴드 융합용.
 * 거래소 호가·체결 원장이 아닌 OHLCV 분포 기반 참고치.
 */
export function computeHotZoneFusionBiasScores(
  candles: Candle[],
  partial?: Partial<{ lookback: number; resolution: number; srThresholdPct: number; horizonBars: number }>
): number[] {
  const n = candles.length;
  const out = new Array(n).fill(0);
  if (n < 30) return out;
  const lookback = clamp(Math.round(partial?.lookback ?? 200), 50, 1000);
  const resolution = clamp(Math.round(partial?.resolution ?? 30), 10, 60);
  const thresholdPct = clamp(Number(partial?.srThresholdPct ?? 80), 50, 100);
  const horizon = clamp(Math.round(partial?.horizonBars ?? 3), 2, 8);

  const arr = candles.slice(-Math.min(lookback, n));
  const clusters = buildVolumeHotZoneClustersFromArr(arr, resolution, thresholdPct);
  if (!clusters?.length) return out;
  enrichHotZoneClustersWithHorizonProb(clusters, arr, horizon);

  for (let i = 0; i < n; i++) {
    const cl = candles[i].close;
    let acc = 0;
    for (const z of clusters) {
      if (cl < z.bot || cl > z.top) continue;
      if (z.longProb != null && z.shortProb != null && (z.probSampleN ?? 0) >= 8) {
        const dir = z.longProb - z.shortProb;
        acc += dir * (0.38 + 0.52 * z.strength);
      } else {
        const tilt = (cl - z.center) / Math.max(z.fullH, 1e-12);
        acc += Math.max(-1, Math.min(1, tilt)) * 0.16 * z.strength;
      }
    }
    out[i] = Math.max(-1.28, Math.min(1.28, acc));
  }
  return out;
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
  const monthDesk = options.monthDeskDirectional === true;
  const chartTf = normalizeChartTimeframe(timeframe);
  const htfPrecision = monthDesk && isMonthDeskHtfTimeframe(chartTf);
  const layerCap = monthDesk ? 1 : layers;
  const predictLabels = monthDesk ? false : options.predictLabels !== false;
  const horizon = clamp(Math.round(options.horizonBars || 3), 2, 8);
  const arr = candles.slice(-Math.min(lookback, candles.length));
  const clusters = buildVolumeHotZoneClustersFromArr(arr, resolution, thresholdPct);
  if (!clusters?.length) return [];

  if (monthDesk && arr.length > horizon + 20) {
    enrichHotZoneClustersWithHorizonProb(clusters, arr, horizon);
  }

  const maxClusters = clamp(Math.round(options.maxClusters ?? (monthDesk ? 4 : 6)), 2, 12);
  const paintClusters = [...clusters].sort((a, b) => b.strength - a.strength).slice(0, maxClusters);
  const recentBars = arr.slice(-8).map((c) => ({ open: c.open, close: c.close, high: c.high, low: c.low }));
  const verdict = options.analyzeVerdict ?? null;

  const t1 = arr[0].time;
  const t2 = arr[arr.length - 1].time;
  const arrHi = Math.max(...arr.map((c) => c.high));
  const arrLo = Math.min(...arr.map((c) => c.low));
  const arrRange = Math.max(1e-9, arrHi - arrLo);
  let atrHint = 0;
  if (htfPrecision && arr.length >= 15) {
    let sum = 0;
    for (let i = arr.length - 14; i < arr.length; i++) {
      const tr = Math.max(
        arr[i].high - arr[i].low,
        Math.abs(arr[i].high - arr[i - 1].close),
        Math.abs(arr[i].low - arr[i - 1].close)
      );
      sum += tr;
    }
    atrHint = sum / 14;
  }
  const maxClusterH = htfPrecision
    ? Math.max(atrHint * 1.05, arrRange * (chartTf === '1w' ? 0.048 : 0.055))
    : Infinity;

  const out: OverlayItem[] = [];
  for (const z of paintClusters) {
    const hzSignal = monthDesk
      ? resolveHotZoneClusterSignal(
          {
            bot: z.bot,
            top: z.top,
            center: z.center,
            fullH: z.fullH,
            inside: z.inside,
            longProb: z.longProb,
            shortProb: z.shortProb,
            probSampleN: z.probSampleN,
          },
          recentBars,
          verdict
        )
      : null;
    const probPct =
      z.longProb != null && z.shortProb != null
        ? Math.max(z.longProb, z.shortProb) * 100
        : undefined;
    const base = hzSignal
      ? hotZoneFillForSignal(hzSignal, z.inside, z.strength)
      : rgba(z.inside ? '#EAB308' : '#EF4444', 0.1 + z.strength * 0.06);
    const hzLabel = monthDesk
      ? hzSignal === 'LONG'
        ? '고래L'
        : hzSignal === 'SHORT'
          ? '고래S'
          : '고래'
      : hzSignal
        ? hotZoneLabelForSignal(hzSignal, z.inside, probPct)
        : z.inside
          ? 'HOT-ZONE(내부)'
          : 'HOT-ZONE';
    const sigSuffix = hzSignal === 'LONG' ? 'long' : hzSignal === 'SHORT' ? 'short' : 'wait';
    const hzClass = monthDesk
      ? `overlay-zone--hotzone-radar overlay-zone--monthdesk-hotzone-entry overlay-zone--hotzone-signal--${sigSuffix}`
      : hzSignal
        ? `overlay-zone--hotzone-radar overlay-zone--hotzone-signal--${sigSuffix}`
        : 'overlay-zone--hotzone-radar';
    const layers = monthDesk ? 1 : layerCap;
    for (let layer = 1; layer <= layers; layer++) {
      const layerScale = layer / layerCap;
      const h = Math.min(z.fullH * layerScale, maxClusterH);
      const lTop = z.center + h / 2;
      const lBot = z.center - h / 2;
      out.push({
        id: `hotzone-${symbol}-${timeframe}-${z.startBin}-${z.endBin}-l${layer}`,
        kind: 'zone',
        label: hzLabel,
        x1: t1,
        y1: lTop,
        x2: t2,
        y2: lBot,
        time1: t1,
        price1: lTop,
        time2: t2,
        price2: lBot,
        confidence: Math.round(z.strength * 100),
        color: typeof base === 'string' && base.startsWith('rgba') ? base : base,
        category: 'zones',
        zoneFillPreserve: true,
        overlayZoneExtraClass: hzClass,
        lineLabelColor:
          hzSignal === 'LONG' ? '#bbf7d0' : hzSignal === 'SHORT' ? '#fecaca' : hzSignal === 'WAIT' ? '#fef08a' : undefined,
      });
    }
  }

  if (predictLabels && arr.length > horizon + 20 && paintClusters.length > 0) {
    const topZones = paintClusters.filter((z) => z.longProb != null && z.shortProb != null).slice(0, 2);
    for (const z of topZones) {
      if (z.longProb == null || z.shortProb == null || (z.probSampleN ?? 0) < 8) continue;
      const longProb = z.longProb;
      const shortProb = z.shortProb;
      const dirLong = longProb >= shortProb;
      const sig = resolveHotZoneClusterSignal(
        {
          bot: z.bot,
          top: z.top,
          center: z.center,
          fullH: z.fullH,
          inside: z.inside,
          longProb,
          shortProb,
          probSampleN: z.probSampleN,
        },
        recentBars,
        verdict
      );
      if (sig === 'WAIT') continue;
      let expPct = 0;
      let cnt = 0;
      for (let j = 0; j < arr.length - horizon; j++) {
        const c = arr[j];
        if (c.close < z.bot || c.close > z.top) continue;
        expPct += ((arr[j + horizon].close - c.close) / Math.max(1e-9, c.close)) * 100;
        cnt++;
      }
      const avgExp = cnt > 0 ? expPct / cnt : 0;
      out.push({
        id: `hotzone-prob-${symbol}-${timeframe}-${z.startBin}-${z.endBin}`,
        kind: 'label',
        label: `HZ ${sig === 'LONG' ? '롱' : '숏'} ${(Math.max(longProb, shortProb) * 100).toFixed(0)}% · 예상 ${avgExp >= 0 ? '+' : ''}${avgExp.toFixed(2)}%`,
        x1: t2,
        y1: z.center,
        time1: t2,
        price1: z.center,
        confidence: Math.round(Math.max(longProb, shortProb) * 100),
        color: sig === 'LONG' ? '#22C55E' : '#EF4444',
        lineLabelColor: sig === 'LONG' ? '#22C55E' : '#EF4444',
        labelBackgroundColor: 'rgba(8,15,25,0.66)',
        labelTextColor: '#E2E8F0',
        category: 'labels',
      });
    }
  }
  return out;
}
