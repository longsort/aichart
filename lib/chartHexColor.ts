/** 차트 오버레이용 #RRGGBB 정규화·rgba 변환 (다크 배경 대비) */

/** TradingView LinReg·Trendlines 참고: 금 채널 + 빨간 추세선 */
export const DEFAULT_PARKF_LINREG_BASE_HEX = '#EAB308';
export const DEFAULT_PARKF_LINREG_LARGE_HEX = '#CA8A04';
export const DEFAULT_PARKF_LINREG_MEDIUM_HEX = '#EAB308';
export const DEFAULT_PARKF_LINREG_SMALL_HEX = '#FACC15';
export const DEFAULT_PARKF_TREND_PRIMARY_HEX = '#EF4444';
export const DEFAULT_PARKF_TREND_SECONDARY_HEX = '#F87171';

export type ParkfTrendlineColorHex = {
  linRegBaseHex: string;
  linRegLargeHex: string;
  linRegMediumHex: string;
  linRegSmallHex: string;
  trendPrimaryHex: string;
  trendSecondaryHex: string;
};

export const DEFAULT_PARKF_TRENDLINE_COLORS: ParkfTrendlineColorHex = {
  linRegBaseHex: DEFAULT_PARKF_LINREG_BASE_HEX,
  linRegLargeHex: DEFAULT_PARKF_LINREG_LARGE_HEX,
  linRegMediumHex: DEFAULT_PARKF_LINREG_MEDIUM_HEX,
  linRegSmallHex: DEFAULT_PARKF_LINREG_SMALL_HEX,
  trendPrimaryHex: DEFAULT_PARKF_TREND_PRIMARY_HEX,
  trendSecondaryHex: DEFAULT_PARKF_TREND_SECONDARY_HEX,
};

export function normalizeHex6(input: string | undefined | null, fallback: string): string {
  const fb = fallback.startsWith('#') ? fallback : `#${fallback}`;
  if (input == null || typeof input !== 'string') return fb;
  const t = input.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(t)) return fb;
  return `#${t.toUpperCase()}`;
}

/** 쿼리/로컬스토리지용 6자리( # 없음 ) */
export function parseHex6Param(v: string | null | undefined): string | undefined {
  if (v == null || typeof v !== 'string') return undefined;
  const t = v.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(t)) return undefined;
  return `#${t.toUpperCase()}`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = normalizeHex6(hex, '#E2E8F0').replace(/^#/, '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r},${g},${b},${a})`;
}

export function mergeParkfTrendlineColors(partial?: Partial<ParkfTrendlineColorHex>): ParkfTrendlineColorHex {
  const d = DEFAULT_PARKF_TRENDLINE_COLORS;
  return {
    linRegBaseHex: normalizeHex6(partial?.linRegBaseHex, d.linRegBaseHex),
    linRegLargeHex: normalizeHex6(partial?.linRegLargeHex, d.linRegLargeHex),
    linRegMediumHex: normalizeHex6(partial?.linRegMediumHex, d.linRegMediumHex),
    linRegSmallHex: normalizeHex6(partial?.linRegSmallHex, d.linRegSmallHex),
    trendPrimaryHex: normalizeHex6(partial?.trendPrimaryHex, d.trendPrimaryHex),
    trendSecondaryHex: normalizeHex6(partial?.trendSecondaryHex, d.trendSecondaryHex),
  };
}
