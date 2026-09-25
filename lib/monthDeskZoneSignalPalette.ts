import type { ClosingEnvelopeFuturesScenario } from '@/lib/institutionalSuperBand';
import { MONTH_DESK_TRAINER } from '@/lib/monthDeskChartTrainerTheme';

const T = MONTH_DESK_TRAINER;

/** 마감·안착 zone 신호 — 확정 / 후보 / 편향 / 대기 */
export type MonthDeskZoneSignal =
  | 'CONFIRMED_LONG'
  | 'CONFIRMED_SHORT'
  | 'LONG_CANDIDATE'
  | 'SHORT_CANDIDATE'
  | 'LONG'
  | 'SHORT'
  | 'WAIT'
  | 'WAIT_MTF'
  | 'MISMATCH';

export type MonthDeskConfirmedInput = {
  confirmed?: boolean;
  direction?: 'LONG' | 'SHORT' | null;
  gatesPassCount?: number;
  readinessTier?: 'none' | 'building' | 'prepared' | 'strong' | 'full' | 'mtf_veto';
  mtfBlocked?: boolean;
  reasons?: string[];
};

export type MonthDeskZoneResolveMeta = {
  signal: MonthDeskZoneSignal;
  gatesPassCount: number;
  confirmedAligned: boolean;
  mismatch: boolean;
  confirmedTooltipKo: string | null;
};

export type MonthDeskZonePalette = {
  pocketLabel: string;
  coreLabel: string;
  zoneFill: string;
  coreFill: string;
  lineLabel: string;
  entryLine: string;
  entryLabel: string;
  slLine: string;
  slLabel: string;
  tpLine: string;
  tpLineSoft: string;
  tpLabel: string;
  cssDir: string;
};

const BASE_LONG: Omit<MonthDeskZonePalette, 'pocketLabel' | 'coreLabel' | 'zoneFill' | 'coreFill' | 'cssDir'> = {
  lineLabel: T.long.lineLabel,
  entryLine: T.plan.eLong,
  entryLabel: '롱 진입(E)',
  slLine: T.plan.sl,
  slLabel: '손절(SL)',
  tpLine: T.plan.tp,
  tpLineSoft: T.plan.tpSoft,
  tpLabel: '수익',
};

const BASE_SHORT: Omit<MonthDeskZonePalette, 'pocketLabel' | 'coreLabel' | 'zoneFill' | 'coreFill' | 'cssDir'> = {
  lineLabel: T.short.lineLabel,
  entryLine: T.plan.eShort,
  entryLabel: '숏 진입(E)',
  slLine: T.plan.sl,
  slLabel: '손절(SL)',
  tpLine: T.plan.tp,
  tpLineSoft: T.plan.tpSoft,
  tpLabel: '수익',
};

const PALETTE: Record<MonthDeskZoneSignal, MonthDeskZonePalette> = {
  CONFIRMED_LONG: {
    ...BASE_LONG,
    pocketLabel: '확정 롱 진입구간',
    coreLabel: '확정 롱·코어',
    zoneFill: T.long.zoneFill,
    coreFill: T.long.coreFill,
    entryLabel: '확정 롱 진입(E)',
    cssDir: 'confirmed-long',
  },
  CONFIRMED_SHORT: {
    ...BASE_SHORT,
    pocketLabel: '확정 숏 진입구간',
    coreLabel: '확정 숏·코어',
    zoneFill: T.short.zoneFill,
    coreFill: T.short.coreFill,
    entryLabel: '확정 숏 진입(E)',
    cssDir: 'confirmed-short',
  },
  LONG_CANDIDATE: {
    ...BASE_LONG,
    pocketLabel: '롱 후보구간',
    coreLabel: '롱 후보·코어',
    zoneFill: 'rgba(16,185,129,0.2)',
    coreFill: 'rgba(52,211,153,0.28)',
    entryLabel: '롱 후보(E)',
    cssDir: 'candidate-long',
  },
  SHORT_CANDIDATE: {
    ...BASE_SHORT,
    pocketLabel: '숏 후보구간',
    coreLabel: '숏 후보·코어',
    zoneFill: 'rgba(244,63,94,0.19)',
    coreFill: 'rgba(251,113,133,0.26)',
    entryLabel: '숏 후보(E)',
    cssDir: 'candidate-short',
  },
  LONG: {
    ...BASE_LONG,
    pocketLabel: '롱 진입구간',
    coreLabel: '롱·코어',
    zoneFill: 'rgba(16,185,129,0.18)',
    coreFill: 'rgba(52,211,153,0.24)',
    cssDir: 'long',
  },
  SHORT: {
    ...BASE_SHORT,
    pocketLabel: '숏 진입구간',
    coreLabel: '숏·코어',
    zoneFill: 'rgba(244,63,94,0.17)',
    coreFill: 'rgba(251,113,133,0.23)',
    cssDir: 'short',
  },
  WAIT: {
    pocketLabel: '대기구간',
    coreLabel: '대기·코어',
    zoneFill: T.wait.zoneFill,
    coreFill: T.wait.coreFill,
    lineLabel: T.wait.lineLabel,
    entryLine: T.wait.entryLine,
    entryLabel: '대기·관망',
    slLine: 'rgba(248,113,113,0.88)',
    slLabel: '무효(SL)',
    tpLine: 'rgba(148,163,184,0.78)',
    tpLineSoft: 'rgba(148,163,184,0.55)',
    tpLabel: '목표',
    cssDir: 'wait',
  },
  WAIT_MTF: {
    pocketLabel: '대기·MTF반대',
    coreLabel: '대기·코어',
    zoneFill: 'rgba(234,179,8,0.2)',
    coreFill: 'rgba(250,204,21,0.27)',
    lineLabel: '#fef3c7',
    entryLine: T.wait.entryLine,
    entryLabel: 'MTF반대·관망',
    slLine: 'rgba(248,113,113,0.88)',
    slLabel: '무효(SL)',
    tpLine: 'rgba(148,163,184,0.78)',
    tpLineSoft: 'rgba(148,163,184,0.55)',
    tpLabel: '목표',
    cssDir: 'wait-mtf',
  },
  MISMATCH: {
    pocketLabel: '방향불일치·대기',
    coreLabel: '불일치·코어',
    zoneFill: 'rgba(251,191,36,0.2)',
    coreFill: 'rgba(253,224,71,0.28)',
    lineLabel: '#fde68a',
    entryLine: 'rgba(251,191,36,0.98)',
    entryLabel: '불일치·관망',
    slLine: 'rgba(248,113,113,0.9)',
    slLabel: '무효(SL)',
    tpLine: 'rgba(148,163,184,0.78)',
    tpLineSoft: 'rgba(148,163,184,0.55)',
    tpLabel: '목표',
    cssDir: 'mismatch',
  },
};

export function monthDeskZoneIsWait(signal: MonthDeskZoneSignal): boolean {
  return signal === 'WAIT' || signal === 'WAIT_MTF' || signal === 'MISMATCH';
}

export function monthDeskZoneIsConfirmed(signal: MonthDeskZoneSignal): boolean {
  return signal === 'CONFIRMED_LONG' || signal === 'CONFIRMED_SHORT';
}

/** Hot Zone 등 단순 롱/숏/대기 매핑 */
export function monthDeskZoneBaseDirection(signal: MonthDeskZoneSignal): 'LONG' | 'SHORT' | 'WAIT' {
  if (
    signal === 'CONFIRMED_LONG' ||
    signal === 'LONG_CANDIDATE' ||
    signal === 'LONG'
  ) {
    return 'LONG';
  }
  if (
    signal === 'CONFIRMED_SHORT' ||
    signal === 'SHORT_CANDIDATE' ||
    signal === 'SHORT'
  ) {
    return 'SHORT';
  }
  return 'WAIT';
}

function scenarioBiasDir(
  scenario: ClosingEnvelopeFuturesScenario | null | undefined
): 'LONG' | 'SHORT' | null {
  if (!scenario || scenario.lastVerdict === '불안' || scenario.bias === 'NEUTRAL') return null;
  if (scenario.bias === 'LONG') return 'LONG';
  if (scenario.bias === 'SHORT') return 'SHORT';
  return null;
}

function formatConfirmedTooltipKo(
  confirmed: MonthDeskConfirmedInput,
  gates: number
): string {
  const parts: string[] = [`5요소 게이트 ${gates}/5`];
  if (confirmed.readinessTier === 'mtf_veto' || confirmed.mtfBlocked) {
    parts.push('MTF 반대로 확정 보류');
  }
  const rs = confirmed.reasons?.filter((r) => typeof r === 'string' && r.trim()).slice(0, 5);
  if (rs?.length) parts.push(rs.join(' · '));
  return parts.join(' — ');
}

/**
 * 우선순위: MTF보류 → 확정(5/5+마감안착+편향일치) → 후보(4/5+) → 마감존 편향 → 대기
 */
export function resolveMonthDeskZoneSignal(
  scenario: ClosingEnvelopeFuturesScenario | null | undefined,
  confirmed?: MonthDeskConfirmedInput | null,
  verdict?: string | null,
  priceAction?: MonthDeskPriceActionInput | null
): MonthDeskZoneResolveMeta {
  const gates = Math.max(0, Math.min(5, Number(confirmed?.gatesPassCount ?? 0) || 0));
  const tier = confirmed?.readinessTier;
  const scenDir = scenarioBiasDir(scenario);
  const lastV = scenario?.lastVerdict;
  const settled = lastV === '안착';
  const confDir =
    confirmed?.confirmed && (confirmed.direction === 'LONG' || confirmed.direction === 'SHORT')
      ? confirmed.direction
      : null;
  const paBias = priceActionBias(priceAction);
  const vDirEarly = verdict === 'LONG' || verdict === 'SHORT' ? verdict : null;

  if (tier === 'mtf_veto' || (confirmed?.mtfBlocked && gates >= 5)) {
    return {
      signal: 'WAIT_MTF',
      gatesPassCount: gates,
      confirmedAligned: false,
      mismatch: false,
      confirmedTooltipKo: formatConfirmedTooltipKo(confirmed ?? {}, gates),
    };
  }

  if (confDir && scenDir && confDir !== scenDir && settled) {
    return {
      signal: 'MISMATCH',
      gatesPassCount: gates,
      confirmedAligned: false,
      mismatch: true,
      confirmedTooltipKo: `확정 ${confDir === 'LONG' ? '롱' : '숏'} vs 마감존 ${scenDir === 'LONG' ? '롱' : '숏'} 편향 불일치 — ${formatConfirmedTooltipKo(confirmed ?? {}, gates)}`,
    };
  }

  if (confDir === 'LONG' && settled && scenDir === 'LONG') {
    return {
      signal: 'CONFIRMED_LONG',
      gatesPassCount: gates,
      confirmedAligned: true,
      mismatch: false,
      confirmedTooltipKo: formatConfirmedTooltipKo(confirmed ?? {}, gates),
    };
  }
  if (confDir === 'SHORT' && settled && scenDir === 'SHORT') {
    return {
      signal: 'CONFIRMED_SHORT',
      gatesPassCount: gates,
      confirmedAligned: true,
      mismatch: false,
      confirmedTooltipKo: formatConfirmedTooltipKo(confirmed ?? {}, gates),
    };
  }

  if (confDir === 'LONG' || confDir === 'SHORT') {
    const mismatch = Boolean(scenDir && confDir !== scenDir);
    if (mismatch) {
      return {
        signal: 'MISMATCH',
        gatesPassCount: gates,
        confirmedAligned: false,
        mismatch: true,
        confirmedTooltipKo: formatConfirmedTooltipKo(confirmed ?? {}, gates),
      };
    }
    return {
      signal: confDir === 'LONG' ? 'LONG_CANDIDATE' : 'SHORT_CANDIDATE',
      gatesPassCount: gates,
      confirmedAligned: false,
      mismatch: false,
      confirmedTooltipKo: `5/5 확정·마감 안착 미정합 — ${formatConfirmedTooltipKo(confirmed ?? {}, gates)}`,
    };
  }

  const vDir = verdict === 'LONG' || verdict === 'SHORT' ? verdict : null;
  const candDir = gates >= 4 ? vDir ?? scenDir : null;
  if (candDir === 'LONG') {
    return {
      signal: 'LONG_CANDIDATE',
      gatesPassCount: gates,
      confirmedAligned: false,
      mismatch: false,
      confirmedTooltipKo: gates > 0 ? `게이트 ${gates}/5 — 확정 미충족` : null,
    };
  }
  if (candDir === 'SHORT') {
    return {
      signal: 'SHORT_CANDIDATE',
      gatesPassCount: gates,
      confirmedAligned: false,
      mismatch: false,
      confirmedTooltipKo: gates > 0 ? `게이트 ${gates}/5 — 확정 미충족` : null,
    };
  }

  if (!scenario) {
    return {
      signal: 'WAIT',
      gatesPassCount: gates,
      confirmedAligned: false,
      mismatch: false,
      confirmedTooltipKo: null,
    };
  }
  if (scenario.lastVerdict === '불안') {
    if (paBias === 'SHORT' || (vDirEarly === 'SHORT' && paBias !== 'LONG')) {
      return {
        signal: 'SHORT',
        gatesPassCount: gates,
        confirmedAligned: false,
        mismatch: false,
        confirmedTooltipKo: '마감 불안·가격은 존 하향 이탈(참고 숏).',
      };
    }
    if (paBias === 'LONG' || (vDirEarly === 'LONG' && paBias !== 'SHORT')) {
      return {
        signal: 'LONG',
        gatesPassCount: gates,
        confirmedAligned: false,
        mismatch: false,
        confirmedTooltipKo: '마감 불안·가격은 존 상향 이탈(참고 롱).',
      };
    }
    return {
      signal: 'WAIT',
      gatesPassCount: gates,
      confirmedAligned: false,
      mismatch: false,
      confirmedTooltipKo: null,
    };
  }
  if (scenario.bias === 'NEUTRAL') {
    return {
      signal: 'WAIT',
      gatesPassCount: gates,
      confirmedAligned: false,
      mismatch: false,
      confirmedTooltipKo: null,
    };
  }
  if (scenario.bias === 'LONG') {
    return {
      signal: 'LONG',
      gatesPassCount: gates,
      confirmedAligned: false,
      mismatch: false,
      confirmedTooltipKo: null,
    };
  }
  if (scenario.bias === 'SHORT') {
    return {
      signal: 'SHORT',
      gatesPassCount: gates,
      confirmedAligned: false,
      mismatch: false,
      confirmedTooltipKo: null,
    };
  }
  return {
    signal: 'WAIT',
    gatesPassCount: gates,
    confirmedAligned: false,
    mismatch: false,
    confirmedTooltipKo: null,
  };
}

export function monthDeskZonePalette(signal: MonthDeskZoneSignal): MonthDeskZonePalette {
  return PALETTE[signal];
}

export type HotZoneClusterLiveInput = {
  bot: number;
  top: number;
  center: number;
  fullH: number;
  inside: boolean;
  longProb?: number;
  shortProb?: number;
  probSampleN?: number;
};

export type HotZoneLiveBar = { open: number; close: number; high?: number; low?: number };

/**
 * Hot Zone 방향 — 과거 통계 + **현재가 이탈·최근 봉 모멘텀** 우선.
 * (과거만 보면 52% 숏인데 표본 차이 8% 미만이면 ‘대기’로 남던 문제 수정)
 */
export function resolveHotZoneClusterSignal(
  cluster: HotZoneClusterLiveInput,
  recentBars: HotZoneLiveBar[],
  analyzeVerdict?: 'LONG' | 'SHORT' | null
): 'LONG' | 'SHORT' | 'WAIT' {
  const { bot, top, center, fullH, inside, longProb, shortProb, probSampleN } = cluster;
  const pad = Math.max(fullH * 0.05, 1e-9);
  const n = recentBars.length;
  const close = n ? Number(recentBars[n - 1]!.close) : NaN;
  const bear = recentBars.filter((c) => Number(c.close) < Number(c.open)).length;
  const bull = recentBars.filter((c) => Number(c.close) > Number(c.open)).length;

  if (Number.isFinite(close)) {
    if (close < bot - pad && (bear >= 2 || analyzeVerdict === 'SHORT')) return 'SHORT';
    if (close > top + pad && (bull >= 2 || analyzeVerdict === 'LONG')) return 'LONG';
    if (n >= 3 && close < bot) {
      const wasIn = recentBars.slice(0, -1).some((c) => c.close >= bot && c.close <= top);
      if (wasIn && bear >= 2) return 'SHORT';
    }
    if (n >= 3 && close > top) {
      const wasIn = recentBars.slice(0, -1).some((c) => c.close >= bot && c.close <= top);
      if (wasIn && bull >= 2) return 'LONG';
    }
    if (inside) {
      const tilt = (close - center) / Math.max(fullH, 1e-9);
      if (tilt <= -0.1 && bear >= 2) return 'SHORT';
      if (tilt >= 0.1 && bull >= 2) return 'LONG';
    }
    if (!inside && close < center - fullH * 0.15 && bear >= 2) return 'SHORT';
    if (!inside && close > center + fullH * 0.15 && bull >= 2) return 'LONG';
  }

  if (longProb != null && shortProb != null && (probSampleN ?? 0) >= 8) {
    const edge = longProb - shortProb;
    if (edge >= 0.04) return 'LONG';
    if (edge <= -0.04) return 'SHORT';
    if (longProb > shortProb) return 'LONG';
    if (shortProb > longProb) return 'SHORT';
  }

  if (analyzeVerdict === 'SHORT' && Number.isFinite(close) && close <= center) return 'SHORT';
  if (analyzeVerdict === 'LONG' && Number.isFinite(close) && close >= center) return 'LONG';

  return 'WAIT';
}

/** @deprecated resolveHotZoneClusterSignal 사용 */
export function hotZoneClusterSignal(
  longProb?: number,
  shortProb?: number,
  sampleN?: number
): 'LONG' | 'SHORT' | 'WAIT' | null {
  if (longProb == null || shortProb == null || (sampleN ?? 0) < 8) return null;
  const edge = longProb - shortProb;
  if (edge >= 0.04) return 'LONG';
  if (edge <= -0.04) return 'SHORT';
  if (longProb > shortProb) return 'LONG';
  if (shortProb > longProb) return 'SHORT';
  return 'WAIT';
}

export function hotZoneFillForSignal(
  signal: 'LONG' | 'SHORT' | 'WAIT',
  inside: boolean,
  strength: number
): string {
  const a = (inside ? 0.28 : 0.2) + strength * 0.12;
  if (signal === 'LONG') return `rgba(34,197,94,${Math.min(0.52, a)})`;
  if (signal === 'SHORT') return `rgba(239,68,68,${Math.min(0.5, a)})`;
  return `rgba(234,179,8,${Math.min(0.48, a)})`;
}

export function hotZoneLabelForSignal(
  signal: 'LONG' | 'SHORT' | 'WAIT',
  inside: boolean,
  probPct?: number
): string {
  const tail = inside ? '(내부)' : '';
  const pct = probPct != null && Number.isFinite(probPct) ? ` ${probPct.toFixed(0)}%` : '';
  if (signal === 'LONG') return `HOT-ZONE·롱${pct}${tail}`;
  if (signal === 'SHORT') return `HOT-ZONE·숏${pct}${tail}`;
  return `HOT-ZONE·대기${tail}`;
}

export type MonthDeskPriceActionInput = {
  close?: number;
  pocketTop?: number;
  pocketBot?: number;
  bearBars?: number;
  bullBars?: number;
};

function priceActionBias(
  pa: MonthDeskPriceActionInput | null | undefined
): 'LONG' | 'SHORT' | null {
  if (!pa) return null;
  const cl = Number(pa.close);
  const top = Number(pa.pocketTop);
  const bot = Number(pa.pocketBot);
  if (!Number.isFinite(cl) || !Number.isFinite(top) || !Number.isFinite(bot) || top <= bot) return null;
  const bear = pa.bearBars ?? 0;
  const bull = pa.bullBars ?? 0;
  if (cl < bot && bear >= 2) return 'SHORT';
  if (cl > top && bull >= 2) return 'LONG';
  if (cl < bot - (top - bot) * 0.08 && bear >= 1) return 'SHORT';
  if (cl > top + (top - bot) * 0.08 && bull >= 1) return 'LONG';
  return null;
}
