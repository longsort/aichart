/**
 * ParkF LinReg·추세선 엔진 — /api/analyze 쿼리 ↔ Partial<ParkfTrendlineOpts>
 */

import {
  DEFAULT_PARKF_TRENDLINE_OPTS,
  type ParkfLineStyle,
  type ParkfTrendlineOpts,
} from '@/lib/parkfLinregTrendlineEngine';

/** Pine 연장 배수 라벨 (스크립트 철자 Infinate 유지) */
export const PARKF_EXTENSION_OPTIONS = [
  '25',
  '50',
  '75',
  '100',
  '150',
  '200',
  '300',
  '400',
  '500',
  '750',
  '1000',
  'Infinate',
] as const;

const EXT_VALID = new Set<string>(PARKF_EXTENSION_OPTIONS);

function decStyle(v: string | null): ParkfLineStyle | undefined {
  if (v == null) return undefined;
  const x = v.trim().toLowerCase();
  if (x === 's' || x === 'solid') return 'solid';
  if (x === 'd' || x === 'dashed') return 'dashed';
  if (x === 't' || x === 'dotted') return 'dotted';
  return undefined;
}

function encStyle(s: ParkfLineStyle): string {
  return s === 'solid' ? 's' : s === 'dashed' ? 'd' : 't';
}

function bool01(v: string | null): boolean | undefined {
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return undefined;
}

/** URLSearchParams → 분석용 부분 옵션 */
export function parseParkfTrendlineOptsFromSearchParams(sp: URLSearchParams): Partial<ParkfTrendlineOpts> {
  const o: Partial<ParkfTrendlineOpts> = {};
  const len = parseInt(sp.get('pfLen') || '', 10);
  if (Number.isFinite(len)) o.linregLength = Math.min(5000, Math.max(1, len));

  const xl = bool01(sp.get('pfXL'));
  if (xl !== undefined) o.extendLinRegLeft = xl;
  const xr = bool01(sp.get('pfXR'));
  if (xr !== undefined) o.extendLinRegRight = xr;
  const log = bool01(sp.get('pfLog'));
  if (log !== undefined) o.useLogChart = log;

  const useLg = bool01(sp.get('pfUseLg'));
  if (useLg !== undefined) o.useLargeLinReg = useLg;
  const useMd = bool01(sp.get('pfUseMd'));
  if (useMd !== undefined) o.useMediumLinReg = useMd;
  const useSm = bool01(sp.get('pfUseSm'));
  if (useSm !== undefined) o.useSmallLinReg = useSm;

  const showPri = bool01(sp.get('pfShowPri'));
  if (showPri !== undefined) o.showPrimaryTrendlines = showPri;
  const showSec = bool01(sp.get('pfShowSec'));
  if (showSec !== undefined) o.showSecondaryTrendlines = showSec;

  const pf = (k: string) => {
    const f = parseFloat(sp.get(k) || '');
    return Number.isFinite(f) ? f : undefined;
  };
  const lgM = pf('pfLgM');
  if (lgM !== undefined) o.linRegLargeMult = Math.min(20, Math.max(0.01, lgM));
  const mdM = pf('pfMdM');
  if (mdM !== undefined) o.linRegMediumMult = Math.min(20, Math.max(0.01, mdM));
  const smM = pf('pfSmM');
  if (smM !== undefined) o.linRegSmallMult = Math.min(20, Math.max(0.01, smM));

  const wi = (k: string) => {
    const n = parseInt(sp.get(k) || '', 10);
    return Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : undefined;
  };
  const lgW = wi('pfLgW');
  if (lgW !== undefined) o.linRegLargeWidth = lgW;
  const mdW = wi('pfMdW');
  if (mdW !== undefined) o.linRegMediumWidth = mdW;
  const smW = wi('pfSmW');
  if (smW !== undefined) o.linRegSmallWidth = smW;
  const bsW = wi('pfBsW');
  if (bsW !== undefined) o.linRegBaseWidth = bsW;
  const priW = wi('pfPriW');
  if (priW !== undefined) o.primaryTrendlineWidth = priW;
  const secW = wi('pfSecW');
  if (secW !== undefined) o.secondaryTrendlineWidth = secW;

  const sLg = decStyle(sp.get('pfLgSt'));
  if (sLg) o.linRegLargeStyle = sLg;
  const sMd = decStyle(sp.get('pfMdSt'));
  if (sMd) o.linRegMediumStyle = sMd;
  const sSm = decStyle(sp.get('pfSmSt'));
  if (sSm) o.linRegSmallStyle = sSm;
  const sBs = decStyle(sp.get('pfBsSt'));
  if (sBs) o.linRegBaseStyle = sBs;
  const sPri = decStyle(sp.get('pfPriSt'));
  if (sPri) o.primaryTrendlineStyle = sPri;
  const sSec = decStyle(sp.get('pfSecSt'));
  if (sSec) o.secondaryTrendlineStyle = sSec;

  const priX = sp.get('pfPriX');
  if (priX && EXT_VALID.has(priX)) o.primaryExtension = priX;
  const secX = sp.get('pfSecX');
  if (secX && EXT_VALID.has(secX)) o.secondaryExtension = secX;

  const priPl = parseInt(sp.get('pfPriPl') || '', 10);
  if (Number.isFinite(priPl)) o.primaryPivotLen = Math.min(60, Math.max(3, priPl));
  const secPl = parseInt(sp.get('pfSecPl') || '', 10);
  if (Number.isFinite(secPl)) o.secondaryPivotLen = Math.min(40, Math.max(2, secPl));

  return o;
}

function appendIfDiff<K extends keyof ParkfTrendlineOpts>(
  parts: string[],
  key: K,
  z: ParkfTrendlineOpts,
  d: ParkfTrendlineOpts,
  encode: (val: ParkfTrendlineOpts[K]) => string
) {
  if (z[key] !== d[key]) parts.push(encode(z[key]));
}

/** 기본값과 다른 필드만 쿼리 스트링 (&pfLen=…&…) */
export function parkfEngineOptsToQueryDiff(partial: Partial<ParkfTrendlineOpts>): string {
  const d = DEFAULT_PARKF_TRENDLINE_OPTS;
  const z: ParkfTrendlineOpts = { ...d, ...partial };
  const parts: string[] = [];

  appendIfDiff(parts, 'linregLength', z, d, (v) => `pfLen=${encodeURIComponent(String(v))}`);
  appendIfDiff(parts, 'extendLinRegLeft', z, d, (v) => `pfXL=${v ? 1 : 0}`);
  appendIfDiff(parts, 'extendLinRegRight', z, d, (v) => `pfXR=${v ? 1 : 0}`);
  appendIfDiff(parts, 'useLogChart', z, d, (v) => `pfLog=${v ? 1 : 0}`);
  appendIfDiff(parts, 'useLargeLinReg', z, d, (v) => `pfUseLg=${v ? 1 : 0}`);
  appendIfDiff(parts, 'useMediumLinReg', z, d, (v) => `pfUseMd=${v ? 1 : 0}`);
  appendIfDiff(parts, 'useSmallLinReg', z, d, (v) => `pfUseSm=${v ? 1 : 0}`);
  appendIfDiff(parts, 'showPrimaryTrendlines', z, d, (v) => `pfShowPri=${v ? 1 : 0}`);
  appendIfDiff(parts, 'showSecondaryTrendlines', z, d, (v) => `pfShowSec=${v ? 1 : 0}`);
  appendIfDiff(parts, 'linRegLargeMult', z, d, (v) => `pfLgM=${encodeURIComponent(String(v))}`);
  appendIfDiff(parts, 'linRegMediumMult', z, d, (v) => `pfMdM=${encodeURIComponent(String(v))}`);
  appendIfDiff(parts, 'linRegSmallMult', z, d, (v) => `pfSmM=${encodeURIComponent(String(v))}`);
  appendIfDiff(parts, 'linRegLargeWidth', z, d, (v) => `pfLgW=${v}`);
  appendIfDiff(parts, 'linRegMediumWidth', z, d, (v) => `pfMdW=${v}`);
  appendIfDiff(parts, 'linRegSmallWidth', z, d, (v) => `pfSmW=${v}`);
  appendIfDiff(parts, 'linRegBaseWidth', z, d, (v) => `pfBsW=${v}`);
  appendIfDiff(parts, 'primaryTrendlineWidth', z, d, (v) => `pfPriW=${v}`);
  appendIfDiff(parts, 'secondaryTrendlineWidth', z, d, (v) => `pfSecW=${v}`);
  appendIfDiff(parts, 'linRegLargeStyle', z, d, (v) => `pfLgSt=${encStyle(v)}`);
  appendIfDiff(parts, 'linRegMediumStyle', z, d, (v) => `pfMdSt=${encStyle(v)}`);
  appendIfDiff(parts, 'linRegSmallStyle', z, d, (v) => `pfSmSt=${encStyle(v)}`);
  appendIfDiff(parts, 'linRegBaseStyle', z, d, (v) => `pfBsSt=${encStyle(v)}`);
  appendIfDiff(parts, 'primaryTrendlineStyle', z, d, (v) => `pfPriSt=${encStyle(v)}`);
  appendIfDiff(parts, 'secondaryTrendlineStyle', z, d, (v) => `pfSecSt=${encStyle(v)}`);
  appendIfDiff(parts, 'primaryExtension', z, d, (v) => `pfPriX=${encodeURIComponent(String(v))}`);
  appendIfDiff(parts, 'secondaryExtension', z, d, (v) => `pfSecX=${encodeURIComponent(String(v))}`);
  appendIfDiff(parts, 'primaryPivotLen', z, d, (v) => `pfPriPl=${v}`);
  appendIfDiff(parts, 'secondaryPivotLen', z, d, (v) => `pfSecPl=${v}`);

  return parts.length ? `&${parts.join('&')}` : '';
}

/** 클라이언트 캐시·서버 analyzeKey용 짧은 시그니처 */
export function parkfEngineOptsCacheSegment(partial: Partial<ParkfTrendlineOpts>): string {
  const q = parkfEngineOptsToQueryDiff(partial);
  return q.length > 2 ? q.slice(1) : '';
}
