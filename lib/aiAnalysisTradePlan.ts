import type { AnalyzeResponse } from '@/types';
import type { UIMode } from '@/lib/settings';
import type { MonthDeskBoardMetrics } from '@/lib/monthDeskBoardMetrics';
import type { MonthDeskCoreLevels } from '@/lib/monthDeskCoreLevels';
import type { MonthDeskTradeAction } from '@/lib/monthDeskTradeAction';
import type { TradeConfirmDesk } from '@/lib/tradeConfirmDesk';
import type { BreakoutFollowChain } from '@/lib/breakoutFollowChain';

export type AiTradePlanLevel = {
  key: string;
  label: string;
  price: number | null;
  distPct: number | null;
  role: 'entry' | 'confirm' | 'invalid' | 'tp' | 'break';
  source: string;
};

export type AiAnalysisTradePlan = {
  direction: 'LONG' | 'SHORT' | 'WAIT';
  directionKo: string;
  stage: string;
  stageKo: string;
  /** 구조·게이트·AI 정합 (0~100, 승률 아님) */
  confluenceScore: number;
  confluenceLabel: string;
  headline: string;
  actionLine: string;
  riskNote: string;
  gatesPass: number;
  gatesTotal: number;
  mtfBlocked: boolean;
  checklist: string[];
  levels: AiTradePlanLevel[];
  rrLines: string[];
  scenarios: { a: string; b: string };
  metaTags: string[];
  panelTitle: string;
  panelSub: string;
  settlementKo: string | null;
  /** 돌파·안착 연동 체인 (상·하방 경로) */
  followChain: BreakoutFollowChain | null;
};

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parsePriceFromText(s: string | undefined | null): number | null {
  if (!s?.trim()) return null;
  const m = s.replace(/,/g, '').match(/[\d]+(?:\.\d+)?/);
  return m ? num(parseFloat(m[0])) : null;
}

function fmtPx(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toFixed(2);
}

function pctDist(close: number, target: number): number {
  return ((target - close) / close) * 100;
}

function levelRow(
  key: string,
  label: string,
  price: number | null,
  close: number | null,
  role: AiTradePlanLevel['role'],
  source: string
): AiTradePlanLevel {
  if (price == null || close == null || close <= 0) {
    return { key, label, price, distPct: null, role, source };
  }
  const d = pctDist(close, price);
  return { key, label, price, distPct: d, role, source };
}

function settlementEntryBand(
  level: number,
  close: number | null
): { low: number; high: number; mid: number } {
  const pad = Math.max(level * 0.0012, close != null ? close * 0.0015 : level * 0.002);
  return { low: level - pad, high: level + pad, mid: level };
}

function mergeEntry(
  levels: MonthDeskCoreLevels,
  ai: AnalyzeResponse['aiUnifiedLongShort'],
  analysis: AnalyzeResponse,
  monthDesk: boolean
): { low: number | null; high: number | null; mid: number | null; source: string } {
  const settle = analysis.settlementZone;
  if (
    monthDesk &&
    settle?.level != null &&
    (settle.state === 'confirmed' || settle.state === 'candidate') &&
    settle.direction !== 'NONE'
  ) {
    const band = settlementEntryBand(settle.level, levels.close);
    return {
      low: band.low,
      high: band.high,
      mid: band.mid,
      source: settle.state === 'confirmed' ? `안착 확정 ${settle.grade}` : `안착 후보 ${settle.grade}`,
    };
  }
  const watch = ai?.watch;
  if (watch?.low != null && watch?.high != null) {
    return {
      low: Math.min(watch.low, watch.high),
      high: Math.max(watch.low, watch.high),
      mid: (watch.low + watch.high) / 2,
      source: watch.role || 'AI 감시존',
    };
  }
  if (levels.entryLow != null && levels.entryHigh != null) {
    return {
      low: levels.entryLow,
      high: levels.entryHigh,
      mid: levels.entryMid,
      source: 'OB·타점',
    };
  }
  const entryPx = parsePriceFromText(ai?.subline ?? undefined);
  if (entryPx != null) {
    return { low: entryPx, high: entryPx, mid: entryPx, source: '엔진 entry' };
  }
  return { low: null, high: null, mid: null, source: '—' };
}

function mergeInvalid(
  levels: MonthDeskCoreLevels,
  ai: AnalyzeResponse['aiUnifiedLongShort'],
  analysis: AnalyzeResponse
): { price: number | null; source: string } {
  if (ai?.invalidation?.price != null) {
    return { price: ai.invalidation.price, source: ai.invalidation.context || 'AI 무효' };
  }
  if (levels.invalidation != null) {
    return { price: levels.invalidation, source: '엔진 무효' };
  }
  const inv = parsePriceFromText(analysis.stopLoss);
  if (inv != null) return { price: inv, source: 'stopLoss' };
  return { price: null, source: '—' };
}

function mergeTargets(
  levels: MonthDeskCoreLevels,
  analysis: AnalyzeResponse
): Array<{ price: number; source: string }> {
  const out: Array<{ price: number; source: string }> = [];
  const seen = new Set<number>();
  const push = (p: number | null, source: string) => {
    if (p == null || seen.has(p)) return;
    seen.add(p);
    out.push({ price: p, source });
  };
  for (const t of levels.targets) push(t, 'targets');
  if (Array.isArray(analysis.targets)) {
    for (let i = 0; i < analysis.targets.length; i++) {
      push(parsePriceFromText(analysis.targets[i]), `TP${i + 1}`);
    }
  }
  const br = analysis.aiUnifiedLongShort?.breaks;
  if (analysis.verdict === 'LONG' && br?.forMoreUp?.price) push(br.forMoreUp.price, br.forMoreUp.label);
  if (analysis.verdict === 'SHORT' && br?.forMoreDown?.price) push(br.forMoreDown.price, br.forMoreDown.label);
  return out.slice(0, 4);
}

function buildConfluence(
  analysis: AnalyzeResponse,
  metrics: MonthDeskBoardMetrics,
  confirmDesk: TradeConfirmDesk | null,
  monthDesk: boolean
): { score: number; label: string } {
  const ai = analysis.aiUnifiedLongShort;
  const cs = analysis.confirmedSignal;
  const gateN = cs?.gatesPassCount ?? metrics.gatesPassCount ?? 0;
  const gatePart = Math.round((gateN / 5) * 40);
  const integ = ai?.integrationStrength ?? 0;
  const integPart = Math.round(integ * 0.35);
  const confPart = Math.round((analysis.confidence ?? metrics.confidence ?? 0) * 0.15);
  const phaseBonus =
    confirmDesk?.phase === 'confirmed_full'
      ? 10
      : confirmDesk?.phase === 'confirmed'
        ? 6
        : confirmDesk?.phase === 'at_entry'
          ? 4
          : 0;
  const mtfPenalty = cs?.mtfBlocked || metrics.mtfBlocked ? 12 : 0;
  const settle = analysis.settlementZone;
  let settleBonus = 0;
  if (monthDesk && settle) {
    if (settle.state === 'confirmed') settleBonus = settle.grade === 'A' ? 14 : settle.grade === 'B' ? 9 : 5;
    else if (settle.state === 'candidate') settleBonus = 5;
    else if (settle.state === 'failed') settleBonus = -10;
  }
  const score = Math.max(0, Math.min(100, gatePart + integPart + confPart + phaseBonus + settleBonus - mtfPenalty));
  let label = '정합 낮음 — 대기·검증';
  if (monthDesk && settle?.state === 'confirmed' && gateN >= 3) {
    label = `안착 확정 · 구조 ${gateN}/5 · 등급 ${settle.grade}`;
  } else if (score >= 82 && gateN >= 4 && !cs?.mtfBlocked) label = '정합 높음 — 구조·게이트 일치';
  else if (score >= 65) label = '정합 중간 — 확정·무효 확인';
  else if (score >= 45) label = '정합 보통 — 후보·되돌림 감시';
  return { score, label };
}

export function buildAiAnalysisTradePlan(
  analysis: AnalyzeResponse | null,
  metrics: MonthDeskBoardMetrics,
  levels: MonthDeskCoreLevels,
  ta: MonthDeskTradeAction,
  confirmDesk: TradeConfirmDesk | null,
  uiMode?: UIMode
): AiAnalysisTradePlan | null {
  if (!analysis) return null;

  const monthDesk = uiMode === 'MONTH_START_DESK' || uiMode === 'ZONE_LINE_PRO';
  const ai = analysis.aiUnifiedLongShort;
  const cs = analysis.confirmedSignal;
  const close = levels.close;
  const dir: 'LONG' | 'SHORT' | 'WAIT' =
    cs?.direction === 'LONG' || cs?.direction === 'SHORT'
      ? cs.direction
      : ai?.primary === 'LONG' || ai?.primary === 'SHORT'
        ? ai.primary
        : metrics.verdict;

  const entry = mergeEntry(levels, ai, analysis, monthDesk);
  const inv = mergeInvalid(levels, ai, analysis);
  const tps = mergeTargets(levels, analysis);

  let confirmPrice: number | null = confirmDesk?.confirmPrice ?? null;
  let confirmSource = '확정·방어';
  if (confirmPrice == null) {
    if (dir === 'LONG' && levels.support != null) {
      confirmPrice = levels.support;
      confirmSource = '지지 확정';
    } else if (dir === 'SHORT' && levels.resistance != null) {
      confirmPrice = levels.resistance;
      confirmSource = '저항 확정';
    }
  }
  const settle = analysis.settlementZone;
  if (settle?.state === 'confirmed' && settle.level != null) {
    confirmPrice = settle.level;
    confirmSource = '마감·안착 확정';
  }

  const { score, label } = buildConfluence(analysis, metrics, confirmDesk, monthDesk);
  const gatesPass = cs?.gatesPassCount ?? metrics.gatesPassCount ?? 0;

  const planLevels: AiTradePlanLevel[] = [];
  if (entry.low != null && entry.high != null) {
    planLevels.push(levelRow('entry-hi', '★ 타점(상)', entry.high, close, 'entry', entry.source));
    if (entry.mid != null) planLevels.push(levelRow('entry-mid', '★ 타점(중)', entry.mid, close, 'entry', entry.source));
    planLevels.push(levelRow('entry-lo', '★ 타점(하)', entry.low, close, 'entry', entry.source));
  }
  if (confirmPrice != null) {
    planLevels.push(levelRow('confirm', '🛡 확정·방어', confirmPrice, close, 'confirm', confirmSource));
  }
  if (inv.price != null) {
    planLevels.push(levelRow('invalid', '⛔ 손절·무효', inv.price, close, 'invalid', inv.source));
  }
  tps.forEach((t, i) => {
    planLevels.push(levelRow(`tp${i}`, `익절 TP${i + 1}`, t.price, close, 'tp', t.source));
  });

  const rrLines: string[] = [];
  if (ta.rrLabel) rrLines.push(ta.rrLabel);
  if (typeof analysis.rr === 'number' && analysis.rr > 0) {
    rrLines.push(`엔진 RR 참고 ≈ 1 : ${analysis.rr.toFixed(1)}`);
  }
  if (close != null && inv.price != null && tps[0]?.price != null && dir !== 'WAIT') {
    const risk = dir === 'LONG' ? Math.abs(close - inv.price) : Math.abs(inv.price - close);
    const reward = dir === 'LONG' ? Math.abs(tps[0].price - close) : Math.abs(close - tps[0].price);
    if (risk > 0) rrLines.push(`통합(현재→TP1/무효) ≈ 1 : ${(reward / risk).toFixed(1)}`);
  }

  let settlementKo: string | null = null;
  if (settle && settle.state !== 'none') {
    settlementKo = `안착 ${settle.state} · ${settle.direction} · ${settle.level != null ? fmtPx(settle.level) : '–'} · ${settle.grade} ${Math.round(settle.score)}`;
  }

  const checklist: string[] = [];
  if (settlementKo) checklist.push(settlementKo);
  if (gatesPass < 4) checklist.push(`구조 확정 ${gatesPass}/5 — 4/5 이상 대기`);
  else checklist.push(`구조 확정 ${gatesPass}/5 ✓`);
  if (cs?.mtfBlocked || metrics.mtfBlocked) checklist.push('MTF 상위 반대 — 확정 억제·소량만');
  else if (metrics.mtfHtf) checklist.push(`MTF ${metrics.mtfHtf} · ${metrics.mtfLtf ?? '–'}`);
  checklist.push(ta.confirmKo);
  checklist.push(ta.invalidKo);
  if (ta.whaleAligned === false) checklist.push('⚠ 고래 흐름 반대 — 무효·확정만 우선');
  else if (ta.whaleAligned === true) checklist.push('고래·방향 같은 쪽');

  const stageKo =
    monthDesk && settle?.state === 'confirmed'
      ? `안착 확정 ${settle.grade}`
      : monthDesk && settle?.state === 'candidate'
        ? `안착 후보 ${settle.grade}`
        : ai?.stageKorean ?? (confirmDesk?.phaseKo?.slice(0, 16) ?? '대기');
  const followChain = analysis.breakoutFollow ?? null;

  const headline =
    followChain?.headlineKo ??
    (monthDesk && settlementKo
      ? settlementKo + (entry.low != null && entry.high != null ? ` · 타점 ${fmtPx(entry.low)}~${fmtPx(entry.high)}` : '')
      : ai?.headline?.trim() ||
        (dir === 'LONG' ? '롱 시나리오' : dir === 'SHORT' ? '숏 시나리오' : '관망') +
          (entry.low != null && entry.high != null ? ` · 타점 ${fmtPx(entry.low)}~${fmtPx(entry.high)}` : ''));

  const actionLine = followChain?.actionLineKo ?? ta.actionKo;
  const oppositeLine = followChain?.oppositeLineKo ?? '';

  if (followChain) {
    for (const n of followChain.upPath) {
      planLevels.push(levelRow(`bf-up-${n.price}`, `↑ ${n.labelKo}`, n.price, close, 'tp', '연동·상방'));
    }
    for (const n of followChain.downPath) {
      planLevels.push(levelRow(`bf-dn-${n.price}`, `↓ ${n.labelKo}`, n.price, close, 'invalid', '연동·하방'));
    }
  }

  return {
    direction: dir,
    directionKo: dir === 'LONG' ? '롱' : dir === 'SHORT' ? '숏' : '관망',
    stage: ai?.stage ?? 'opinion',
    stageKo,
    confluenceScore: score,
    confluenceLabel: label,
    headline,
    actionLine,
    riskNote:
      '고정 승률·투자 권유 아님 — 구조·무효·게이트·MTF가 맞을 때만 계획대로. 이탈 시 즉시 시나리오 중단.',
    gatesPass,
    gatesTotal: 5,
    mtfBlocked: !!(cs?.mtfBlocked || metrics.mtfBlocked),
    checklist: checklist.slice(0, 5),
    levels: planLevels,
    rrLines: [...new Set(rrLines)].slice(0, 3),
    scenarios: {
      a: followChain?.actionLineKo ?? ai?.scenarioA ?? analysis.bullishScenario ?? '—',
      b: oppositeLine || (ai?.scenarioB ?? analysis.bearishScenario ?? '—'),
    },
    metaTags: [
      ...(monthDesk && settle?.grade ? [`안착${settle.grade}`] : []),
      ...(ai?.metaTags?.slice(0, 5) ?? []),
    ].slice(0, 6),
    panelTitle: monthDesk ? '마감·안착 통합 플랜' : 'AI 통합 트레이드 플랜',
    panelSub: monthDesk
      ? '마감·안착 · AI 타점 · 확정 · 손절 · 익절 (구조 검증, 승률 보장 아님)'
      : '타점 · 확정 · 손절 · 익절 — 구조 검증용 (승률 보장 아님)',
    settlementKo,
    followChain,
  };
}
