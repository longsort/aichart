/**
 * 통합·분석 — ST 구름(상·하한 리본) ↔ 롱/숏 시그널.
 * 구름 채움과 동일 융합 코어 — 조건부 참고, 확정 수익·투자 권유 아님.
 */
import type { Candle } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { AtlasPulseMarker } from '@/lib/monthDeskAtlasPulseDesk';
import {
  computeInstitutionalSuperTrendCore,
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  type InstitutionalSuperTrendCore,
  type MonthDeskBandFusionContext,
} from '@/lib/institutionalSuperBand';
import { buildMergedAdvancedStRibbonFillOverlays } from '@/lib/mergedAdvancedStRibbonFillOverlays';
import { mergedDevelopingBar } from '@/lib/mergedAnalysisLeadingBar';
import { mergedWorkCandles } from '@/lib/mergedAnalysisOverlayTimes';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';

export type MergedStCloudSignalKind = 'flip' | 'bounce' | 'reject' | 'live';

function stCloudWorkCandles(candles: Candle[], timeframe: string): Candle[] {
  return sanitizeChartCandlesForSeries(mergedWorkCandles(candles, timeframe), timeframe);
}

function minBarGap(_tf: string): number {
  return 3; // 4h 참조 — 전 TF 동일
}

function maxSignals(_tf: string): number {
  return 36; // 4h 참조 — 전 TF 동일
}

function pickSpread<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = Math.ceil(items.length / max);
  const out: T[] = [];
  for (let i = 0; i < items.length; i += step) out.push(items[i]!);
  const last = items[items.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

type Cand = {
  time: number;
  direction: 'LONG' | 'SHORT';
  kind: MergedStCloudSignalKind;
  score: number;
  barIdx: number;
};

/** ST 추세 전환 · 구름 경계 반등/거부 · 마지막 봉 선행 */
export function buildMergedStCloudSignalMarkers(params: {
  candles: Candle[];
  timeframe: string;
  fusion: MonthDeskBandFusionContext | null | undefined;
  reuseCore?: InstitutionalSuperTrendCore | null;
}): AtlasPulseMarker[] {
  const safe = stCloudWorkCandles(params.candles, params.timeframe);
  if (safe.length < 8) return [];

  const core =
    params.reuseCore && params.reuseCore.trend.length === safe.length
      ? params.reuseCore
      : computeInstitutionalSuperTrendCore(
          safe,
          INSTITUTIONAL_BAND_DEFAULT_PERIOD,
          INSTITUTIONAL_BAND_DEFAULT_MULT
        );
  if (!core) return [];

  const { trend, finalUpper, finalLower } = core;
  const tf = normalizeChartTimeframe(params.timeframe);
  const gap = minBarGap(tf);
  const cap = maxSignals(tf);
  const candidates: Cand[] = [];

  for (let i = 1; i < safe.length; i++) {
    const c = safe[i]!;
    const t = Number(c.time);
    if (!Number.isFinite(t)) continue;

    const flipShort = trend[i - 1] === 1 && trend[i] === -1;
    const flipLong = trend[i - 1] === -1 && trend[i] === 1;

    if (flipShort) {
      candidates.push({ time: t, direction: 'SHORT', kind: 'flip', score: 100, barIdx: i });
    } else if (flipLong) {
      candidates.push({ time: t, direction: 'LONG', kind: 'flip', score: 100, barIdx: i });
    }

    const bw = finalUpper[i]! - finalLower[i]!;
    if (!Number.isFinite(bw) || bw <= 0) continue;
    const touchEps = Math.max(bw * 0.07, Math.abs(c.close) * 0.0002);
    const bullBody = c.close > c.open;
    const bearBody = c.close < c.open;

    if (trend[i] === 1) {
      const touchLower = c.low <= finalLower[i]! + touchEps;
      const holdAbove = c.close >= finalLower[i]! - touchEps * 0.5;
      if (touchLower && holdAbove && bullBody) {
        candidates.push({
          time: t,
          direction: 'LONG',
          kind: 'bounce',
          score: 72 + (i === safe.length - 1 ? 12 : 0),
          barIdx: i,
        });
      }
    } else if (trend[i] === -1) {
      const touchUpper = c.high >= finalUpper[i]! - touchEps;
      const holdBelow = c.close <= finalUpper[i]! + touchEps * 0.5;
      if (touchUpper && holdBelow && bearBody) {
        candidates.push({
          time: t,
          direction: 'SHORT',
          kind: 'reject',
          score: 72 + (i === safe.length - 1 ? 12 : 0),
          barIdx: i,
        });
      }
    }
  }

  const lastIdx = safe.length - 1;
  const last = safe[lastIdx]!;
  const lastT = Number(last.time);
  if (Number.isFinite(lastT)) {
    const dev = mergedDevelopingBar(last);
    const li = lastIdx;
    const bw = finalUpper[li]! - finalLower[li]!;
    const tol = Math.max(bw * 0.06, Math.abs(last.close) * 0.00025, 1e-8);
    if (trend[li] === 1 && dev.low <= finalLower[li]! + tol) {
      candidates.push({
        time: lastT,
        direction: 'LONG',
        kind: 'live',
        score: 88,
        barIdx: li,
      });
    } else if (trend[li] === -1 && dev.high >= finalUpper[li]! - tol) {
      candidates.push({
        time: lastT,
        direction: 'SHORT',
        kind: 'live',
        score: 88,
        barIdx: li,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.time - a.time);

  const out: AtlasPulseMarker[] = [];
  const usedIdx: number[] = [];

  for (const c of candidates) {
    if (out.length >= cap) break;
    if (usedIdx.some((j) => Math.abs(c.barIdx - j) < gap)) continue;

    const long = c.direction === 'LONG';
    let text: string;
    let color: string;
    let size: 1 | 2 | 3 = 2;
    let shape: 'square' | 'circle' = 'square';

    if (c.kind === 'flip') {
      text = long ? '▲ST' : '▼ST';
      color = long ? '#22c55e' : '#ef4444';
      shape = 'square';
    } else if (c.kind === 'live') {
      text = long ? '⚡L☁' : '⚡S☁';
      color = long ? '#2dd4bf' : '#f472b6';
    } else {
      text = long ? 'L☁' : 'S☁';
      color = long ? '#4ade80' : '#fb7185';
      size = 1;
    }

    out.push({
      time: c.time as UTCTimestamp,
      position: long ? 'belowBar' : 'aboveBar',
      shape,
      color,
      text,
      size,
      id: `merged-st-cloud-${c.kind}-${long ? 'long' : 'short'}-${c.time}`,
    });
    usedIdx.push(c.barIdx);
  }

  return pickSpread(out, cap);
}

/** ST 구름 채움 + 시그널 마커 — 동일 fusion 코어 */
export function buildMergedStCloudChartPack(params: {
  candles: Candle[];
  timeframe: string;
  fusion: MonthDeskBandFusionContext | null | undefined;
}): {
  overlays: ReturnType<typeof buildMergedAdvancedStRibbonFillOverlays>;
  markers: AtlasPulseMarker[];
  core: InstitutionalSuperTrendCore | null;
} {
  const safe = stCloudWorkCandles(params.candles, params.timeframe);
  const core =
    safe.length >= 8
      ? computeInstitutionalSuperTrendCore(
          safe,
          INSTITUTIONAL_BAND_DEFAULT_PERIOD,
          INSTITUTIONAL_BAND_DEFAULT_MULT
        )
      : null;

  const overlays = buildMergedAdvancedStRibbonFillOverlays({
    candles: params.candles,
    timeframe: params.timeframe,
    fusion: params.fusion,
    reuseCore: core,
  });

  const markers = buildMergedStCloudSignalMarkers({
    candles: params.candles,
    timeframe: params.timeframe,
    fusion: params.fusion,
    reuseCore: core,
  });

  return { overlays, markers, core };
}

export function summarizeMergedStCloudSignalsKo(markers: AtlasPulseMarker[]): string {
  if (!markers.length) return 'ST 구름 — 전환·터치 신호 대기';
  const flips = markers.filter((m) => String(m.id || '').includes('-flip-')).length;
  const live = markers.filter((m) => String(m.text || '').includes('⚡')).length;
  const touch = markers.length - flips - live;
  return `ST 구름 · 전환 ${flips} · 터치 ${touch}${live ? ` · 선행 ${live}` : ''} (참고)`;
}
