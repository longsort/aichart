import { CHART_CANDLE } from '@/lib/overlayColors';
import { normalizeHex6, hexToRgba } from '@/lib/chartHexColor';
import type { UserSettings } from '@/lib/settings';

export type ChartCandleStyleFields = Pick<
  UserSettings,
  | 'chartCandleStyle'
  | 'chartCandleClassicUpHex'
  | 'chartCandleClassicDownHex'
  | 'chartCandleMonoUpHex'
  | 'chartCandleMonoDownBodyHex'
  | 'chartCandleMonoOutlineHex'
>;

/** lightweight-charts CandlestickSeries.applyOptions에 넣을 옵션 */
export function buildCandlestickApplyOptions(settings: ChartCandleStyleFields, chartBgHex: string) {
  const bg = normalizeHex6(chartBgHex, '#10151D');
  if (settings.chartCandleStyle === 'monochrome') {
    const up = normalizeHex6(settings.chartCandleMonoUpHex, '#FFFFFF');
    const downBody = normalizeHex6(settings.chartCandleMonoDownBodyHex, bg);
    const outline = normalizeHex6(settings.chartCandleMonoOutlineHex, '#FFFFFF');
    return {
      upColor: up,
      downColor: downBody,
      borderVisible: true,
      borderUpColor: up,
      borderDownColor: outline,
      wickUpColor: up,
      wickDownColor: outline,
    };
  }
  const up = normalizeHex6(settings.chartCandleClassicUpHex, CHART_CANDLE.up);
  const down = normalizeHex6(settings.chartCandleClassicDownHex, CHART_CANDLE.down);
  return {
    upColor: up,
    downColor: down,
    /** 존·채널 틴트 뒤에서도 몸통·심지 윤곽이 뚜렷하게 */
    borderVisible: true,
    borderUpColor: up,
    borderDownColor: down,
    wickUpColor: up,
    wickDownColor: down,
  };
}

/** 히스토그램 볼륨 봉별 color (rgba) */
export function volumeHistogramBarColors(settings: ChartCandleStyleFields, chartBgHex: string) {
  const bg = normalizeHex6(chartBgHex, '#10151D');
  if (settings.chartCandleStyle === 'monochrome') {
    const up = normalizeHex6(settings.chartCandleMonoUpHex, '#FFFFFF');
    const downBody = normalizeHex6(settings.chartCandleMonoDownBodyHex, bg);
    return {
      up: hexToRgba(up, 0.32),
      down: hexToRgba(downBody, 0.28),
    };
  }
  const up = normalizeHex6(settings.chartCandleClassicUpHex, CHART_CANDLE.up);
  const down = normalizeHex6(settings.chartCandleClassicDownHex, CHART_CANDLE.down);
  return {
    up: hexToRgba(up, 0.32),
    down: hexToRgba(down, 0.28),
  };
}
