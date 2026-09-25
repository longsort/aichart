/**
 * AI超级变身统计 Hub — 앱 전역 단일 판정 코어.
 *
 * 설계 원칙 (signal-engine):
 * - 엔진은 많이, 화면 판정은 하나. WAIT가 정상.
 * - 카드·캔들분석·학파·POC·마스터는 "증거 투표"만 — 각자 E/SL/TP를 내세우지 않음.
 * - 강한 롱·숏 동시 투표 → WAIT (헛갈림 제거).
 * - E/SL/TP는 선언 방향에 기하 강제 일치.
 * - 확정 수익·고정 승률 문구 금지.
 * - 超级强化加速: 구형 초강통계 전체 재계산 생략.
 */
import type { AnalyzeResponse } from '@/types';
import type { MasterFuturesDecision } from '@/lib/mergedDeskMasterFuturesDecision';
import type { MergedTradeJudgment } from '@/lib/mergedAnalysisTradeJudgment';
import type { UnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';
import type { MergedDeskActiveTradePlan } from '@/lib/mergedDeskActiveTradePlan';
import type { MergedDeskHotZoneEntryPack } from '@/lib/mergedDeskHotZoneEntry';
import type { MergedVrvpProfile } from '@/lib/mergedAnalysisTradeLayer';
import type { Eagle1MainPlan } from '@/lib/eagle1/signalEngine';
import { enforceTradePlanDirectionGeometry } from '@/lib/mergedDeskUnifiedTradeRails';
import {
  aiSuperStatsDesignKo,
  aiSuperStatsHeadline,
  aiSuperStatsSourceKo,
  AI_SUPER_BIANSHEN_STATS,
} from '@/lib/eagle1/aiSuperBianShenStats';
import type {
  MergedDeskSuperAdvancedStats,
  SuperAdvancedVerdict,
} from '@/lib/mergedDeskSuperAdvancedStats';
import * as SuperStatsSwingTf from '@/lib/mergedDeskSuperStatsSwingTf';
/** Hub는 투표만 하고, 구형 초강통계 전체 재계산은 생략(가속) */

/** 카드/캔들 패널 증거용 — deskEngine cardPanel과 호환 (순환 import 방지) */
export type SuperStatsCardEvidence = {
  direction?: 'LONG' | 'SHORT' | 'NEUTRAL' | null;
  longPct?: number;
  shortPct?: number;
  judgmentKo?: string | null;
  keyZoneKo?: string | null;
  confirmKo?: string | null;
  smcLeadingKo?: string | null;
  bounceTargetKo?: string | null;
  topsBottomsKo?: string | null;
  mirageLspKo?: string | null;
  supportReboundKo?: string | null;
  pocKo?: string | null;
  whalePhaseKo?: string | null;
};

export type SuperStatsExpertVote = {
  id: string;
  labelKo: string;
  /** -100..+100 (양수=롱, 음수=숏) */
  score: number;
  weight: number;
  detailKo: string;
  family: 'structure' | 'zone' | 'flow' | 'plan' | 'school' | 'ai' | 'mtf';
};

export type SuperStatsHubPack = {
  /** UI·차트·텔레 공통 판정 */
  stats: MergedDeskSuperAdvancedStats;
  votes: SuperStatsExpertVote[];
  agreementPct: number;
  conflict: boolean;
  conflictKo: string | null;
  /** 카드/패널용 — 대체 매매가 아님 */
  evidenceKo: string[];
  /** ActiveTrade·가격선에 밀어넣을 단일 플랜 */
  asUnifiedPlan: UnifiedDeskTradePlan;
  designKo: string;
};

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function asMainPlan(raw: unknown): Eagle1MainPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as Eagle1MainPlan;
}

function vote(
  id: string,
  labelKo: string,
  score: number,
  weight: number,
  detailKo: string,
  family: SuperStatsExpertVote['family']
): SuperStatsExpertVote | null {
  if (!(weight > 0) || !Number.isFinite(score)) return null;
  return {
    id,
    labelKo,
    score: clamp(score, -100, 100),
    weight,
    detailKo: detailKo.slice(0, 72),
    family,
  };
}

/** 전문가 투표 수집 — 엔진 삭제 없이 합류만 */
export function collectSuperStatsExpertVotes(params: {
  analysis?: AnalyzeResponse | null;
  master?: MasterFuturesDecision | null;
  judgment?: MergedTradeJudgment | null;
  tradePlan?: UnifiedDeskTradePlan | null;
  activeTrade?: MergedDeskActiveTradePlan | null;
  hotZone?: MergedDeskHotZoneEntryPack | null;
  vrvp?: MergedVrvpProfile | null;
  mtfAligned?: boolean | null;
  mtfLabelKo?: string | null;
  schoolBiasKo?: string | null;
  confluenceHint?: string | null;
  /** 카드 패널 · 캔들분석 증거 */
  cardPanel?: SuperStatsCardEvidence | null;
  candleSummaryKo?: string | null;
  /** 최근 봉 PA용 (analysis에 candles 없을 때) */
  recentCandles?: Array<{ open: number; high: number; low: number; close: number }> | null;
}): SuperStatsExpertVote[] {
  const a = params.analysis ?? null;
  const master = params.master ?? null;
  const judgment = params.judgment ?? null;
  const plan = params.tradePlan ?? null;
  const active = params.activeTrade ?? null;
  const main = asMainPlan(a?.eagle1MainPlan);
  const out: SuperStatsExpertVote[] = [];

  const push = (v: SuperStatsExpertVote | null) => {
    if (v) out.push(v);
  };

  /** 1) analyze 롱·숏 점수 */
  const longS = Number(a?.longScore);
  const shortS = Number(a?.shortScore);
  if (Number.isFinite(longS) || Number.isFinite(shortS)) {
    const L = Number.isFinite(longS) ? longS : 50;
    const S = Number.isFinite(shortS) ? shortS : 50;
    push(
      vote(
        'analyze-score',
        'AI캔들점수',
        clamp(L - S, -100, 100),
        1.15,
        `롱${Math.round(L)} · 숏${Math.round(S)}`,
        'ai'
      )
    );
  }

  /** 2) 마스터 */
  if (master?.side === 'LONG') {
    push(vote('master', '마스터', 40 + master.strength * 0.45, 1.4, master.reasonKo || '마스터 롱', 'plan'));
  } else if (master?.side === 'SHORT') {
    push(vote('master', '마스터', -(40 + master.strength * 0.45), 1.4, master.reasonKo || '마스터 숏', 'plan'));
  } else if (master) {
    push(vote('master', '마스터', 0, 0.9, master.reasonKo || '관망', 'plan'));
  }

  /** 3) 판단 필라 */
  for (const p of judgment?.pillars ?? []) {
    const s = p.bias === 'LONG' ? 55 : p.bias === 'SHORT' ? -55 : 0;
    push(vote(`pillar-${p.key}`, p.labelKo, s, 0.85, p.detailKo, 'structure'));
  }

  /** 4) Eagle1 MainPlan */
  if (main?.direction === 'LONG') {
    push(vote('eagle1-plan', '독수리Main', 50, 1.1, String(main.status || 'LONG'), 'plan'));
  } else if (main?.direction === 'SHORT') {
    push(vote('eagle1-plan', '독수리Main', -50, 1.1, String(main.status || 'SHORT'), 'plan'));
  }

  /** 5) 통합·Active 플랜 */
  if (plan?.direction === 'LONG') {
    push(vote('unified', '통합플랜', 45, 1.0, plan.sourceKo || '통합', 'plan'));
  } else if (plan?.direction === 'SHORT') {
    push(vote('unified', '통합플랜', -45, 1.0, plan.sourceKo || '통합', 'plan'));
  }
  if (active && (active.direction === 'LONG' || active.direction === 'SHORT')) {
    push(
      vote(
        'active',
        'ActiveTrade',
        active.direction === 'LONG' ? 42 : -42,
        0.95,
        `${active.sourceKo} · ${active.statusKo}`,
        'plan'
      )
    );
  }

  /** 6) 구조·정착 */
  const st = a?.structureState?.state;
  if (st === 'trend_up') push(vote('structure', '구조', 48, 1.0, '상승 구조', 'structure'));
  else if (st === 'trend_down') push(vote('structure', '구조', -48, 1.0, '하락 구조', 'structure'));
  const sz = a?.settlementZone;
  if (sz?.state === 'confirmed' && (sz.direction === 'LONG' || sz.direction === 'SHORT')) {
    push(
      vote(
        'settle',
        '마감안착',
        sz.direction === 'LONG' ? 52 : -52,
        1.05,
        `안착 ${sz.grade ?? ''}`,
        'structure'
      )
    );
  }

  /** 7) POC / VRVP */
  const poc = params.vrvp?.poc;
  const px = Number(a?.currentPrice);
  if (poc != null && poc > 0 && px > 0) {
    const dist = ((px - poc) / poc) * 100;
    if (dist > 0.15) push(vote('poc', 'POC', -28, 0.7, `가격>POC ${dist.toFixed(2)}%`, 'zone'));
    else if (dist < -0.15) push(vote('poc', 'POC', 28, 0.7, `가격<POC ${Math.abs(dist).toFixed(2)}%`, 'zone'));
    else push(vote('poc', 'POC', 0, 0.5, 'POC 근접', 'zone'));
  }

  /** 8) HotZone */
  const hz = params.hotZone;
  if (hz?.below && hz.below.side === 'LONG') {
    push(vote('hotzone-long', 'HotZone롱', 44, 1.0, hz.below.reasonKo || hz.below.labelKo || '지지존', 'zone'));
  }
  if (hz?.above && hz.above.side === 'SHORT') {
    push(vote('hotzone-short', 'HotZone숏', -44, 1.0, hz.above.reasonKo || hz.above.labelKo || '저항존', 'zone'));
  }
  if (hz?.precision?.side === 'LONG') {
    push(vote('hotzone-prec', 'Hot정밀', 38, 0.9, '정밀 롱', 'zone'));
  } else if (hz?.precision?.side === 'SHORT') {
    push(vote('hotzone-prec', 'Hot정밀', -38, 0.9, '정밀 숏', 'zone'));
  }

  /** 9) MTF — 정렬 플래그 + TF별 컴퍼스/수락 투표 */
  if (params.mtfAligned === false) {
    push(vote('mtf', 'MTF', 0, 1.2, params.mtfLabelKo || '상위TF 불일치 → 대기 가중', 'mtf'));
  } else if (params.mtfAligned === true) {
    push(vote('mtf', 'MTF', judgment?.direction === 'SHORT' ? -20 : judgment?.direction === 'LONG' ? 20 : 8, 0.8, params.mtfLabelKo || 'MTF 정렬', 'mtf'));
  }

  const compassFrames = a?.eagle1CompassFrames;
  if (Array.isArray(compassFrames) && compassFrames.length) {
    const wByTf: Record<string, number> = {
      '1W': 1.15,
      '1D': 1.1,
      '4H': 1.0,
      '1H': 0.75,
      '15m': 0.55,
      '5m': 0.4,
      '1m': 0.3,
    };
    for (const fr of compassFrames) {
      const tf = String(fr.tf || '');
      if (!tf || fr.bias == null) continue;
      const w = wByTf[tf] ?? 0.5;
      const score = fr.bias === 'bullish' ? 28 : fr.bias === 'bearish' ? -28 : 0;
      push(vote(`mtf-${tf}`, `MTF ${tf}`, score, w, `${fr.regime || fr.state || fr.bias}`, 'mtf'));
    }
  } else {
    const acc = a?.eagle1Acceptance as
      | { mtfBias?: Array<{ tfs?: string; bias?: 'up' | 'down' | null; note?: string }> }
      | null
      | undefined;
    if (acc?.mtfBias?.length) {
      for (const row of acc.mtfBias) {
        if (!row.bias) continue;
        const tfs = String(row.tfs || '')
          .split(/[,/·]/)
          .map((x) => x.trim())
          .filter(Boolean);
        for (const tf of tfs.slice(0, 3)) {
          push(
            vote(
              `mtf-acc-${tf}`,
              `MTF ${tf}`,
              row.bias === 'up' ? 24 : -24,
              0.55,
              row.note || row.bias,
              'mtf'
            )
          );
        }
      }
    } else if (a?.mtf) {
      const htf =
        /상승|롱|bull|up/i.test(a.mtf.htfBias || '')
          ? 22
          : /하락|숏|bear|down/i.test(a.mtf.htfBias || '')
            ? -22
            : 0;
      const mid =
        /상승|롱|bull|up/i.test(a.mtf.mtfBias || a.mtf.mtfStructure || '')
          ? 16
          : /하락|숏|bear|down/i.test(a.mtf.mtfBias || a.mtf.mtfStructure || '')
            ? -16
            : 0;
      const ltf =
        /상승|롱|bull|up/i.test(a.mtf.ltfEntryBias || a.mtf.ltfBias || '')
          ? 10
          : /하락|숏|bear|down/i.test(a.mtf.ltfEntryBias || a.mtf.ltfBias || '')
            ? -10
            : 0;
      if (htf) push(vote('mtf-htf', 'MTF HTF', htf, 1.0, a.mtf.htfBias || 'HTF', 'mtf'));
      if (mid) push(vote('mtf-mid', 'MTF MID', mid, 0.7, a.mtf.mtfStructure || 'MTF', 'mtf'));
      if (ltf) push(vote('mtf-ltf', 'MTF LTF', ltf, 0.45, a.mtf.ltfEntryBias || 'LTF', 'mtf'));
    }
  }

  /** 10) 파생 (펀딩·OI) */
  const funding = a?.fundingState;
  if (funding === 'positive') push(vote('funding', '펀딩', -22, 0.55, '롱 지불 → 숏 되돌림 감시', 'flow'));
  else if (funding === 'negative') push(vote('funding', '펀딩', 22, 0.55, '숏 지불 → 롱 커버 감시', 'flow'));
  const oi = a?.oiState;
  if (oi === 'increasing') push(vote('oi', 'OI', 8, 0.4, 'OI 증가', 'flow'));
  else if (oi === 'decreasing') push(vote('oi', 'OI', -8, 0.4, 'OI 감소', 'flow'));

  /** 11) 학파 사이클 한 줄 */
  const school = String(params.schoolBiasKo || '');
  if (/마크업|축적|상승|다우상승|구름위/i.test(school)) {
    push(vote('school', '학파도식', 30, 0.65, school.slice(0, 40), 'school'));
  } else if (/마크다운|분배|하락|다우하락|구름아래/i.test(school)) {
    push(vote('school', '학파도식', -30, 0.65, school.slice(0, 40), 'school'));
  }

  /** 12) 합류 힌트 */
  if (params.confluenceHint) {
    const h = params.confluenceHint;
    const s = /숏|저항|공급|하락/i.test(h) ? -18 : /롱|지지|수요|상승/i.test(h) ? 18 : 0;
    push(vote('confluence', '합류힌트', s, 0.5, h, 'zone'));
  }

  /** 13) 카드 패널 (대체 매매 아님 — 증거만) */
  const card = params.cardPanel;
  if (card) {
    const cScore =
      card.direction === 'LONG'
        ? 40
        : card.direction === 'SHORT'
          ? -40
          : Number.isFinite(card.longPct) && Number.isFinite(card.shortPct)
            ? clamp(Number(card.longPct) - Number(card.shortPct), -40, 40)
            : 0;
    push(
      vote(
        'card-panel',
        '카드패널',
        cScore,
        0.9,
        (card.judgmentKo || card.keyZoneKo || '카드 합류').slice(0, 72),
        'ai'
      )
    );
    if (card.confirmKo) {
      push(
        vote(
          'card-confirm',
          '캔들확인',
          /숏|하락|저항/i.test(card.confirmKo) ? -32 : /롱|상승|지지/i.test(card.confirmKo) ? 32 : 0,
          0.75,
          card.confirmKo.slice(0, 72),
          'structure'
        )
      );
    }
    if (card.smcLeadingKo) {
      push(
        vote(
          'card-smc',
          'SMC선행',
          /숏|분배|하락/i.test(card.smcLeadingKo) ? -30 : /롱|매집|상승/i.test(card.smcLeadingKo) ? 30 : 0,
          0.7,
          card.smcLeadingKo.slice(0, 72),
          'structure'
        )
      );
    }
    if (card.topsBottomsKo) {
      push(
        vote(
          'card-tb',
          '천장바닥',
          /바닥|저점|롱/i.test(card.topsBottomsKo) ? 26 : /천장|고점|숏/i.test(card.topsBottomsKo) ? -26 : 0,
          0.55,
          card.topsBottomsKo.slice(0, 72),
          'zone'
        )
      );
    }
    if (card.mirageLspKo) {
      push(vote('card-mirage', '미라지LSP', 0, 0.45, card.mirageLspKo.slice(0, 72), 'zone'));
    }
    if (card.supportReboundKo) {
      push(
        vote(
          'card-rebound',
          '지지반등',
          /반등|지지|롱/i.test(card.supportReboundKo)
            ? 28
            : /저항|하락|숏/i.test(card.supportReboundKo)
              ? -28
              : 0,
          0.6,
          card.supportReboundKo.slice(0, 72),
          'zone'
        )
      );
    }
    if (card.whalePhaseKo) {
      push(
        vote(
          'card-whale',
          '고래국면',
          /매집|롱|흡수/i.test(card.whalePhaseKo) ? 22 : /분산|숏|덤프/i.test(card.whalePhaseKo) ? -22 : 0,
          0.5,
          card.whalePhaseKo.slice(0, 72),
          'flow'
        )
      );
    }
  }

  /** 14) 캔들분석 — patternVision + 최근봉 PA (정확도 가중) */
  const patterns = Array.isArray(a?.detectedVisionPatterns)
    ? (a!.detectedVisionPatterns as Array<{
        type?: string;
        bias?: string;
        confidence?: number;
        label?: string;
      }>)
    : [];
  if (patterns.length) {
    const ranked = [...patterns].sort(
      (x, y) => Number(y.confidence ?? 0) - Number(x.confidence ?? 0)
    );
    const top = ranked[0]!;
    const conf = Number(top.confidence) || 0;
    if (conf >= 64) {
      const bias = String(top.bias || '');
      const score =
        bias === 'bullish' || /bull|long|상승|바닥/i.test(String(top.type || ''))
          ? Math.min(55, 28 + conf * 0.28)
          : bias === 'bearish' || /bear|short|하락|천장/i.test(String(top.type || ''))
            ? -Math.min(55, 28 + conf * 0.28)
            : 0;
      push(
        vote(
          'candle-pattern',
          '캔들패턴',
          score,
          0.95,
          `${top.type || top.label || '패턴'} ${Math.round(conf)}%`,
          'ai'
        )
      );
    }
  }

  const candleKo =
    params.candleSummaryKo ||
    (typeof a?.patternVisionSummary === 'string' ? a.patternVisionSummary : null);
  if (candleKo && !patterns.length) {
    push(
      vote(
        'candle-vision',
        '캔들분석',
        /숏|하락|약세|bear/i.test(candleKo) ? -34 : /롱|상승|강세|bull/i.test(candleKo) ? 34 : 0,
        0.8,
        candleKo.slice(0, 72),
        'ai'
      )
    );
  }

  /** 15) 최근 1~2봉 가격행동 — 장악·핀바 근사 */
  const bars =
    (Array.isArray(params.recentCandles) && params.recentCandles.length >= 3
      ? params.recentCandles
      : null) ||
    (Array.isArray((a as { candles?: unknown })?.candles)
      ? ((a as { candles: Array<{ open: number; high: number; low: number; close: number }> }).candles)
      : null);
  if (bars && bars.length >= 3) {
    const c0 = bars[bars.length - 1] as { open?: number; high?: number; low?: number; close?: number };
    const c1 = bars[bars.length - 2] as { open?: number; high?: number; low?: number; close?: number };
    const o0 = Number(c0.open);
    const h0 = Number(c0.high);
    const l0 = Number(c0.low);
    const cl0 = Number(c0.close);
    const o1 = Number(c1.open);
    const cl1 = Number(c1.close);
    if ([o0, h0, l0, cl0, o1, cl1].every((n) => Number.isFinite(n) && n > 0)) {
      const body0 = Math.abs(cl0 - o0);
      const range0 = Math.max(h0 - l0, 1e-9);
      const upper = h0 - Math.max(o0, cl0);
      const lower = Math.min(o0, cl0) - l0;
      /** 장악 */
      if (cl0 > o0 && cl1 < o1 && cl0 >= o1 && o0 <= cl1) {
        push(vote('pa-engulf', '장악봉', 36, 0.7, '양봉 장악', 'structure'));
      } else if (cl0 < o0 && cl1 > o1 && cl0 <= o1 && o0 >= cl1) {
        push(vote('pa-engulf', '장악봉', -36, 0.7, '음봉 장악', 'structure'));
      }
      /** 핀바 */
      if (lower > body0 * 2.2 && upper < body0 * 0.7 && lower / range0 > 0.55) {
        push(vote('pa-pin', '핀바', 28, 0.55, '하단 긴심지', 'structure'));
      } else if (upper > body0 * 2.2 && lower < body0 * 0.7 && upper / range0 > 0.55) {
        push(vote('pa-pin', '핀바', -28, 0.55, '상단 긴심지', 'structure'));
      }
    }
  }

  return out;
}

function aggregateVotes(votes: SuperStatsExpertVote[]): {
  longPct: number;
  shortPct: number;
  signed: number;
  agreementPct: number;
  conflict: boolean;
} {
  if (!votes.length) {
    return { longPct: 50, shortPct: 50, signed: 0, agreementPct: 0, conflict: false };
  }
  let wSum = 0;
  let signed = 0;
  let longW = 0;
  let shortW = 0;
  for (const v of votes) {
    wSum += v.weight;
    signed += v.score * v.weight;
    if (v.score > 8) longW += v.weight;
    else if (v.score < -8) shortW += v.weight;
  }
  const avg = wSum > 0 ? signed / wSum : 0;
  /** avg -100..100 → longPct */
  const longPct = clamp(Math.round(50 + avg / 2), 0, 100);
  const shortPct = 100 - longPct;
  const sideSum = longW + shortW;
  const agreementPct = sideSum > 0 ? Math.round((Math.max(longW, shortW) / sideSum) * 100) : 0;
  const conflict = longW > 0.35 * wSum && shortW > 0.35 * wSum && Math.abs(longW - shortW) / wSum < 0.18;
  return { longPct, shortPct, signed: avg, agreementPct, conflict };
}

function verdictFromAggregate(
  agg: ReturnType<typeof aggregateVotes>,
  master: MasterFuturesDecision | null
): SuperAdvancedVerdict {
  if (agg.conflict || Math.abs(agg.longPct - agg.shortPct) < 10) return 'WAIT';
  const bull = agg.longPct >= agg.shortPct;
  const gap = Math.abs(agg.longPct - agg.shortPct);
  if (master?.side === 'LONG' && master.entryAllowed && master.grade !== 'X' && bull && gap >= 12) {
    return master.grade === 'A' || master.grade === 'B' ? 'CONFIRMED_LONG' : 'LONG_WATCH';
  }
  if (master?.side === 'SHORT' && master.entryAllowed && master.grade !== 'X' && !bull && gap >= 12) {
    return master.grade === 'A' || master.grade === 'B' ? 'CONFIRMED_SHORT' : 'SHORT_WATCH';
  }
  if (bull && gap >= 14) return gap >= 28 && agg.agreementPct >= 70 ? 'CONFIRMED_LONG' : 'LONG_WATCH';
  if (!bull && gap >= 14) return gap >= 28 && agg.agreementPct >= 70 ? 'CONFIRMED_SHORT' : 'SHORT_WATCH';
  return 'WAIT';
}

/**
 * Hub 빌드 — deskEngine·HUD·차트·AI ZONE이 이 결과만 소비.
 */
export function buildMergedDeskSuperStatsHub(params: {
  analysis?: AnalyzeResponse | null;
  master?: MasterFuturesDecision | null;
  judgment?: MergedTradeJudgment | null;
  tradePlan?: UnifiedDeskTradePlan | null;
  activeTrade?: MergedDeskActiveTradePlan | null;
  hotZone?: MergedDeskHotZoneEntryPack | null;
  vrvp?: MergedVrvpProfile | null;
  mtfAligned?: boolean | null;
  mtfLabelKo?: string | null;
  schoolBiasKo?: string | null;
  confluenceHint?: string | null;
  cardPanel?: SuperStatsCardEvidence | null;
  candleSummaryKo?: string | null;
  recentCandles?: Array<{ open: number; high: number; low: number; close: number }> | null;
  /** 차트 TF — 스윙 보드·현물% */
  timeframe?: string | null;
  /** ATR/close×100 */
  atrPct?: number | null;
}): SuperStatsHubPack {
  const votes = collectSuperStatsExpertVotes(params);
  const agg = aggregateVotes(votes);
  const master = params.master ?? null;
  let verdict = verdictFromAggregate(agg, master);

  /** MTF 불일치면 확정을 감시/대기로 강등 */
  if (params.mtfAligned === false && (verdict === 'CONFIRMED_LONG' || verdict === 'CONFIRMED_SHORT')) {
    verdict = verdict === 'CONFIRMED_LONG' ? 'LONG_WATCH' : 'SHORT_WATCH';
  }

  /** 가속: 구형 초강통계 전체 재계산 생략 — 활성 플랜·마스터에서 레벨만 추출 */
  const plan = params.tradePlan ?? params.activeTrade?.asUnifiedPlan ?? null;
  const active = params.activeTrade;
  let entry: number | null =
    (active && active.entry > 0 ? active.entry : null) ??
    (plan && plan.entry > 0 ? plan.entry : null) ??
    (master?.entryPrice && master.entryPrice > 0 ? master.entryPrice : null);
  let stopLoss: number | null =
    (active && active.stopLoss > 0 ? active.stopLoss : null) ??
    (plan && plan.stopLoss > 0 ? plan.stopLoss : null) ??
    (master?.stopPrice && master.stopPrice > 0 ? master.stopPrice : null);
  let tp1: number | null =
    (active && active.tp1 > 0 ? active.tp1 : null) ??
    (plan && plan.tp1 > 0 ? plan.tp1 : null) ??
    (master?.tp1 && master.tp1 > 0 ? master.tp1 : null);
  let tp2: number | null =
    (active && active.tp2 > 0 ? active.tp2 : null) ?? (plan && plan.tp2 > 0 ? plan.tp2 : null);
  let tp3: number | null =
    (active && active.tp3 > 0 ? active.tp3 : null) ?? (plan && plan.tp3 > 0 ? plan.tp3 : null);
  const invalidationKo =
    active?.invalidationKo ||
    plan?.invalidationKo ||
    params.judgment?.invalidationKo ||
    '무효화 조건 확인';
  const grade = master?.grade || (agg.agreementPct >= 70 ? 'A' : agg.agreementPct >= 55 ? 'B' : 'C');

  /** 허브 비율·판정이 우선 (마스터 단독 덮어쓰기 방지) */
  const dir =
    verdict === 'CONFIRMED_LONG' || verdict === 'LONG_WATCH'
      ? ('LONG' as const)
      : verdict === 'CONFIRMED_SHORT' || verdict === 'SHORT_WATCH'
        ? ('SHORT' as const)
        : null;

  if (dir && entry != null && entry > 0) {
    const g = enforceTradePlanDirectionGeometry(dir, entry, stopLoss, tp1, tp2, tp3);
    entry = g.entry;
    stopLoss = g.stopLoss;
    tp1 = g.tp1;
    tp2 = g.tp2;
    tp3 = g.tp3;
  } else if (!dir) {
    entry = null;
    stopLoss = null;
    tp1 = null;
    tp2 = null;
    tp3 = null;
  }

  const verdictKo =
    verdict === 'CONFIRMED_LONG'
      ? '확정롱'
      : verdict === 'CONFIRMED_SHORT'
        ? '확정숏'
        : verdict === 'LONG_WATCH'
          ? '롱감시'
          : verdict === 'SHORT_WATCH'
            ? '숏감시'
            : '대기';

  const entryAllowed =
    (verdict === 'CONFIRMED_LONG' || verdict === 'CONFIRMED_SHORT') &&
    Boolean(master?.entryAllowed !== false) &&
    !agg.conflict;

  const evidenceKo = votes
    .slice()
    .sort((a, b) => Math.abs(b.score) * b.weight - Math.abs(a.score) * a.weight)
    .slice(0, 14)
    .map((v) => `${v.labelKo}: ${v.detailKo}`);

  const conflictKo = agg.conflict
    ? `롱·숏 전문가 동시 우세(합의 ${agg.agreementPct}%) — 대기`
    : null;

  const strength = clamp(Math.round(agg.agreementPct * 0.55 + Math.abs(agg.signed) * 0.35), 0, 100);
  const buildSwing =
    typeof SuperStatsSwingTf.buildSuperStatsSwingSpotPack === 'function'
      ? SuperStatsSwingTf.buildSuperStatsSwingSpotPack
      : null;
  const swingSpot = buildSwing
    ? buildSwing({
        direction: dir,
        entry,
        stopLoss,
        tp1,
        tp2,
        tp3,
        timeframe: params.timeframe || '1H',
        atrPct: params.atrPct,
      })
    : null;
  const swingHint =
    typeof SuperStatsSwingTf.summarizeSwingSpotKo === 'function'
      ? SuperStatsSwingTf.summarizeSwingSpotKo(swingSpot)
      : '';
  const stats: MergedDeskSuperAdvancedStats = {
    verdict,
    verdictKo,
    longPct: agg.longPct,
    shortPct: agg.shortPct,
    waitPct: clamp(100 - Math.max(agg.longPct, agg.shortPct), 0, 100),
    strength,
    entryAllowed,
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    reasonsKo: [...(conflictKo ? [conflictKo] : []), ...evidenceKo.slice(0, 4)],
    sampleHintKo: `${AI_SUPER_BIANSHEN_STATS} · 합의 ${agg.agreementPct}% · 투표 ${votes.length} · ${verdictKo}${
      swingHint ? ` · ${swingHint}` : ''
    }`,
    color:
      verdict === 'CONFIRMED_LONG' || verdict === 'LONG_WATCH'
        ? '#4ade80'
        : verdict === 'CONFIRMED_SHORT' || verdict === 'SHORT_WATCH'
          ? '#f87171'
          : '#94a3b8',
    headlineKo: aiSuperStatsHeadline(verdictKo, agg.longPct, agg.shortPct, entry, stopLoss, tp1),
    invalidationKo,
    grade,
    swingSpot,
  };

  const asUnifiedPlan: UnifiedDeskTradePlan = {
    direction: dir ?? 'NEUTRAL',
    entry: entry ?? 0,
    stopLoss: stopLoss ?? 0,
    tp1: tp1 ?? 0,
    tp2: tp2 ?? 0,
    tp3: tp3 ?? 0,
    invalidationKo: stats.invalidationKo,
    sourceKo: aiSuperStatsSourceKo(),
    alignedWithChart: true,
    warningsKo: conflictKo ? [conflictKo] : stats.reasonsKo.slice(0, 3),
  };

  return {
    stats,
    votes,
    agreementPct: agg.agreementPct,
    conflict: agg.conflict,
    conflictKo,
    evidenceKo,
    asUnifiedPlan,
    designKo: aiSuperStatsDesignKo(),
  };
}

/** ActiveTrade를 Hub 타점으로 덮어쓰기(방향·가격 단일화) */
export function applySuperStatsHubToActiveTrade(
  active: MergedDeskActiveTradePlan,
  hub: SuperStatsHubPack
): MergedDeskActiveTradePlan {
  const p = hub.asUnifiedPlan;
  const v = hub.stats.verdict;
  if (p.direction !== 'LONG' && p.direction !== 'SHORT') {
    return {
      ...active,
      direction: 'NEUTRAL',
      entry: 0,
      stopLoss: 0,
      tp1: 0,
      tp2: 0,
      tp3: 0,
      entryAllowed: false,
      status: 'WAIT',
      statusKo: '대기',
      sourceKo: aiSuperStatsSourceKo(),
      invalidationKo: hub.conflictKo || 'Hub 대기',
      asUnifiedPlan: p,
    };
  }
  const status =
    v === 'CONFIRMED_LONG' || v === 'CONFIRMED_SHORT'
      ? ('ENTER' as const)
      : ('WAIT' as const);
  return {
    ...active,
    direction: p.direction,
    entry: p.entry,
    stopLoss: p.stopLoss,
    tp1: p.tp1,
    tp2: p.tp2,
    tp3: p.tp3,
    entryAllowed: hub.stats.entryAllowed,
    status,
    statusKo: hub.stats.verdictKo,
    sourceKo: aiSuperStatsSourceKo(),
    invalidationKo: p.invalidationKo,
    asUnifiedPlan: p,
  };
}
