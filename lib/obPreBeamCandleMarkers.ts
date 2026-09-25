import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import { isMonthDeskHtfTimeframe } from '@/lib/monthDeskZonePrecision';
import { detectSmcStructureOrderBlocks, type SmcObHit } from '@/lib/smcStructureOrderBlocks';

/** lightweight-charts 시리즈 마커 */
export type ObPreBeamChartMarker = {
  time: UTCTimestamp;
  position: 'aboveBar' | 'belowBar' | 'inBar';
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  color: string;
  text: string;
  size?: number;
};

export type ObPreBeamPaintCell = {
  role: 'ob' | 'beam';
  direction: 'LONG' | 'SHORT';
  linked: boolean;
  barsToBeam?: number;
  bosIndex?: number;
};

export type ObPreBeamScanOptions = {
  lookbackBars?: number;
  maxAheadBars?: number;
  maxPairs?: number;
  timeframe?: string;
};

export type ObPreBeamScanResult = {
  paintByTime: Map<number, ObPreBeamPaintCell>;
  markers: ObPreBeamChartMarker[];
  detailByTime: Map<number, string[]>;
  zoneOverlays: OverlayItem[];
};

function wilderAtr14(candles: Candle[]): number[] {
  const n = candles.length;
  const out = new Array(n).fill(NaN);
  const period = 14;
  if (n < period + 1) return out;
  const tr = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const c = candles[i]!;
    const h = Number(c.high);
    const l = Number(c.low);
    const cl = Number(c.close);
    const pc = i > 0 ? Number(candles[i - 1]!.close) : cl;
    tr[i] =
      Number.isFinite(h) && Number.isFinite(l) && Number.isFinite(cl) && Number.isFinite(pc)
        ? Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc))
        : 0;
  }
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  out[period - 1] = sum / period;
  for (let i = period; i < n; i++) {
    out[i] = (out[i - 1]! * (period - 1) + tr[i]) / period;
  }
  return out;
}

function displacementBeamAt(candles: Candle[], i: number, atr: number): { long: boolean; short: boolean } {
  const c = candles[i]!;
  const h = Number(c.high);
  const l = Number(c.low);
  const o = Number(c.open);
  const cl = Number(c.close);
  const rng = Math.max(1e-12, h - l);
  const body = Math.abs(cl - o);
  const bodyPct = body / rng;
  const bull = cl > o;
  const bear = cl < o;
  const closeFromLow = (cl - l) / rng;
  const closeFromHigh = (h - cl) / rng;
  const bodyAtr = body / Math.max(atr, 1e-9);
  return {
    long: bull && bodyPct >= 0.48 && (closeFromLow >= 0.62 || bodyAtr >= 0.65),
    short: bear && bodyPct >= 0.48 && (closeFromHigh >= 0.62 || bodyAtr >= 0.65),
  };
}

function findBeamAfterOb(candles: Candle[], ob: SmcObHit, atr: number, maxAhead: number): number | null {
  const n = candles.length;
  const wantLong = ob.bias === 'bullish';
  const lo = ob.index + 1;
  const hi = Math.min(n - 1, ob.bosIndex, ob.index + maxAhead);
  if (lo > hi) return null;

  /** BOS 봉이 displacement이면 우선 */
  if (ob.bosIndex >= lo && ob.bosIndex <= hi) {
    const b = displacementBeamAt(candles, ob.bosIndex, atr);
    if ((wantLong && b.long) || (!wantLong && b.short)) return ob.bosIndex;
  }

  for (let j = lo; j <= hi; j++) {
    const c = candles[j]!;
    const b = displacementBeamAt(candles, j, atr);
    if (wantLong && b.long && Number(c.close) > ob.high) return j;
    if (!wantLong && b.short && Number(c.close) < ob.low) return j;
  }
  return null;
}

export function isObPreBeamMarkerText(text: string): boolean {
  const tx = String(text || '').trim();
  return tx === 'OB' || tx === '빔' || tx === '▲' || tx === '▼' || /^[◎○]OB/.test(tx) || (/^[▲▼]/.test(tx) && /빔/.test(tx));
}

/** 마감·안착 HTF: 구조 OB + 빔 — 핀·얇은 존 */
export function buildObPreBeamChartOverlays(
  candles: Candle[],
  scan: ObPreBeamScanResult,
  timeframe?: string
): OverlayItem[] {
  const htf = isMonthDeskHtfTimeframe(normalizeChartTimeframe(String(timeframe || '')));
  const pins: OverlayItem[] = [];
  const pairs = [...scan.paintByTime.entries()]
    .filter(([, c]) => c.linked && c.role === 'ob')
    .slice(-(htf ? 4 : 6));

  for (const [time, cell] of pairs) {
    const c = candles.find((x) => Number(x.time) === Number(time));
    if (!c) continue;
    const long = cell.direction === 'LONG';
    const accent = '#FACC15';
    const yPad = (c.high - c.low) * 0.28;
    pins.push({
      id: `ob-pre-beam-pin-${time}-ob`,
      kind: 'label',
      label: 'OB',
      x1: 0,
      y1: 0,
      time1: time,
      price1: long ? c.low - yPad : c.high + yPad,
      confidence: 96,
      color: accent,
      lineLabelColor: accent,
      labelBackgroundColor: 'rgba(8,12,28,0.96)',
      labelTextColor: '#fef08a',
      labelBorderColor: accent,
      category: 'scenario',
      labelTooltip: `구조 OB · ${long ? '롱(수요)' : '숏(공급)'} · BOS ${cell.barsToBeam ?? '?'}봉 전${cell.bosIndex != null ? ` (돌파봉 #${cell.bosIndex})` : ''}`,
      overlayZoneExtraClass: 'overlay-pin--monthdesk-ob-prebeam overlay-pin--monthdesk-ob-only',
      noProject: true,
    } as OverlayItem);
  }

  for (const [time, cell] of scan.paintByTime.entries()) {
    if (!cell.linked || cell.role !== 'beam') continue;
    const c = candles.find((x) => Number(x.time) === Number(time));
    if (!c) continue;
    const long = cell.direction === 'LONG';
    const accent = long ? '#4ADE80' : '#F87171';
    const yPad = (c.high - c.low) * 0.2;
    pins.push({
      id: `ob-pre-beam-pin-${time}-beam`,
      kind: 'label',
      label: long ? '▲' : '▼',
      x1: 0,
      y1: 0,
      time1: time,
      price1: long ? c.close + yPad : c.close - yPad,
      confidence: 96,
      color: accent,
      lineLabelColor: accent,
      labelBackgroundColor: 'rgba(8,12,28,0.96)',
      labelTextColor: '#f8fafc',
      labelBorderColor: accent,
      category: 'scenario',
      labelTooltip: `${long ? '롱' : '숏'} displacement(빔) · 구조 OB ${cell.barsToBeam ?? '?'}봉 후`,
      overlayZoneExtraClass: 'overlay-pin--monthdesk-ob-prebeam overlay-pin--monthdesk-beam-only',
      noProject: true,
    } as OverlayItem);
  }

  return [...scan.zoneOverlays, ...pins];
}

/**
 * 구조 OB(BOS 직전 반대봉) + 이후 displacement(빔/BOS봉)만 표시.
 * 음봉→양봉 단순 전환 패턴은 사용하지 않음.
 */
export function scanObPreBeamCandles(candles: Candle[], options?: ObPreBeamScanOptions): ObPreBeamScanResult {
  const paintByTime = new Map<number, ObPreBeamPaintCell>();
  const markers: ObPreBeamChartMarker[] = [];
  const detailByTime = new Map<number, string[]>();
  const zoneOverlays: OverlayItem[] = [];

  const n = candles.length;
  if (n < 12) return { paintByTime, markers, detailByTime, zoneOverlays };

  const tf = normalizeChartTimeframe(String(options?.timeframe || ''));
  const htf = isMonthDeskHtfTimeframe(tf);
  const lookback = Math.max(80, Math.min(900, Math.floor(options?.lookbackBars ?? (htf ? 220 : 360))));
  const maxAhead = Math.max(2, Math.min(10, Math.floor(options?.maxAheadBars ?? (htf ? 6 : 8))));
  const maxPairs = Math.max(2, Math.min(8, Math.floor(options?.maxPairs ?? (htf ? 4 : 6))));

  const sliceStart = Math.max(0, n - lookback);
  const slice = candles.slice(sliceStart);
  const { validObs, atrVal } = detectSmcStructureOrderBlocks(slice);
  const atrArr = wilderAtr14(slice);

  const pushDetail = (time: number, line: string) => {
    if (!detailByTime.has(time)) detailByTime.set(time, []);
    const arr = detailByTime.get(time)!;
    if (!arr.includes(line)) arr.push(line);
  };

  type Pair = { ob: SmcObHit; beamIdx: number; gap: number };
  const pairs: Pair[] = [];

  for (const ob of validObs) {
    const localAtr = atrArr[ob.index] ?? atrVal;
    const beamIdx = findBeamAfterOb(slice, ob, localAtr, maxAhead);
    if (beamIdx == null) continue;
    pairs.push({ ob, beamIdx, gap: beamIdx - ob.index });
  }

  pairs.sort((a, b) => b.ob.index - a.ob.index);
  const usedOb = new Set<number>();
  const usedBeam = new Set<number>();
  const picked: Pair[] = [];
  for (const p of pairs) {
    if (picked.length >= maxPairs) break;
    if (usedOb.has(p.ob.index) || usedBeam.has(p.beamIdx)) continue;
    usedOb.add(p.ob.index);
    usedBeam.add(p.beamIdx);
    picked.push(p);
  }

  for (const p of picked) {
    const obGlobalIdx = sliceStart + p.ob.index;
    const beamGlobalIdx = sliceStart + p.beamIdx;
    const obC = candles[obGlobalIdx];
    const beamC = candles[beamGlobalIdx];
    if (!obC || !beamC) continue;

    const dir: 'LONG' | 'SHORT' = p.ob.bias === 'bullish' ? 'LONG' : 'SHORT';
    const obTime = obC.time as number;
    const beamTime = beamC.time as number;
    const long = dir === 'LONG';

    paintByTime.set(obTime, {
      role: 'ob',
      direction: dir,
      linked: true,
      barsToBeam: p.gap,
      bosIndex: sliceStart + p.ob.bosIndex,
    });
    paintByTime.set(beamTime, {
      role: 'beam',
      direction: dir,
      linked: true,
      barsToBeam: p.gap,
      bosIndex: sliceStart + p.ob.bosIndex,
    });

    const t1 = Math.min(obTime, beamTime);
    const t2 = Math.max(obTime, beamTime);
    zoneOverlays.push({
      id: `ob-pre-beam-zone-${obTime}`,
      kind: long ? 'demandZone' : 'supplyZone',
      label: 'OB',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: t2,
      price1: p.ob.high,
      price2: p.ob.low,
      confidence: 88,
      color: long ? 'rgba(250,204,21,0.14)' : 'rgba(251,146,60,0.12)',
      lineLabelColor: '#FACC15',
      category: 'zones',
      labelTooltip: `구조 OB ${long ? '롱' : '숏'} · BOS 전 ${p.gap}봉 → displacement`,
      overlayZoneExtraClass:
        'overlay-zone--phz-monthdesk overlay-zone--monthdesk-phz-core overlay-zone--monthdesk-ob-beam-zone',
      zoneFillPreserve: true,
    });

    pushDetail(obTime, `구조 OB · ${long ? '롱' : '숏'} — BOS/빔 ${p.gap}봉 후 (구조+FVG 검증)`);
    pushDetail(beamTime, `${long ? '롱' : '숏'} displacement · 구조 OB ${p.gap}봉 전`);

    markers.push({
      time: obTime as UTCTimestamp,
      position: long ? 'belowBar' : 'aboveBar',
      shape: 'circle',
      color: '#FACC15',
      text: 'OB',
      size: htf ? 2 : 1,
    });
    markers.push({
      time: beamTime as UTCTimestamp,
      position: long ? 'belowBar' : 'aboveBar',
      shape: long ? 'arrowUp' : 'arrowDown',
      color: long ? '#22C55E' : '#EF4444',
      text: long ? '▲' : '▼',
      size: htf ? 2 : 1,
    });
  }

  return { paintByTime, markers, detailByTime, zoneOverlays };
}
