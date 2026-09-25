/**
 * 통합모드 기본 거래량 — 캔들·거래량 동기 구간 스토리 라벨.
 * (전투캔들 전용 아님. 기존 adv volume 막대·색은 유지, 마커만 추가.)
 *
 * 하락중증가 / 스윕폭락 / 반등유입 / 상승지속
 * + 흡수 / 다이버전스 / 고점소진(상승 끝)
 */
import type { UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '@/types';
import type { VolumePanelMarker } from '@/lib/volumeHistogramIntelligence';
import { candleBodyRatioOfRange, smaTotalVolumeAt } from '@/lib/volumeHistogramIntelligence';
import { findVolumeBuildAndExhaustSpans } from '@/lib/mergedDeskVolAccumulateExhaust';

export type VolumeSectionKind =
  | 'sell-rise'
  | 'sweep-plunge'
  | 'bounce-inflow'
  | 'rally-continue'
  | 'absorb'
  | 'diverge-bull'
  | 'diverge-bear'
  | 'climax-top'
  | 'vol-build'
  | 'vol-exhaust'
  | 'wave-up'
  | 'candle-pin'
  | 'candle-shoot';

export type VolumeSectionSpan = {
  kind: VolumeSectionKind;
  /** 내부/툴팁용 설명 */
  labelKo: string;
  /** 차트 표시용 짧은 한글 (전문 트레이더형) */
  displayKo: string;
  /** 라벨을 꽂을 봉(구간 내 거래량 피크) */
  peakIdx: number;
  startIdx: number;
  endIdx: number;
  color: string;
};

type BarCue = {
  idx: number;
  time: number;
  vol: number;
  rvol: number;
  buyPct: number;
  chg1: number;
  slope3: number;
  body: number | null;
  low: number;
  high: number;
  close: number;
  open: number;
};

function rvolAt(rows: Candle[], i: number, period: number): number {
  const sma = smaTotalVolumeAt(rows, i, period);
  const v = Math.max(0, Number(rows[i]?.volume) || 0);
  if (!(sma > 0)) return 1;
  return v / sma;
}

function buildCues(rows: Candle[], period = 20): BarCue[] {
  const out: BarCue[] = [];
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i]!;
    const prev = rows[i - 1];
    const chg1 =
      prev && prev.close > 0 ? ((c.close - prev.close) / prev.close) * 100 : 0;
    const a = rows[Math.max(0, i - 3)]!;
    const slope3 = a.close > 0 ? ((c.close - a.close) / a.close) * 100 : 0;
    const tb = c.takerBuyBaseVolume;
    let buyPct = 50;
    if (typeof tb === 'number' && Number.isFinite(tb) && c.volume > 0) {
      buyPct = Math.max(0, Math.min(100, (tb / c.volume) * 100));
    } else if (c.close > c.open) buyPct = 62;
    else if (c.close < c.open) buyPct = 38;
    out.push({
      idx: i,
      time: Number(c.time),
      vol: Math.max(0, c.volume || 0),
      rvol: rvolAt(rows, i, period),
      buyPct,
      chg1,
      slope3,
      body: candleBodyRatioOfRange(c),
      low: c.low,
      high: c.high,
      close: c.close,
      open: c.open,
    });
  }
  return out;
}

function peakInRange(cues: BarCue[], from: number, to: number): number {
  let best = from;
  let bestV = -1;
  for (let i = from; i <= to; i++) {
    if (cues[i]!.vol >= bestV) {
      bestV = cues[i]!.vol;
      best = i;
    }
  }
  return best;
}

const STORY_PRIORITY: Record<VolumeSectionKind, number> = {
  'sweep-plunge': 100,
  'climax-top': 90,
  'vol-exhaust': 88,
  absorb: 85,
  'sell-rise': 80,
  'vol-build': 78,
  'diverge-bear': 75,
  'diverge-bull': 75,
  'wave-up': 72,
  'candle-pin': 70,
  'candle-shoot': 70,
  'bounce-inflow': 68,
  'rally-continue': 60,
};

/** 최근 창에서 스토리 구간 (기본 최대 6) */
export function detectVolumeSectionSpans(
  candles: Candle[],
  opts?: { lookback?: number; rvolPeriod?: number; maxSpans?: number; timeframe?: string }
): VolumeSectionSpan[] {
  const n = candles.length;
  if (n < 24) return [];
  const lookback = Math.max(40, Math.min(120, opts?.lookback ?? 80));
  const period = Math.max(8, Math.min(40, opts?.rvolPeriod ?? 20));
  const maxSpans = Math.max(4, Math.min(8, opts?.maxSpans ?? 6));
  const from = Math.max(3, n - lookback);
  const cues = buildCues(candles, period);
  const spans: VolumeSectionSpan[] = [];

  /** 1) 스윕 폭락 — lookback 내 고 RVOL + 저점 스윕 (최근 우선) */
  let sweepIdx = -1;
  for (let i = n - 2; i >= from + 4; i--) {
    const c = cues[i]!;
    if (c.rvol < 1.55) continue;
    const prevLows = cues.slice(Math.max(from, i - 14), i).map((x) => x.low);
    if (!prevLows.length) continue;
    const prevLow = Math.min(...prevLows);
    const swept = c.low < prevLow * 0.9992;
    let reclaim = false;
    for (let j = i; j <= Math.min(n - 1, i + 5); j++) {
      if (cues[j]!.close > prevLow) {
        reclaim = true;
        break;
      }
    }
    if (swept && (reclaim || c.close > c.low + (c.high - c.low) * 0.35)) {
      sweepIdx = i;
      break;
    }
  }
  if (sweepIdx < 0) {
    let bestI = -1;
    let bestScore = 0;
    for (let i = from + 6; i <= n - 2; i++) {
      const c = cues[i]!;
      if (c.rvol < 1.7) continue;
      const rng = Math.max(1e-9, c.high - c.low);
      const lowerWick = Math.min(c.open, c.close) - c.low;
      const wickRatio = lowerWick / rng;
      const dump = c.chg1 < -0.15 || c.close < c.open;
      if (!(dump || wickRatio >= 0.35)) continue;
      const score = c.rvol * 10 + wickRatio * 4 + (dump ? 2 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestI = i;
      }
    }
    if (bestI >= 0) sweepIdx = bestI;
  }
  if (sweepIdx >= 0) {
    const s0 = Math.max(from, sweepIdx - 1);
    const s1 = Math.min(n - 1, sweepIdx + 2);
    spans.push({
      kind: 'sweep-plunge',
      labelKo: '스윕 시 폭락',
      displayKo: '스윕폭락',
      peakIdx: peakInRange(cues, s0, s1),
      startIdx: s0,
      endIdx: s1,
      color: 'rgba(239,68,68,0.98)',
    });
  }

  /** 2) 하락 중 증가 */
  let sellStart = -1;
  let sellEnd = -1;
  if (sweepIdx > from + 8) {
    sellEnd = sweepIdx - 2;
    sellStart = Math.max(from, sellEnd - 18);
  } else {
    let bestScore = 0;
    for (let end = n - 12; end >= from + 8; end--) {
      const start = Math.max(from, end - 16);
      if (end - start < 5) continue;
      let downBars = 0;
      let volUp = 0;
      let sellDomSum = 0;
      for (let i = start + 1; i <= end; i++) {
        if (cues[i]!.slope3 < -0.05 || cues[i]!.chg1 < 0) downBars += 1;
        if (cues[i]!.vol > cues[i - 1]!.vol * 0.98) volUp += 1;
        sellDomSum += 100 - cues[i]!.buyPct;
      }
      const sellDom = sellDomSum / Math.max(1, end - start);
      const score = downBars * 2 + volUp + (sellDom >= 52 ? 3 : 0);
      if (downBars >= 3 && (volUp >= 3 || sellDom >= 52) && score > bestScore) {
        bestScore = score;
        sellStart = start;
        sellEnd = end;
      }
    }
  }
  if (sellStart >= 0 && sellEnd > sellStart) {
    let downBars = 0;
    let volUp = 0;
    for (let i = sellStart + 1; i <= sellEnd; i++) {
      if (cues[i]!.slope3 < -0.05 || cues[i]!.chg1 < 0) downBars += 1;
      if (cues[i]!.vol > cues[i - 1]!.vol * 0.98) volUp += 1;
    }
    const sellDom =
      cues.slice(sellStart, sellEnd + 1).reduce((s, x) => s + (100 - x.buyPct), 0) /
      Math.max(1, sellEnd - sellStart + 1);
    if (downBars >= 3 && (volUp >= 3 || sellDom >= 52)) {
      spans.push({
        kind: 'sell-rise',
        labelKo: '하락 중 증가 (매도 우세)',
        displayKo: '매도우위',
        peakIdx: peakInRange(cues, sellStart, sellEnd),
        startIdx: sellStart,
        endIdx: sellEnd,
        color: 'rgba(248,113,113,0.98)',
      });
    }
  }

  /** 3) 반등 시 증가 */
  const bounceStart = sweepIdx >= 0 ? sweepIdx + 1 : Math.max(from, n - 22);
  const bounceEnd = Math.min(n - 1, bounceStart + 12);
  if (bounceEnd - bounceStart >= 3) {
    let upBars = 0;
    let buyDom = 0;
    for (let i = bounceStart; i <= bounceEnd; i++) {
      if (cues[i]!.chg1 > 0 || cues[i]!.close > cues[i]!.open) upBars += 1;
      if (cues[i]!.buyPct >= 52) buyDom += 1;
    }
    if (upBars >= 2 && buyDom >= 2) {
      spans.push({
        kind: 'bounce-inflow',
        labelKo: '반등 시 증가 (매수 유입)',
        displayKo: '매수유입',
        peakIdx: peakInRange(cues, bounceStart, bounceEnd),
        startIdx: bounceStart,
        endIdx: bounceEnd,
        color: 'rgba(56,189,248,0.98)',
      });
    }
  }

  /** 4) 상승 지속 */
  const rallyStart = Math.min(
    n - 1,
    (spans.find((s) => s.kind === 'bounce-inflow')?.endIdx ?? bounceEnd) + 1
  );
  const rallyEnd = n - 1;
  if (rallyEnd - rallyStart >= 3) {
    let up = 0;
    for (let i = rallyStart; i <= rallyEnd; i++) {
      if (cues[i]!.slope3 > 0 || cues[i]!.close >= cues[i]!.open) up += 1;
    }
    if (up >= Math.ceil((rallyEnd - rallyStart + 1) * 0.45)) {
      spans.push({
        kind: 'rally-continue',
        labelKo: '상승 지속',
        displayKo: '상승지속',
        peakIdx: peakInRange(cues, rallyStart, rallyEnd),
        startIdx: rallyStart,
        endIdx: rallyEnd,
        color: 'rgba(125,211,252,0.95)',
      });
    }
  }

  /** 5) 흡수 — 고거래량 + 작은 몸통(가격 정체) */
  {
    let bestI = -1;
    let bestScore = 0;
    for (let i = Math.max(from + 4, n - 48); i <= n - 2; i++) {
      if (sweepIdx >= 0 && Math.abs(i - sweepIdx) < 2) continue;
      const c = cues[i]!;
      if (c.rvol < 1.45) continue;
      const body = c.body ?? 1;
      if (body > 0.38) continue;
      const rng = Math.max(1e-9, c.high - c.low);
      const midHold = Math.abs(c.close - (c.high + c.low) / 2) / rng < 0.42;
      if (!midHold && Math.abs(c.chg1) > 0.35) continue;
      const score = c.rvol * 8 + (1 - body) * 6;
      if (score > bestScore) {
        bestScore = score;
        bestI = i;
      }
    }
    if (bestI >= 0) {
      spans.push({
        kind: 'absorb',
        labelKo: '흡수 (거래량↑·가격정체)',
        displayKo: '흡수',
        peakIdx: bestI,
        startIdx: Math.max(from, bestI - 1),
        endIdx: Math.min(n - 1, bestI + 1),
        color: 'rgba(251,191,36,0.98)',
      });
    }
  }

  /** 6) 다이버전스 — 가격 신고/신저 vs 거래량 약화 */
  {
    const win = 10;
    let bullI = -1;
    let bearI = -1;
    let bullScore = 0;
    let bearScore = 0;
    for (let i = Math.max(from + win, n - 40); i <= n - 2; i++) {
      const slice = cues.slice(i - win, i + 1);
      const hiNow = cues[i]!.high;
      const loNow = cues[i]!.low;
      const prevHi = Math.max(...slice.slice(0, -1).map((x) => x.high));
      const prevLo = Math.min(...slice.slice(0, -1).map((x) => x.low));
      const volNow = cues[i]!.vol;
      const volPrevPeak = Math.max(...slice.slice(0, -1).map((x) => x.vol));
      /** 약세 다이버전스: 신고가 + 거래량↓ */
      if (hiNow > prevHi * 1.0005 && volNow < volPrevPeak * 0.82 && cues[i]!.rvol < 1.15) {
        const sc = (prevHi > 0 ? (hiNow - prevHi) / prevHi : 0) * 100 + (1 - volNow / Math.max(1, volPrevPeak)) * 4;
        if (sc > bearScore) {
          bearScore = sc;
          bearI = i;
        }
      }
      /** 강세 다이버전스: 신저 + 거래량↓ (매도 약화) */
      if (loNow < prevLo * 0.9995 && volNow < volPrevPeak * 0.82) {
        const sc = (prevLo > 0 ? (prevLo - loNow) / prevLo : 0) * 100 + (1 - volNow / Math.max(1, volPrevPeak)) * 4;
        if (sc > bullScore) {
          bullScore = sc;
          bullI = i;
        }
      }
    }
    if (bearI >= 0) {
      spans.push({
        kind: 'diverge-bear',
        labelKo: '약세 다이버전스',
        displayKo: '약세괴리',
        peakIdx: bearI,
        startIdx: Math.max(from, bearI - 2),
        endIdx: Math.min(n - 1, bearI + 1),
        color: 'rgba(251,113,133,0.95)',
      });
    }
    if (bullI >= 0 && bullI !== bearI) {
      spans.push({
        kind: 'diverge-bull',
        labelKo: '강세 다이버전스',
        displayKo: '강세괴리',
        peakIdx: bullI,
        startIdx: Math.max(from, bullI - 2),
        endIdx: Math.min(n - 1, bullI + 1),
        color: 'rgba(52,211,153,0.95)',
      });
    }
  }

  /** 7) 고점 소진 / 상승 끝 — 고점 근처 고RVOL + 윗꼬리·매수 약화 */
  {
    let bestI = -1;
    let bestScore = 0;
    const scanFrom = Math.max(from + 8, n - 36);
    for (let i = scanFrom; i <= n - 2; i++) {
      const c = cues[i]!;
      if (c.rvol < 1.5) continue;
      const winHi = Math.max(...cues.slice(Math.max(from, i - 16), i + 1).map((x) => x.high));
      const nearHigh = c.high >= winHi * 0.998;
      if (!nearHigh) continue;
      const rng = Math.max(1e-9, c.high - c.low);
      const upperWick = c.high - Math.max(c.open, c.close);
      const wickRatio = upperWick / rng;
      const buyFade = c.buyPct <= 48 || c.chg1 < 0.05;
      if (!(wickRatio >= 0.28 || buyFade)) continue;
      const score = c.rvol * 9 + wickRatio * 5 + (buyFade ? 3 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestI = i;
      }
    }
    if (bestI >= 0) {
      spans.push({
        kind: 'climax-top',
        labelKo: '고점 소진 (상승 끝)',
        displayKo: '고점소진',
        peakIdx: bestI,
        startIdx: Math.max(from, bestI - 1),
        endIdx: Math.min(n - 1, bestI + 1),
        color: 'rgba(251,146,60,0.98)',
      });
    }
  }

  /** 8) 거래량모집·소진·파동·캔들 합류 */
  for (const extra of findVolumeBuildAndExhaustSpans(candles, {
    lookback,
    rvolPeriod: period,
    timeframe: opts?.timeframe,
  })) {
    spans.push({
      kind: extra.kind,
      labelKo: extra.labelKo,
      displayKo: extra.displayKo,
      peakIdx: extra.peakIdx,
      startIdx: extra.startIdx,
      endIdx: extra.endIdx,
      color: extra.color,
    });
  }

  /** 우선순위·시간순 · 최대 N — 종류 다르면 인접 허용 */
  spans.sort((a, b) => {
    const pd = (STORY_PRIORITY[b.kind] ?? 0) - (STORY_PRIORITY[a.kind] ?? 0);
    if (pd !== 0) return pd;
    return a.peakIdx - b.peakIdx;
  });
  const dedup: VolumeSectionSpan[] = [];
  for (const s of spans) {
    const conflict = dedup.find((d) => {
      const dist = Math.abs(d.peakIdx - s.peakIdx);
      if (d.kind === s.kind) return dist < 4;
      return dist < 1;
    });
    if (conflict) {
      const prefer =
        (STORY_PRIORITY[s.kind] ?? 0) > (STORY_PRIORITY[conflict.kind] ?? 0) ||
        (s.kind === 'sweep-plunge' && conflict.kind !== 'sweep-plunge');
      if (prefer) dedup[dedup.indexOf(conflict)] = s;
      continue;
    }
    dedup.push(s);
    if (dedup.length >= maxSpans) break;
  }
  dedup.sort((a, b) => a.peakIdx - b.peakIdx);
  return dedup;
}

export type VolumeSectionDivider = {
  time: number;
  barIdx: number;
  kind: 'decline-end' | 'bounce-start' | 'rally-end' | 'rise-end' | 'absorb';
  labelKo: string;
  color: string;
};

/** 구간 경계 — 하락끝 / 폭락 / 반등 / 상승끝. 세로선으로 구간 표지 */
export function buildVolumeSectionDividers(
  candles: Candle[],
  spans: VolumeSectionSpan[]
): VolumeSectionDivider[] {
  if (!candles.length || !spans.length) return [];
  const byKind = new Map(spans.map((s) => [s.kind, s]));
  const out: VolumeSectionDivider[] = [];
  const push = (idx: number, kind: VolumeSectionDivider['kind'], labelKo: string, color: string) => {
    const i = Math.max(0, Math.min(candles.length - 1, idx));
    const c = candles[i];
    if (!c) return;
    const t = Number(c.time);
    if (!(t > 0)) return;
    /** 같은 자리 중복만 막고, 구간마다 선은 남김 */
    if (out.some((d) => Math.abs(d.barIdx - i) < 1 && d.kind === kind)) return;
    if (out.some((d) => Math.abs(d.barIdx - i) < 2 && d.labelKo === labelKo)) return;
    out.push({ time: t, barIdx: i, kind, labelKo, color });
  };

  const sell = byKind.get('sell-rise');
  const sweep = byKind.get('sweep-plunge');
  const bounce = byKind.get('bounce-inflow');
  const rally = byKind.get('rally-continue');
  const climax = byKind.get('climax-top');
  const absorb = byKind.get('absorb');
  const exhaust = byKind.get('vol-exhaust');

  if (sell) push(sell.startIdx, 'decline-end', '하락', 'rgba(248,113,113,0.92)');
  if (sweep) push(sweep.peakIdx, 'decline-end', '폭락', 'rgba(254,226,226,0.95)');
  else if (sell) push(sell.endIdx, 'decline-end', '하락끝', 'rgba(248,250,252,0.92)');

  if (climax) push(climax.peakIdx, 'rise-end', '상승끝', 'rgba(251,146,60,0.98)');
  if (exhaust && (!climax || Math.abs(exhaust.peakIdx - climax.peakIdx) > 2)) {
    push(exhaust.peakIdx, 'rise-end', '소진', 'rgba(251,146,60,0.9)');
  }

  if (bounce) push(bounce.startIdx, 'bounce-start', '반등', 'rgba(125,211,252,0.95)');
  else if (sweep)
    push(Math.min(candles.length - 1, sweep.endIdx + 1), 'bounce-start', '반등?', 'rgba(125,211,252,0.75)');

  if (rally && bounce && rally.startIdx > bounce.endIdx) {
    push(rally.startIdx, 'rally-end', '상승', 'rgba(52,211,153,0.88)');
  }

  if (absorb) push(absorb.peakIdx, 'absorb', '흡수', 'rgba(251,191,36,0.92)');

  out.sort((a, b) => a.barIdx - b.barIdx);
  return out.slice(0, 7);
}

function markerSizeForKind(kind: VolumeSectionKind): number {
  if (kind === 'sweep-plunge' || kind === 'sell-rise' || kind === 'climax-top') return 3;
  if (kind === 'absorb' || kind === 'diverge-bull' || kind === 'diverge-bear') return 2;
  return 2;
}

export function buildVolumeSectionStoryMarkers(
  candles: Candle[],
  opts?: { lookback?: number; rvolPeriod?: number; maxSpans?: number; timeframe?: string }
): VolumePanelMarker[] {
  const spans = detectVolumeSectionSpans(candles, opts);
  const out: VolumePanelMarker[] = [];
  for (const s of spans) {
    const c = candles[s.peakIdx];
    if (!c) continue;
    out.push({
      time: Number(c.time) as UTCTimestamp,
      position: 'aboveBar',
      shape: 'square',
      color: s.color,
      text: s.displayKo,
      size: markerSizeForKind(s.kind),
    });
  }
  return out;
}

export function buildVolumeSectionStoryPack(
  candles: Candle[],
  opts?: { lookback?: number; rvolPeriod?: number; maxSpans?: number; timeframe?: string }
): {
  spans: VolumeSectionSpan[];
  markers: VolumePanelMarker[];
  dividers: VolumeSectionDivider[];
} {
  const spans = detectVolumeSectionSpans(candles, opts);
  const markers = spans.map((s) => {
    const c = candles[s.peakIdx]!;
    return {
      time: Number(c.time) as UTCTimestamp,
      position: 'aboveBar' as const,
      shape: 'square' as const,
      color: s.color,
      text: proVolumeStoryDisplayKo(s.displayKo) || s.displayKo,
      size: markerSizeForKind(s.kind),
    };
  });
  return {
    spans,
    markers,
    dividers: buildVolumeSectionDividers(candles, spans),
  };
}

/** 장문 → 전문 트레이더형 짧은 한글 */
export function proVolumeStoryDisplayKo(raw: string): string {
  const t = String(raw || '').trim();
  if (!t) return '';
  if (t.includes('스윕') || t === '스윕폭락' || t === '스윙폭락') return '폭락';
  if (t.includes('횡보→') || t.startsWith('횡보')) return t.length > 12 ? t.slice(0, 12) : t;
  if (t.includes('매수모집') || t.includes('모집·매수')) return '모집·매수';
  if (t.includes('매도모집') || t.includes('모집·매도')) return '모집·매도';
  if (t.includes('매수확장') || t.includes('확장·매수')) return '확장·매수';
  if (t.includes('매도확장') || t.includes('확장·매도')) return '확장·매도';
  if (t.includes('폭등') || t.includes('롱빔') || t === '모집→폭등') return '폭등';
  if (t.includes('확장') && !t.includes('확장끝')) return '확장';
  if (t.includes('반등 시 증가') || t === '매수유입') return '매수유입';
  if (t === '상승 지속' || t === '상승지속') return '상승';
  if (t.includes('흡수')) return '흡수';
  if (t.includes('약세')) return '약세괴리';
  if (t.includes('강세') && t.includes('다이버전스')) return '강세괴리';
  if (t.includes('강세괴리')) return '강세괴리';
  if (t.includes('고점') || t.includes('상승 끝') || t === '고점소진') return '소진';
  if (t.includes('거래량모집') || t.includes('모집')) return '모집';
  if (t.includes('거래량소진') || (t.includes('소진') && !t.includes('고점'))) return '소진';
  if (t.includes('파동상승') || t === '파동상승') return '파동';
  if (t.includes('핀바')) return '핀바';
  if (t.includes('슈팅')) return '슈팅';
  if (t.includes('하락 중 증가') || t === '매도우위') return '매도';
  if (t === '하락 끝' || t === '하락끝') return '하락끝';
  if (t === '하락') return '하락';
  if (t === '폭락') return '폭락';
  if (t === '소진') return '소진';
  if (t.includes('반등 시작') || t === '반등' || t === '반등?') return t === '반등?' ? '반등?' : '반등';
  if (t === '상승 구간' || t === '상승') return '상승';
  if (t === '상승끝') return '상승끝';
  return t.length > 5 ? t.slice(0, 5) : t;
}

export function isVolumeSectionStoryMarkerText(text: string): boolean {
  const t = String(text || '');
  return (
    t.includes('하락 중 증가') ||
    t.includes('스윕') ||
    t.includes('스윙') ||
    t.includes('반등 시 증가') ||
    t === '상승 지속' ||
    t === '상승지속' ||
    t === '상승' ||
    t === '매도우위' ||
    t === '매도' ||
    t === '매수유입' ||
    t === '스윕폭락' ||
    t === '폭락' ||
    t === '매수모집' ||
    t === '매도모집' ||
    t === '매수확장' ||
    t === '매도확장' ||
    t === '모집·매수' ||
    t === '모집·매도' ||
    t === '확장·매수' ||
    t === '확장·매도' ||
    t.includes('횡보→') ||
    t === '모집' ||
    t === '확장' ||
    t === '폭등' ||
    t === '모집→폭등' ||
    t.includes('롱빔') ||
    t.includes('흡수') ||
    t.includes('다이버전스') ||
    t.includes('괴리') ||
    t.includes('고점') ||
    t.includes('상승 끝') ||
    t === '고점소진' ||
    t === '소진' ||
    t.includes('거래량모집') ||
    t.includes('거래량소진') ||
    t === '모집' ||
    t.includes('파동') ||
    t.includes('핀바') ||
    t.includes('슈팅')
  );
}
