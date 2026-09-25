/**
 * 통합·분석 — AI톤 팔레트 (칩 ON일 때만).
 * 기존 기능색은 유지하고, 이 세팅이 배경·밴드·캔들·축 톤만 바꾼다.
 */
import type { ChartCandleStyleFields } from '@/lib/chartCandleOptions';

export type MergedDeskAiToneChartPack = {
  bg: string;
  text: string;
  gridVert: string;
  gridHorz: string;
  border: string;
  crosshairLine: string;
  crosshairLabelBg: string;
  lastPriceLine: string;
  volumeHistogramMaLine: string;
};

export const MERGED_DESK_AI_TONE_DARK: MergedDeskAiToneChartPack = {
  bg: '#0a0e14',
  text: '#94a3b8',
  gridVert: 'rgba(148,163,184,0.055)',
  gridHorz: 'rgba(148,163,184,0.032)',
  border: 'rgba(255,255,255,0.06)',
  crosshairLine: 'rgba(148,180,198,0.32)',
  crosshairLabelBg: 'rgba(10,14,20,0.94)',
  lastPriceLine: 'rgba(148,163,184,0.52)',
  volumeHistogramMaLine: 'rgba(148,163,184,0.42)',
};

export const MERGED_DESK_AI_TONE_BAND = {
  long: '#5F9A86',
  short: '#B07A7A',
};

export const MERGED_DESK_AI_TONE_CANDLE = {
  up: '#D5DEE6',
  down: '#8F5A5A',
  upBorder: '#E8EEF2',
  downBorder: '#A86B6B',
};

export function isMergedDeskAiToneEnabled(
  settings: { chartMergedDeskAiToneEnabled?: boolean } | null | undefined
): boolean {
  return settings?.chartMergedDeskAiToneEnabled === true;
}

export function mergedDeskAiToneCandleOptions() {
  return {
    upColor: MERGED_DESK_AI_TONE_CANDLE.up,
    downColor: MERGED_DESK_AI_TONE_CANDLE.down,
    borderVisible: true,
    borderUpColor: MERGED_DESK_AI_TONE_CANDLE.upBorder,
    borderDownColor: MERGED_DESK_AI_TONE_CANDLE.downBorder,
    wickUpColor: MERGED_DESK_AI_TONE_CANDLE.upBorder,
    wickDownColor: MERGED_DESK_AI_TONE_CANDLE.downBorder,
  };
}

export function mergedDeskAiToneVolumeColors(_settings?: ChartCandleStyleFields) {
  return {
    up: 'rgba(74,222,128,0.72)',
    down: 'rgba(248,113,113,0.68)',
  };
}
