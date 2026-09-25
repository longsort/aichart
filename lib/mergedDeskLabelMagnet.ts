/**
 * 통합·분석 라벨 자석 — 기능 도형(대각 레일·존 면·선)에 부착.
 * 줌/패닝은 screen 좌표가 바뀌면 같이 움직임. 확정 매매 아님.
 */

export type MagnetPt = { x: number; y: number; angleDeg: number };

const T_RAIL = 0.88;
const T_LINE = 0.86;

export function magnetOnSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t = T_LINE
): MagnetPt {
  const u = Math.max(0, Math.min(1, t));
  return {
    x: x1 + (x2 - x1) * u,
    y: y1 + (y2 - y1) * u,
    angleDeg: (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI,
  };
}

/** channelBand poly: [UL, UR, LR, LL] */
export function magnetOnChannelRail(
  poly: Array<{ x: number; y: number }>,
  rail: 'upper' | 'lower' | 'mid' = 'upper',
  t = T_RAIL
): MagnetPt | null {
  if (!poly || poly.length < 4) return null;
  const ul = poly[0]!;
  const ur = poly[1]!;
  const lr = poly[2]!;
  const ll = poly[3]!;
  if (rail === 'upper') return magnetOnSegment(ul.x, ul.y, ur.x, ur.y, t);
  if (rail === 'lower') return magnetOnSegment(ll.x, ll.y, lr.x, lr.y, t);
  return magnetOnSegment(
    (ul.x + ll.x) / 2,
    (ul.y + ll.y) / 2,
    (ur.x + lr.x) / 2,
    (ur.y + lr.y) / 2,
    t
  );
}

export function magnetOnZoneRect(left: number, top: number, width: number, height: number): MagnetPt {
  return {
    x: left + Math.max(0, width),
    y: top + Math.max(0, height) / 2,
    angleDeg: 0,
  };
}

export function clampMagnetAngle(deg: number, maxAbs = 22): number {
  if (!Number.isFinite(deg)) return 0;
  return Math.max(-maxAbs, Math.min(maxAbs, deg));
}

/** HotZone과 동일 — 기능 박스만 참고. 차트 줌 scale 금지(캔들 좌표와 이중 스케일됨) */
export function featureLabelZoom(_chartZoom = 1, _featH = 0, _featW = 0): number {
  return 1;
}

/** @deprecated featureLabelZoom 사용 */
export function rbLabelZoomFromFeature(
  bandW: number,
  bandH: number,
  chartZoom = 1
): number {
  return featureLabelZoom(chartZoom, bandH, bandW);
}

/** 핵심돌파·안착·실패·핵심 핀 — 레일/봉에 고정 */
export function isMergedDeskCoreLabelFeature(
  id: string,
  extra = '',
  text = ''
): boolean {
  const i = String(id || '');
  const e = String(extra || '');
  const t = String(text || '');
  return (
    i.startsWith('merged-desk-rb-core-') ||
    e.includes('merged-desk-rb-core-') ||
    /^(돌파확정|확실한안착|실패|핵심돌파|핵심안착|핵심실패)/.test(t.replace(/^◆+/, ''))
  );
}

/**
 * $$$$·최강분석·돈구간 면 — 라벨/면을 +20 빈축이 아니라 **분석 마지막 봉**에 자석.
 */
export function isMergedDeskCandleMagnetFace(
  id: string,
  extra = '',
  text = ''
): boolean {
  const i = String(id || '');
  const e = String(extra || '');
  const t = String(text || '');
  if (e.includes('merged-desk-money-zone-keep')) return true;
  if (e.includes('merged-desk-candle-magnet')) return true;
  if (e.includes('merged-desk-strongest-analysis-zone')) return true;
  if (e.includes('merged-desk-pill-zone') && /\$\$\$\$|최강/.test(t)) return true;
  if (/\$\$\$\$/.test(t)) return true;
  if (i.startsWith('merged-desk-hq-') && e.includes('merged-desk-zone-label-on')) return true;
  return false;
}
