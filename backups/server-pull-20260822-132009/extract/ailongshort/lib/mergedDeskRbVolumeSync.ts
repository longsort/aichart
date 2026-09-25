/**
 * 초록/빨강 통로 ↔ 거래량 도식 연동.
 * 상승 통로: 초록 / 하락 통로: 빨강 / 횡보: 매수·매도 비율로 면·볼륨 계속 물들임.
 * 수급이 추세와 같으면 진하게, 괴리면 탁하게(확정 매매 아님).
 */
import type { HistogramData, UTCTimestamp } from 'lightweight-charts';
import type { Candle, OverlayItem } from '@/types';
import type { MergedDeskChannelGeom } from '@/lib/mergedDeskBlueRedChannels';
import { estimateBarBuySell } from '@/lib/volumeDirectionStats';
import {
  sanitizeChartCandlesForSeries,
  smaTotalVolumeAt,
} from '@/lib/volumeHistogramIntelligence';

export type RbVolumeTrendSide = 'up' | 'down' | 'chop';
export type RbVolumeConfirm = 'confirm' | 'diverge' | 'weak';

export type RbDualTonePalette = {
  upperHex: string;
  lowerHex: string;
  fillHex: string;
};

export type MergedDeskRbVolumeSyncPack = {
  side: RbVolumeTrendSide;
  confirm: RbVolumeConfirm;
  buyPct: number;
  sellPct: number;
  rvol: number | null;
  volTrend: 'grow' | 'shrink' | 'flat';
  whaleHint: 'long' | 'short' | 'none';
  fromIdx: number;
  toIdx: number;
  upPalette: RbDualTonePalette;
  downPalette: RbDualTonePalette;
  volUp: string;
  volDown: string;
  volMix: string;
  volHotUp: string;
  volHotDown: string;
  summaryKo: string;
  compareKo: string;
};

const UP_FULL: RbDualTonePalette = {
  upperHex: '#16A34A',
  lowerHex: '#4ADE80',
  fillHex: '#22C55E',
};
const DOWN_FULL: RbDualTonePalette = {
  upperHex: '#EF4444',
  lowerHex: '#FB7185',
  fillHex: '#E11D48',
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = String(hex || '').replace('#', '').trim();
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return { r: 34, g: 197, b: 94 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mixHex(a: string, gray = '#64748B', t = 0.42): string {
  const A = hexToRgb(a);
  const G = hexToRgb(gray);
  const m = (x: number, y: number) => Math.round(x * (1 - t) + y * t);
  const to = (v: number) => v.toString(16).padStart(2, '0');
  return `#${to(m(A.r, G.r))}${to(m(A.g, G.g))}${to(m(A.b, G.b))}`;
}

/** 횡보 복도 — 회색 고정 금지. 매수%로 초록↔빨강 혼합 */
function chopFlowPalette(buyPct: number): RbDualTonePalette {
  const t = Math.max(0, Math.min(1, buyPct));
  return {
    upperHex: mixHex(UP_FULL.upperHex, DOWN_FULL.upperHex, 1 - t),
    lowerHex: mixHex(UP_FULL.lowerHex, DOWN_FULL.lowerHex, 1 - t),
    fillHex: mixHex(UP_FULL.fillHex, DOWN_FULL.fillHex, 1 - t),
  };
}

function tonePalette(base: RbDualTonePalette, confirm: RbVolumeConfirm): RbDualTonePalette {
  if (confirm === 'confirm') return base;
  const t = confirm === 'diverge' ? 0.48 : 0.28;
  return {
    upperHex: mixHex(base.upperHex, '#64748B', t),
    lowerHex: mixHex(base.lowerHex, '#64748B', t),
    fillHex: mixHex(base.fillHex, '#64748B', t),
  };
}

function closeSlopePct(rows: Candle[], from: number, to: number): number {
  const a = Number(rows[from]?.close);
  const b = Number(rows[to]?.close);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !(a > 0)) return 0;
  return ((b - a) / a) * 100;
}

function idxOfTime(rows: Candle[], t: number): number {
  const tt = Number(t);
  if (!Number.isFinite(tt)) return -1;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < rows.length; i++) {
    const d = Math.abs(Number(rows[i]!.time) - tt);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return bestD < 1e12 ? best : -1;
}

/** 같은 길이 과거 창과 수급 지문 비교 → 이후 수익률 중앙값(참고) */
function schematicCompareKo(rows: Candle[], from: number, to: number, buyPct: number, rvol: number | null): string {
  const len = to - from + 1;
  if (len < 8 || rows.length < len * 3) return '과거 유사창 부족 · 참고만';
  const fwd = Math.min(8, Math.max(4, Math.floor(len * 0.25)));
  const hits: number[] = [];
  const step = Math.max(2, Math.floor(len / 4));
  for (let s = 0; s + len + fwd < from; s += step) {
    const e = s + len - 1;
    let buy = 0;
    let tot = 0;
    for (let i = s; i <= e; i++) {
      const sp = estimateBarBuySell(rows[i]!);
      buy += sp.buyVol;
      tot += sp.buyVol + sp.sellVol;
    }
    const bp = tot > 0 ? buy / tot : 0.5;
    const sma = smaTotalVolumeAt(rows, e, Math.min(20, len));
    const lastV = Math.max(0, Number(rows[e]?.volume) || 0);
    const rv = sma > 0 ? lastV / sma : 1;
    if (Math.abs(bp - buyPct) > 0.09) continue;
    if (rvol != null && Math.abs(rv - rvol) > 0.55) continue;
    const c0 = Number(rows[e]!.close);
    const c1 = Number(rows[e + fwd]!.close);
    if (c0 > 0 && Number.isFinite(c1)) hits.push(((c1 - c0) / c0) * 100);
  }
  if (hits.length < 3) return `유사창 ${hits.length} · 표본 부족`;
  hits.sort((a, b) => a - b);
  const mid = hits[Math.floor(hits.length / 2)]!;
  const sign = mid >= 0 ? '+' : '';
  return `유사 ${hits.length}창 ${fwd}봉 후 중앙 ${sign}${mid.toFixed(1)}%(참고)`;
}

export function computeMergedDeskRbVolumeSync(params: {
  candles: Candle[];
  timeframe?: string;
  geoms?: MergedDeskChannelGeom[] | null;
  whaleBeamSide?: 'LONG' | 'SHORT' | 'NEUTRAL' | null;
  whaleRangeNetPct?: number | null;
  enabled?: boolean;
}): MergedDeskRbVolumeSyncPack | null {
  if (params.enabled === false) return null;
  const rows = sanitizeChartCandlesForSeries(params.candles, params.timeframe);
  const n = rows.length;
  if (n < 16) return null;

  const primary =
    params.geoms?.find((g) => g.primary) ??
    params.geoms?.find((g) => g.horizon === 'short') ??
    params.geoms?.[0] ??
    null;

  let fromIdx = Math.max(0, n - Math.min(48, Math.max(20, Math.floor(n * 0.32))));
  let toIdx = n - 1;
  if (primary) {
    const i0 = idxOfTime(rows, primary.tStart);
    if (i0 >= 0) fromIdx = Math.min(i0, n - 8);
  }

  const slopePct = primary?.slopePct ?? closeSlopePct(rows, fromIdx, toIdx);
  let side: RbVolumeTrendSide = 'chop';
  if (primary) {
    if (Math.abs(slopePct) < 0.004) side = 'chop';
    else side = primary.descending ? 'down' : 'up';
  } else if (slopePct > 0.35) side = 'up';
  else if (slopePct < -0.35) side = 'down';

  let buy = 0;
  let sell = 0;
  let volA = 0;
  let volB = 0;
  const mid = fromIdx + Math.floor((toIdx - fromIdx) / 2);
  for (let i = fromIdx; i <= toIdx; i++) {
    const sp = estimateBarBuySell(rows[i]!);
    buy += sp.buyVol;
    sell += sp.sellVol;
    const v = Math.max(0, Number(rows[i]!.volume) || 0);
    if (i <= mid) volA += v;
    else volB += v;
  }
  const tot = buy + sell;
  const buyPct = tot > 0 ? buy / tot : 0.5;
  const sellPct = 1 - buyPct;
  const volTrend: 'grow' | 'shrink' | 'flat' =
    volA <= 0
      ? 'flat'
      : volB / volA >= 1.12
        ? 'grow'
        : volB / volA <= 0.88
          ? 'shrink'
          : 'flat';

  const sma = smaTotalVolumeAt(rows, toIdx, 20);
  const lastV = Math.max(0, Number(rows[toIdx]?.volume) || 0);
  const rvol = sma > 0 ? lastV / sma : null;

  const whaleRaw = params.whaleBeamSide;
  const whaleHint: 'long' | 'short' | 'none' =
    whaleRaw === 'LONG' ? 'long' : whaleRaw === 'SHORT' ? 'short' : 'none';

  let confirm: RbVolumeConfirm = 'weak';
  const flowUp = buyPct >= 0.54;
  const flowDn = sellPct >= 0.54;
  const energy = volTrend === 'grow' || (rvol != null && rvol >= 1.18);
  if (side === 'up' && flowUp && (energy || buyPct >= 0.58)) confirm = 'confirm';
  else if (side === 'up' && flowDn) confirm = 'diverge';
  else if (side === 'down' && flowDn && (energy || sellPct >= 0.58)) confirm = 'confirm';
  else if (side === 'down' && flowUp) confirm = 'diverge';
  else if (side === 'chop') confirm = 'weak';

  if (whaleHint === 'long' && side === 'up' && confirm !== 'diverge') confirm = 'confirm';
  if (whaleHint === 'short' && side === 'down' && confirm !== 'diverge') confirm = 'confirm';
  if (whaleHint === 'long' && side === 'down') confirm = confirm === 'confirm' ? 'weak' : 'diverge';
  if (whaleHint === 'short' && side === 'up') confirm = confirm === 'confirm' ? 'weak' : 'diverge';

  const chop = side === 'chop';
  const flowPal = chop ? chopFlowPalette(buyPct) : null;
  const upPalette = flowPal ?? tonePalette(UP_FULL, confirm);
  const downPalette = flowPal ?? tonePalette(DOWN_FULL, confirm);

  const volUp =
    chop
      ? mixHex('#22C55E', '#64748B', 0.18)
      : confirm === 'diverge' && side === 'up'
        ? mixHex('#22C55E', '#64748B', 0.4)
        : '#22C55E';
  const volDown =
    chop
      ? mixHex('#EF4444', '#64748B', 0.18)
      : confirm === 'diverge' && side === 'down'
        ? mixHex('#EF4444', '#64748B', 0.4)
        : '#EF4444';
  const volHotUp = '#14B8A6';
  const volHotDown = '#E11D48';
  const volMix = '#64748B';

  const dirKo = side === 'up' ? '상승' : side === 'down' ? '하락' : '횡보';
  const confKo = confirm === 'confirm' ? '수급동의' : confirm === 'diverge' ? '수급괴리' : '수급약';
  const rvolKo = rvol != null ? `RVOL ${rvol.toFixed(2)}` : 'RVOL-';
  const whaleKo = whaleHint === 'long' ? ' · 롱빔' : whaleHint === 'short' ? ' · 숏빔' : '';
  const rangeKo =
    params.whaleRangeNetPct != null && Number.isFinite(params.whaleRangeNetPct)
      ? ` · 구간넷 ${params.whaleRangeNetPct >= 0 ? '+' : ''}${params.whaleRangeNetPct.toFixed(1)}%`
      : '';
  const summaryKo = `${dirKo}채널·${confKo} · 매수 ${(buyPct * 100).toFixed(0)}% · ${rvolKo} · 볼륨${
    volTrend === 'grow' ? '확대' : volTrend === 'shrink' ? '축소' : '평이'
  }${whaleKo}${rangeKo}`;
  const compareKo = schematicCompareKo(rows, fromIdx, toIdx, buyPct, rvol);

  return {
    side,
    confirm,
    buyPct,
    sellPct,
    rvol,
    volTrend,
    whaleHint,
    fromIdx,
    toIdx,
    upPalette,
    downPalette,
    volUp,
    volDown,
    volMix,
    volHotUp,
    volHotDown,
    summaryKo,
    compareKo,
  };
}

export function rbVolumeSyncExtraClass(pack: MergedDeskRbVolumeSyncPack, bear: boolean): string {
  const sideCls =
    pack.side === 'chop' ? 'merged-desk-rb-vol-chop' : bear ? 'merged-desk-rb-vol-down' : 'merged-desk-rb-vol-up';
  return [
    'merged-desk-rb-volsync',
    sideCls,
    pack.confirm === 'confirm'
      ? 'merged-desk-rb-vol-confirm'
      : pack.confirm === 'diverge'
        ? 'merged-desk-rb-vol-diverge'
        : 'merged-desk-rb-vol-weak',
  ].join(' ');
}

export function applyMergedDeskRbVolumeBarColors(
  base: HistogramData<UTCTimestamp>[],
  candles: Candle[],
  pack: MergedDeskRbVolumeSyncPack | null | undefined,
  timeframe?: string
): HistogramData<UTCTimestamp>[] {
  if (!pack || !base.length) return base;
  const rows = sanitizeChartCandlesForSeries(candles, timeframe);
  const n = Math.min(base.length, rows.length);
  if (n < 2) return base;
  const rvolPeriod = 20;
  return base.map((bar, i) => {
    if (i >= n) return bar;
    const c = rows[i]!;
    const oc = Number(c.open);
    const cc = Number(c.close);
    const isUp = Number.isFinite(oc) && Number.isFinite(cc) ? cc >= oc : true;
    const inWin = i >= pack.fromIdx && i <= pack.toIdx;
    let color = isUp ? pack.volUp : pack.volDown;
    if (i >= rvolPeriod - 1) {
      const sma = smaTotalVolumeAt(rows, i, rvolPeriod);
      const v = Math.max(0, Number(c.volume) || 0);
      const rv = sma > 0 ? v / sma : 1;
      if (rv >= 1.85) color = isUp ? pack.volHotUp : pack.volHotDown;
      else if (rv >= 1.35) color = isUp ? mixHex(pack.volHotUp, pack.volUp, 0.35) : mixHex(pack.volHotDown, pack.volDown, 0.35);
    }
    const sp = estimateBarBuySell(c);
    if (sp.direction === 'mixed' && Math.abs(sp.buyPct - 0.5) < 0.06) color = pack.volMix;
    if (!inWin) {
      color = mixHex(color.replace(/^#/, '').length === 6 ? color : pack.volMix, '#334155', 0.38);
    }
    return { ...bar, color };
  });
}

export function mergeRbVolumeSyncTooltip(item: OverlayItem, pack: MergedDeskRbVolumeSyncPack): OverlayItem {
  const prev = String(item.labelTooltip || '').trim();
  const extra = `${pack.summaryKo} · ${pack.compareKo}`;
  if (prev.includes(pack.summaryKo)) return item;
  return { ...item, labelTooltip: prev ? `${prev}\n${extra}` : extra };
}
