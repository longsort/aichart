/**
 * 통합·분석 — 선진 거래량 읽기.
 * 막대 = 매수(초록) 위에 매도(빨강) 스택. 마지막 봉 마커 = 우세·흡수·진입참고.
 * 자동주문·확정 수익 아님. 카드/HUD 없음.
 */
import type { HistogramData, UTCTimestamp } from 'lightweight-charts';
import type { Candle, OverlayItem } from '@/types';
import { estimateBarBuySell } from '@/lib/volumeDirectionStats';
import {
  candleBodyRatioOfRange,
  smaTotalVolumeAt,
  type VolumePanelMarker,
} from '@/lib/volumeHistogramIntelligence';

export type AdvVolKind =
  | 'buy-dom'
  | 'sell-dom'
  | 'absorb'
  | 'climax-up'
  | 'climax-dn'
  | 'break-up'
  | 'break-dn'
  | 'no-demand'
  | 'no-supply'
  | 'confirm-up'
  | 'confirm-dn'
  | 'diverge'
  | 'dump1'
  | 'bounce2'
  | 'rally1'
  | 'drop2'
  | 'weak';

export type AdvVolAction = 'long-ref' | 'short-ref' | 'wait' | 'watch';

export type AdvVolBarRead = {
  time: number;
  buyVol: number;
  sellVol: number;
  buyPct: number;
  rvol: number | null;
  kind: AdvVolKind;
  tagKo: string;
  action: AdvVolAction;
  actionKo: string;
  markerKo: string;
  notable: boolean;
};

export type MergedDeskAdvVolumePack = {
  last: AdvVolBarRead | null;
  sellHist: HistogramData<UTCTimestamp>[];
  buyHist: HistogramData<UTCTimestamp>[];
  markers: VolumePanelMarker[];
  overlays: OverlayItem[];
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function rvolAt(rows: Candle[], i: number, period: number): number | null {
  if (i < period - 1) return null;
  const sma = smaTotalVolumeAt(rows, i, period);
  const v = Math.max(0, Number(rows[i]?.volume) || 0);
  if (!(sma > 0)) return null;
  return v / sma;
}

function slopePct(rows: Candle[], i: number, look: number): number {
  const a = Number(rows[Math.max(0, i - look)]?.close);
  const b = Number(rows[i]?.close);
  if (!(a > 0) || !Number.isFinite(b)) return 0;
  return ((b - a) / a) * 100;
}

function classifyBar(rows: Candle[], i: number, period: number): AdvVolBarRead {
  const c = rows[i]!;
  const sp = estimateBarBuySell(c);
  const rvol = rvolAt(rows, i, period);
  const rv = rvol ?? 1;
  const body = candleBodyRatioOfRange(c);
  const chg = slopePct(rows, i, 1);
  const slope3 = slopePct(rows, i, 3);
  const buyPct = sp.buyPct;
  const sellPct = sp.sellPct;

  let kind: AdvVolKind = 'weak';
  if (rv >= 2.35 && body != null && body < 0.4) {
    kind = 'absorb';
  } else if (rv >= 2.55 && body != null && body >= 0.55) {
    kind = chg >= 0 ? 'climax-up' : 'climax-dn';
  } else if (rv >= 1.55 && body != null && body >= 0.52 && Math.abs(chg) >= 0.08) {
    kind = chg >= 0 ? 'break-up' : 'break-dn';
  } else if (rv < 0.68 && chg > 0.02) {
    kind = 'no-demand';
  } else if (rv < 0.68 && chg < -0.02) {
    kind = 'no-supply';
  } else if (slope3 > 0.06 && sellPct >= 0.56) {
    kind = 'diverge';
  } else if (slope3 < -0.06 && buyPct >= 0.56) {
    kind = 'diverge';
  } else if (slope3 > 0.05 && buyPct >= 0.56 && rv >= 1.05) {
    kind = 'confirm-up';
  } else if (slope3 < -0.05 && sellPct >= 0.56 && rv >= 1.05) {
    kind = 'confirm-dn';
  } else if (buyPct >= 0.56) {
    kind = 'buy-dom';
  } else if (sellPct >= 0.56) {
    kind = 'sell-dom';
  }

  const tagKo =
    kind === 'absorb'
      ? '흡수'
      : kind === 'climax-up'
        ? '매수절정'
        : kind === 'climax-dn'
          ? '매도절정'
          : kind === 'break-up'
            ? '돌파V'
            : kind === 'break-dn'
              ? '이탈V'
              : kind === 'no-demand'
                ? '수요없음'
                : kind === 'no-supply'
                  ? '공급없음'
                  : kind === 'diverge'
                    ? '수급괴리'
                    : kind === 'confirm-up'
                      ? '수급동의↑'
                      : kind === 'confirm-dn'
                        ? '수급동의↓'
                        : kind === 'buy-dom'
                          ? '매수우세'
                          : kind === 'sell-dom'
                            ? '매도우세'
                            : '혼조·약함';

  let action: AdvVolAction = 'watch';
  if (kind === 'absorb' || kind === 'climax-up' || kind === 'climax-dn' || kind === 'diverge') {
    action = 'wait';
  } else if (
    (kind === 'break-up' || kind === 'confirm-up' || kind === 'buy-dom') &&
    buyPct >= 0.56 &&
    rv >= 1.12
  ) {
    action = 'long-ref';
  } else if (
    (kind === 'break-dn' || kind === 'confirm-dn' || kind === 'sell-dom') &&
    sellPct >= 0.56 &&
    rv >= 1.12
  ) {
    action = 'short-ref';
  } else if (kind === 'no-demand' || kind === 'no-supply') {
    action = 'watch';
  }

  const actionKo =
    action === 'long-ref'
      ? '롱진입참고'
      : action === 'short-ref'
        ? '숏진입참고'
        : action === 'wait'
          ? '대기'
          : '관망';

  const shortTag =
    kind === 'buy-dom' || kind === 'confirm-up' || kind === 'break-up'
      ? '매수↑'
      : kind === 'sell-dom' || kind === 'confirm-dn' || kind === 'break-dn'
        ? '매도↑'
        : kind === 'absorb'
          ? '흡수'
          : kind === 'climax-up'
            ? '절정↑'
            : kind === 'climax-dn'
              ? '절정↓'
              : kind === 'diverge'
                ? '괴리'
                : kind === 'no-demand'
                  ? '수요X'
                  : kind === 'no-supply'
                    ? '공급X'
                    : '약함';

  const notable =
    kind === 'absorb' ||
    kind === 'climax-up' ||
    kind === 'climax-dn' ||
    kind === 'break-up' ||
    kind === 'break-dn' ||
    kind === 'diverge' ||
    kind === 'confirm-up' ||
    kind === 'confirm-dn' ||
    rv >= 1.65;

  return {
    time: Number(c.time),
    buyVol: sp.buyVol,
    sellVol: sp.sellVol,
    buyPct,
    rvol,
    kind,
    tagKo,
    action,
    actionKo,
    markerKo: `${shortTag}·${actionKo}`,
    notable,
  };
}

function sellRgba(rvol: number | null, last: boolean): string {
  const rv = rvol ?? 1;
  const a = clamp((rv >= 1.85 ? 0.78 : rv >= 1.25 ? 0.58 : 0.4) + (last ? 0.08 : 0), 0.32, 0.88);
  return `rgba(239,68,68,${a.toFixed(2)})`;
}

function buyRgba(rvol: number | null, last: boolean): string {
  const rv = rvol ?? 1;
  const a = clamp((rv >= 1.85 ? 0.94 : rv >= 1.25 ? 0.78 : 0.58) + (last ? 0.06 : 0), 0.45, 0.96);
  return `rgba(34,197,94,${a.toFixed(2)})`;
}

function markerColor(read: AdvVolBarRead): string {
  if (read.kind === 'bounce2' || read.kind === 'dump1') return 'rgba(250,204,21,0.98)';
  if (read.kind === 'drop2' || read.kind === 'rally1') return 'rgba(251,146,60,0.98)';
  if (read.action === 'long-ref') return 'rgba(74,222,128,0.96)';
  if (read.action === 'short-ref') return 'rgba(248,113,113,0.96)';
  if (read.kind === 'absorb' || read.kind === 'diverge') return 'rgba(250,204,21,0.96)';
  if (read.kind === 'climax-up' || read.kind === 'climax-dn') return 'rgba(251,146,60,0.96)';
  return 'rgba(148,163,184,0.92)';
}

function atrLike(rows: Candle[], i: number, len = 14): number {
  let s = 0;
  let c = 0;
  const from = Math.max(1, i - len + 1);
  for (let k = from; k <= i; k++) {
    const a = rows[k]!;
    const b = rows[k - 1]!;
    const tr = Math.max(
      Number(a.high) - Number(a.low),
      Math.abs(Number(a.high) - Number(b.close)),
      Math.abs(Number(a.low) - Number(b.close))
    );
    if (Number.isFinite(tr)) {
      s += tr;
      c += 1;
    }
  }
  const px = Number(rows[i]?.close) || 0;
  return c > 0 ? s / c : px * 0.004;
}

function isLocalExtreme(rows: Candle[], i: number, side: 'low' | 'high', w = 2): boolean {
  const px = side === 'low' ? Number(rows[i]?.low) : Number(rows[i]?.high);
  if (!Number.isFinite(px) || px <= 0) return false;
  for (let j = i - w; j <= i + w; j++) {
    if (j < 0 || j >= rows.length || j === i) continue;
    const o = side === 'low' ? Number(rows[j]?.low) : Number(rows[j]?.high);
    if (!Number.isFinite(o)) continue;
    if (side === 'low' && o < px) return false;
    if (side === 'high' && o > px) return false;
  }
  return true;
}

function closePosInRange(c: Candle): number | null {
  const hi = Number(c.high);
  const lo = Number(c.low);
  const cl = Number(c.close);
  if (![hi, lo, cl].every(Number.isFinite) || hi <= lo) return null;
  return (cl - lo) / (hi - lo);
}

function looksBounceBar(c: Candle): boolean {
  const pos = closePosInRange(c);
  if (pos == null) return false;
  return pos >= 0.55 || Number(c.close) >= Number(c.open);
}

function looksDropBar(c: Candle): boolean {
  const pos = closePosInRange(c);
  if (pos == null) return false;
  return pos <= 0.45 || Number(c.close) <= Number(c.open);
}

function peakVolIdx(
  reads: AdvVolBarRead[],
  from: number,
  to: number,
  pred: (i: number) => boolean
): number {
  let best = from;
  let bestRv = -1;
  const a = Math.max(0, Math.min(from, to));
  const b = Math.min(reads.length - 1, Math.max(from, to));
  for (let i = a; i <= b; i++) {
    if (!pred(i)) continue;
    const rv = reads[i]?.rvol ?? 0;
    if (rv > bestRv) {
      bestRv = rv;
      best = i;
    }
  }
  return best;
}

type VolTwoTouchSeat = {
  side: 'long' | 'short';
  firstIdx: number;
  secondIdx: number | null;
  bounce: boolean;
};

function detectVolTwoTouchSeats(rows: Candle[], reads: AdvVolBarRead[]): VolTwoTouchSeat[] {
  const n = rows.length;
  if (n < 16) return [];
  const from = Math.max(8, n - 72);
  const lows: number[] = [];
  const highs: number[] = [];
  for (let i = from; i < n; i++) {
    if (isLocalExtreme(rows, i, 'low', 2)) lows.push(i);
    if (isLocalExtreme(rows, i, 'high', 2)) highs.push(i);
  }

  const out: VolTwoTouchSeat[] = [];

  for (let k = lows.length - 1; k >= 1; k--) {
    const i2 = lows[k]!;
    const i1 = lows[k - 1]!;
    if (i2 - i1 < 3 || i2 - i1 > 36) continue;
    const l1 = Number(rows[i1]!.low);
    const l2 = Number(rows[i2]!.low);
    const tol = Math.max(atrLike(rows, i2) * 0.55, l1 * 0.0038);
    if (!Number.isFinite(l1) || !Number.isFinite(l2) || Math.abs(l2 - l1) > tol) continue;
    const v1 = peakVolIdx(reads, i1 - 2, i1, (i) => {
      const c = rows[i]!;
      return Number(c.close) <= Number(c.open) || Number(c.close) < Number(rows[Math.max(0, i - 1)]!.close);
    });
    const v2 = peakVolIdx(reads, i2 - 1, i2, () => true);
    const rv1 = reads[v1]?.rvol ?? 0;
    const rv2 = reads[v2]?.rvol ?? 0;
    if (rv1 < 1.32 && rv2 < 1.28) continue;
    if (Math.max(rv1, rv2) < 1.45) continue;
    const bounce = looksBounceBar(rows[i2]!) || looksBounceBar(rows[v2]!);
    out.push({ side: 'long', firstIdx: v1, secondIdx: bounce ? v2 : i2, bounce });
    break;
  }

  if (!out.some((s) => s.side === 'long')) {
    for (let i = n - 1; i >= from; i--) {
      const rv = reads[i]?.rvol ?? 0;
      const c = rows[i]!;
      if (rv < 1.55) continue;
      if (!(Number(c.close) < Number(c.open))) continue;
      if (!isLocalExtreme(rows, i, 'low', 3) && i < n - 4) continue;
      out.push({ side: 'long', firstIdx: i, secondIdx: null, bounce: false });
      break;
    }
  }

  for (let k = highs.length - 1; k >= 1; k--) {
    const i2 = highs[k]!;
    const i1 = highs[k - 1]!;
    if (i2 - i1 < 3 || i2 - i1 > 36) continue;
    const h1 = Number(rows[i1]!.high);
    const h2 = Number(rows[i2]!.high);
    const tol = Math.max(atrLike(rows, i2) * 0.55, h1 * 0.0038);
    if (!Number.isFinite(h1) || !Number.isFinite(h2) || Math.abs(h2 - h1) > tol) continue;
    const v1 = peakVolIdx(reads, i1 - 2, i1, (i) => {
      const c = rows[i]!;
      return Number(c.close) >= Number(c.open) || Number(c.close) > Number(rows[Math.max(0, i - 1)]!.close);
    });
    const v2 = peakVolIdx(reads, i2 - 1, i2, () => true);
    const rv1 = reads[v1]?.rvol ?? 0;
    const rv2 = reads[v2]?.rvol ?? 0;
    if (rv1 < 1.32 && rv2 < 1.28) continue;
    if (Math.max(rv1, rv2) < 1.45) continue;
    const drop = looksDropBar(rows[i2]!) || looksDropBar(rows[v2]!);
    out.push({ side: 'short', firstIdx: v1, secondIdx: drop ? v2 : i2, bounce: drop });
    break;
  }

  return out;
}

function stampSeat(read: AdvVolBarRead, kind: AdvVolKind): AdvVolBarRead {
  if (kind === 'dump1') {
    return {
      ...read,
      kind,
      tagKo: '1차하락V',
      action: 'wait',
      actionKo: '대기',
      markerKo: '1차↓·대기',
      notable: true,
    };
  }
  if (kind === 'bounce2') {
    return {
      ...read,
      kind,
      tagKo: '2차반등',
      action: 'long-ref',
      actionKo: '롱진입참고',
      markerKo: '2차반등·롱참고',
      notable: true,
    };
  }
  if (kind === 'rally1') {
    return {
      ...read,
      kind,
      tagKo: '1차상승V',
      action: 'wait',
      actionKo: '대기',
      markerKo: '1차↑·대기',
      notable: true,
    };
  }
  return {
    ...read,
    kind,
    tagKo: '2차하락',
    action: 'short-ref',
    actionKo: '숏진입참고',
    markerKo: '2차하락·숏참고',
    notable: true,
  };
}

function seatOverlay(
  id: string,
  label: string,
  c: Candle,
  color: string,
  bg: string,
  tip: string
): OverlayItem {
  const t = Number(c.time);
  const px = Number(c.close) > 0 ? Number(c.close) : Number(c.low);
  return {
    id,
    kind: 'label',
    category: 'chartPrimeTrendChannels',
    label,
    x1: 0,
    y1: 0,
    time1: t,
    price1: px,
    confidence: 86,
    color,
    labelBackgroundColor: bg,
    labelTextColor: '#f8fafc',
    overlayZoneExtraClass: 'merged-desk-advvol-seat-pin',
    labelTooltip: tip,
    noProject: true,
  };
}

export function buildMergedDeskAdvVolumePack(
  candles: Candle[],
  opts?: { rvolPeriod?: number; maxHistMarks?: number; minBarGap?: number }
): MergedDeskAdvVolumePack {
  const rows = candles;
  const n = rows.length;
  const period = Math.max(8, Math.min(60, Math.floor(opts?.rvolPeriod ?? 20)));
  const maxMarks = Math.max(6, Math.min(24, Math.floor(opts?.maxHistMarks ?? 14)));
  const minGap = Math.max(1, Math.min(6, Math.floor(opts?.minBarGap ?? 3)));
  if (n < 4) {
    return { last: null, sellHist: [], buyHist: [], markers: [], overlays: [] };
  }

  const reads: AdvVolBarRead[] = [];
  for (let i = 0; i < n; i++) reads.push(classifyBar(rows, i, period));

  const seats = detectVolTwoTouchSeats(rows, reads);
  for (const seat of seats) {
    if (seat.side === 'long') {
      reads[seat.firstIdx] = stampSeat(reads[seat.firstIdx]!, 'dump1');
      if (seat.secondIdx != null && seat.bounce) {
        reads[seat.secondIdx] = stampSeat(reads[seat.secondIdx]!, 'bounce2');
      }
    } else {
      reads[seat.firstIdx] = stampSeat(reads[seat.firstIdx]!, 'rally1');
      if (seat.secondIdx != null && seat.bounce) {
        reads[seat.secondIdx] = stampSeat(reads[seat.secondIdx]!, 'drop2');
      }
    }
  }

  const sellHist: HistogramData<UTCTimestamp>[] = [];
  const buyHist: HistogramData<UTCTimestamp>[] = [];
  for (let i = 0; i < n; i++) {
    const read = reads[i]!;
    const last = i === n - 1;
    const tot = Math.max(0, Number(rows[i]!.volume) || 0);
    const t = Number(rows[i]!.time) as UTCTimestamp;
    let sellC = sellRgba(read.rvol, last);
    let buyC = buyRgba(read.rvol, last);
    if (read.kind === 'dump1' || read.kind === 'rally1') {
      sellC = 'rgba(251,191,36,0.88)';
      buyC = 'rgba(250,204,21,0.92)';
    } else if (read.kind === 'bounce2') {
      sellC = 'rgba(45,212,191,0.78)';
      buyC = 'rgba(52,211,153,0.96)';
    } else if (read.kind === 'drop2') {
      sellC = 'rgba(244,63,94,0.88)';
      buyC = 'rgba(251,113,133,0.9)';
    }
    sellHist.push({ time: t, value: tot, color: sellC });
    buyHist.push({ time: t, value: Math.max(0, read.buyVol), color: buyC });
  }

  const last = reads[n - 1] ?? null;
  const markers: VolumePanelMarker[] = [];
  const seatIdx = new Set<number>();
  for (const seat of seats) {
    seatIdx.add(seat.firstIdx);
    if (seat.secondIdx != null) seatIdx.add(seat.secondIdx);
  }

  for (const i of [...seatIdx].sort((a, b) => a - b)) {
    const read = reads[i]!;
    if (!(read.time > 0)) continue;
    if (!['dump1', 'bounce2', 'rally1', 'drop2'].includes(read.kind)) continue;
    markers.push({
      time: read.time as UTCTimestamp,
      position: 'aboveBar',
      shape: 'square',
      color: markerColor(read),
      text: i === n - 1 ? read.markerKo : read.tagKo,
      size: read.kind === 'bounce2' || read.kind === 'drop2' || i === n - 1 ? 2 : 1,
    });
  }

  if (last && last.time > 0 && !seatIdx.has(n - 1)) {
    markers.push({
      time: last.time as UTCTimestamp,
      position: 'aboveBar',
      shape: 'square',
      color: markerColor(last),
      text: last.markerKo,
      size: 2,
    });
  }

  let prevIdx = n;
  for (let i = n - 2; i >= period - 1 && markers.length < maxMarks; i--) {
    if (seatIdx.has(i)) continue;
    const read = reads[i]!;
    if (!read.notable || !(read.time > 0)) continue;
    if (prevIdx - i < minGap) continue;
    prevIdx = i;
    markers.push({
      time: read.time as UTCTimestamp,
      position: 'aboveBar',
      shape: 'square',
      color: markerColor(read),
      text: read.tagKo,
      size: 1,
    });
  }

  const overlays: OverlayItem[] = [];
  for (const seat of seats) {
    const a = rows[seat.firstIdx]!;
    if (seat.side === 'long') {
      overlays.push(
        seatOverlay(
          `merged-desk-advvol-seat-l1-${seat.firstIdx}`,
          '1차↓V',
          a,
          '#fbbf24',
          'rgba(69,26,3,0.94)',
          '1차 하락+고거래량 · 아직 진입 아님 · 2차 저점 반등 대기 · 확정 아님'
        )
      );
      if (seat.secondIdx != null && seat.bounce) {
        overlays.push(
          seatOverlay(
            `merged-desk-advvol-seat-l2-${seat.secondIdx}`,
            '2차반등',
            rows[seat.secondIdx]!,
            '#34d399',
            'rgba(6,78,59,0.94)',
            '2차 저점+고거래량 반등 · 롱진입참고 · 무효=저점 이탈 · 확정 아님'
          )
        );
      }
    } else {
      overlays.push(
        seatOverlay(
          `merged-desk-advvol-seat-s1-${seat.firstIdx}`,
          '1차↑V',
          a,
          '#fb923c',
          'rgba(67,20,7,0.94)',
          '1차 상승+고거래량 · 아직 진입 아님 · 2차 고점 하락 대기 · 확정 아님'
        )
      );
      if (seat.secondIdx != null && seat.bounce) {
        overlays.push(
          seatOverlay(
            `merged-desk-advvol-seat-s2-${seat.secondIdx}`,
            '2차하락',
            rows[seat.secondIdx]!,
            '#fb7185',
            'rgba(76,5,25,0.94)',
            '2차 고점+고거래량 하락 · 숏진입참고 · 무효=고점 돌파 · 확정 아님'
          )
        );
      }
    }
  }

  markers.sort((a, b) => Number(a.time) - Number(b.time));
  return { last, sellHist, buyHist, markers, overlays };
}
