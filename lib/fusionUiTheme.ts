import type { Verdict } from '@/types';
import type { SignalGrade } from '@/lib/unifiedSignalTypes';

/** API/내부 verdict → 화면용 한글 */
export function verdictLabelKo(v: Verdict | string | undefined | null): string {
  if (v == null || v === '') return '–';
  const u = String(v).toUpperCase();
  if (u === 'LONG') return '롱';
  if (u === 'SHORT') return '숏';
  if (u === 'WATCH') return '관망';
  return String(v);
}

/** 통합 신호 게이트 실패 키 → 한글 */
export function gateFailedLabelKo(key: string): string {
  if (key.startsWith('riskFlags:')) {
    const n = key.slice('riskFlags:'.length);
    return `리스크 플래그 ${n}건`;
  }
  if (key === 'zone_bucket_invalid') return '존 시그널 단계 무효';
  return key;
}

/** 퓨전 등급별 UI 악센트 (글로우·링·메인 색) */
export function fusionTheme(grade: SignalGrade): { main: string; dim: string; glow: string; ring: string } {
  switch (grade) {
    case 'CONFIRMED':
      return { main: '#4ade80', dim: '#16a34a', glow: 'rgba(74,222,128,0.4)', ring: 'rgba(74,222,128,0.55)' };
    case 'LEAN':
      return { main: '#5eead4', dim: '#0d9488', glow: 'rgba(94,234,212,0.35)', ring: 'rgba(45,212,191,0.5)' };
    case 'WATCH':
      return { main: '#fcd34d', dim: '#d97706', glow: 'rgba(252,211,77,0.3)', ring: 'rgba(245,158,11,0.5)' };
    case 'CONFLICT':
      return { main: '#fdba74', dim: '#ea580c', glow: 'rgba(253,186,116,0.35)', ring: 'rgba(249,115,22,0.48)' };
    default:
      return { main: '#cbd5e1', dim: '#64748b', glow: 'rgba(148,163,184,0.22)', ring: 'rgba(148,163,184,0.4)' };
  }
}
