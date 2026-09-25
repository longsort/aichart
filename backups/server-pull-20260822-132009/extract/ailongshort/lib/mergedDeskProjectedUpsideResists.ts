/**
 * 통합·분석 — 상승 시 상방 핵심 저항 zone 투영.
 * 목표 가격에 과거 캔들이 없어도 스윙·피보·채널·VRVP·구조로 zone 표시 (조건부 참고).
 * 하방 핵심지지(`mergedDeskProjectedDownsideSupports`)의 대칭.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { MergedBounceScenario } from '@/lib/mergedAnalysisBounceTargets';
import type { MergedCriticalZone } from '@/lib/mergedAnalysisCriticalZones';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import {
  mergedDeskAnalysisZoneTimes,
  mergedAnalysisChartZoneTimesSnapped,
  mergedWorkCandles,
  MERGED_ARES_ZONE_CAPTION_CLASS,
} from '@/lib/mergedAnalysisOverlayTimes';
import { computeCandleTrendChannelGeom } from '@/lib/mergedDeskCandleTrendline';

type VrvpRef = { poc?: number | null; vaLow?: number | null; vaHigh?: number | null } | null;

export type ProjectedUpsideResist = {
  id: string;
  price: number;
  top: number;
  bot: number;
  labelKo: string;
  sourceKo: string;
  score: number;
  /** true = 해당 가격대 캔들 없이 수학 투영 */
  pureProjection: boolean;
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

function maxUpsidePct(_timeframe?: string): number {
  return 32;
}

function zonePad(atr: number, price: number): { top: number; bot: number } {
  const rel = Math.max(atr * 0.42, Math.abs(price) * 0.004);
  return { top: rel * 0.55, bot: rel * 0.45 };
}

function pushResist(
  list: ProjectedUpsideResist[],
  row: {
    id?: string;
    price: number;
    top?: number;
    bot?: number;
    labelKo: string;
    sourceKo: string;
    score: number;
    pureProjection: boolean;
  },
  close: number,
  atr: number,
  maxPct: number
): void {
  if (!Number.isFinite(row.price) || row.price <= 0 || row.price <= close + atr * 0.08) return;
  const distPct = ((row.price - close) / Math.max(close, 1e-9)) * 100;
  if (distPct < 0.4 || distPct > maxPct) return;
  const pad = zonePad(atr, row.price);
  const top = row.top ?? row.price + pad.top;
  const bot = row.bot ?? row.price - pad.bot;
  const id =
    row.id ??
    `merged-desk-projected-resist-${row.labelKo.replace(/\s+/g, '-')}-${Math.round(row.price)}`;
  const tol = Math.max(atr * 0.38, close * 0.006);
  const existing = list.find((z) => Math.abs(z.price - row.price) <= tol);
  if (existing) {
    existing.score = Math.max(existing.score, row.score);
    existing.sourceKo = `${existing.sourceKo} · ${row.sourceKo}`;
    existing.pureProjection = existing.pureProjection && row.pureProjection;
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
  });
}

export function detectProjectedUpsideResists(params: {
  candles: Candle[];
  timeframe: string;
  keyZones?: MergedKeyZone[];
  criticalZones?: MergedCriticalZone[];
  bounceScenarios?: MergedBounceScenario[];
  vrvp?: VrvpRef;
  analysis?: AnalyzeResponse | null;
  whaleMemoryZones?: Array<{ price1: number; price2: number; confidence?: number }>;
}): ProjectedUpsideResist[] {
  const tf = normalizeChartTimeframe(params.timeframe);
  const work = mergedWorkCandles(params.candles, tf);
  if (work.length < 24) return [];

  const close = work[work.length - 1]!.close;
  const atr = estimateAtr(work, work.length - 1);
  const maxPct = maxUpsidePct(tf);
  const out: ProjectedUpsideResist[] = [];

  let legHigh = -Infinity;
  let legLow = Infinity;
  const look = Math.min(work.length, 120);
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
    pushResist(
      out,
      {
        price: anchor + range * f.r,
        labelKo: `상방 핵심저항 · ${f.label}`,
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
    const upperNow = channel.upperEnd.price;
    pushResist(
      out,
      {
        price: upperNow,
        labelKo: '상방 핵심저항 · 채널상단',
        sourceKo: '캔들 피벗 채널 상단선',
        score: 84,
        pureProjection: false,
      },
      close,
      atr,
      maxPct
    );
    const slope =
      (channel.upper[1].price - channel.upper[0].price) /
      Math.max(1, channel.upper[1].i - channel.upper[0].i);
    const extraBars = 12;
    const highPrice = upperNow + slope * extraBars;
    if (highPrice > upperNow + atr * 0.2) {
      pushResist(
        out,
        {
          price: highPrice,
          labelKo: '상방 핵심저항 · 채널연장',
          sourceKo: `채널 상단 ${extraBars}봉 연장 투영`,
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
  if (vrvp?.vaHigh != null && vrvp.vaHigh > close + atr * 0.1) {
    pushResist(
      out,
      {
        price: vrvp.vaHigh,
        labelKo: '상방 핵심저항 · VRVP VAH',
        sourceKo: '거래량 밸류 에어리어 상단',
        score: 80,
        pureProjection: false,
      },
      close,
      atr,
      maxPct
    );
  }
  if (vrvp?.poc != null && vrvp.poc > close + atr * 0.5) {
    pushResist(
      out,
      {
        price: vrvp.poc,
        labelKo: '상방 핵심저항 · POC',
        sourceKo: 'VRVP POC (상방)',
        score: 74,
        pureProjection: false,
      },
      close,
      atr,
      maxPct
    );
  }

  const aiResist = params.analysis?.aiSupportResistancePlan?.resistance;
  if (typeof aiResist === 'number' && aiResist > close + atr * 0.1) {
    pushResist(
      out,
      {
        price: aiResist,
        labelKo: '상방 핵심저항 · AI저항',
        sourceKo: '분석 엔진 AI 저항',
        score: 77,
        pureProjection: true,
      },
      close,
      atr,
      maxPct
    );
  }
  const resistLevel = params.analysis?.resistanceLevel?.price;
  if (typeof resistLevel === 'number' && resistLevel > close + atr * 0.1) {
    pushResist(
      out,
      {
        price: resistLevel,
        labelKo: '상방 핵심저항 · 구조저항',
        sourceKo: '구조 저항 레벨',
        score: 79,
        pureProjection: false,
      },
      close,
      atr,
      maxPct
    );
  }

  for (const z of params.keyZones ?? []) {
    if (z.kind !== 'supply' || z.price <= close + atr * 0.08) continue;
    pushResist(
      out,
      {
        id: `merged-desk-projected-resist-key-${z.id}`,
        price: z.price,
        top: z.top,
        bot: z.bot,
        labelKo: `상방 핵심저항 · ${z.labelKo}`,
        sourceKo: `과거 스윙 저항 ${fmtPx(z.price)}`,
        score: 75 + Math.min(12, z.score * 2),
        pureProjection: false,
      },
      close,
      atr,
      maxPct
    );
  }

  for (const z of params.criticalZones ?? []) {
    if (z.scenario !== 'if_rally' || z.price <= close + atr * 0.08) continue;
    pushResist(
      out,
      {
        id: `merged-desk-projected-resist-critical-${z.id}`,
        price: z.price,
        top: z.top,
        bot: z.bot,
        labelKo: `상방 핵심저항 · ${z.labelKo}`,
        sourceKo: z.sources?.slice(0, 2).join(' · ') || '임계 상승 시나리오',
        score: 83 + (z.tier === 'S' ? 8 : z.tier === 'A' ? 4 : 0),
        pureProjection: false,
      },
      close,
      atr,
      maxPct
    );
  }

  const upBounce = (params.bounceScenarios ?? []).find((s) => s.direction === 'up');
  for (const t of upBounce?.targets ?? []) {
    if (t.price <= close + atr * 0.08) continue;
    pushResist(
      out,
      {
        price: t.price,
        labelKo: `상방 핵심저항 · ${t.label}`,
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
    if (mid <= close + atr * 0.08) continue;
    pushResist(
      out,
      {
        price: mid,
        labelKo: '상방 핵심저항 · 고래메모리',
        sourceKo: '고래 메모리 공급',
        score: 73,
        pureProjection: false,
      },
      close,
      atr,
      maxPct
    );
  }

  const swingHighs: Array<{ price: number; i: number }> = [];
  for (let i = 3; i < work.length - 3; i++) {
    const hi = work[i]!.high;
    if (work[i - 1]!.high >= hi || work[i - 2]!.high >= hi) continue;
    if (work[i + 1]!.high > hi || work[i + 2]!.high > hi) continue;
    if (hi > close + atr * 0.15) swingHighs.push({ price: hi, i });
  }
  swingHighs.sort((a, b) => a.price - b.price);
  for (const s of swingHighs.slice(0, 4)) {
    pushResist(
      out,
      {
        price: s.price,
        labelKo: '상방 핵심저항 · 스윙고점',
        sourceKo: '가시 구간 스윙 고점',
        score: 76,
        pureProjection: false,
      },
      close,
      atr,
      maxPct
    );
  }

  const gap = Math.max(atr * 0.55, close * 0.012);
  const ranked = out
    .sort((a, b) => b.score - a.score || a.price - b.price)
    .filter((z, _i, arr) => {
      const nearerLower = arr.some(
        (o) => o !== z && o.price < z.price && Math.abs(o.price - z.price) < gap && o.score >= z.score - 4
      );
      return !nearerLower;
    });

  const cap = 3;
  return ranked.slice(0, cap).sort((a, b) => a.price - b.price);
}

export function buildProjectedUpsideResistOverlays(
  candles: Candle[],
  timeframe: string,
  resists: ProjectedUpsideResist[],
  zoneCtx?: import('@/lib/mergedAnalysisOverlayTimes').MergedDeskAnalysisZoneContext | null
): OverlayItem[] {
  if (!resists.length || candles.length < 2) return [];
  const tf = normalizeChartTimeframe(timeframe);
  const work = mergedWorkCandles(candles, tf);
  const { t1, t2 } = zoneCtx
    ? mergedDeskAnalysisZoneTimes(work, tf, zoneCtx)
    : mergedAnalysisChartZoneTimesSnapped(work, tf) ?? mergedDeskAnalysisZoneTimes(work, tf, null);
  const out: OverlayItem[] = [];

  for (const z of resists) {
    const projTag = z.pureProjection ? '투영' : '구조';
    out.push({
      id: z.id,
      kind: 'supplyZone',
      label: `핵심 저항 ${fmtPx(z.price)}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: z.top,
      price2: z.bot,
      confidence: Math.min(94, 68 + Math.round(z.score * 0.22)),
      color: z.pureProjection ? 'rgba(251,146,60,0.16)' : 'rgba(248,113,113,0.14)',
      category: 'scenario',
      zoneFillPreserve: true,
      lineDash: z.pureProjection ? '8 6' : undefined,
      overlayZoneExtraClass: [
        'merged-desk-projected-resist',
        'merged-desk-support-rebound',
        'merged-ares-key-zone',
        MERGED_ARES_ZONE_CAPTION_CLASS,
        z.pureProjection ? 'merged-desk-projected-resist--math' : 'merged-desk-projected-resist--hist',
      ].join(' '),
      lineLabelColor: z.pureProjection ? '#fdba74' : '#fca5a5',
      labelBackgroundColor: z.pureProjection ? 'rgba(124,45,18,0.92)' : 'rgba(127,29,29,0.92)',
      labelTextColor: '#f8fafc',
      labelTooltip: `${z.labelKo} · ${z.sourceKo} (${projTag} · 조건부 참고)`,
    });
    out.push({
      id: `${z.id}-pin`,
      kind: 'label',
      label: `▲ ${fmtPx(z.price)}`,
      x1: 0.92,
      y1: 0.5,
      time1: t2 as UTCTimestamp,
      price1: z.price,
      confidence: 88,
      color: z.pureProjection ? '#fb923c' : '#f87171',
      labelBackgroundColor: z.pureProjection ? 'rgba(124,45,18,0.9)' : 'rgba(127,29,29,0.9)',
      labelTextColor: '#f8fafc',
      category: 'labels',
      overlayZoneExtraClass: 'merged-desk-projected-resist-pin',
      labelTooltip: `${z.labelKo} · ${z.sourceKo}`,
    });
  }
  return out;
}

export function summarizeProjectedUpsideResistsKo(resists: ProjectedUpsideResist[]): string {
  if (!resists.length) return '상방 핵심저항 투영 — 구간 없음';
  const top3 = resists
    .slice(0, 3)
    .map((z) => `${fmtPx(z.price)}${z.pureProjection ? '(투영)' : ''}`)
    .join(' → ');
  return `상방 핵심저항 ${top3}`;
}

export function buildMergedDeskProjectedUpsidePack(params: {
  candles: Candle[];
  timeframe: string;
  keyZones?: MergedKeyZone[];
  criticalZones?: MergedCriticalZone[];
  bounceScenarios?: MergedBounceScenario[];
  vrvp?: VrvpRef;
  analysis?: AnalyzeResponse | null;
  whaleMemoryZones?: Array<{ price1: number; price2: number; confidence?: number }>;
}): {
  resists: ProjectedUpsideResist[];
  summaryKo: string;
  overlays: OverlayItem[];
} {
  const resists = detectProjectedUpsideResists(params);
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
    resists,
    summaryKo: summarizeProjectedUpsideResistsKo(resists),
    overlays: buildProjectedUpsideResistOverlays(
      params.candles,
      params.timeframe,
      resists,
      zoneCtx
    ),
  };
}
