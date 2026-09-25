/**
 * Bitget 고래 DNA — 우측 여백 오라클 좌표
 */
import type { BitgetWhaleDnaPanel } from '@/lib/bitgetWhaleDnaPanel';
import type { WhaleSegmentVolumeSignal } from '@/lib/whaleVolumeSegmentSignals';

export type WhaleBeamRightOracleGeom = {
  id: string;
  chartHeight: number;
  volPanelTop: number;
  priceAxisReserve: number;
  /** 캔들 위 구간 박스 — 통합·분석에서는 비표시 */
  box: { x1: number; x2: number; yTop: number; yBot: number } | null;
  /** 마지막 봉 우측 · 미래 여백 DNA 레인 */
  futureLane: { x: number; w: number; yTop: number; yBot: number };
  lastBarX: number;
  anchorX: number;
  colLeft: number;
  colRight: number;
  colCenter: number;
  entryY: number;
  targetY: number;
  color: string;
  dna: BitgetWhaleDnaPanel;
  marginOnly: boolean;
};

function dirOf(s: WhaleSegmentVolumeSignal): 'long' | 'short' | 'neutral' {
  if (s.verdictKo === '상승' || s.move.dir === 'long') return 'long';
  if (s.verdictKo === '하락' || s.move.dir === 'short') return 'short';
  return 'neutral';
}

export function buildWhaleBeamRightOracleGeom(params: {
  signal: WhaleSegmentVolumeSignal;
  dna: BitgetWhaleDnaPanel;
  resolveTimeX: (t: number) => number;
  priceToY: (p: number) => number | null;
  chartWidth: number;
  chartHeight: number;
  lastBarTime?: number;
  prevBarTime?: number;
  priceAxisReserve?: number;
  volPanelTopRatio?: number;
  /** true — 캔들 위 박스·가로선 없음, 우측 여백 DNA만 */
  marginOnly?: boolean;
}): WhaleBeamRightOracleGeom | null {
  const {
    signal: s,
    dna,
    resolveTimeX,
    priceToY,
    chartWidth,
    chartHeight,
    lastBarTime,
    prevBarTime,
    priceAxisReserve = 62,
    volPanelTopRatio = 0.82,
    marginOnly = false,
  } = params;

  const x1 = resolveTimeX(s.timeFrom);
  const boxEndT = s.timeBoxTo ?? s.timeTo;
  const x2raw = resolveTimeX(boxEndT);
  const yTop = priceToY(s.priceHigh);
  const yBot = priceToY(s.priceLow);
  if (!Number.isFinite(x1) || !Number.isFinite(x2raw) || yTop == null || yBot == null) return null;

  const boxTop = Math.min(yTop, yBot) - 5;
  const boxBot = Math.max(yTop, yBot) + 5;
  const x2 = Math.max(x1, x2raw);

  let lastX = lastBarTime != null ? resolveTimeX(lastBarTime) : x2;
  let prevX = prevBarTime != null ? resolveTimeX(prevBarTime) : lastX - 14;
  if (!Number.isFinite(lastX)) lastX = x2;
  if (!Number.isFinite(prevX)) prevX = lastX - 14;
  const barW = Math.max(8, lastX - prevX);

  const colW = 98;
  const colRight = chartWidth - priceAxisReserve - 4;
  const laneGap = 12;
  const laneW = 14;
  const lastBarRight = lastX + barW * 0.52;
  const futureLaneX = lastBarRight + laneGap;
  const colLeft = Math.max(futureLaneX + laneW + 8, colRight - colW);

  const colCenter = (colLeft + colRight) / 2;

  const close = s.priceClose;
  const med = s.forecastPct ?? 0;
  const entryPrice =
    s.entryPrice ??
    (s.move.dir === 'long' ? s.priceLow : s.move.dir === 'short' ? s.priceHigh : close);
  const targetPrice =
    s.targetPrice ?? (close > 0 ? close * (1 + med / 100) : close);
  const entryY = priceToY(entryPrice) ?? priceToY(close) ?? boxBot;
  const targetY = priceToY(targetPrice) ?? entryY;

  const dir = dirOf(s);
  void dir;

  const chartBox =
    marginOnly
      ? null
      : { x1: Math.min(x1, x2), x2: Math.max(x1, x2), yTop: boxTop, yBot: boxBot };

  return {
    id: s.id,
    chartHeight,
    volPanelTop: chartHeight * volPanelTopRatio,
    priceAxisReserve,
    box: chartBox,
    futureLane: { x: futureLaneX, w: laneW, yTop: boxTop, yBot: boxBot },
    lastBarX: lastX + barW,
    anchorX: marginOnly ? futureLaneX + laneW / 2 : x2,
    colLeft,
    colRight,
    colCenter,
    entryY,
    targetY,
    color: s.move.color,
    dna,
    marginOnly,
  };
}
