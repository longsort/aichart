/**
 * 파랑빨강띠 옆 시그널 — 큰 zone 네모 대신 전폭 가격선 + 마지막봉 핀.
 * 채널 띠(channelBand)는 건드리지 않음. 확정 매매·승률 아님.
 */
import type { OverlayItem } from '@/types';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';

export function rbSignalPriceLine(params: {
  price: number;
  color: string;
  title: string;
  lineWidth?: 1 | 2 | 3 | 4;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
}): AtlasPulsePriceLine {
  return {
    price: params.price,
    color: params.color,
    title: params.title,
    lineWidth: params.lineWidth ?? 2,
    lineStyle: params.lineStyle ?? 'dashed',
    axisLabel: false,
  };
}

/** 마지막 1~3봉에만 붙는 시그널 핀 (면 네모 아님) */
export function rbLastBarSignalPin(params: {
  id: string;
  label: string;
  price: number;
  tFrom?: number;
  tLast: number;
  color: string;
  bg: string;
  tooltip: string;
  extraClass?: string;
  faceBase?: string;
  faceSignal?: string;
  bias?: 'bullish' | 'bearish';
}): OverlayItem {
  return {
    id: params.id,
    kind: 'label',
    label: params.label,
    zoneFaceBase: params.faceBase ?? params.label.split('·')[0],
    zoneFaceSignal: params.faceSignal,
    zoneFaceDetailKo: params.tooltip,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: params.tLast,
    time2: params.tLast,
    price1: params.price,
    price2: params.price,
    color: params.color,
    category: 'chartPrimeTrendChannels',
    confidence: 0.88,
    noProject: true,
    ...(params.bias ? { structureBias: params.bias } : {}),
    overlayZoneExtraClass: [
      'merged-desk-rb-signal-pin',
      'merged-desk-rb-channel',
      'merged-desk-money-zone-keep',
      params.extraClass || '',
    ]
      .filter(Boolean)
      .join(' '),
    labelTooltip: params.tooltip,
    labelBackgroundColor: params.bg,
    labelTextColor: '#f8fafc',
  };
}
