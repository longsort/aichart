/**
 * 통합·분석 — 선진 거래량 읽기.
 * 막대 = 매수(초록) 위에 매도(빨강) 스택. 마지막 봉 마커 = 우세·흡수·진입참고.
 * 자동주문·확정 수익 아님. 카드/HUD 없음.
 */
import type { HistogramData, UTCTimestamp } from 'lightweight-charts';
import type { Candle, OverlayItem } from '@/types';
import {
  detectSwingAnchorVolumeEvents,
  mergeAdvVolumeMarkersForDisplay,
  type SwingAnchorVolumeEvent,
} from '@/lib/mergedDeskSwingAnchorVolumeEvents';
import { enrichSwingAnchorWithWhale } from '@/lib/mergedDeskSwingAnchorWhaleConfluence';
import type { WhaleBeamIntelPack } from '@/lib/whaleVolumeBeamIntel';
import { estimateBarBuySell } from '@/lib/volumeDirectionStats';
import {
  candleBodyRatioOfRange,
  smaTotalVolumeAt,
  type VolumePanelMarker,
} from '@/lib/volumeHistogramIntelligence';
import {
  advVolKindToSide,
  appendSpotPctToTag,
  buildVolumeSignalSpotPctKo,
} from '@/lib/mergedDeskSpotReactionPct';
import {
  buildVolumeBurstSequenceIntel,
  enrichSwingEventsWithBurstSequence,
  type VolumeBurstSequenceIntel,
} from '@/lib/volumeBurstSequenceIntel';
import {
  buildVolumeTfMetricsSeries,
  pickVolumeTfLabelBars,
} from '@/lib/mergedDeskVolumeTfMetrics';
import { buildVolumeSectionStoryPack, proVolumeStoryDisplayKo, type VolumeSectionDivider } from '@/lib/mergedDeskVolumeSectionStory';
import {
  detectVolumePhaseZones,
  resolveCurrentVolumeSection,
  volumePhaseZoneLabel,
  type VolumePhaseZone,
} from '@/lib/mergedDeskVolAccumulateExhaust';
import {
  buildSidewaysBreakForecast,
  type SidewaysBreakForecast,
} from '@/lib/volumeSidewaysBreakForecast';

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
  | 'big-long'
  | 'big-short'
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
  /** 스윙앵커 빅롱/빅숏 V±% (확정봉만) */
  swingAnchorEvents: SwingAnchorVolumeEvent[];
  /** 횡보→1·2차 거래량쌍 통계 (막대 불변) */
  burstSequence?: VolumeBurstSequenceIntel | null;
  /** 2차 터짐 예상 현물 % 가격선 */
  burstPriceLines?: import('@/lib/monthDeskAtlasPulseDesk').AtlasPulsePriceLine[];
  /** 하락끝/반등시작 세로 구분선 (통합모드 기본) */
  sectionDividers?: VolumeSectionDivider[];
  /** TF 모집/소진/폭락 거래량 존 (패널 박스) — 기존 막대 유지·추가 */
  volumePhaseZones?: VolumePhaseZone[];
  /** 횡보→상승/하락 + 현물 예상% (기존 존 유지·부가) */
  sidewaysBreak?: SidewaysBreakForecast | null;
  /** 우측 끝 현재 구간 한 줄 */
  currentSection?: { ko: string; detailKo: string; tone: 'bear' | 'bull' | 'neutral' };
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
  const a = clamp((rv >= 1.85 ? 0.9 : rv >= 1.25 ? 0.78 : 0.62) + (last ? 0.06 : 0), 0.55, 0.94);
  return `rgba(239,68,68,${a.toFixed(2)})`;
}

function buyRgba(rvol: number | null, last: boolean): string {
  const rv = rvol ?? 1;
  const a = clamp((rv >= 1.85 ? 0.96 : rv >= 1.25 ? 0.88 : 0.74) + (last ? 0.04 : 0), 0.68, 0.98);
  return `rgba(34,197,94,${a.toFixed(2)})`;
}

/** 거래량 막대 위 짧은 라벨 — TF 메트릭은 그대로, 구형 장문만 축약 (… 금지) */
export function compactAdvVolBarLabelKo(raw: string): string {
  const src = String(raw || '').replace(/·/g, ' ').replace(/\s+/g, ' ').trim();
  if (!src) return '';
  /** 구간 스토리 — 전문 트레이더형 짧은 한글 */
  if (
    src.includes('하락 중 증가') ||
    src.includes('스윕') ||
    src.includes('반등 시 증가') ||
    src === '상승 지속' ||
    src === '상승지속' ||
    src === '매도우위' ||
    src === '매수유입' ||
    src === '스윕폭락' ||
    src.includes('흡수') ||
    src.includes('다이버전스') ||
    src.includes('괴리') ||
    src.includes('고점') ||
    src.includes('상승 끝') ||
    src === '고점소진'
  ) {
    return proVolumeStoryDisplayKo(src);
  }
  /** 예: 매62↑1.1 / 매도71↓0.8 현+0.3 — 자르지 않음 */
  if (/^매(?:도)?\d{1,3}/.test(src) || /현[+−+\-]/.test(src)) {
    return src;
  }
  if (/예고롱/.test(src)) return '예고롱';
  if (/예고숏/.test(src)) return '예고숏';
  if (/준비롱/.test(src)) return '준비롱';
  if (/준비숏/.test(src)) return '준비숏';
  if (/예비빅롱/.test(src)) return '예비롱';
  if (/예비빅숏/.test(src)) return '예비숏';
  if (/빅롱·2차/.test(src)) return '빅롱2';
  if (/빅숏·2차/.test(src)) return '빅숏2';
  if (/빅롱·1차/.test(src)) return '빅롱1';
  if (/빅숏·1차/.test(src)) return '빅숏1';
  if (/빅롱/.test(src)) return '빅롱';
  if (/빅숏/.test(src)) return '빅숏';
  const t = src.replace(/\s*[+\-−]?\d+(?:\.\d+)?%\s*/g, '').trim();
  if (!t) return '';
  if (/돌파/.test(t)) return '돌파';
  if (/이탈/.test(t)) return '이탈';
  if (/수급동의↑|동의↑/.test(t)) return '동의↑';
  if (/수급동의↓|동의↓/.test(t)) return '동의↓';
  if (/1차/.test(t) && /↓|하락/.test(t)) return '1↓';
  if (/1차/.test(t) && /↑|상승/.test(t)) return '1↑';
  if (/2차/.test(t) && /반등|↑/.test(t)) return '2↑';
  if (/2차/.test(t) && /하락|↓/.test(t)) return '2↓';
  if (/매수절/.test(t)) return '매수절';
  if (/매도절/.test(t)) return '매도절';
  if (/매수우세/.test(t)) return '매수';
  if (/매도우세/.test(t)) return '매도';
  if (/흡수/.test(t)) return '흡수';
  if (/괴리/.test(t)) return '괴리';
  if (/스윙|앵커|빔/.test(t)) return t.slice(0, 4);
  return t.slice(0, 6);
}

function markerColor(read: AdvVolBarRead): string {
  if (read.kind === 'big-long') return 'rgba(52,211,153,0.98)';
  if (read.kind === 'big-short') return 'rgba(248,113,113,0.98)';
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


function stampSwingAnchor(read: AdvVolBarRead, ev: SwingAnchorVolumeEvent): AdvVolBarRead {
  const watchish = ev.phase === 'watch' || ev.phase === 'setup';
  if (ev.tier === 'big-long') {
    return {
      ...read,
      kind: 'big-long',
      tagKo: ev.markerKo,
      action: watchish ? 'watch' : 'long-ref',
      actionKo: watchish
        ? ev.phase === 'setup'
          ? '롱준비'
          : '롱예고'
        : '롱진입참고',
      markerKo: ev.markerKo,
      notable: true,
    };
  }
  return {
    ...read,
    kind: 'big-short',
    tagKo: ev.markerKo,
    action: watchish ? 'watch' : 'short-ref',
    actionKo: watchish
      ? ev.phase === 'setup'
        ? '숏준비'
        : '숏예고'
      : '숏진입참고',
    markerKo: ev.markerKo,
    notable: true,
  };
}

function markerTextWithSpotPct(
  rows: Candle[],
  barIdx: number,
  spot: number | null | undefined,
  tagKo: string,
  kind: AdvVolKind
): string {
  const side = advVolKindToSide(kind);
  if (!side || !(spot != null && spot > 0)) return tagKo;
  const pctKo = buildVolumeSignalSpotPctKo({ candles: rows, barIdx, spot, side });
  return appendSpotPctToTag(tagKo, pctKo);
}

export function buildMergedDeskAdvVolumePack(
  candles: Candle[],
  opts?: {
    timeframe?: string;
    rvolPeriod?: number;
    maxHistMarks?: number;
    minBarGap?: number;
    swingAnchorOn?: boolean;
    whaleBeamIntel?: WhaleBeamIntelPack | null;
    /** 현물 종가 — 마커·좌석에 반등/하락 % */
    spotPx?: number | null;
  }
): MergedDeskAdvVolumePack {
  const rows = candles;
  const n = rows.length;
  const period = Math.max(8, Math.min(60, Math.floor(opts?.rvolPeriod ?? 20)));
  const maxMarks = Math.max(6, Math.min(24, Math.floor(opts?.maxHistMarks ?? 14)));
  const minGap = Math.max(1, Math.min(6, Math.floor(opts?.minBarGap ?? 3)));
  if (n < 4) {
    return {
      last: null,
      sellHist: [],
      buyHist: [],
      markers: [],
      overlays: [],
      swingAnchorEvents: [],
      burstSequence: null,
      burstPriceLines: [],
      volumePhaseZones: [],
      sidewaysBreak: null,
    };
  }

  const reads: AdvVolBarRead[] = [];
  for (let i = 0; i < n; i++) reads.push(classifyBar(rows, i, period));

  const swingAnchorOn = opts?.swingAnchorOn !== false;
  const swingRaw = swingAnchorOn
    ? detectSwingAnchorVolumeEvents(rows, {
        timeframe: opts?.timeframe,
        rvolPeriod: period,
        minBarGap: Math.max(minGap, 5),
        maxEvents: 10,
      })
    : [];
  const swingWithWhale =
    opts?.whaleBeamIntel && swingRaw.length
      ? swingRaw.map((ev) => enrichSwingAnchorWithWhale(ev, opts.whaleBeamIntel ?? null))
      : swingRaw;
  const burstSequence = buildVolumeBurstSequenceIntel({
    candles: rows,
    timeframe: opts?.timeframe,
    swingEvents: swingWithWhale,
    spotPx: opts?.spotPx ?? null,
    rvolPeriod: period,
  });
  const sectionPack = buildVolumeSectionStoryPack(rows, {
    lookback: Math.min(100, n),
    rvolPeriod: period,
    maxSpans: 4,
    timeframe: opts?.timeframe,
  });
  const bearStoryNear = (barIdx: number) =>
    sectionPack.spans.some(
      (s) =>
        (s.kind === 'sweep-plunge' ||
          s.kind === 'climax-top' ||
          s.kind === 'sell-rise' ||
          s.kind === 'vol-exhaust') &&
        Math.abs(s.peakIdx - barIdx) <= 8
    );
  const bullStoryNear = (barIdx: number) =>
    sectionPack.spans.some(
      (s) =>
        (s.kind === 'bounce-inflow' || s.kind === 'rally-continue' || s.kind === 'vol-build') &&
        Math.abs(s.peakIdx - barIdx) <= 8
    );
  /** 스윕·고점소진 옆에 준비롱/예고롱 금지 — 구간 스토리가 우선 */
  const swingClean = swingWithWhale.filter((ev) => {
    if (ev.phase !== 'watch' && ev.phase !== 'setup') return true;
    if (ev.side === 'long' && bearStoryNear(ev.barIdx)) return false;
    if (ev.side === 'short' && bullStoryNear(ev.barIdx) && !bearStoryNear(ev.barIdx)) return false;
    return true;
  });
  const swingAnchorEvents = enrichSwingEventsWithBurstSequence(swingClean, burstSequence);
  const swingIdx = new Set<number>();
  for (const ev of swingAnchorEvents) {
    swingIdx.add(ev.barIdx);
    reads[ev.barIdx] = stampSwingAnchor(reads[ev.barIdx]!, ev);
  }

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

  const spotPx =
    opts?.spotPx != null && Number.isFinite(Number(opts.spotPx)) && Number(opts.spotPx) > 0
      ? Number(opts.spotPx)
      : Number(rows[n - 1]?.close) > 0
        ? Number(rows[n - 1]!.close)
        : null;

  /** TF 공통 — taker/WAD·RVOL·RSI·봉%·현물% → 막대색·라벨 */
  const tfMetrics = buildVolumeTfMetricsSeries({
    candles: rows,
    spotPx,
    rvolPeriod: period,
    whaleBeamIntel: opts?.whaleBeamIntel ?? null,
  });
  const tfByTime = new Map(tfMetrics.map((m) => [m.time, m]));

  const sellHist: HistogramData<UTCTimestamp>[] = [];
  const buyHist: HistogramData<UTCTimestamp>[] = [];
  for (let i = 0; i < n; i++) {
    const read = reads[i]!;
    const t = Number(rows[i]!.time) as UTCTimestamp;
    const c = rows[i]!;
    const tm = tfByTime.get(Number(t));
    const tot = Math.max(0, Number(c.volume) || 0);
    let buyV = tm?.buyVol ?? Math.max(0, read.buyVol);
    let sellV = tm?.sellVol ?? Math.max(0, read.sellVol);
    const split = buyV + sellV;
    if (split > 0 && tot > 0) {
      buyV = (tot * buyV) / split;
      sellV = Math.max(0, tot - buyV);
    } else if (tot > 0) {
      buyV = tot * 0.5;
      sellV = tot - buyV;
    }
    let buyC = tm?.buyColor ?? buyRgba(read.rvol, i === n - 1);
    let sellC = tm?.sellColor ?? sellRgba(read.rvol, i === n - 1);
    /** 고점 윗꼬리 — 매도우세일 때만 빨강 (저거래량 단독 숏신호 금지) */
    const hi = Number(c.high);
    const lo = Number(c.low);
    const cl = Number(c.close);
    const o = Number(c.open);
    const range = hi - lo;
    if (range > 0) {
      const upperR = (hi - Math.max(o, cl)) / range;
      const lowerR = (Math.min(o, cl) - lo) / range;
      const buyPct = tot > 0 ? buyV / tot : 0.5;
      const sellPct = 1 - buyPct;
      if (upperR >= 0.32 && sellPct >= 0.52) {
        sellC = 'rgba(239,68,68,0.94)';
        buyC = 'rgba(127,29,29,0.42)';
      } else if (lowerR >= 0.32 && buyPct >= 0.52) {
        buyC = 'rgba(34,197,94,0.98)';
        sellC = 'rgba(22,101,52,0.42)';
      }
    }
    /** 1·2차·스윙 악센트 */
    if (read.kind === 'dump1' || read.kind === 'rally1') {
      sellC = 'rgba(251,191,36,0.7)';
      buyC = 'rgba(250,204,21,0.95)';
    } else if (read.kind === 'bounce2') {
      buyC = 'rgba(52,211,153,0.98)';
    } else if (read.kind === 'drop2') {
      sellC = 'rgba(220,38,38,0.98)';
    } else if (read.kind === 'big-long') {
      buyC = 'rgba(16,185,129,1)';
    } else if (read.kind === 'big-short') {
      sellC = 'rgba(220,38,38,1)';
    }
    /**
     * LWC 겹침: 아래=총량(적·황) · 위=매수량(녹)
     * → 초록만 전체로 보이는 문제 방지. 매수%=초록 높이 / 총량.
     */
    sellHist.push({ time: t, value: tot > 0 ? tot : sellV + buyV, color: sellC });
    buyHist.push({ time: t, value: buyV, color: buyC });
  }

  const last = reads[n - 1] ?? null;
  const markers: VolumePanelMarker[] = [];
  const seatIdx = new Set<number>();
  for (const seat of seats) {
    seatIdx.add(seat.firstIdx);
    if (seat.secondIdx != null) seatIdx.add(seat.secondIdx);
  }

  /** 핵심: 매수%/매도% · 봉↑↓% · 현물% — 봉에 정렬 */
  const tfLabels = pickVolumeTfLabelBars(tfMetrics, Math.min(6, maxMarks));
  const labeledTimes = new Set(tfLabels.map((m) => m.time));
  for (const m of tfLabels) {
    markers.push({
      time: m.time as UTCTimestamp,
      position: 'aboveBar',
      shape: 'square',
      color: m.buyDominant
        ? 'rgba(34,197,94,0.98)'
        : m.sellDominant
          ? 'rgba(239,68,68,0.98)'
          : 'rgba(148,163,184,0.95)',
      text: m.labelKo,
      size: m.time === Number(rows[n - 1]?.time) ? 2 : 1,
    });
  }

  for (const ev of swingAnchorEvents) {
    const watchish = ev.phase === 'watch' || ev.phase === 'setup';
    const boost = ev.whaleBoost === true || (ev.early === true && !watchish);
    /** 빅롱/빅숏·예고·준비는 같은 봉 다른 라벨보다 우선 — labeledTimes 스킵하지 않음 */
    markers.push({
      time: ev.time as UTCTimestamp,
      position: 'aboveBar',
      shape: 'square',
      color: watchish
        ? ev.tier === 'big-long'
          ? 'rgba(52,211,153,0.72)'
          : 'rgba(248,113,113,0.72)'
        : boost
          ? ev.tier === 'big-long'
            ? 'rgba(16,185,129,1)'
            : 'rgba(220,38,38,1)'
          : ev.tier === 'big-long'
            ? 'rgba(52,211,153,0.98)'
            : 'rgba(248,113,113,0.98)',
      text: compactAdvVolBarLabelKo(ev.markerKo),
      size: watchish ? 1 : ev.early ? 2 : boost ? 3 : 2,
    });
    labeledTimes.add(ev.time);
  }

  for (const i of [...seatIdx].sort((a, b) => a - b)) {
    if (swingIdx.has(i)) continue;
    const read = reads[i]!;
    if (!(read.time > 0) || labeledTimes.has(read.time)) continue;
    if (!['dump1', 'bounce2', 'rally1', 'drop2'].includes(read.kind)) continue;
    markers.push({
      time: read.time as UTCTimestamp,
      position: 'aboveBar',
      shape: 'square',
      color: markerColor(read),
      text: compactAdvVolBarLabelKo(read.tagKo),
      size: 1,
    });
    labeledTimes.add(read.time);
  }

  /** HTML 핀은 캔들 가격축에 세로로 쌓임 — LWC 거래량 마커만 사용 */
  const overlays: OverlayItem[] = [...(burstSequence.overlays ?? [])];

  /** 통합모드 기본 — 구간 스토리 + 하락/폭락/상승끝 세로선. 막대 로직 불변 */
  /** 확정·예비(TRIGGER)만 같은 봉 스토리 스킵. 예고/준비는 스토리에 양보(위에서 이미 필터) */
  for (const m of sectionPack.markers) {
    const t = Number(m.time);
    if (!Number.isFinite(t) || t <= 0) continue;
    const block = swingAnchorEvents.some((ev) => {
      if (Number(ev.time) !== t) return false;
      return ev.phase === 'confirmed' || ev.phase === 'trigger' || ev.phase == null;
    });
    if (block) continue;
    markers.push(m);
    labeledTimes.add(t);
  }

  const volumePhaseZones = detectVolumePhaseZones(rows, {
    lookback: Math.min(240, n),
    rvolPeriod: period,
    timeframe: opts?.timeframe,
    maxZones: 6,
  });
  /** 폭등/폭락/확장(+매수·매도)·모집 피크 라벨 — 기존 빅롱/숏·캔들은 유지 */
  for (const z of volumePhaseZones) {
    if (
      z.kind !== 'surge' &&
      z.kind !== 'dump' &&
      z.kind !== 'climax' &&
      z.kind !== 'accumulate'
    )
      continue;
    let best = z.startIdx;
    let bestV = -1;
    for (let i = z.startIdx; i <= z.endIdx; i++) {
      const v = Math.max(0, Number(rows[i]?.volume) || 0);
      if (v >= bestV) {
        bestV = v;
        best = i;
      }
    }
    let i = best;
    if (z.kind === 'accumulate') i = Math.floor((z.startIdx + z.endIdx) / 2);
    if (swingIdx.has(i)) {
      const alt = [i - 1, i + 1, i - 2, i + 2].find(
        (j) => j >= z.startIdx && j <= z.endIdx && j >= 0 && j < n && !swingIdx.has(j)
      );
      if (alt == null) continue;
      i = alt;
    }
    const t = Number(rows[i]?.time);
    if (!(t > 0)) continue;
    const tx =
      z.kind === 'surge'
        ? z.afterAccumulate
          ? '모집→폭등'
          : '폭등'
        : z.kind === 'dump'
          ? '폭락'
          : volumePhaseZoneLabel(z);
    /** 모집/확장은 기존 존 색 유지 — 방향은 라벨(·매수/·매도)로만 추가 */
    const color =
      z.kind === 'surge'
        ? 'rgba(16,185,129,0.98)'
        : z.kind === 'dump'
          ? 'rgba(248,113,113,0.98)'
          : z.kind === 'climax'
            ? 'rgba(251,146,60,0.95)'
            : 'rgba(148,163,184,0.95)';
    const mark = {
      time: t as UTCTimestamp,
      position: 'aboveBar' as const,
      shape: 'square' as const,
      color,
      text: tx,
      size: 2 as const,
    };
    const exist = markers.findIndex((m) => Number(m.time) === t);
    if (exist >= 0) {
      const prev = String(markers[exist]!.text || '');
      if (!/빅롱|빅숏|예비|준비|예고/.test(prev)) markers[exist] = mark;
    } else {
      markers.push(mark);
    }
    labeledTimes.add(t);
  }

  const sidewaysBreak = buildSidewaysBreakForecast(rows, {
    timeframe: opts?.timeframe,
    rvolPeriod: period,
  });

  /** 횡보→방향·현물% 마커 (기존 폭등/모집과 별도 추가) */
  if (sidewaysBreak.active && sidewaysBreak.chipKo) {
    const mid = Math.floor((sidewaysBreak.fromIdx + sidewaysBreak.toIdx) / 2);
    const i =
      [mid, sidewaysBreak.toIdx, sidewaysBreak.fromIdx].find(
        (j) => j >= 0 && j < n && !swingIdx.has(j) && !labeledTimes.has(Number(rows[j]?.time))
      ) ?? sidewaysBreak.toIdx;
    const t = Number(rows[i]?.time);
    if (t > 0) {
      const color =
        sidewaysBreak.bias === 'up'
          ? 'rgba(52,211,153,0.98)'
          : sidewaysBreak.bias === 'down'
            ? 'rgba(248,113,113,0.98)'
            : 'rgba(148,163,184,0.95)';
      markers.push({
        time: t as UTCTimestamp,
        position: 'aboveBar' as const,
        shape: 'square' as const,
        color,
        text: sidewaysBreak.chipKo,
        size: 2 as const,
      });
      labeledTimes.add(t);
    }
  }

  let currentSection = resolveCurrentVolumeSection({
    zones: volumePhaseZones,
    storyKinds: volumePhaseZones.map((z) => z.displayKo),
    lastBarIdx: n - 1,
  });

  /** 폭등/폭락이 아니면 횡보→현물% 칩을 우선·보강 (기존 존 문구는 detail에 유지) */
  if (sidewaysBreak.active) {
    const tone =
      sidewaysBreak.bias === 'up' || sidewaysBreak.stage === 'break-up'
        ? 'bull'
        : sidewaysBreak.bias === 'down' || sidewaysBreak.stage === 'break-down'
          ? 'bear'
          : 'neutral';
    const isHot =
      currentSection.ko.includes('폭등') ||
      currentSection.ko.includes('폭락') ||
      currentSection.ko.includes('모집→폭등');
    if (!isHot) {
      currentSection = {
        ko: sidewaysBreak.chipKo || currentSection.ko,
        detailKo: [sidewaysBreak.detailKo, currentSection.detailKo].filter(Boolean).join(' · '),
        tone,
      };
    } else if (sidewaysBreak.expectedSpotKo) {
      currentSection = {
        ...currentSection,
        detailKo: `${currentSection.detailKo} · ${sidewaysBreak.chipKo}`,
      };
    }
  }

  markers.sort((a, b) => Number(a.time) - Number(b.time));
  return {
    last,
    sellHist,
    buyHist,
    markers,
    overlays,
    swingAnchorEvents,
    burstSequence,
    burstPriceLines: burstSequence.priceLines,
    sectionDividers: sectionPack.dividers,
    volumePhaseZones,
    sidewaysBreak,
    currentSection,
  };
}

export { mergeAdvVolumeMarkersForDisplay, isSwingAnchorVolumeMarkerText } from '@/lib/mergedDeskSwingAnchorVolumeEvents';
