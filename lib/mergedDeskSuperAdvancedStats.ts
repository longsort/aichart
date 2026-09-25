/**
 * 超强高级强化分析统计 — 중앙 통계 판정 1줄.
 * 기존 엔진(MasterFutures · analyze 점수 · 통합 플랜)만 합류. 확정 수익·승률 아님.
 */
import type { AnalyzeResponse } from '@/types';
import type { MasterFuturesDecision } from '@/lib/mergedDeskMasterFuturesDecision';
import type { MergedTradeJudgment } from '@/lib/mergedAnalysisTradeJudgment';
import type { UnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';
import { enforceTradePlanDirectionGeometry } from '@/lib/mergedDeskUnifiedTradeRails';
import type { SuperStatsSwingSpotPack } from '@/lib/mergedDeskSuperStatsSwingTf';
import * as SuperStatsSwingTf from '@/lib/mergedDeskSuperStatsSwingTf';

/** Turbopack HMR이 SwingTf 모듈을 비우면 named import가 undefined가 됨 — namespace+가드로 방어 */
function buildSwingSpotSafe(
  params: Parameters<NonNullable<typeof SuperStatsSwingTf.buildSuperStatsSwingSpotPack>>[0]
): SuperStatsSwingSpotPack {
  const fn = SuperStatsSwingTf.buildSuperStatsSwingSpotPack;
  if (typeof fn === 'function') return fn(params);
  const tf = String(params.timeframe || '1h');
  return {
    timeframe: tf,
    horizonKo: tf,
    direction: params.direction,
    entry: params.entry,
    stopLoss: params.stopLoss,
    tp1: params.tp1,
    tp2: params.tp2,
    tp3: params.tp3,
    stopPct: null,
    risePctTp1: null,
    risePctTp2: null,
    risePctTp3: null,
    rrTp1: null,
    atrPct: params.atrPct ?? null,
    spotLineKo: '현물기준 % · 대기(모듈재로딩)',
    qualityKo: '대기',
    tfBoard: [],
  };
}

function summarizeSwingSpotKoSafe(pack: SuperStatsSwingSpotPack | null | undefined): string {
  const fn = SuperStatsSwingTf.summarizeSwingSpotKo;
  if (typeof fn === 'function') return fn(pack);
  return pack?.spotLineKo || '';
}

export type SuperAdvancedVerdict = 'CONFIRMED_LONG' | 'CONFIRMED_SHORT' | 'WAIT' | 'LONG_WATCH' | 'SHORT_WATCH';

export type MergedDeskSuperAdvancedStats = {
  verdict: SuperAdvancedVerdict;
  verdictKo: string;
  longPct: number;
  shortPct: number;
  waitPct: number;
  strength: number;
  grade: string;
  entryAllowed: boolean;
  entry: number | null;
  stopLoss: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  invalidationKo: string;
  reasonsKo: string[];
  sampleHintKo: string;
  color: string;
  headlineKo: string;
  /** TF 스윙 · 현물 기준 손절%/상승% */
  swingSpot?: SuperStatsSwingSpotPack | null;
};

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function fmtPx(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '—';
  return n >= 1000 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toPrecision(4);
}

export function buildMergedDeskSuperAdvancedStats(params: {
  master?: MasterFuturesDecision | null;
  judgment?: MergedTradeJudgment | null;
  analysis?: AnalyzeResponse | null;
  tradePlan?: UnifiedDeskTradePlan | null;
  confluenceHint?: string | null;
  timeframe?: string | null;
  atrPct?: number | null;
}): MergedDeskSuperAdvancedStats {
  const master = params.master ?? null;
  const judgment = params.judgment ?? null;
  const analysis = params.analysis ?? null;
  const plan = params.tradePlan ?? null;

  const longRaw = Number(analysis?.longScore ?? 50);
  const shortRaw = Number(analysis?.shortScore ?? 50);
  let longPct = clampPct(longRaw);
  let shortPct = clampPct(shortRaw);
  const sum = longPct + shortPct;
  if (sum > 0 && sum !== 100) {
    longPct = clampPct((longPct / sum) * 100);
    shortPct = clampPct(100 - longPct);
  }
  const gap = Math.abs(longPct - shortPct);
  const waitPct = clampPct(100 - Math.max(longPct, shortPct));

  let verdict: SuperAdvancedVerdict = 'WAIT';
  if (master?.side === 'LONG' && master.entryAllowed && master.grade !== 'X') {
    verdict = master.grade === 'A' || master.grade === 'B' ? 'CONFIRMED_LONG' : 'LONG_WATCH';
  } else if (master?.side === 'SHORT' && master.entryAllowed && master.grade !== 'X') {
    verdict = master.grade === 'A' || master.grade === 'B' ? 'CONFIRMED_SHORT' : 'SHORT_WATCH';
  } else if (master?.side === 'LONG') {
    verdict = 'LONG_WATCH';
  } else if (master?.side === 'SHORT') {
    verdict = 'SHORT_WATCH';
  } else if (judgment?.direction === 'LONG' && gap >= 12) {
    verdict = 'LONG_WATCH';
  } else if (judgment?.direction === 'SHORT' && gap >= 12) {
    verdict = 'SHORT_WATCH';
  } else if (plan?.direction === 'LONG' && gap >= 18) {
    verdict = 'LONG_WATCH';
  } else if (plan?.direction === 'SHORT' && gap >= 18) {
    verdict = 'SHORT_WATCH';
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

  let entry =
    master?.entryPrice && master.entryPrice > 0
      ? master.entryPrice
      : plan?.entry && plan.entry > 0
        ? plan.entry
        : null;
  let stopLoss =
    master?.stopPrice && master.stopPrice > 0
      ? master.stopPrice
      : plan?.stopLoss && plan.stopLoss > 0
        ? plan.stopLoss
        : null;
  let tp1 =
    master?.tp1 && master.tp1 > 0 ? master.tp1 : plan?.tp1 && plan.tp1 > 0 ? plan.tp1 : null;
  let tp2 = plan?.tp2 && plan.tp2 > 0 ? plan.tp2 : null;
  let tp3 = plan?.tp3 && plan.tp3 > 0 ? plan.tp3 : null;

  /** 선언 방향과 E/SL/TP 기하 강제 일치 (롱인데 SL>E / TP1<E 금지) */
  const dirGeom =
    verdict === 'CONFIRMED_LONG' || verdict === 'LONG_WATCH'
      ? ('LONG' as const)
      : verdict === 'CONFIRMED_SHORT' || verdict === 'SHORT_WATCH'
        ? ('SHORT' as const)
        : null;
  if (dirGeom && entry != null && entry > 0) {
    const g = enforceTradePlanDirectionGeometry(dirGeom, entry, stopLoss, tp1, tp2, tp3);
    entry = g.entry;
    stopLoss = g.stopLoss;
    tp1 = g.tp1;
    tp2 = g.tp2;
    tp3 = g.tp3;
  }

  const confRaw = Number(analysis?.confidence);
  const strength = clampPct(
    master?.strength != null
      ? master.strength
      : Number.isFinite(confRaw)
        ? confRaw <= 1
          ? confRaw * 100
          : confRaw
        : Math.max(longPct, shortPct)
  );
  const grade = master?.grade ?? (strength >= 75 ? 'A' : strength >= 55 ? 'B' : 'C');
  const entryAllowed = Boolean(master?.entryAllowed && (verdict === 'CONFIRMED_LONG' || verdict === 'CONFIRMED_SHORT'));
  const color =
    verdict === 'CONFIRMED_LONG' || verdict === 'LONG_WATCH'
      ? '#4ade80'
      : verdict === 'CONFIRMED_SHORT' || verdict === 'SHORT_WATCH'
        ? '#f87171'
        : '#94a3b8';

  const reasonsKo = [
    ...(master?.reasonsKo?.slice(0, 4) ?? []),
    judgment?.headlineKo ? judgment.headlineKo.slice(0, 28) : '',
    params.confluenceHint ? String(params.confluenceHint).slice(0, 28) : '',
  ].filter(Boolean) as string[];

  const sampleHintKo =
    master?.gatesPassCount != null
      ? `게이트 ${master.gatesPassCount}/${master.gatesRequired} · 강도${strength}`
      : `롱${longPct}%·숏${shortPct}% · 강도${strength}`;

  const headlineKo = `超强统计 · ${verdictKo} · 롱${longPct}% / 숏${shortPct}% · E ${fmtPx(entry)} · SL ${fmtPx(
    stopLoss
  )} · TP1 ${fmtPx(tp1)}`;

  const swingSpot = buildSwingSpotSafe({
    direction: dirGeom,
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    timeframe: params.timeframe || '1H',
    atrPct: params.atrPct,
  });

  return {
    verdict,
    verdictKo,
    longPct,
    shortPct,
    waitPct,
    strength,
    grade: String(grade),
    entryAllowed,
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    invalidationKo: master?.invalidationKo || plan?.invalidationKo || '무효조건 재확인',
    reasonsKo,
    sampleHintKo: `${sampleHintKo} · ${summarizeSwingSpotKoSafe(swingSpot)}`,
    color,
    headlineKo,
    swingSpot,
  };
}
