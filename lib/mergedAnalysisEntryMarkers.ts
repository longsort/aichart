/**
 * 통합·분석 — zone 터치 진입 · directionConfirm · MTF stack · sweep-reclaim 차트 마커.
 * 조건부 참고용 — 확정 수익·투자 권유 아님.
 */
import type { AnalyzeResponse, Candle } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { AtlasPulseMarker } from '@/lib/monthDeskAtlasPulseDesk';
import type { MonthDeskStrikeDeskBundle } from '@/lib/monthDeskStrikeDesk';
import type { MergedCriticalZone } from '@/lib/mergedAnalysisCriticalZones';
import type { MergedDirectionConfirm } from '@/lib/mergedAnalysisDirectionConfirm';
import {
  buildMergedLeadingCandleMarkers,
  prioritizeMergedLeadingMarkers,
  scanMergedLeadingCandleSignals,
} from '@/lib/mergedAnalysisLeadingSignals';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import { mergedWorkCandles } from '@/lib/mergedAnalysisOverlayTimes';
import { mergedLeadingBarExtremes, mergedLeadingBreakAbove, mergedLeadingBreakBelow } from '@/lib/mergedAnalysisLeadingBar';
import type { MergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';
import {
  buildMergedDeskCandleEventVerdictPack,
  candleEventMarkerText,
  type CandleEventVerdictPack,
} from '@/lib/mergedDeskCandleEventVerdict';
import type { HqEntryZone } from '@/lib/mergedDeskHqEntryZones';
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';

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

function dedupeMarkers(items: AtlasPulseMarker[]): AtlasPulseMarker[] {
  const seen = new Set<string>();
  const out: AtlasPulseMarker[] = [];
  for (const m of items) {
    const key = String(m.id || `${m.time}-${m.text}-${m.position}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

function zoneTouchAtBarLocal(
  bar: Candle,
  isLast: boolean,
  direction: 'LONG' | 'SHORT',
  keyZones: MergedKeyZone[],
  criticalZones: MergedCriticalZone[],
  atr: number
): MergedKeyZone | MergedCriticalZone | null {
  const ex = mergedLeadingBarExtremes(bar, isLast);
  const px = direction === 'LONG' ? ex.low : ex.high;
  const pad = atr * 0.08;

  for (const z of criticalZones) {
    if (direction === 'LONG' && z.kind !== 'demand') continue;
    if (direction === 'SHORT' && z.kind !== 'supply') continue;
    if (px >= z.bot - pad && px <= z.top + pad) return z;
  }
  for (const z of keyZones) {
    if (direction === 'LONG' && z.kind !== 'demand') continue;
    if (direction === 'SHORT' && z.kind !== 'supply') continue;
    if (px >= z.bot - pad && px <= z.top + pad) return z;
  }
  return null;
}

/** 존 터치 — zone gate + confirm 연동 B/S·⚡ 마커 */
export function buildMergedZoneTouchEntryMarkers(params: {
  candles: Candle[];
  timeframe: string;
  keyZones: MergedKeyZone[];
  criticalZones: MergedCriticalZone[];
  directionConfirms: MergedDirectionConfirm[];
}): AtlasPulseMarker[] {
  const source = mergedWorkCandles(params.candles, params.timeframe);
  if (source.length < 12) return [];

  const tf = normalizeChartTimeframe(params.timeframe);
  const spacing = mtfMinSpacingBars(tf);
  const maxMarks = 10; // 4h 참조 — 전 TF 동일
  const lookback = Math.min(source.length, 72); // 4h 참조
  const startIdx = Math.max(0, source.length - lookback);

  const confirmByTime = new Map<number, MergedDirectionConfirm>();
  for (const c of params.directionConfirms) {
    const prev = confirmByTime.get(c.time);
    if (!prev || c.gatesPassCount > prev.gatesPassCount) confirmByTime.set(c.time, c);
  }

  type Cand = { time: number; direction: 'LONG' | 'SHORT'; score: number; confirmed: boolean; hot: boolean };
  const candidates: Cand[] = [];

  for (let idx = startIdx; idx < source.length; idx++) {
    const bar = source[idx]!;
    const time = Number(bar.time);
    if (!Number.isFinite(time)) continue;
    const isLast = idx === source.length - 1;
    const atr = estimateAtr(source, idx);
    const confirm = confirmByTime.get(time);

    for (const dir of ['LONG', 'SHORT'] as const) {
      const touched = zoneTouchAtBarLocal(
        bar,
        isLast,
        dir,
        params.keyZones,
        params.criticalZones,
        atr
      );
      if (!touched) continue;

      const gatesPass = confirm?.gatesPassCount ?? 0;
      if (gatesPass < 3 && confirm?.direction !== dir) continue;
      if (confirm && confirm.direction !== dir && confirm.tier === 'confirmed') continue;

      const confirmed = confirm?.tier === 'confirmed' && confirm.direction === dir;
      const hot = confirm?.tier === 'strong' && confirm.direction === dir;
      if (!confirmed && !hot && gatesPass < 3) continue;

      const tierBoost = 'tier' in touched && touched.tier === 'S' ? 18 : 'tier' in touched ? 10 : 6;
      candidates.push({
        time,
        direction: dir,
        score: gatesPass * 5 + tierBoost + (confirmed ? 30 : hot ? 18 : 0),
        confirmed,
        hot,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.time - a.time);

  const out: AtlasPulseMarker[] = [];
  const usedTimes: number[] = [];

  for (const c of candidates) {
    if (out.length >= maxMarks) break;
    if (usedTimes.some((t) => Math.abs(c.time - t) < spacing * barSec(tf))) continue;

    const long = c.direction === 'LONG';
    const text = c.confirmed ? (long ? '🛒' : '⚡') : c.hot ? (long ? 'B' : 'S') : long ? 'B' : 'S';

    out.push({
      time: c.time as UTCTimestamp,
      position: long ? 'belowBar' : 'aboveBar',
      shape: c.confirmed || c.hot ? 'square' : 'circle',
      color: c.confirmed
        ? long
          ? '#22c55e'
          : '#ef4444'
        : long
          ? '#22d3ee'
          : '#fb7185',
      text,
      size: c.confirmed ? 2 : c.hot ? 2 : 1,
      id: `merged-zte-${c.direction.toLowerCase()}-${c.time}`,
    });
    usedTimes.push(c.time);
  }

  return out;
}

/** HTF critical(S/A) + 확정·HOT 진입만 — 희소·티어 표기 (1D★ / 1W◈) */
export function buildMergedMtfStackMarkers(params: {
  candles: Candle[];
  timeframe: string;
  criticalZones: MergedCriticalZone[];
  directionConfirms: MergedDirectionConfirm[];
  leadingSignals?: ReturnType<typeof scanMergedLeadingCandleSignals>;
}): AtlasPulseMarker[] {
  const htfCritical = params.criticalZones.filter(
    (z) => z.htfLabel && (z.tier === 'S' || (z.tier === 'A' && z.confluenceCount >= 4))
  );
  if (!htfCritical.length) return [];

  const source = mergedWorkCandles(params.candles, params.timeframe);
  const tf = normalizeChartTimeframe(params.timeframe);
  const spacing = mtfMinSpacingBars(tf);
  const maxMarks = 8; // 4h 참조 — 전 TF 동일

  type Cand = {
    time: number;
    direction: 'LONG' | 'SHORT';
    score: number;
    htfTag: string;
    tier: 'S' | 'A';
    hot: boolean;
    confirmed: boolean;
  };
  const candidates: Cand[] = [];

  const confirmByTime = new Map<number, MergedDirectionConfirm>();
  for (const c of params.directionConfirms) {
    if (c.tier === 'confirmed') confirmByTime.set(c.time, c);
  }

  const hotTouch = new Set<number>();
  for (const s of params.leadingSignals ?? []) {
    if (s.tier === 'confirmed' || s.tier === 'strong') hotTouch.add(s.time);
  }
  for (const c of params.directionConfirms) {
    if (c.tier === 'confirmed' || c.tier === 'strong') hotTouch.add(c.time);
  }

  const eventTimes = new Set<number>([...confirmByTime.keys(), ...hotTouch]);

  for (const time of eventTimes) {
    if (!Number.isFinite(time)) continue;
    const barIdx = source.findIndex((c) => Number(c.time) === time);
    if (barIdx < 0) continue;
    const bar = source[barIdx]!;
    const confirm = confirmByTime.get(time);
    const hot = hotTouch.has(time);
    const dir =
      confirm?.direction ??
      (hot
        ? params.leadingSignals?.find((s) => s.time === time)?.direction ??
          params.directionConfirms.find((x) => x.time === time)?.direction ??
          null
        : null);
    if (dir !== 'LONG' && dir !== 'SHORT') continue;

    const isLast = barIdx === source.length - 1;
    const ex = mergedLeadingBarExtremes(bar, isLast);
    const px = dir === 'LONG' ? ex.low : ex.high;
    const atr = estimateAtr(source, barIdx);

    let bestZone: MergedCriticalZone | null = null;
    let bestScore = 0;
    for (const z of htfCritical) {
      if (dir === 'LONG' && z.kind !== 'demand') continue;
      if (dir === 'SHORT' && z.kind !== 'supply') continue;
      const inside = px >= z.bot - atr * 0.06 && px <= z.top + atr * 0.06;
      if (!inside) continue;
      const zs =
        (z.tier === 'S' ? 28 : 12) +
        z.confluenceCount * 4 +
        (z.isPrimary ? 8 : 0) +
        Math.max(0, 12 - closeDistPct(bar.close, z.price));
      if (zs > bestScore) {
        bestScore = zs;
        bestZone = z;
      }
    }
    if (!bestZone) continue;

    const confirmed = confirm?.tier === 'confirmed';
    if (!confirmed && !hot) continue;

    candidates.push({
      time,
      direction: dir,
      score:
        bestScore + (confirmed ? 36 : 0) + (hot ? 22 : 0) + (confirm?.gatesPassCount ?? 0) * 3,
      htfTag: String(bestZone.htfLabel || 'HTF').replace(/^HTF/i, '').toUpperCase() || 'HTF',
      tier: bestZone.tier === 'S' ? 'S' : 'A',
      hot,
      confirmed,
    });
  }

  candidates.sort((a, b) => b.score - a.score || b.time - a.time);

  const out: AtlasPulseMarker[] = [];
  const usedTimes: number[] = [];

  for (const c of candidates) {
    if (out.length >= maxMarks) break;
    if (usedTimes.some((t) => Math.abs(c.time - t) < spacing * barSec(tf))) continue;

    const long = c.direction === 'LONG';
    const premium = c.tier === 'S' && (c.confirmed || c.hot);
    const glyph = c.confirmed ? '★' : c.hot ? '◈' : '·';
    const label = `${c.htfTag}${glyph}`;

    out.push({
      time: c.time as UTCTimestamp,
      position: long ? 'belowBar' : 'aboveBar',
      shape: premium ? 'square' : 'circle',
      color: premium
        ? long
          ? c.confirmed
            ? '#fde047'
            : '#2dd4bf'
          : c.confirmed
            ? '#fb923c'
            : '#f472b6'
        : long
          ? '#64748b'
          : '#78716c',
      text: label,
      size: premium ? 2 : 1,
      id: `merged-mtf-stack-${c.direction.toLowerCase()}-${c.time}-${c.htfTag}`,
    });
    usedTimes.push(c.time);
  }

  return out;
}

function closeDistPct(close: number, level: number): number {
  return (Math.abs(close - level) / Math.max(Math.abs(close), 1e-9)) * 100;
}

function barSec(tf: string): number {
  const map: Record<string, number> = {
    '1m': 60,
    '3m': 180,
    '5m': 300,
    '15m': 900,
    '1h': 3600,
    '4h': 14_400,
    '1d': 86_400,
    '1w': 604_800,
    '1M': 2_592_000,
  };
  return map[normalizeChartTimeframe(tf)] ?? 3600;
}

function mtfMinSpacingBars(tf: string): number {
  const map: Record<string, number> = {
    '1m': 28,
    '3m': 24,
    '5m': 20,
    '15m': 16,
    '1h': 12,
    '4h': 10,
    '1d': 6,
    '1w': 3,
    '1M': 2,
  };
  return map[tf] ?? 10;
}

/** 유동성 스weep 후 BOS/CHoCH — ◆ 마커 */
export function buildMergedSweepReclaimMarkers(params: {
  candles: Candle[];
  timeframe: string;
  smcLeading: MergedSmcLeadingContext;
}): AtlasPulseMarker[] {
  const source = mergedWorkCandles(params.candles, params.timeframe);
  if (source.length < 24 || !params.smcLeading.marks.length) return [];

  const out: AtlasPulseMarker[] = [];
  const L = normalizeChartTimeframe(params.timeframe) === '1M' ? 2 : 3;

  for (const mark of params.smcLeading.marks) {
    if (mark.tag !== 'CHOCH' && mark.tag !== 'BOS') continue;
    const idx = mark.index;
    if (idx < L + 3 || idx >= source.length) continue;

    let swingRef = mark.bias === 'bullish' ? Infinity : -Infinity;
    for (let j = Math.max(0, idx - 14); j < idx - 1; j++) {
      if (mark.bias === 'bullish') swingRef = Math.min(swingRef, source[j]!.low);
      else swingRef = Math.max(swingRef, source[j]!.high);
    }
    if (!Number.isFinite(swingRef)) continue;

    const breakBar = source[idx]!;
    const prior = source[idx - 1]!;
    const isLast = idx === source.length - 1;
    let swept = false;
    if (mark.bias === 'bullish') {
      const reclaim = isLast
        ? mergedLeadingBreakAbove(breakBar, swingRef, true)
        : breakBar.close > swingRef;
      swept = prior.low < swingRef - estimateAtr(source, idx) * 0.05 && reclaim;
    } else {
      const reclaim = isLast
        ? mergedLeadingBreakBelow(breakBar, swingRef, true)
        : breakBar.close < swingRef;
      swept = prior.high > swingRef + estimateAtr(source, idx) * 0.05 && reclaim;
    }
    if (!swept) continue;

    const t = Number(breakBar.time) as UTCTimestamp;
    const long = mark.bias === 'bullish';
    out.push({
      time: t,
      position: long ? 'belowBar' : 'aboveBar',
      shape: 'circle',
      color: long ? '#2dd4bf' : '#f472b6',
      text: '◆',
      size: mark.developing ? 2 : 1,
      id: `merged-sweep-${mark.tag.toLowerCase()}-${long ? 'long' : 'short'}-${t}`,
    });
  }

  return out.slice(0, 32);
}

function trimPerBarMarkers(markers: AtlasPulseMarker[]): AtlasPulseMarker[] {
  const mtfTimes = new Set(
    markers
      .filter((m) => String(m.id || '').startsWith('merged-mtf-stack-'))
      .map((m) => Number(m.time))
      .filter(Number.isFinite)
  );
  if (!mtfTimes.size) return markers;
  return markers.filter((m) => {
    const t = Number(m.time);
    if (!mtfTimes.has(t)) return true;
    const id = String(m.id || '');
    const tx = String(m.text || '');
    if (id.includes('confirm') && (tx === '롱+' || tx === '숏+' || tx === '롱확' || tx === '숏확')) return false;
    if (id.startsWith('merged-zte-') && (tx === 'B' || tx === 'S')) return false;
    return true;
  });
}

/** 통합·분석 차트 — 선반영 L/S 단일 엔진 + MTF · sweep · 캔들이벤트 */
export function buildMergedDeskChartMarkers(params: {
  bundle: MonthDeskStrikeDeskBundle;
  candles: Candle[];
  timeframe: string;
  analysis?: AnalyzeResponse | null;
  keyZones: MergedKeyZone[];
  criticalZones: MergedCriticalZone[];
  directionConfirms: MergedDirectionConfirm[];
  smcLeading: MergedSmcLeadingContext;
  symbol?: string;
  dumpZones?: MtfDumpZoneSpec[] | null;
  hqZones?: HqEntryZone[] | null;
  /** 외부에서 이미 산출한 팩 재사용 */
  candleEventPack?: CandleEventVerdictPack | null;
}): AtlasPulseMarker[] {
  const leadingSignals = scanMergedLeadingCandleSignals({
    candles: params.candles,
    timeframe: params.timeframe,
    keyZones: params.keyZones,
    criticalZones: params.criticalZones,
    bundle: params.bundle,
    analysis: params.analysis,
    confirms: params.directionConfirms,
  });
  const leadingMarks = buildMergedLeadingCandleMarkers(leadingSignals);
  const zoneTouch = buildMergedZoneTouchEntryMarkers({
    candles: params.candles,
    timeframe: params.timeframe,
    keyZones: params.keyZones,
    criticalZones: params.criticalZones,
    directionConfirms: params.directionConfirms,
  });

  const mtf = buildMergedMtfStackMarkers({
    candles: params.candles,
    timeframe: params.timeframe,
    criticalZones: params.criticalZones,
    directionConfirms: params.directionConfirms,
    leadingSignals,
  });
  const sweep = buildMergedSweepReclaimMarkers({
    candles: params.candles,
    timeframe: params.timeframe,
    smcLeading: params.smcLeading,
  });

  const candleEvents =
    params.candleEventPack ??
    buildMergedDeskCandleEventVerdictPack({
      candles: params.candles,
      timeframe: params.timeframe,
      symbol: params.symbol,
      dumpZones: params.dumpZones,
      hqZones: params.hqZones,
      keyZones: params.keyZones,
      criticalZones: params.criticalZones,
    });

  const eventMarks: AtlasPulseMarker[] = [];
  for (const e of candleEvents.events.filter((x) => x.isLastBar || x.phase !== 'WATCH').slice(-8)) {
    const longBias =
      e.kind === 'SWEEP_RECLAIM' || e.kind === 'SUPPORT_BOUNCE' || e.kind === 'BREAK_SETTLE';
    const fail = e.phase === 'FAIL_REF' || e.kind === 'BREAK_REJECT';
    eventMarks.push({
      time: e.time as UTCTimestamp,
      position: longBias && !fail ? 'belowBar' : 'aboveBar',
      shape: e.kind.startsWith('BREAK') ? 'square' : 'circle',
      color: fail
        ? '#f87171'
        : e.phase === 'OK_REF'
          ? '#34d399'
          : e.kind === 'SUPPORT_BOUNCE'
            ? '#38bdf8'
            : '#fbbf24',
      text: candleEventMarkerText(e.kind, e.phase, e.isLastBar),
      size: e.isLastBar || e.phase === 'OK_REF' || e.phase === 'FAIL_REF' ? 2 : 1,
      id: `merged-candle-event-${e.kind}-${e.phase}-${e.time}`,
    });
  }

  return prioritizeMergedLeadingMarkers(
    trimPerBarMarkers(
      dedupeMarkers([...leadingMarks, ...zoneTouch, ...mtf, ...sweep, ...eventMarks])
    )
  );
}

