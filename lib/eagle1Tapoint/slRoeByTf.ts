/**
 * 타점엔진 TF별 손절 ROE% (20배 기준 사용자 세팅).
 * 1·3·5m = 5.5% · 15m = 8%(7~10 중간) · 1H+ = 12%(길게)
 */
import { normalizeTapointTf } from '@/lib/eagle1Tapoint/symbolEntryTf';

export const TAPOINT_SL_ROE_BY_TF: Record<string, number> = {
  '1m': 5.5,
  '3m': 5.5,
  '5m': 5.5,
  '15m': 8,
  '1H': 12,
  '4H': 14,
  '1D': 16,
};

export function resolveTapointSlRoePct(timeframe: string | null | undefined): number {
  const tf = normalizeTapointTf(timeframe);
  if (TAPOINT_SL_ROE_BY_TF[tf] != null) return TAPOINT_SL_ROE_BY_TF[tf]!;
  const low = String(timeframe || '').toLowerCase();
  if (low === '1h') return 12;
  if (low === '4h') return 14;
  return 8;
}

export function tapointSlRoeLabelKo(): string {
  return '손절ROE · 1/3/5m=5.5% · 15m=8% · 1H=12%(길게)';
}
