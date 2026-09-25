/**
 * 마감·안착 — 고래 모드 차트 팩 (ChartPrime cptc + ParkF 피벗 TL + AI 압축).
 * LinReg 3선(monthDeskLinReg)과 별도 — 사용자 시드 설정의 고래 추세·채널 레이어.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UserSettings } from '@/lib/settings';
import {
  computeChartPrimeTrendChannelOverlays,
  computeSuggestedChartPrimePivotLength,
} from '@/lib/chartPrimeTrendChannels';
import {
  computeParkfTrendlineOverlays,
  DEFAULT_PARKF_TRENDLINE_OPTS,
} from '@/lib/parkfLinregTrendlineEngine';
import { effectiveChartPrimeChannelWidthScale, defaultSettings } from '@/lib/settings';
import { normalizeHex6 } from '@/lib/chartHexColor';

export function isMonthDeskWhaleChartOverlayId(id: string): boolean {
  const s = String(id || '');
  return (
    s.startsWith('parkf-pri-') ||
    s.startsWith('parkf-sec-') ||
    s.startsWith('cptc-') ||
    s.startsWith('ai-auto-compression') ||
    s.startsWith('ai-auto-live-compression')
  );
}

function priceEnvelope(candles: Candle[]): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const c of candles) {
    min = Math.min(min, c.low);
    max = Math.max(max, c.high);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
  return { min, max };
}

export type MonthDeskWhaleChartPackInput = {
  candles: Candle[];
  timeframe: string;
  settings: UserSettings;
  /** analyze API의 ai-auto-compression* (있을 때) */
  aiAutoOverlays?: OverlayItem[];
};

/** 고래 모드와 동일 ChartPrime + ParkF 피벗( LinReg 밴드 제외 ) */
export function buildMonthDeskWhaleChartPack(input: MonthDeskWhaleChartPackInput): OverlayItem[] {
  if (input.settings.chartMonthDeskWhaleChartPackEnabled === false) return [];

  const { candles, timeframe, settings } = input;
  const n = candles.length;
  if (n < 24) return [];

  const env = priceEnvelope(candles);
  if (!env) return [];

  const { min, max } = env;
  const visIdx = (arr: Candle[], i: number) => Math.max(0, Math.min(arr.length - 1, Math.floor(i)));
  const visTime = (arr: Candle[], i: number) =>
    Number(arr[visIdx(arr, i)]?.time ?? arr[arr.length - 1]?.time ?? 0);

  const out: OverlayItem[] = [];

  const parkfPartial = {
    ...DEFAULT_PARKF_TRENDLINE_OPTS,
    ...settings.parkfEngineOpts,
    includeLinReg: false,
    useLargeLinReg: false,
    useMediumLinReg: false,
    useSmallLinReg: false,
    extendLinRegRight: false,
    extendLinRegLeft: false,
    showPrimaryTrendlines: settings.parkfEngineOpts?.showPrimaryTrendlines !== false,
    showSecondaryTrendlines: settings.parkfEngineOpts?.showSecondaryTrendlines !== false,
  };

  const parkf = computeParkfTrendlineOverlays(candles, min, max, parkfPartial);
  for (const o of parkf.overlays) {
    const id = String(o.id || '');
    if (id.startsWith('parkf-pri-') || id.startsWith('parkf-sec-')) out.push(o);
  }

  const manualLen = Math.max(
    2,
    Math.min(30, Math.round(Number(settings.chartPrimeTrendChannelsLength) || 8))
  );
  const cpLen =
    settings.chartPrimeTrendChannelsAutoLength !== false
      ? computeSuggestedChartPrimePivotLength(candles, timeframe)
      : manualLen;
  const widthScale = effectiveChartPrimeChannelWidthScale(settings);

  const cp = computeChartPrimeTrendChannelOverlays(candles, min, max, visTime, visIdx, {
    enableLiquid: settings.chartPrimeTrendChannelsVolumeBg !== false,
    length: cpLen,
    wait: settings.chartPrimeTrendChannelsWait !== false,
    extend: settings.chartPrimeTrendChannelsExtend === true,
    show: settings.chartPrimeTrendChannelsShowLastOnly !== false,
    showFills: settings.chartPrimeTrendChannelsShowFills !== false,
    channelWidthScale: widthScale,
    topColor: normalizeHex6(
      settings.chartPrimeTrendChannelsTopHex,
      defaultSettings.chartPrimeTrendChannelsTopHex
    ),
    centerColor: normalizeHex6(
      settings.chartPrimeTrendChannelsCenterHex,
      defaultSettings.chartPrimeTrendChannelsCenterHex
    ),
    bottomColor: normalizeHex6(
      settings.chartPrimeTrendChannelsBottomHex,
      defaultSettings.chartPrimeTrendChannelsBottomHex
    ),
  });
  if (cp.overlays?.length) out.push(...cp.overlays);

  const aiSrc = input.aiAutoOverlays ?? [];
  for (const o of aiSrc) {
    const id = String(o.id || '');
    if (id.startsWith('ai-auto-compression') || id.startsWith('ai-auto-live-compression')) {
      out.push(o);
    }
  }

  return out;
}
