/**
 * 통합·분석 ZONE 화면 작도 레이어.
 * 탐지·분석 가격(time/price)은 바꾸지 않고, ChartView에 넘기는 표시용 복제만 만든다.
 *
 * 원인(조사):
 * - reacc body = support~resist 전구간 fill
 * - coreSr maxH = 1.15 ATR (일반 존 0.15~0.35 대비 과대)
 * - 다TF 동일가 박스가 중첩
 * - 가로: 형성봉→마지막봉 + 화면 좌끝 클램프
 * - 먼 HTF도 거대한 면으로 그림
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import {
  isMergedDeskTradeRailOverlay,
  snapMergedOverlayTimeToCandles,
} from '@/lib/mergedAnalysisOverlayTimes';
import {
  isMergedDeskDumpZoneOverlay,
  isMergedDeskRbDrawOverlay,
} from '@/lib/mergedAnalysisOverlayIds';

const CORE_MIN_ATR = 0.15;
const CORE_MAX_ATR = 0.35;
const STRONG_MAX_ATR = 0.5;
const CLUSTER_ATR = 0.25;
const FAR_ATR = 6;
const OUTER_FILL_MAX_ATR = 1.15;
const MAX_FACE_BARS = 64;
const TOP_FULL = 6;
const TOP_DIM = 10;

const BOX_KINDS = new Set([
  'zone',
  'supplyZone',
  'demandZone',
  'box',
  'reactionZone',
]);
const SMC_KEEP_KINDS = new Set(['fvg', 'ob', 'bprZone']);

function paintAtr(candles: Candle[]): number {
  const n = candles.length;
  if (n < 3) return 0;
  const period = Math.min(14, n - 1);
  let sum = 0;
  for (let i = n - period; i < n; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1]!;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
    sum += tr;
  }
  return Math.max(sum / period, 1e-9);
}

function idxAtTime(candles: Candle[], t: number): number {
  const s = Number(snapMergedOverlayTimeToCandles(t, candles));
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < candles.length; i++) {
    const d = Math.abs(Number(candles[i]!.time) - s);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function inferTf(o: OverlayItem, chartTf: string): string {
  const blob = `${o.id} ${o.overlayZoneExtraClass || ''} ${o.label || ''} ${o.labelTooltip || ''} ${o.zoneFaceDetailKo || ''}`;
  const order = ['1M', '1w', '1d', '4h', '1h', '15m', '5m', '3m', '1m'] as const;
  for (const tf of order) {
    if (blob.includes(tf) || blob.toLowerCase().includes(tf.toLowerCase())) return tf;
  }
  if (/HTF1W|주봉|1W/.test(blob)) return '1w';
  if (/HTF1D|일봉/.test(blob)) return '1d';
  if (/HTF1M|월봉/.test(blob)) return '1M';
  return chartTf;
}

function isBroken(o: OverlayItem): boolean {
  if (o.obMitigated) return true;
  const blob = `${o.id} ${o.overlayZoneExtraClass || ''}`.toLowerCase();
  return /broken|invalid|mitigated|fail/.test(blob);
}

function isPaintBox(o: OverlayItem): boolean {
  if (isMergedDeskTradeRailOverlay(o) || isMergedDeskRbDrawOverlay(o)) return false;
  /** 폭락 밴드는 상태색 면+우측 한글 라벨 유지 — CORE/클러스터/원거리 레일 금지 */
  if (isMergedDeskDumpZoneOverlay(o)) return false;
  const kind = String(o.kind || '');
  if (!BOX_KINDS.has(kind) && !SMC_KEEP_KINDS.has(kind)) return false;
  const p1 = Number(o.price1);
  const p2 = Number(o.price2);
  return Number.isFinite(p1) && Number.isFinite(p2) && p1 !== p2;
}

function isSmcKeep(o: OverlayItem): boolean {
  return SMC_KEEP_KINDS.has(String(o.kind || ''));
}

function rgba(color: string | undefined, a: number): string {
  const s = String(color || '');
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
  const h = s.match(/^#([0-9a-f]{6})$/i);
  if (h) {
    const n = parseInt(h[1]!, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  return `rgba(196,163,90,${a})`;
}

function isStrong(o: OverlayItem): boolean {
  const extra = String(o.overlayZoneExtraClass || '');
  if (o.zonePulse || o.aiZoneNearestSr) return true;
  if ((Number(o.confidence) || 0) >= 80) return true;
  return /primary|hotzone|confluence|--near|hq-/.test(extra + o.id);
}

function isFresh(o: OverlayItem, candles: Candle[]): boolean {
  const t = Number(o.time1);
  if (!Number.isFinite(t) || candles.length < 4) return false;
  const i = idxAtTime(candles, t);
  return candles.length - 1 - i <= 36;
}

type Face = {
  src: OverlayItem;
  lo: number;
  hi: number;
  mid: number;
  tf: string;
  distAtr: number;
  score: number;
  smc: boolean;
};

function scoreFace(f: Face, last: number, atr: number, candles: Candle[]): number {
  let s = 0;
  s += Math.max(0, 48 - f.distAtr * 8);
  s += Math.min(24, Number(f.src.confidence) || 0) * 0.2;
  if (isFresh(f.src, candles)) s += 16;
  if (isStrong(f.src)) s += 12;
  if (f.src.aiZoneNearestSr) s += 10;
  if (f.smc) s += 6;
  if (last > 0 && Math.abs(f.mid - last) / last < 0.008) s += 8;
  void atr;
  return s;
}

function renderTimes(
  candles: Candle[],
  o: OverlayItem,
  broken: boolean
): { t1: number; t2: number } {
  const n = candles.length;
  const lastI = n - 1;
  const lastT = Number(candles[lastI]!.time);
  const a1 = Number(o.analysisTime1 ?? o.time1);
  const a2 = Number(o.analysisTime2 ?? o.time2);
  let i1 = Number.isFinite(a1) && a1 > 0 ? idxAtTime(candles, a1) : Math.max(0, lastI - 24);
  const clipI = Math.max(0, lastI - MAX_FACE_BARS);
  if (i1 < clipI) i1 = clipI;
  let i2 = lastI;
  if (broken && Number.isFinite(a2) && a2 > 0) {
    i2 = Math.min(lastI, Math.max(i1 + 1, idxAtTime(candles, a2)));
  }
  if (i2 <= i1) i2 = Math.min(lastI, i1 + 8);
  return {
    t1: Number(candles[i1]!.time),
    t2: Number(candles[i2]!.time) || lastT,
  };
}

function coreHalf(atr: number, analysisH: number, strong: boolean): number {
  const maxA = (strong ? STRONG_MAX_ATR : CORE_MAX_ATR) * atr;
  const minA = CORE_MIN_ATR * atr;
  if (analysisH <= maxA) return Math.max(minA, analysisH) / 2;
  return maxA / 2;
}

/**
 * 엔진 overlays → 화면용 복제. 원본 배열의 분석 필드는 호출측에서 유지.
 */
export function paintMergedDeskZonesForChart(
  overlays: OverlayItem[],
  candles: Candle[],
  timeframe: string
): OverlayItem[] {
  if (!overlays.length || candles.length < 8) return overlays;
  const atr = paintAtr(candles);
  const last = Number(candles[candles.length - 1]!.close);
  if (!(atr > 0) || !(last > 0)) return overlays;

  const pass: OverlayItem[] = [];
  const faces: Face[] = [];

  for (const o of overlays) {
    if (!isPaintBox(o)) {
      pass.push(o);
      continue;
    }
    const lo = Math.min(Number(o.price1), Number(o.price2));
    const hi = Math.max(Number(o.price1), Number(o.price2));
    const mid = (lo + hi) / 2;
    const distAtr = Math.abs(mid - last) / atr;
    const smc = isSmcKeep(o);
    const f: Face = {
      src: o,
      lo,
      hi,
      mid,
      tf: inferTf(o, timeframe),
      distAtr,
      score: 0,
      smc,
    };
    f.score = scoreFace(f, last, atr, candles);
    faces.push(f);
  }

  const used = new Set<number>();
  const painted: OverlayItem[] = [];

  const order = faces
    .map((f, i) => ({ f, i }))
    .sort((a, b) => b.f.score - a.f.score);

  let shown = 0;
  for (const { f, i } of order) {
    if (used.has(i)) continue;
    used.add(i);

    const cluster: Face[] = [f];
    if (!f.smc) {
      for (let j = 0; j < faces.length; j++) {
        if (used.has(j) || faces[j]!.smc) continue;
        if (Math.abs(faces[j]!.mid - f.mid) <= CLUSTER_ATR * atr) {
          used.add(j);
          cluster.push(faces[j]!);
        }
      }
    }

    const tfs = [...new Set(cluster.map((c) => c.tf))];
    const analysisLo = Math.min(...cluster.map((c) => c.lo));
    const analysisHi = Math.max(...cluster.map((c) => c.hi));
    const mid = cluster.reduce((s, c) => s + c.mid, 0) / cluster.length;
    const analysisH = analysisHi - analysisLo;
    const distAtr = Math.abs(mid - last) / atr;
    const src = f.src;
    const extra = String(src.overlayZoneExtraClass || '');
    const tfTag = tfs.length > 1 ? tfs.join('+') : tfs[0] || timeframe;
    const times = renderTimes(candles, src, isBroken(src));

    const base: OverlayItem = {
      ...src,
      analysisPrice1: analysisHi,
      analysisPrice2: analysisLo,
      analysisTime1: Number(src.time1),
      analysisTime2: Number(src.time2),
      time1: times.t1 as UTCTimestamp,
      time2: times.t2 as UTCTimestamp,
    };

    if (distAtr >= FAR_ATR) {
      const side = mid >= last ? '저항' : '지지';
      painted.push({
        ...base,
        id: `${src.id}__paint-rail`,
        kind: mid >= last ? 'resistanceLine' : 'supportLine',
        label: `${tfTag.toUpperCase()} ${side}`,
        labelTooltip: src.labelTooltip || `${src.label} · ${analysisLo.toFixed(1)}~${analysisHi.toFixed(1)}`,
        price1: mid,
        price2: mid,
        color: rgba(src.color, 0.55),
        lineStrokeWidth: 1,
        noProject: false,
        zoneSpanOnly: true,
        zoneRenderRole: 'distant-rail',
        overlayZoneExtraClass: `${extra} merged-desk-zone-paint-rail`.trim(),
      });
      shown += 1;
      continue;
    }

    shown += 1;
    const dim = shown > TOP_FULL && shown <= TOP_DIM;
    const hideBox = shown > TOP_DIM;
    const strong = cluster.some((c) => isStrong(c.src));
    const half = coreHalf(atr, analysisH, strong);
    const coreLo = mid - half;
    const coreHi = mid + half;
    const fillA = hideBox ? 0.03 : dim ? 0.08 : 0.16;
    const outerA = hideBox ? 0.015 : 0.04;
    const tfLabel = tfs.length > 1 ? ` ${tfTag}` : '';

    painted.push({
      ...base,
      id: src.id,
      label: `${src.label || ''}${tfLabel}`.trim(),
      price1: coreHi,
      price2: coreLo,
      color: rgba(src.color, fillA),
      zoneFillPreserve: false,
      zoneRenderRole: 'core',
      overlayZoneExtraClass: `${extra} merged-desk-zone-paint-core`.trim(),
    });

    if (analysisH > half * 2 * 1.15) {
      const skipOuterRails = extra.includes('merged-desk-reacc-zone');
      if (analysisH <= OUTER_FILL_MAX_ATR * atr && !hideBox) {
        painted.push({
          ...base,
          id: `${src.id}__paint-outer`,
          label: '',
          price1: analysisHi,
          price2: analysisLo,
          color: rgba(src.color, outerA),
          zoneFillPreserve: false,
          zonePulse: false,
          zoneRenderRole: 'outer',
          overlayZoneExtraClass: `${extra} merged-desk-zone-paint-outer`.trim(),
        });
      } else if (!skipOuterRails) {
        painted.push({
          ...base,
          id: `${src.id}__paint-outer-hi`,
          kind: 'resistanceLine',
          label: '',
          price1: analysisHi,
          price2: analysisHi,
          color: rgba(src.color, 0.45),
          lineStrokeWidth: 1,
          noProject: true,
          zoneRenderRole: 'outer',
          overlayZoneExtraClass: `${extra} merged-desk-zone-paint-outer-rail`.trim(),
        });
        painted.push({
          ...base,
          id: `${src.id}__paint-outer-lo`,
          kind: 'supportLine',
          label: '',
          price1: analysisLo,
          price2: analysisLo,
          color: rgba(src.color, 0.45),
          lineStrokeWidth: 1,
          noProject: true,
          zoneRenderRole: 'outer',
          overlayZoneExtraClass: `${extra} merged-desk-zone-paint-outer-rail`.trim(),
        });
      }
    }
  }

  return [...pass, ...painted];
}
