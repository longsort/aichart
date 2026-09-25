/**
 * 타점차트 신호 타입 — 존·가로선·마커.
 */
export type TapointChartLineStyle = 'solid' | 'dashed' | 'dotted' | 'sparse';

export type TapointChartLine = {
  title: string;
  price: number;
  color: string;
  lineStyle?: TapointChartLineStyle;
  lineWidth?: number;
  /** 라벨을 선 위/아래 */
  labelSide?: 'above' | 'below';
};

export type TapointChartZoneBand = {
  id?: string;
  title?: string;
  lo: number;
  hi: number;
  color?: string;
  fillOpacity?: number;
  borderColor?: string;
};

export type TapointChartMarker = {
  time: number;
  position: 'aboveBar' | 'belowBar' | 'inBar';
  color: string;
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  label: string;
};

export type TapointChartSignals = {
  lines?: TapointChartLine[];
  zones?: TapointChartZoneBand[];
  markers?: TapointChartMarker[];
  legendKo?: string[];
};
