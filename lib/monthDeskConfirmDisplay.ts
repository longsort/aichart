/**
 * 마감·안착 — 확정 단계 UI (tradeConfirmDesk + 게이트 연동)
 */
import type { AnalyzeResponse } from '@/types';
import type { MonthDeskBoardMetrics } from '@/lib/monthDeskBoardMetrics';
import type { ConfirmPhase, TradeConfirmDesk } from '@/lib/tradeConfirmDesk';

export type MonthDeskConfirmDisplay = {
  phase: ConfirmPhase;
  headlineKo: string;
  badgeKo: string;
  badgeTone: 'long' | 'short' | 'wait' | 'warn' | 'neutral';
  isAnyConfirm: boolean;
  isFullConfirm: boolean;
  isSettleConfirm: boolean;
  steps: Array<{ key: string; label: string; done: boolean; active: boolean }>;
  explainLines: string[];
};

function dirKo(dir: 'LONG' | 'SHORT' | 'WAIT'): string {
  if (dir === 'LONG') return '롱';
  if (dir === 'SHORT') return '숏';
  return '관망';
}

export function buildMonthDeskConfirmDisplay(
  desk: TradeConfirmDesk | null,
  metrics: MonthDeskBoardMetrics,
  analysis: AnalyzeResponse | null
): MonthDeskConfirmDisplay {
  const dir = metrics.verdict;
  const gates = metrics.gatesPassCount ?? 0;
  const settle = analysis?.settlementZone;
  const settleOk =
    settle?.state === 'confirmed' &&
    (settle.direction === 'LONG' || settle.direction === 'SHORT') &&
    settle.direction === dir;

  const steps =
    desk?.steps?.map((s) => ({ key: s.key, label: s.label, done: s.done, active: s.active })) ?? [
      { key: 'bias', label: '방향', done: dir !== 'WAIT', active: dir !== 'WAIT' },
      { key: 'settle', label: '안착', done: !!settleOk, active: settle?.state === 'candidate' },
      { key: 'cand', label: '후보', done: gates >= 4, active: gates >= 3 && gates < 4 },
      { key: 'conf', label: '확정', done: !!metrics.confirmed, active: gates >= 4 && !metrics.confirmed },
      { key: 'entry', label: '타점', done: false, active: false },
    ];

  if (!desk) {
    const headlineKo =
      dir === 'WAIT'
        ? '관망 · 방향 없음'
        : settleOk
          ? `${dirKo(dir)} · 마감·안착 확정 · 게이트 ${gates}/5`
          : `${dirKo(dir)} 우세 · 게이트 ${gates}/5 · 확정 대기`;
    return {
      phase: 'wait',
      headlineKo,
      badgeKo: settleOk ? '안착 확정' : `게이트 ${gates}/5`,
      badgeTone: dir === 'LONG' ? 'long' : dir === 'SHORT' ? 'short' : 'wait',
      isAnyConfirm: settleOk,
      isFullConfirm: false,
      isSettleConfirm: settleOk,
      steps,
      explainLines: [
        '확정은 단계별로 쌓입니다: 방향 → 마감·안착 → 후보(4/5) → 확정(5/5) → 타점.',
        settleOk
          ? '현재: 캔들·존 기준 마감·안착은 확정됐으나, 5요소 게이트는 아직 부족할 수 있습니다.'
          : `현재: 게이트 ${gates}/5 — 구조·RSI·S/R·종가·FVG를 채워야 확정 단계로 올라갑니다.`,
        '참고·교육용 — 무효 이탈 시 시나리오를 다시 봅니다.',
      ],
    };
  }

  const d = desk.direction;
  const phase = desk.phase;
  let headlineKo = desk.phaseKo;
  let badgeKo = `게이트 ${gates}/5`;
  let badgeTone: MonthDeskConfirmDisplay['badgeTone'] =
    d === 'LONG' ? 'long' : d === 'SHORT' ? 'short' : 'wait';
  let isAnyConfirm = false;
  let isFullConfirm = !!desk.isFullConfirm;

  switch (phase) {
    case 'confirmed_full':
      headlineKo = `${dirKo(d)} · 5/5 + MTF 확정(참고)`;
      badgeKo = '5/5 확정';
      isAnyConfirm = true;
      break;
    case 'confirmed':
      headlineKo = `${dirKo(d)} · 확정(참고) · 게이트 ${gates}/5`;
      badgeKo = desk.mtfBlocked ? '확정·MTF보류' : '확정';
      isAnyConfirm = true;
      break;
    case 'at_entry':
      headlineKo = `${dirKo(d)} · 확정 · 타점 구간`;
      badgeKo = '타점';
      isAnyConfirm = true;
      break;
    case 'candidate':
      if (settleOk) {
        headlineKo = `${dirKo(d)} · 마감·안착 확정 · 게이트 ${gates}/5`;
        badgeKo = gates >= 4 ? '후보·4/5' : '안착 확정';
      } else {
        headlineKo = `${dirKo(d)} · 확정 후보 · 게이트 ${gates}/5`;
        badgeKo = gates >= 4 ? '후보 4/5' : '후보';
      }
      break;
    case 'invalid':
      headlineKo = '무효 이탈 — 시나리오 중단';
      badgeKo = '무효';
      badgeTone = 'warn';
      break;
    default:
      if (settleOk) {
        headlineKo = `${dirKo(d)} · 마감·안착 확정 · 게이트 ${gates}/5`;
        badgeKo = '안착 확정';
        isAnyConfirm = true;
      } else {
        headlineKo = `${dirKo(d)} 우세 · 게이트 ${gates}/5 · 확정 대기`;
        badgeKo = `대기 ${gates}/5`;
      }
      break;
  }

  const explainLines = [
    '【확정 단계】 방향 → 안착 → 후보(4/5) → 확정(5/5) → 타점.',
    `현재: ${desk.phaseKo}`,
    isFullConfirm
      ? '5요소(구조·RSI·S/R·종가·FVG) 전부 + MTF 통과 — 가장 높은 확정 단계(참고).'
      : isAnyConfirm
        ? '일부 조건은 충족됐습니다. 5/5 전에는 “완전 확정”이 아닙니다.'
        : `게이트 ${gates}/5 — RSI 85+, 지지/저항 0.3% 이내, 종가 정배열, FVG 등이 필요합니다.`,
    metrics.mtfBlocked ? 'MTF: 상위 타임프레임이 반대면 5/5여도 확정이 억제될 수 있습니다.' : '',
    '참고·교육용 — 실제 매매 확정이 아닙니다.',
  ].filter(Boolean);

  return {
    phase,
    headlineKo,
    badgeKo,
    badgeTone,
    isAnyConfirm: isAnyConfirm || !!desk.isConfirmed || settleOk,
    isFullConfirm,
    isSettleConfirm: settleOk,
    steps,
    explainLines,
  };
}
