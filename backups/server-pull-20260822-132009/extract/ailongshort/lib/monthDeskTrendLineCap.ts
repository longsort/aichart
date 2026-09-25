/**

 * 마감·안착 — 대각 추세선 정리.

 * 고래 팩(parkf-pri/sec, cptc)은 유지 · LinReg·ALR·잡선은 제거 · 기타 대각선만 상한.

 */

import type { OverlayItem } from '@/types';

import { isMonthDeskWhaleChartOverlayId } from '@/lib/monthDeskWhaleChartPack';



export const MONTH_DESK_MAX_TREND_LINES = 6;



const DROP_TREND_PREFIXES = [

  'parkf-lr-',

  'parkf-xsec-',

  'whale-alr-',

  'diag-',

  'md-path-',

] as const;



function isDiagonalTrendLine(o: OverlayItem): boolean {

  const kind = String(o.kind || '');

  if (kind !== 'trendLine') return false;

  const id = String(o.id || '');

  if (id === 'md-path-future-divider') return false;

  const p1 = Number(o.price1);

  const p2 = Number(o.price2);

  const t1 = Number(o.time1);

  const t2 = Number(o.time2);

  if (Number.isFinite(p1) && Number.isFinite(p2) && Number.isFinite(t1) && Number.isFinite(t2)) {

    const dp = Math.abs(p2 - p1);

    const dt = Math.abs(t2 - t1);

    if (dt > 0 && dp / dt < 1e-12) return false;

  }

  return true;

}



function shouldDropTrendId(id: string): boolean {

  if (isMonthDeskWhaleChartOverlayId(id)) return false;

  return DROP_TREND_PREFIXES.some((p) => id.startsWith(p) || id.includes(p));

}



/** 마감·안착 오버레이 — 고래 팩 대각선 유지, 나머지 stray trendLine만 최대 N개 */

export function capMonthDeskDiagonalTrendLines(

  items: OverlayItem[],

  max = MONTH_DESK_MAX_TREND_LINES

): OverlayItem[] {

  const rest: OverlayItem[] = [];

  const candidates: OverlayItem[] = [];



  for (const o of items) {

    if (!isDiagonalTrendLine(o)) {

      rest.push(o);

      continue;

    }

    const id = String(o.id || '');

    if (isMonthDeskWhaleChartOverlayId(id)) {

      rest.push(o);

      continue;

    }

    if (shouldDropTrendId(id)) continue;

    candidates.push(o);

  }



  const kept = candidates.slice(0, Math.max(0, max));

  return [...rest, ...kept];

}

