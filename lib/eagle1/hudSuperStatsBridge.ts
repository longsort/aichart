/**
 * Eagle1 HUD ↔ AI超级变身统计 Hub 브릿지.
 * 과거 표본 PATH UNAVAILABLE / 통계 부족일 때도 Hub 시나리오·합의로 패널을 채운다.
 * 가짜 승률·확정 수익 금지.
 */
import { formatPriceCompact } from './chartUx';
import { AI_SUPER_BIANSHEN_STATS } from './aiSuperBianShenStats';
import type { Eagle1CanonicalTradeDisplay } from './canonicalTradeDisplay';
import type { MergedDeskSuperAdvancedStats } from '@/lib/mergedDeskSuperAdvancedStats';

export type HubScenarioPathRow = {
  id: string;
  uiState: 'ON_TRACK' | 'WAIT' | 'PATH_UNAVAILABLE';
  note: string;
};

/** 과거 경로 게이트가 비어도 Hub 타점으로 MAIN/ALT/BREAK 시나리오 */
export function buildHubScenarioPathCluster(
  canon: Eagle1CanonicalTradeDisplay | null | undefined
): HubScenarioPathRow[] {
  if (!canon?.superStats) {
    return [
      { id: 'MAIN', uiState: 'PATH_UNAVAILABLE', note: `${AI_SUPER_BIANSHEN_STATS} 대기` },
      { id: 'ALT', uiState: 'WAIT', note: '반대 시나리오 대기' },
      { id: 'BREAK', uiState: 'WAIT', note: '무효화 대기' },
    ];
  }
  const s = canon.superStats;
  const e = formatPriceCompact(s.entry);
  const sl = formatPriceCompact(s.stopLoss);
  const tp = formatPriceCompact(s.tp1);
  const levels = `E${e} · SL${sl} · TP1${tp}`;
  if (canon.direction === 'WAIT' || !s.entry) {
    return [
      {
        id: 'MAIN',
        uiState: 'WAIT',
        note: `${AI_SUPER_BIANSHEN_STATS} · ${s.verdictKo} · 합의 타점 대기`,
      },
      { id: 'ALT', uiState: 'WAIT', note: '롱·숏 합의 부족 · 반대 감시' },
      {
        id: 'BREAK',
        uiState: 'WAIT',
        note: s.invalidationKo || '무효화 조건 확인',
      },
    ];
  }
  const opposite = canon.direction === 'LONG' ? '숏' : '롱';
  return [
    {
      id: 'MAIN',
      uiState: 'ON_TRACK',
      note: `${s.verdictKo} · ${levels}`,
    },
    {
      id: 'ALT',
      uiState: 'WAIT',
      note: `${opposite} 전환 조건 · 합의 반전 시`,
    },
    {
      id: 'BREAK',
      uiState: 'WAIT',
      note: s.invalidationKo || `무효 · SL ${sl}`,
    },
  ];
}

export function hubEntryQualityFromStats(
  stats: MergedDeskSuperAdvancedStats | null | undefined
): { score: number; labelKo: string; note: string } | null {
  if (!stats) return null;
  const gap = Math.abs(stats.longPct - stats.shortPct);
  const base = Math.round(
    clamp(stats.strength * 0.55 + gap * 0.9 + (stats.entryAllowed ? 12 : 0), 0, 100)
  );
  const labelKo =
    base >= 78 ? '진입 양호(변신)' : base >= 55 ? '진입 보통(변신)' : base >= 35 ? '진입 낮음(변신)' : '대기(변신)';
  return {
    score: base,
    labelKo,
    note: `${AI_SUPER_BIANSHEN_STATS} · 합의·강도 근사 · 확정 아님`,
  };
}

export function hubCombinationSupplementKo(
  stats: MergedDeskSuperAdvancedStats | null | undefined,
  sampleSize: number
): string {
  if (!stats) return '';
  const nHint = sampleSize > 0 && sampleSize < 30 ? `과거 n=${sampleSize} 부족 · ` : '';
  return `${nHint}${AI_SUPER_BIANSHEN_STATS} 합의 롱${stats.longPct}%/숏${stats.shortPct}% · ${stats.verdictKo}`;
}

export function hubEvidenceLines(
  canon: Eagle1CanonicalTradeDisplay | null | undefined,
  max = 12
): string[] {
  const reasons = canon?.superStats?.reasonsKo ?? [];
  const hint = canon?.noteKo ? [canon.noteKo] : [];
  return [...hint, ...reasons].filter(Boolean).slice(0, max);
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
