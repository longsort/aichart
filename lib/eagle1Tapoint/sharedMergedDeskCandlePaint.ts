/**
 * 통합·분석 캔들 색상 — 타점엔진 공동 사용.
 * 설정(클래식/모노/AI톤) · 줄·존 근접 반짝 · 거래량 구간 테두리.
 * buildCandlestickDataWithPre3Sparkle / chartCandleOptions 단일 소스.
 */
import type { CandlestickData, UTCTimestamp } from 'lightweight-charts';
import type { Candle, OverlayItem } from '@/types';
import {
  buildCandlestickDataWithPre3Sparkle,
  type CandleBlendInput,
} from '@/lib/chartSparkleCandles';
import { buildCandlestickApplyOptions } from '@/lib/chartCandleOptions';
import {
  isMergedDeskAiToneEnabled,
  mergedDeskAiToneCandleOptions,
} from '@/lib/mergedDeskAiTonePalette';
import { collectLineZoneProximitySparkle } from '@/lib/proximityLineZoneSparkle';
import {
  applyVolumeVerdictCandleBorders,
  buildVolumeAiZonePack,
  buildVolumeVerdictCandleBorderByTime,
} from '@/lib/volumeAiZoneEngine';
import { loadSettings, type UserSettings } from '@/lib/settings';
import type { TapointChartSignals } from './chartSignals';

export type TapCandlePaintLevels = {
  entry?: number | null;
  sl?: number | null;
  tp1?: number | null;
  tp2?: number | null;
  tp3?: number | null;
  zoneLo?: number | null;
  zoneHi?: number | null;
  zoneMid?: number | null;
};

export type TapCandleSeriesOptions = ReturnType<typeof buildCandlestickApplyOptions>;

function blendFromSettings(s: UserSettings): CandleBlendInput {
  return {
    compositeLayers: s.chartCandleCompositeLayers !== false,
    chartCandleStyle: s.chartCandleStyle,
    classicUpHex: s.chartCandleClassicUpHex,
    classicDownHex: s.chartCandleClassicDownHex,
    monoUpHex: s.chartCandleMonoUpHex,
    monoDownBodyHex: s.chartCandleMonoDownBodyHex,
    monoOutlineHex: s.chartCandleMonoOutlineHex,
  };
}

/** 타점 존·가격선 → 통합모드와 동일 근접 반짝용 OverlayItem */
export function tapointOverlaysForCandlePaint(
  signals: TapointChartSignals | null | undefined,
  levels: TapCandlePaintLevels | null | undefined
): OverlayItem[] {
  const out: OverlayItem[] = [];
  for (const z of signals?.zones || []) {
    const lo = Math.min(z.lo, z.hi);
    const hi = Math.max(z.lo, z.hi);
    if (!(hi > 0) || !(lo > 0)) continue;
    out.push({
      id: `tap-z-${z.id}`,
      kind: 'zone',
      label: z.labelKo || z.kind,
      x1: 0,
      y1: lo,
      x2: 1,
      y2: hi,
      price1: lo,
      price2: hi,
      confidence: 0.9,
      color: z.stroke,
    });
  }
  for (const ln of signals?.lines || []) {
    if (!(ln.price > 0)) continue;
    out.push({
      id: `tap-l-${ln.id}`,
      kind: ln.group === 'exec' ? 'equilibrium' : 'supportLine',
      label: ln.title,
      x1: 0,
      y1: ln.price,
      x2: 1,
      y2: ln.price,
      price1: ln.price,
      price2: ln.price,
      confidence: 0.85,
      color: ln.color,
    });
  }
  const lv = levels || {};
  const pairs: Array<[string, number | null | undefined]> = [
    ['entry', lv.entry],
    ['sl', lv.sl],
    ['tp1', lv.tp1],
    ['tp2', lv.tp2],
    ['tp3', lv.tp3],
    ['zoneMid', lv.zoneMid],
  ];
  for (const [id, px] of pairs) {
    const p = Number(px);
    if (!(p > 0)) continue;
    if (out.some((o) => Math.abs(Number(o.price1) - p) / p < 0.0003)) continue;
    out.push({
      id: `tap-lv-${id}`,
      kind: 'equilibrium',
      label: id,
      x1: 0,
      y1: p,
      x2: 1,
      y2: p,
      price1: p,
      price2: p,
      confidence: 0.8,
    });
  }
  return out;
}

/** 통합모드와 동일 시리즈 applyOptions (설정·AI톤) */
export function resolveTapointCandleSeriesOptions(
  settings?: UserSettings | null,
  chartBg = '#0b1220'
): TapCandleSeriesOptions {
  const s = settings ?? loadSettings();
  if (isMergedDeskAiToneEnabled(s)) return mergedDeskAiToneCandleOptions();
  return buildCandlestickApplyOptions(s, chartBg);
}

/**
 * 통합모드와 동일 per-bar 캔들 색.
 * 근접 반짝 + 거래량 구간 테두리 + 클래식/모노 블렌드.
 */
export function buildTapointCandlestickPaintData(
  candles: Candle[],
  opts: {
    timeframe: string;
    signals?: TapointChartSignals | null;
    levels?: TapCandlePaintLevels | null;
    settings?: UserSettings | null;
    pulsePhase?: number;
    reducedMotion?: boolean;
    proximitySensitivity?: number;
  }
): CandlestickData<UTCTimestamp>[] {
  if (!candles.length) return [];
  const s = opts.settings ?? loadSettings();
  const blend = blendFromSettings(s);
  const overlays = tapointOverlaysForCandlePaint(opts.signals, opts.levels);
  const prox =
    overlays.length > 0
      ? collectLineZoneProximitySparkle(
          overlays,
          candles,
          opts.proximitySensitivity ?? s.chartLineZoneProximitySensitivity ?? 1
        )
      : undefined;

  const dataRaw = buildCandlestickDataWithPre3Sparkle(
    candles,
    new Map(),
    opts.pulsePhase ?? 0,
    opts.reducedMotion === true,
    prox && prox.size ? prox : undefined,
    null,
    null,
    blend,
    null,
    null
  );

  try {
    const volPack = buildVolumeAiZonePack(candles, opts.timeframe);
    const borderByTime = buildVolumeVerdictCandleBorderByTime(candles, volPack, opts.timeframe);
    if (borderByTime.size) return applyVolumeVerdictCandleBorders(dataRaw, borderByTime);
  } catch {
    /* ignore — 기본 OHLC 색 유지 */
  }
  return dataRaw;
}
