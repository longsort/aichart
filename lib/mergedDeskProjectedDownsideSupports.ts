/**
 * 통합·분석 — 하락 시 하방 핵심 지지 zone 투영.
 * 목표 가격에 과거 캔들이 없어도 스윙·피보·채널·VRVP·구조로 zone 표시 (조건부 참고).
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { MergedBounceScenario } from '@/lib/mergedAnalysisBounceTargets';
import type { MergedCriticalZone } from '@/lib/mergedAnalysisCriticalZones';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import {
  findMergedDeskZoneFormationBarTime,
  mergedDeskAnalyzedZoneSpanTimes,
  mergedWorkCandles,
  MERGED_ARES_ZONE_CAPTION_CLASS,
} from '@/lib/mergedAnalysisOverlayTimes';
import { computeCandleTrendChannelGeom } from '@/lib/mergedDeskCandleTrendline';

type VrvpRef = { poc?: number | null; vaLow?: number | null; vaHigh?: number | null } | null;

export type ProjectedDownsideSupport = {
  id: string;
  price: number;
  top: number;
  bot: number;
  labelKo: string;
  sourceKo: string;
  score: number;
  /** true = 해당 가격대 캔들 없이 수학 투영 */
  pureProjection: boolean;
  /** 형성봉 */
  time1?: number;
};

function fmtPx(p: number): string {
  const a = Math.abs(p);
  if (a >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (a >= 1) return p.toFixed(1);
  return p.toFixed(3);
}

function estimateAtr(candles: Candle[], endIdx: number, period = 14): number {
  const start = Math.max(1, endIdx - period + 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= endIdx; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!.close;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p), Math.abs(c.low - p));
    n++;
  }
  return n > 0 ? sum / n : Math.abs(candles[endIdx]?.close ?? 1) * 0.01;
}

function maxDownsidePct(timeframe?: string): number {
  const tf = normalizeChartTimeframe(timeframe || '');
  if (tf === '1M') return 68;
  if (tf === '1w') return 62;
  if (tf === '3d' || tf === '1d') return 52;
  if (tf === '4h' || tf === '1h') return 48;
  return 42;
}

function zonePad(atr: number, price: number): { top: number; bot: number } {
  const rel = Math.max(atr * 0.42, Math.abs(price) * 0.004);
  return { top: rel * 0.45, bot: rel * 0.55 };
}

function pushSupport(
  list: ProjectedDownsideSupport[],
  row: {
    id?: string;
    price: number;
    top?: number;
    bot?: number;
    labelKo: string;
    sourceKo: string;
    score: number;
    pureProjection: boolean;
    time1?: number;
  },
  close: number,
  atr: number,
  maxPct: number
): void {
  if (!Number.isFinite(row.price) || row.price <= 0 || row.price >= close - atr * 0.08) return;
  const distPct = ((close - row.price) / Math.max(close, 1e-9)) * 100;
  if (distPct < 0.4 || distPct > maxPct) return;
  const pad = zonePad(atr, row.price);
  const top = row.top ?? row.price + pad.top;
  const bot = row.bot ?? row.price - pad.bot;
  const id =
    row.id ??
    `merged-desk-projected-support-${row.labelKo.replace(/\s+/g, '-')}-${Math.round(row.price)}`;
  const tol = Math.max(atr * 0.38, close * 0.006);
  const existing = list.find((z) => Math.abs(z.price - row.price) <= tol);
  if (existing) {
    existing.score = Math.max(existing.score, row.score);
    existing.sourceKo = `${existing.sourceKo} · ${row.sourceKo}`;
    existing.pureProjection = existing.pureProjection && row.pureProjection;
    if (row.time1 != null && Number.isFinite(row.time1)) {
      existing.time1 =
        existing.time1 != null ? Math.min(existing.time1, Number(row.time1)) : Number(row.time1);
    }
    return;
  }
  list.push({
    id,
    price: row.price,
    top,
    bot,
    labelKo: row.labelKo,
    sourceKo: row.sourceKo,
    score: row.score,
    pureProjection: row.pureProjection,
    time1: row.time1,
  });
}

export function detectProjectedDownsideSupports(params: {
  candles: Candle[];
  timeframe: string;
  keyZones?: MergedKeyZone[];
  criticalZones?: MergedCriticalZone[];
  bounceScenarios?: MergedBounceScenario[];
  vrvp?: VrvpRef;
  analysis?: AnalyzeResponse | null;
  whaleMemoryZones?: Array<{ price1: number; price2: number; confidence?: number }>;
}): ProjectedDownsideSupport[] {
  const tf = normalizeChartTimeframe(params.timeframe);
  const work = mergedWorkCandles(params.candles, tf);
  if (work.length < 24) return [];

  const close = work[work.length - 1]!.close;
  const atr = estimateAtr(work, work.length - 1);
  const maxPct = maxDownsidePct(tf);
  const out: ProjectedDownsideSupport[] = [];

  let legHigh = -Infinity;
  let legLow = Infinity;
  const look = work.length;
  for (let i = work.length - look; i < work.length; i++) {
    legHigh = Math.max(legHigh, work[i]!.high);
    legLow = Math.min(legLow, work[i]!.low);
  }
  if (!Number.isFinite(legHigh) || !Number.isFinite(legLow) || legHigh <= legLow) {
    legHigh = close + atr * 4;
    legLow = close - atr * 4;
  }
  const range = Math.max(legHigh - legLow, atr * 6);
  const anchor = close;

  const fibRatios = [
    { r: 0.382, label: '피보 0.382', score: 72 },
    { r: 0.5, label: '피보 0.5', score: 78 },
    { r: 0.618, label: '피보 0.618', score: 82 },
    { r: 1.0, label: '피보 1.0', score: 76 },
    { r: 1.272, label: '피보 1.272', score: 68 },
  ];
  for (const f of fibRatios) {
    pushSupport(
      out,
      {
        price: anchor - range * f.r,
        labelKo: `하방 핵심지지 · ${f.label}`,
        sourceKo: `스윙레인지 ${fmtPx(legLow)}~${fmtPx(legHigh)} 투영`,
        score: f.score,
        pureProjection: true,
      },
      close,
      atr,
      maxPct
    );
  }

  const channel = computeCandleTrendChannelGeom(params.candles, params.timeframe);
  if (channel) {
    const lowerNow = channel.lowerEnd.price;
    pushSupport(
      out,
      {
        price: lowerNow,
        labelKo: '하방 핵심지지 · 채널하단',
        sourceKo: '캔들 피벗 채널 하단선',
        score: 84,
        pureProjection: false,
      },
      close,
      atr,
      maxPct
    );
    const slope =
      (channel.lower[1].price - channel.lower[0].price) /
      Math.max(1, channel.lower[1].i - channel.lower[0].i);
    const extraBars = 12; // 4h 참조
    const deepPrice = lowerNow + slope * extraBars;
    if (deepPrice < lowerNow - atr * 0.2) {
      pushSupport(
        out,
        {
          price: deepPrice,
          labelKo: '하방 핵심지지 · 채널연장',
          sourceKo: `채널 하단 ${extraBars}봉 연장 투영`,
          score: 70,
          pureProjection: true,
        },
        close,
        atr,
        maxPct
      );
    }
  }

  const vrvp = params.vrvp;
  if (vrvp?.vaLow != null && vrvp.vaLow < close - atr * 0.1) {
    pushSupport(
      out,
      {
        price: vrvp.vaLow,
        labelKo: '하방 핵심지지 · VRVP VAL',
        sourceKo: '거래량 밸류 에어리어 하단',
        score: 80,
        pureProjection: false,
      },
      close,
      atr,
      maxPct
    );
  }
  if (vrvp?.poc != null && vrvp.poc < close - atr * 0.5) {
    pushSupport(
      out,
      {
        price: vrvp.poc,
        labelKo: '하방 핵심지지 · POC',
        sourceKo: 'VRVP POC (하방)',
        score: 74,
        pureProjection: false,
      },
      close,
      atr,
      maxPct
    );
  }

  const aiSupport = params.analysis?.aiSupportResistancePlan?.support;
  if (typeof aiSupport === 'number' && aiSupport < close - atr * 0.1) {
    pushSupport(
      out,
      {
        price: aiSupport,
        labelKo: '하방 핵심지지 · AI지지',
        sourceKo: '분석 엔진 AI 지지',
        score: 77,
        pureProjection: true,
      },
      close,
      atr,
      maxPct
    );
  }
  const supportLevel = params.analysis?.supportLevel?.price;
  if (typeof supportLevel === 'number' && supportLevel < close - atr * 0.1) {
    pushSupport(
      out,
      {
        price: supportLevel,
        labelKo: '하방 핵심지지 · 구조지지',
        sourceKo: '구조 지지 레벨',
        score: 79,
        pureProjection: false,
      },
      close,
      atr,
      maxPct
    );
  }

  for (const z of params.keyZones ?? []) {
    if (z.kind !== 'demand' || z.price >= close - atr * 0.08) continue;
    pushSupport(
      out,
      {
        id: `merged-desk-projected-support-key-${z.id}`,
        price: z.price,
        top: z.top,
        bot: z.bot,
        labelKo: `하방 핵심지지 · ${z.labelKo}`,
        sourceKo: `과거 스윙 지지 ${fmtPx(z.price)}`,
        score: 75 + Math.min(12, z.score * 2),
        pureProjection: false,
      },
      close,
      atr,
      maxPct
    );
  }

  for (const z of params.criticalZones ?? []) {
    if (z.scenario !== 'if_decline' || z.price >= close - atr * 0.08) continue;
    pushSupport(
      out,
      {
        id: `merged-desk-projected-support-critical-${z.id}`,
        price: z.price,
        top: z.top,
        bot: z.bot,
        labelKo: `하방 핵심지지 · ${z.labelKo}`,
        sourceKo: z.sources?.slice(0, 2).join(' · ') || '임계 하락 시나리오',
        score: 83 + (z.tier === 'S' ? 8 : z.tier === 'A' ? 4 : 0),
        pureProjection: false,
      },
      close,
      atr,
      maxPct
    );
  }

  const downBounce = (params.bounceScenarios ?? []).find((s) => s.direction === 'down');
  for (const t of downBounce?.targets ?? []) {
    if (t.price >= close - atr * 0.08) continue;
    pushSupport(
      out,
      {
        price: t.price,
        labelKo: `하방 핵심지지 · ${t.label}`,
        sourceKo: t.sourceKo,
        score: 71,
        pureProjection: true,
      },
      close,
      atr,
      maxPct
    );
  }

  for (const w of params.whaleMemoryZones ?? []) {
    const mid = (w.price1 + w.price2) / 2;
    if (mid >= close - atr * 0.08) continue;
    pushSupport(
      out,
      {
        price: mid,
        labelKo: '하방 핵심지지 · 고래메모리',
        sourceKo: '고래 메모리 수요',
        score: 73,
        pureProjection: false,
      },
      close,
      atr,
      maxPct
    );
  }

  const swingLows: Array<{ price: number; i: number }> = [];
  for (let i = 3; i < work.length - 3; i++) {
    const lo = work[i]!.low;
    if (work[i - 1]!.low <= lo || work[i - 2]!.low <= lo) continue;
    if (work[i + 1]!.low < lo || work[i + 2]!.low < lo) continue;
    if (lo < close - atr * 0.15) swingLows.push({ price: lo, i });
  }
  swingLows.sort((a, b) => b.price - a.price);
  for (const s of swingLows.slice(0, 8)) {
    pushSupport(
      out,
      {
        price: s.price,
        labelKo: '하방 핵심지지 · 스윙저점',
        sourceKo: '가시 구간 스윙 저점',
        score: 80,
        pureProjection: false,
        time1: Number(work[s.i]!.time),
      },
      close,
      atr,
      maxPct
    );
  }

  /** 점수 상위만 고르면 멀리 $$$$롱만 남음 → 가까운·중간·깊은 사다리 */
  const gap = Math.max(atr * 0.85, close * 0.018);
  const byNear = [...out].sort(
    (a, b) => b.price - a.price || b.score - a.score
  );
  const ladder: ProjectedDownsideSupport[] = [];
  for (const z of byNear) {
    if (ladder.some((p) => Math.abs(p.price - z.price) < gap)) continue;
    ladder.push(z);
    if (ladder.length >= 3) break;
  }
  return ladder;
}

export function buildProjectedDownsideSupportOverlays(
  candles: Candle[],
  timeframe: string,
  supports: ProjectedDownsideSupport[],
  _zoneCtx?: import('@/lib/mergedAnalysisOverlayTimes').MergedDeskAnalysisZoneContext | null
): OverlayItem[] {
  if (!supports.length || candles.length < 2) return [];
  const tf = normalizeChartTimeframe(timeframe);
  const work = mergedWorkCandles(candles, tf);
  const out: OverlayItem[] = [];

  supports.forEach((z, idx) => {
    const rank = idx + 1;
    const formT = findMergedDeskZoneFormationBarTime(work, z.top, z.bot, z.time1 ?? null);
    const zoneTimes = mergedDeskAnalyzedZoneSpanTimes(work, {
      id: z.id,
      time1: formT,
      price1: z.top,
      price2: z.bot,
    });
    if (!zoneTimes) return;
    const projTag = z.pureProjection ? '투영' : '구조';
    const faceSignal = rank === 1 ? '근접' : rank === 2 ? '다음' : '심층';
    out.push({
      id: z.id,
      kind: 'demandZone',
      label: `선포착지지${rank}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: zoneTimes.t1 as UTCTimestamp,
      time2: zoneTimes.t2 as UTCTimestamp,
      price1: z.top,
      price2: z.bot,
      confidence: Math.min(94, 68 + Math.round(z.score * 0.22)),
      color: z.pureProjection ? 'rgba(167,139,250,0.28)' : 'rgba(45,212,191,0.30)',
      category: 'zones',
      zoneFillPreserve: true,
      zonePulse: rank === 1,
      zoneSpanOnly: false,
      structureBias: 'bullish',
      zoneFaceBase: '선포착지지',
      zoneFaceSignal: faceSignal,
      zoneFaceDetailKo: `${z.labelKo} · ${fmtPx(z.bot)}~${fmtPx(z.top)} · ${z.sourceKo} (${projTag} · 참고·승률 아님)`,
      zoneFaceLang: 'ko',
      overlayZoneExtraClass: [
        'merged-desk-projected-support',
        'merged-desk-precapture-zone',
        'merged-desk-support-rebound',
        MERGED_ARES_ZONE_CAPTION_CLASS,
        z.pureProjection ? 'merged-desk-projected-support--math' : 'merged-desk-projected-support--hist',
        `merged-desk-projected-support--r${rank}`,
      ].join(' '),
      lineLabelColor: z.pureProjection ? '#c4b5fd' : '#5eead4',
      labelBackgroundColor: z.pureProjection ? 'rgba(76,29,149,0.92)' : 'rgba(6,78,59,0.92)',
      labelTextColor: '#f8fafc',
      labelTooltip: `${z.labelKo} · ${z.sourceKo} (${projTag} · 조건부 참고)`,
    });
  });
  return out;
}

export function summarizeProjectedDownsideSupportsKo(
  supports: ProjectedDownsideSupport[]
): string {
  if (!supports.length) return '하방 핵심지지 투영 — 구간 없음';
  const top3 = supports
    .slice(0, 3)
    .map((z) => `${fmtPx(z.price)}${z.pureProjection ? '(투영)' : ''}`)
    .join(' → ');
  return `선포착 하방지지 ${top3}`;
}

export function buildMergedDeskProjectedDownsidePack(params: {
  candles: Candle[];
  timeframe: string;
  keyZones?: MergedKeyZone[];
  criticalZones?: MergedCriticalZone[];
  bounceScenarios?: MergedBounceScenario[];
  vrvp?: VrvpRef;
  analysis?: AnalyzeResponse | null;
  whaleMemoryZones?: Array<{ price1: number; price2: number; confidence?: number }>;
}): {
  supports: ProjectedDownsideSupport[];
  summaryKo: string;
  overlays: OverlayItem[];
} {
  const supports = detectProjectedDownsideSupports(params);
  const active = params.bounceScenarios?.find((s) => s.active) ?? params.bounceScenarios?.[0];
  const zoneCtx = active
    ? {
        anchorTime: active.anchorTime,
        legHigh: active.legHigh,
        legLow: active.legLow,
        direction: active.direction,
      }
    : null;
  return {
    supports,
    summaryKo: summarizeProjectedDownsideSupportsKo(supports),
    overlays: buildProjectedDownsideSupportOverlays(
      params.candles,
      params.timeframe,
      supports,
      zoneCtx
    ),
  };
}
