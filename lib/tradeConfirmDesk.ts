import type { AnalyzeResponse } from '@/types';
import type { MonthDeskCoreLevels } from '@/lib/monthDeskCoreLevels';
import type { MonthDeskBoardMetrics } from '@/lib/monthDeskBoardMetrics';
import type { MonthDeskTradeAction } from '@/lib/monthDeskTradeAction';

export type ConfirmPhase =
  | 'wait'
  | 'candidate'
  | 'confirmed'
  | 'confirmed_full'
  | 'at_entry'
  | 'invalid';

export type ConfirmNotifyKind =
  | 'candidate'
  | 'confirmed'
  | 'confirmed_full'
  | 'at_entry'
  | 'invalid';

export type TradeConfirmDesk = {
  phase: ConfirmPhase;
  phaseKo: string;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  gatesPassCount: number;
  isConfirmed: boolean;
  isFullConfirm: boolean;
  mtfBlocked: boolean;
  entryLow: number | null;
  entryHigh: number | null;
  entryKo: string;
  confirmPrice: number | null;
  confirmLabel: string;
  confirmKo: string;
  invalidPrice: number | null;
  tp1: number | null;
  close: number | null;
  steps: Array<{ key: string; label: string; done: boolean; active: boolean }>;
  notifyKind: ConfirmNotifyKind | null;
  notifyTitle: string;
  notifyBody: string;
  notifyKey: string;
};

function fmtPx(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toFixed(2);
}

function entryKo(lo: number | null, hi: number | null, mid: number | null): string {
  if (lo != null && hi != null) return `${fmtPx(Math.min(lo, hi))} ~ ${fmtPx(Math.max(lo, hi))}`;
  if (mid != null) return fmtPx(mid);
  return '—';
}

export function buildTradeConfirmDesk(
  analysis: AnalyzeResponse | null,
  metrics: MonthDeskBoardMetrics,
  levels: MonthDeskCoreLevels,
  ta: MonthDeskTradeAction
): TradeConfirmDesk | null {
  if (!analysis) return null;

  const cs = analysis.confirmedSignal;
  const settle = analysis.settlementZone;
  const zc = analysis.zoneBiasCard;
  const gates = metrics.gatesPassCount;
  const dir: 'LONG' | 'SHORT' | 'WAIT' =
    cs?.direction === 'LONG' || cs?.direction === 'SHORT'
      ? cs.direction
      : metrics.verdict;
  const isConfirmed = !!cs?.confirmed && (dir === 'LONG' || dir === 'SHORT');
  const isFullConfirm = isConfirmed && cs?.readinessTier === 'full' && !cs?.mtfBlocked;
  const mtfBlocked = !!cs?.mtfBlocked || metrics.mtfBlocked;

  const entryLo = levels.entryLow;
  const entryHi = levels.entryHigh;
  const close = levels.close;

  let confirmPrice: number | null = null;
  let confirmLabel = '확정·방어';
  if (settle?.state === 'confirmed' && settle.level != null) {
    confirmPrice = settle.level;
    confirmLabel = dir === 'LONG' ? '안착·확정 지지' : dir === 'SHORT' ? '안착·확정 저항' : '안착 확정';
  } else if (dir === 'LONG' && levels.support != null) {
    confirmPrice = levels.support;
    confirmLabel = '확정 지지(방어)';
  } else if (dir === 'SHORT' && levels.resistance != null) {
    confirmPrice = levels.resistance;
    confirmLabel = '확정 저항(방어)';
  } else if (zc && (zc.side === 'LONG' || zc.side === 'SHORT')) {
    confirmPrice = (zc.low + zc.high) / 2;
    confirmLabel = zc.side === 'LONG' ? 'OB·확정 구간' : 'OB·확정 구간';
  }

  let phase: ConfirmPhase = 'wait';
  let phaseKo = '대기 · 방향·게이트 부족';

  if (ta.status === 'invalid_hit') {
    phase = 'invalid';
    phaseKo = '무효 이탈 — 시나리오 중단';
  } else if (isFullConfirm) {
    phase = ta.status === 'at_entry' ? 'at_entry' : 'confirmed_full';
    phaseKo =
      ta.status === 'at_entry'
        ? `확정 ${dir === 'LONG' ? '롱' : '숏'} · 타점 구간 진입`
        : `확정 ${dir === 'LONG' ? '롱' : '숏'} 완료 (5/5 + MTF)`;
  } else if (isConfirmed) {
    phase = ta.status === 'at_entry' ? 'at_entry' : 'confirmed';
    phaseKo =
      ta.status === 'at_entry'
        ? `확정 ${dir === 'LONG' ? '롱' : '숏'} · 타점 안`
        : mtfBlocked
          ? `확정 ${dir === 'LONG' ? '롱' : '숏'} (MTF 보류)`
          : `확정 ${dir === 'LONG' ? '롱' : '숏'} — 타점 대기`;
  } else if (
    settle?.state === 'confirmed' &&
    settle.direction === dir &&
    (dir === 'LONG' || dir === 'SHORT')
  ) {
    phase = ta.status === 'at_entry' ? 'at_entry' : isConfirmed ? 'confirmed' : 'candidate';
    phaseKo =
      ta.status === 'at_entry'
        ? `안착 확정 ${settle.grade} · 타점 안`
        : `안착 확정 ${settle.grade} · ${dir === 'LONG' ? '롱' : '숏'} · 게이트 ${gates}/5`;
  } else if (settle?.state === 'candidate' && settle.direction === dir && gates >= 3) {
    phase = 'candidate';
    phaseKo = `안착 후보 ${settle.grade} · 확정 ${gates}/5`;
  } else if (gates >= 4 && (dir === 'LONG' || dir === 'SHORT')) {
    phase = 'candidate';
    phaseKo = `${dir === 'LONG' ? '롱' : '숏'} 후보 · 확정 ${gates}/5`;
  } else if (dir === 'LONG' || dir === 'SHORT') {
    phase = 'wait';
    phaseKo = `${dir === 'LONG' ? '롱' : '숏'} 편향 · 확정 ${gates}/5`;
  }

  const settleDone = settle?.state === 'confirmed' && settle.direction === dir;
  const steps = [
    { key: 'bias', label: '방향', done: dir === 'LONG' || dir === 'SHORT', active: phase === 'wait' && (dir === 'LONG' || dir === 'SHORT') },
    {
      key: 'settle',
      label: '안착',
      done: settleDone || settle?.state === 'failed',
      active: settle?.state === 'candidate' && settle.direction === dir,
    },
    { key: 'cand', label: '후보', done: gates >= 4, active: phase === 'candidate' },
    { key: 'conf', label: '확정', done: isConfirmed || settleDone, active: phase === 'confirmed' || phase === 'confirmed_full' },
    { key: 'entry', label: '타점', done: ta.status === 'at_entry', active: phase === 'at_entry' },
  ];

  const confirmKo =
    confirmPrice != null
      ? `${confirmLabel} ${fmtPx(confirmPrice)} — 이탈 시 재검토`
      : '확정 방어가 없음 — 지지/저항·무효 참고';

  let notifyKind: ConfirmNotifyKind | null = null;
  let notifyTitle = '';
  let notifyBody = '';

  const sym = analysis.symbol ?? '';
  const tf = analysis.timeframe ?? '';
  const eKo = entryKo(entryLo, entryHi, levels.entryMid);

  if (phase === 'invalid') {
    notifyKind = 'invalid';
    notifyTitle = `⚠ 무효 이탈 · ${sym}`;
    notifyBody = `${tf} · ${dir === 'LONG' ? '롱' : '숏'} 시나리오 중단 · 무효 ${levels.invalidation != null ? fmtPx(levels.invalidation) : '—'}`;
  } else if (phase === 'at_entry') {
    notifyKind = 'at_entry';
    notifyTitle = `★ 타점 진입 · ${dir} ${sym}`;
    notifyBody = `${tf} · 확정 후 타점 ${eKo} · 방어 ${confirmPrice != null ? fmtPx(confirmPrice) : '—'}`;
  } else if (phase === 'confirmed_full') {
    notifyKind = 'confirmed_full';
    notifyTitle = `✓ 확정 ${dir} · ${sym}`;
    notifyBody = `${tf} · 5/5 + MTF · 타점 ${eKo} · ${confirmLabel} ${confirmPrice != null ? fmtPx(confirmPrice) : ''}`;
  } else if (phase === 'confirmed') {
    notifyKind = 'confirmed';
    notifyTitle = `● 확정 ${dir} · ${sym}`;
    notifyBody = `${tf} · 게이트 ${gates}/5 · 타점 ${eKo} · ${confirmKo}`;
  } else if (phase === 'candidate') {
    notifyKind = 'candidate';
    notifyTitle = `◐ ${dir} 후보 · ${sym}`;
    notifyBody = `${tf} · 확정 ${gates}/5 · 타점 예정 ${eKo}`;
  }

  const notifyKey = notifyKind
    ? `${sym}|${tf}|${notifyKind}|${dir}|${eKo}|${confirmPrice ?? ''}|${levels.invalidation ?? ''}`
    : '';

  return {
    phase,
    phaseKo,
    direction: dir,
    gatesPassCount: gates,
    isConfirmed,
    isFullConfirm,
    mtfBlocked,
    entryLow: entryLo,
    entryHigh: entryHi,
    entryKo: eKo,
    confirmPrice,
    confirmLabel,
    confirmKo,
    invalidPrice: levels.invalidation,
    tp1: levels.targets[0] ?? null,
    close,
    steps,
    notifyKind,
    notifyTitle,
    notifyBody,
    notifyKey,
  };
}

/** 이전 단계 대비 새로 알릴 이벤트 */
export function detectConfirmNotifyTransition(
  prevPhase: ConfirmPhase | null,
  desk: TradeConfirmDesk
): ConfirmNotifyKind | null {
  if (!desk.notifyKind) return null;
  const next = desk.phase;
  if (next === prevPhase) return null;

  if (next === 'invalid' && prevPhase !== 'invalid') return 'invalid';
  if (next === 'at_entry' && prevPhase !== 'at_entry') return 'at_entry';
  if (next === 'confirmed_full' && prevPhase !== 'confirmed_full' && prevPhase !== 'at_entry') return 'confirmed_full';
  if (
    next === 'confirmed' &&
    prevPhase !== 'confirmed' &&
    prevPhase !== 'confirmed_full' &&
    prevPhase !== 'at_entry'
  ) {
    return 'confirmed';
  }
  if (next === 'candidate' && (prevPhase === 'wait' || prevPhase === null)) return 'candidate';

  return null;
}
