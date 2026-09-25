/**
 * 수익패턴엔진 — 가상/LIVE 공통 보강 정책.
 * 메이커 · 롱만 · SL0.4% · 보유1봉(H1)·타임아웃=미진입 · 하루 N · 비중캡.
 */
export const PP_PAPER_FEE_MODE = 'maker' as const;
export const PP_PAPER_HORIZON_BARS = 1;
export const PP_PAPER_MAX_TRADES_PER_DAY = 4;
export const PP_PAPER_COOLDOWN_BARS = 2;
export const PP_PAPER_MAKER_FEE = 0.0002;

export type PpDirectionMode = 'LONG' | 'SHORT' | 'BOTH';
export const PP_PAPER_DIRECTION_MODE: PpDirectionMode = 'LONG';
export const PP_PAPER_SL_FRAC = 0.004;
export const PP_PAPER_MAX_LOSS_ROE_PCT = 22;
export const PP_PAPER_MIN_SIZE_SCALE = 0.35;
export const PP_LEVERAGE = 50;
export const PP_TARGET_NET_ROE_PCT = 5;

export const PP_PAPER_POLICY_KO = [
  '메이커(지정가) 가정만',
  '방향=롱만',
  `손절=${(PP_PAPER_SL_FRAC * 100).toFixed(2)}%(패ROE≤${PP_PAPER_MAX_LOSS_ROE_PCT}%p)`,
  `보유=${PP_PAPER_HORIZON_BARS}봉 · 미도달=타임아웃→미진입`,
  '비중=손절ROE 대비 캡 스케일',
  `하루 확정매매 ≤${PP_PAPER_MAX_TRADES_PER_DAY}회`,
  '전코인(*USDT) · 차트 E/SL/TP 진입후 고정',
  'AMBIGUOUS·TIMEOUT은 승·패 제외',
  '확정 수익·고정 승률 아님',
].join(' · ');

export function ppUtcDayKey(sec: number): string {
  const d = new Date(sec * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ppDirectionAllowed(dir: 'LONG' | 'SHORT' | null | undefined): boolean {
  if (dir !== 'LONG' && dir !== 'SHORT') return false;
  if (PP_PAPER_DIRECTION_MODE === 'BOTH') return true;
  return dir === PP_PAPER_DIRECTION_MODE;
}

export function ppGrossLossRoePct(slFrac: number, leverage: number): number {
  const lev = Math.max(1, leverage);
  return Math.max(0, slFrac) * lev * 100;
}

export function ppSizeScaleFromSl(slFrac: number, leverage: number): number {
  const gross = ppGrossLossRoePct(slFrac, leverage);
  if (!(gross > 0)) return 0;
  const raw = Math.min(1, PP_PAPER_MAX_LOSS_ROE_PCT / gross);
  if (raw < PP_PAPER_MIN_SIZE_SCALE) return 0;
  return Number(raw.toFixed(4));
}

export function ppDirectionWhyKo(dir: 'LONG' | 'SHORT' | null | undefined): string {
  if (ppDirectionAllowed(dir)) return '';
  return `방향게이트 · ${PP_PAPER_DIRECTION_MODE}만 허용`;
}
