/**
 * Eagle1 HUD 카드 — 엔진 필드 없을 때 analyze/plan 근사 연결 (확정 수익 표현 금지).
 */
import type { AnalyzeResponse } from '@/types';
import type { Eagle1MainPlan } from './signalEngine';
import type { Eagle1HudPack } from './hudPack';
import { eagle1DecisionKo, formatPriceCompact } from './chartUx';
import { formatSamplePct } from './noFakeNumbers';
import { resolveHudOrderFlowSummary } from './hudSynthesis';
import { formatReactionTime } from './historicalStatisticsEngine';
import type { SchematicCompareReport } from './schematicCompare';
import { runSchematicCompare } from './schematicCompare';
import type { StructureSnapshot } from './structureEngine';
import type { StructureAcceptanceReport } from './structureAcceptanceEngine';
import { normalizeMtfTf } from './mtfSequence';
import type { HudCheck } from './hudPack';
import type { PocState } from './zoneEngine';

function asPlan(raw: unknown): Eagle1MainPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as Eagle1MainPlan;
}

export type HudConfirmBadge = {
  tone: 'long' | 'short' | 'wait';
  badgeKo: string;
  subKo: string;
  slLocked: boolean;
  slText: string;
};

export function resolveHudConfirmBadge(
  analysis: AnalyzeResponse | null,
  plan: Eagle1MainPlan | null
): HudConfirmBadge {
  const p = plan ?? asPlan(analysis?.eagle1MainPlan);
  const slText = formatPriceCompact(p?.sl ?? null);
  const slLocked = p?.sl != null && Number.isFinite(p.sl);
  if (!p) {
    return { tone: 'wait', badgeKo: '대기', subKo: '플랜 계산 중', slLocked: false, slText: '—' };
  }
  if (p.status === 'CONFIRMED_LONG') {
    return { tone: 'long', badgeKo: '확정 롱', subKo: '진입·손절 레벨 고정', slLocked, slText };
  }
  if (p.status === 'CONFIRMED_SHORT') {
    return { tone: 'short', badgeKo: '확정 숏', subKo: '진입·손절 레벨 고정', slLocked, slText };
  }
  if (p.status === 'LONG_WATCH') {
    return { tone: 'long', badgeKo: '감시 롱', subKo: eagle1DecisionKo(p.status), slLocked, slText };
  }
  if (p.status === 'SHORT_WATCH') {
    return { tone: 'short', badgeKo: '감시 숏', subKo: eagle1DecisionKo(p.status), slLocked, slText };
  }
  const dir = p.direction ?? analysis?.verdict;
  if (dir === 'LONG') {
    return { tone: 'long', badgeKo: '롱 우선', subKo: '확정 전 · 조건 확인', slLocked, slText };
  }
  if (dir === 'SHORT') {
    return { tone: 'short', badgeKo: '숏 우선', subKo: '확정 전 · 조건 확인', slLocked, slText };
  }
  return { tone: 'wait', badgeKo: '대기', subKo: eagle1DecisionKo(p.status), slLocked, slText };
}

export type HudZoneLevels = {
  supportText: string;
  resistText: string;
  hasAny: boolean;
};

export function resolveHudZoneLevels(analysis: AnalyzeResponse | null): HudZoneLevels {
  const unified = analysis?.eagle1UnifiedZones as
    | {
        support?: Array<{ lower?: number; upper?: number; mid?: number }>;
        resist?: Array<{ lower?: number; upper?: number; mid?: number }>;
      }
    | null
    | undefined;
  let sup = unified?.support?.[0];
  let res = unified?.resist?.[0];
  const zones = analysis?.eagle1Zones as
    | {
        displaySupport?: Array<{ lower: number; upper: number }>;
        displayResist?: Array<{ lower: number; upper: number }>;
      }
    | null
    | undefined;
  if (!sup && zones?.displaySupport?.[0]) {
    const c = zones.displaySupport[0];
    sup = { lower: c.lower, upper: c.upper };
  }
  if (!res && zones?.displayResist?.[0]) {
    const c = zones.displayResist[0];
    res = { lower: c.lower, upper: c.upper };
  }
  const struct = analysis?.eagle1Structure as
    | { rangeLow?: number; rangeHigh?: number; lastSwingLow?: number; lastSwingHigh?: number }
    | null
    | undefined;
  if (!sup && struct?.lastSwingLow != null) {
    const p = struct.lastSwingLow;
    sup = { lower: p * 0.998, upper: p * 1.002 };
  }
  if (!res && struct?.lastSwingHigh != null) {
    const p = struct.lastSwingHigh;
    res = { lower: p * 0.998, upper: p * 1.002 };
  }
  const supportText = sup
    ? `${formatPriceCompact(sup.lower ?? sup.mid)}~${formatPriceCompact(sup.upper ?? sup.mid)}`
    : struct?.rangeLow != null
      ? formatPriceCompact(struct.rangeLow)
      : '—';
  const resistText = res
    ? `${formatPriceCompact(res.lower ?? res.mid)}~${formatPriceCompact(res.upper ?? res.mid)}`
    : struct?.rangeHigh != null
      ? formatPriceCompact(struct.rangeHigh)
      : '—';
  return {
    supportText,
    resistText,
    hasAny: supportText !== '—' || resistText !== '—',
  };
}

export function resolveHudTradeOpportunity(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null,
  plan: Eagle1MainPlan | null
): { grade: string; note: string } {
  if (hud?.tradeOpportunity?.grade) {
    return {
      grade: hud.tradeOpportunity.grade,
      note: hud.tradeOpportunity.note ?? hud.tradeOpportunity.labelKo ?? '',
    };
  }
  const p = plan ?? asPlan(analysis?.eagle1MainPlan);
  if (p?.status === 'CONFIRMED_LONG' || p?.status === 'CONFIRMED_SHORT') {
    return { grade: p.status === 'CONFIRMED_LONG' ? 'A' : 'A-', note: '구조·리스크 게이트 통과' };
  }
  if (p?.direction === 'LONG' || p?.direction === 'SHORT') {
    return {
      grade: p.entryQuality === 'good' ? 'B+' : p.entryQuality === 'ok' ? 'B' : 'C',
      note: p.reasons[0] ?? `${p.direction} 감시 · 확정 수익 아님`,
    };
  }
  return { grade: 'WAIT', note: p?.opposing[0] ?? 'HTF 충돌 또는 게이트 대기' };
}

export function resolveHudPositionSizeText(
  hud: Eagle1HudPack | null,
  plan: Eagle1MainPlan | null
): { units: string; note: string } {
  if (hud?.positionSize?.units != null) {
    return {
      units: `${hud.positionSize.units.toFixed(4)} u`,
      note: hud.positionSize.note ?? `위험 ${hud.positionSize.riskPct ?? '—'}%`,
    };
  }
  const p = plan;
  if (p?.sizeUnits != null) {
    return { units: `${p.sizeUnits.toFixed(4)} u`, note: p.sizeNote || '플랜 근사 크기' };
  }
  return { units: '—', note: '리스크 % 설정 후 계산' };
}

export function resolveHudMarketStateKo(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null,
  plan: Eagle1MainPlan | null
): string {
  if (hud?.marketState?.labelKo && !/^데이터 없음/.test(hud.marketState.labelKo)) {
    return hud.marketState.labelKo;
  }
  const p = plan;
  if (p?.regime) {
    const map: Record<string, string> = {
      trend_up: '상승 추세',
      trend_down: '하락 추세',
      range: '횡보 범위',
      transition: '전환 구간',
    };
    return map[String(p.regime)] ?? String(p.regime);
  }
  if (analysis?.verdict === 'LONG') return '상방 우세(근사)';
  if (analysis?.verdict === 'SHORT') return '하방 우세(근사)';
  return '횡보·대기(근사)';
}

export function resolveHudBigMoveUi(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null
): { score: number | null; labelKo: string; compression: number | null; expansionReady: number | null } {
  if (hud?.bigMove && hud.bigMove.state !== 'NONE') {
    return {
      score: hud.bigMove.score ?? null,
      labelKo: hud.bigMove.labelKo,
      compression: hud.bigMove.compression ?? null,
      expansionReady: hud.bigMove.expansionReady ?? null,
    };
  }
  const longS = analysis?.longScore ?? null;
  const shortS = analysis?.shortScore ?? null;
  const score =
    typeof longS === 'number' && typeof shortS === 'number'
      ? Math.round(Math.max(longS, shortS))
      : typeof longS === 'number'
        ? Math.round(longS)
        : typeof shortS === 'number'
          ? Math.round(shortS)
          : null;
  const diff = Math.abs((longS ?? 50) - (shortS ?? 50));
  return {
    score,
    labelKo: diff < 8 ? '압축·혼조(근사)' : (longS ?? 0) > (shortS ?? 0) ? '상방 탄력(근사)' : '하방 탄력(근사)',
    compression: score,
    expansionReady: diff > 15 ? Math.min(100, Math.round(diff * 1.2)) : null,
  };
}

export function resolveHudFlowSyncKo(hud: Eagle1HudPack | null, analysis: AnalyzeResponse | null): string {
  if (hud?.flowSync?.labelKo && !/^데이터 없음/.test(hud.flowSync.labelKo)) {
    return hud.flowSync.labelKo;
  }
  const mtf = analysis?.mtf as { alignmentScore?: number; labelKo?: string } | undefined;
  if (mtf?.labelKo) return mtf.labelKo;
  if (typeof mtf?.alignmentScore === 'number') {
    return mtf.alignmentScore >= 60 ? 'MTF 정렬↑(근사)' : 'MTF 혼조(근사)';
  }
  const mp = analysis?.eagle1MoneyPressure as { labelKo?: string } | null | undefined;
  if (mp?.labelKo) return mp.labelKo;
  return analysis?.verdict === 'LONG'
    ? '흐름 상방(근사)'
    : analysis?.verdict === 'SHORT'
      ? '흐름 하방(근사)'
      : '동기화 대기';
}

export function resolveHudClockFlowKo(hud: Eagle1HudPack | null): string {
  if (hud?.clockFlow?.labelKo && !/^데이터 없음/.test(hud.clockFlow.labelKo)) {
    return hud.clockFlow.labelKo;
  }
  if (hud?.clockFlow?.note) return hud.clockFlow.note;
  return '15m 경계 근사';
}

export function resolveHudClockFlowDetail(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null
): {
  label: string;
  after15m: string;
  after1h: string;
  after4h: string;
  subMinute: string;
  note: string;
} {
  const cf = hud?.clockFlow;
  const dir = analysis?.verdict;
  const lane = dir === 'LONG' ? '롱 우세 근사' : dir === 'SHORT' ? '숏 우세 근사' : '횡보 근사';
  return {
    label: resolveHudClockFlowKo(hud),
    after15m: cf?.after15m && !/^데이터 없음/.test(cf.after15m) ? cf.after15m : lane,
    after1h: cf?.after1h && !/^데이터 없음/.test(cf.after1h) ? cf.after1h : lane,
    after4h: cf?.after4h && !/^데이터 없음/.test(cf.after4h) ? cf.after4h : lane,
    subMinute: cf?.subMinute && !/^데이터 없음/.test(cf.subMinute) ? cf.subMinute : '틱·초봉 근사',
    note: cf?.note ?? '15m·1H·4H 경계',
  };
}

export function resolveHudEntryQualityUi(
  hud: Eagle1HudPack | null,
  plan: Eagle1MainPlan | null,
  hubStats?: { strength?: number; longPct?: number; shortPct?: number; entryAllowed?: boolean } | null
): { score: number | null; labelKo: string } {
  if (hubStats && typeof hubStats.strength === 'number') {
    const gap = Math.abs(Number(hubStats.longPct ?? 50) - Number(hubStats.shortPct ?? 50));
    const score = Math.max(
      0,
      Math.min(
        100,
        Math.round(hubStats.strength * 0.55 + gap * 0.9 + (hubStats.entryAllowed ? 12 : 0))
      )
    );
    return {
      score,
      labelKo:
        score >= 78 ? '진입 양호(变身)' : score >= 55 ? '진입 보통(变身)' : score >= 35 ? '진입 낮음(变身)' : '대기(变身)',
    };
  }
  if (hud?.entryQuality?.score != null) {
    return { score: hud.entryQuality.score, labelKo: hud.entryQuality.labelKo };
  }
  const p = plan;
  const map = { good: 82, ok: 58, poor: 32 } as const;
  if (p?.entryQuality) {
    return {
      score: map[p.entryQuality],
      labelKo: p.entryQuality === 'good' ? '진입 양호' : p.entryQuality === 'ok' ? '진입 보통' : '진입 낮음',
    };
  }
  return { score: null, labelKo: '대기' };
}

export function resolveHudExecutionLevelsFallback(
  hud: Eagle1HudPack | null,
  plan: Eagle1MainPlan | null
): {
  summaryKo: string;
  entry: string;
  stop: string;
  targets: string[];
  allowEntry: boolean;
} | null {
  if (hud?.executionLevels) {
    return {
      summaryKo: hud.executionLevels.summaryKo,
      entry: hud.executionLevels.entry.note,
      stop: String(hud.executionLevels.stop.executableSl ?? formatPriceCompact(plan?.sl ?? null)),
      targets: hud.executionLevels.target.levels.map((lv) => `${lv.id}:${lv.price ?? '—'}`),
      allowEntry: hud.executionLevels.entry.allowEntry,
    };
  }
  const p = plan;
  if (!p?.entryLow && p?.sl == null) return null;
  return {
    summaryKo: '플랜 레벨(근사)',
    entry:
      p.entryLow != null
        ? `${formatPriceCompact(p.entryLow)}~${formatPriceCompact(p.entryHigh)}`
        : '—',
    stop: formatPriceCompact(p.sl),
    targets: [p.tp1, p.tp2, p.tp3]
      .filter((x) => x != null)
      .map((x, i) => `TP${i + 1}:${formatPriceCompact(x)}`),
    allowEntry: p.status === 'CONFIRMED_LONG' || p.status === 'CONFIRMED_SHORT',
  };
}

export function resolveHudStrategyFusionKo(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null
): string {
  if (hud?.legendaryFusion?.summaryKo) return hud.legendaryFusion.summaryKo;
  const combo = analysis?.eagle1Combination as { summaryKo?: string; headlineKo?: string } | null | undefined;
  if (combo?.summaryKo) return combo.summaryKo;
  if (combo?.headlineKo) return combo.headlineKo;
  const p = asPlan(analysis?.eagle1MainPlan);
  if (p?.consensus?.headlineKo) return p.consensus.headlineKo;
  return '융합 대기 · 단일 플랜 우선';
}

export function resolveHudReEntryKo(hud: Eagle1HudPack | null, plan: Eagle1MainPlan | null): string {
  if (hud?.reEntry?.summaryKo) return hud.reEntry.summaryKo;
  if (plan?.status === 'LONG_MISSED' || plan?.status === 'SHORT_MISSED') {
    return '재진입 — 이전 시그널 놓침 · 새 구조 대기';
  }
  return plan?.direction ? `${plan.direction} 1차만 · 재진입 조건 별도` : '재진입 없음';
}

export function resolveHudMtfSmartZoneKo(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null
): string {
  if (hud?.mtfSmartZone?.summaryKo) return hud.mtfSmartZone.summaryKo;
  const v = analysis?.verdict;
  if (v === 'LONG') return 'WATCH LONG(근사) · MTF 정렬 확인';
  if (v === 'SHORT') return 'WATCH SHORT(근사) · MTF 정렬 확인';
  return 'WATCH · 방향 대기';
}

export function resolveHudHtfHistoryRows(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null
): Array<{ tf: string; note: string; ok: boolean }> {
  if (hud?.htfHistorical?.rows?.length) {
    return hud.htfHistorical.rows
      .filter((r) => ['1M', '1W', '1D', '4H'].includes(r.tf))
      .map((r) => ({ tf: r.tf, note: r.note, ok: r.status === 'ok' }));
  }
  const compass = (hud?.mtfCompass ?? []) as Array<{ tf: string; bias: string; arrow: string }>;
  if (compass.length) {
    return compass
      .filter((r) => ['1M', '1W', '1D', '4H'].includes(r.tf))
      .map((r) => ({
        tf: r.tf,
        note: `${r.arrow} ${r.bias}`,
        ok: r.bias === 'up' || r.bias === 'down',
      }));
  }
  const mtf = analysis?.mtf as { rows?: Array<{ tf: string; verdict?: string }> } | undefined;
  if (mtf?.rows?.length) {
    return mtf.rows.slice(0, 4).map((r) => ({
      tf: r.tf,
      note: r.verdict ?? '—',
      ok: r.verdict === 'LONG' || r.verdict === 'SHORT',
    }));
  }
  return [
    { tf: '4H', note: '근사 미연결', ok: false },
    { tf: '1D', note: '근사 미연결', ok: false },
  ];
}

export function resolveHudLiquidityDefenseKo(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null
): { summary: string; bid: string; ask: string } | null {
  if (hud?.liquidityDefense) {
    return {
      summary: hud.liquidityDefense.summaryKo,
      bid: hud.liquidityDefense.bidDefense.real
        ? hud.liquidityDefense.bidDefense.note
        : resolveHudOrderFlowSummary(analysis, hud),
      ask: hud.liquidityDefense.askDefense.real
        ? hud.liquidityDefense.askDefense.note
        : typeof analysis?.orderbookImbalance === 'number'
          ? analysis.orderbookImbalance > 0.05
            ? '매수 호가 우세(근사)'
            : analysis.orderbookImbalance < -0.05
              ? '매도 호가 우세(근사)'
              : '호가 균형(근사)'
          : '호가 근사',
    };
  }
  const ob = analysis?.orderbookImbalance;
  if (typeof ob === 'number') {
    return {
      summary: '호가·체결 근사',
      bid: ob > 0 ? `매수측 +${(ob * 100).toFixed(0)}%` : '매수측 약',
      ask: ob < 0 ? `매도측 +${(-ob * 100).toFixed(0)}%` : '매도측 약',
    };
  }
  return {
    summary: resolveHudOrderFlowSummary(analysis, hud),
    bid: '체결·CVD 근사',
    ask: analysis?.eagle1Availability?.has_orderbook ? '호가 수집중' : '라이브 보강중',
  };
}

export function resolveHudWalkForwardKo(hud: Eagle1HudPack | null, plan: Eagle1MainPlan | null): string {
  if (hud?.costAwareWalkForward?.summaryKo) return hud.costAwareWalkForward.summaryKo;
  if (plan?.sampleSize && plan.sampleSize >= 20) {
    return formatSamplePct(plan.sampleSize, plan.calibratedProbability ?? null);
  }
  return `표본 n=${plan?.sampleSize ?? 0} · 워크포워드 근사`;
}

export function resolveHudScoreCalibrationFallback(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null,
  plan: Eagle1MainPlan | null
): { aiScore: number | null; calibratedText: string; summaryKo: string } {
  if (hud?.scoreCalibration) {
    return {
      aiScore: hud.scoreCalibration.aiScore ?? null,
      calibratedText: hud.scoreCalibration.calibratedText,
      summaryKo: hud.scoreCalibration.summaryKo,
    };
  }
  const ai =
    plan?.aiScore ??
    (typeof analysis?.longScore === 'number'
      ? Math.round((analysis.longScore + (analysis.shortScore ?? analysis.longScore)) / 2)
      : null);
  return {
    aiScore: ai,
    calibratedText: formatSamplePct(plan?.sampleSize ?? 0, plan?.calibratedProbability ?? null),
    summaryKo: '플랜·MTF 근사 점수',
  };
}

export function resolveHudLiveMarkIndex(
  analysis: AnalyzeResponse | null,
  px: number | null
): { mark: string; index: string } {
  const mark = analysis?.eagle1LiveQuotes?.mark ?? null;
  const index = analysis?.eagle1LiveQuotes?.index ?? null;
  const fallback = px != null ? formatPriceCompact(px) : null;
  return {
    mark:
      mark != null
        ? formatPriceCompact(mark)
        : analysis?.eagle1Availability?.has_mark
          ? fallback ?? '수집중'
          : fallback ?? '—',
    index:
      index != null
        ? formatPriceCompact(index)
        : analysis?.eagle1Availability?.has_index
          ? fallback ?? '수집중'
          : fallback ?? '—',
  };
}

export function resolveHudMicroMetric(
  key: 'cvd' | 'ofi' | 'lob' | 'oi',
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null
): { text: string; on: boolean } {
  const ch = hud?.orderFlow?.channels?.find((c) => c.key === key);
  if (ch?.valueText && ch.available) {
    return { text: ch.valueText, on: true };
  }
  const avail = analysis?.eagle1Availability;
  if (key === 'cvd') {
    if (typeof analysis?.volumeDelta === 'number') {
      return {
        text: `${analysis.volumeDelta >= 0 ? '+' : ''}${analysis.volumeDelta.toFixed(2)}`,
        on: true,
      };
    }
    return { text: avail?.has_cvd ? '수집중' : '근사 대기', on: Boolean(avail?.has_cvd) };
  }
  if (key === 'oi') {
    const st = analysis?.oiState;
    if (st) return { text: st === 'increasing' ? 'OI↑' : st === 'decreasing' ? 'OI↓' : 'OI→', on: true };
    return { text: avail?.has_oi ? '시리즈' : '—', on: Boolean(avail?.has_oi) };
  }
  if (key === 'lob') {
    const ob = analysis?.orderbookImbalance;
    if (typeof ob === 'number') {
      return {
        text: ob > 0.05 ? '매수우세' : ob < -0.05 ? '매도우세' : '균형',
        on: true,
      };
    }
    return { text: avail?.has_orderbook ? '호가' : '—', on: Boolean(avail?.has_orderbook) };
  }
  if (typeof analysis?.buyPressure === 'number') {
    return { text: `${Math.round(analysis.buyPressure * 100)}%`, on: true };
  }
  return { text: avail?.has_trades ? '수집중' : '—', on: Boolean(avail?.has_trades) };
}

export function resolveHudSummaryText(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null,
  plan: Eagle1MainPlan | null,
  confirm: HudConfirmBadge
): string {
  if (hud?.summary && !/^데이터 없음/.test(hud.summary)) return hud.summary;
  const acc = analysis?.eagle1Acceptance as { uiLabel?: string } | null | undefined;
  if (acc?.uiLabel) return acc.uiLabel;
  const p = plan;
  if (!p) return '분석 로딩…';
  return `${confirm.badgeKo} · 진입 ${formatPriceCompact(p.entryLow)}~${formatPriceCompact(p.entryHigh)} · 손절 ${confirm.slText} · 확정 수익 아님`;
}

export function resolveHudInvalidationKo(plan: Eagle1MainPlan | null, dir: 'LONG' | 'SHORT' | null): string {
  if (plan?.invalidation && !/^데이터 없음/.test(plan.invalidation)) return plan.invalidation;
  if (plan?.sl != null) {
    return `종가가 ${formatPriceCompact(plan.sl)} ${dir === 'SHORT' ? '위' : '아래'}면 무효`;
  }
  return '손절 레벨 대기';
}

export function resolveHudUnifiedZoneKo(
  analysis: AnalyzeResponse | null,
  zoneLevels: HudZoneLevels
): { lines: string[]; hasAny: boolean } {
  const zones = analysis?.eagle1UnifiedZones as
    | {
        support?: Array<{ sourceLabels?: string[]; sampleSize?: number; holdProbability?: number }>;
        resist?: Array<{ sourceLabels?: string[]; sampleSize?: number; holdProbability?: number }>;
      }
    | null
    | undefined;
  const z = zones?.support?.[0] ?? zones?.resist?.[0];
  if (z) {
    return {
      hasAny: true,
      lines: [
        `POC/OB/FVG ${(z.sourceLabels ?? ['zone']).join(' · ')}`,
        `홀드 ${formatSamplePct(z.sampleSize ?? 0, z.holdProbability ?? null)}`,
        `지지 ${zoneLevels.supportText} · 저항 ${zoneLevels.resistText}`,
      ],
    };
  }
  if (zoneLevels.hasAny) {
    return {
      hasAny: true,
      lines: [`지지 ${zoneLevels.supportText}`, `저항 ${zoneLevels.resistText}`, '엔진 존 근사'],
    };
  }
  return { hasAny: false, lines: ['존 계산 중'] };
}

export function resolveHudLiqZonesKo(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null,
  zoneLevels: HudZoneLevels,
  plan: Eagle1MainPlan | null
): { summary: string; lines: string[] } {
  if (hud?.liqZones) {
    const lines: string[] = [];
    if (hud.liqZones.longLiq) {
      lines.push(`${hud.liqZones.longLiq.labelEn} · ${hud.liqZones.longLiq.note}`);
    }
    if (hud.liqZones.shortLiq) {
      lines.push(`${hud.liqZones.shortLiq.labelEn} · ${hud.liqZones.shortLiq.note}`);
    }
    return { summary: hud.liqZones.summaryKo, lines };
  }
  const struct = analysis?.eagle1Structure as { equalHighs?: number[]; equalLows?: number[] } | null | undefined;
  const lines: string[] = [];
  const eqh = struct?.equalHighs?.slice(-1)[0];
  const eql = struct?.equalLows?.slice(-1)[0];
  if (eqh != null) lines.push(`SHORT LIQ · EQH ${formatPriceCompact(eqh)}`);
  if (eql != null) lines.push(`LONG LIQ · EQL ${formatPriceCompact(eql)}`);
  if (plan?.sl != null) lines.push(`손절 ${formatPriceCompact(plan.sl)}`);
  if (!lines.length) {
    lines.push(`저항 ${zoneLevels.resistText}`, `지지 ${zoneLevels.supportText}`);
  }
  return { summary: '유동성·손절 근사', lines };
}

export function resolveHudCombinationEngineKo(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null,
  plan: Eagle1MainPlan | null
): { summary: string; hits: string[] } {
  if (hud?.combination?.hits?.length) {
    return {
      summary: hud.combination.summaryKo,
      hits: hud.combination.hits.slice(0, 6).map((h) => `${h.labelKo} · n=${h.sampleSize}`),
    };
  }
  const combo = analysis?.eagle1Combination as { summaryKo?: string; hits?: Array<{ labelKo?: string }> } | null;
  if (combo?.hits?.length) {
    return {
      summary: combo.summaryKo ?? '조합 근사',
      hits: combo.hits.slice(0, 4).map((h) => h.labelKo ?? 'hit'),
    };
  }
  const reasons = plan?.reasons?.slice(0, 4) ?? [];
  return {
    summary: plan?.expectedPath ?? '단일 플랜 조합',
    hits: reasons.length ? reasons : ['게이트 통과 대기'],
  };
}

export function resolveHudCombinationMiningKo(
  hud: Eagle1HudPack | null,
  plan: Eagle1MainPlan | null
): { summary: string; rows: string[] } {
  if (hud?.combinationMining?.rows?.length) {
    return {
      summary: hud.combinationMining.summaryKo,
      rows: hud.combinationMining.rows.slice(0, 5).map(
        (r) => `${r.family}/${r.regime} · n=${r.sampleSize} · ${r.statLabel}`
      ),
    };
  }
  const sample = plan?.sampleSize ?? 0;
  return {
    summary: formatSamplePct(sample, plan?.calibratedProbability ?? null),
    rows: [`표본 n=${sample}`, plan?.structureState ?? 'structure', plan?.regime ?? 'regime'],
  };
}

export function resolveHudLobResiliencyKo(hud: Eagle1HudPack | null, analysis: AnalyzeResponse | null): string {
  if (hud?.lobResiliency?.labelKo && !/^데이터 없음/.test(hud.lobResiliency.labelKo)) {
    return `${hud.lobResiliency.labelKo} · ${hud.lobResiliency.note ?? ''}`.trim();
  }
  const ob = analysis?.orderbookImbalance;
  if (typeof ob === 'number') {
    return ob > 0.08 ? '매수벽 회복(근사)' : ob < -0.08 ? '매도벽 회복(근사)' : '호가 균형(근사)';
  }
  return resolveHudOrderFlowSummary(analysis, hud);
}

export function resolveHudBitgetCoverageRows(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null,
  timeframe: string
): Array<{ tf: string; text: string }> {
  if (hud?.coverage?.length) {
    return hud.coverage.map((c) => ({
      tf: c.tf,
      text: c.rows > 0 ? `${c.rows}봉 · 공백 ${c.gaps}` : '근사',
    }));
  }
  const avail = analysis?.eagle1Availability;
  const on = [
    avail?.has_orderbook ? '호가' : null,
    avail?.has_cvd ? 'CVD' : null,
    avail?.has_oi ? 'OI' : null,
    avail?.has_funding ? '펀딩' : null,
  ].filter(Boolean);
  return [
    { tf: timeframe, text: on.length ? on.join('+') : '수집 대기' },
    { tf: 'live', text: avail?.has_trades ? '체결 ON' : '체결 대기' },
  ];
}

export function resolveHudPremiumDiscountPct(
  prem: { position?: number } | null | undefined,
  plan: Eagle1MainPlan | null,
  px: number | null
): number | null {
  if (prem?.position != null) return Math.max(0, Math.min(100, prem.position * 100));
  if (plan?.entryLow != null && plan.entryHigh != null && px != null) {
    const mid = (plan.entryLow + plan.entryHigh) / 2;
    const span = Math.abs(plan.entryHigh - plan.entryLow) || 1;
    return Math.max(0, Math.min(100, 50 + ((px - mid) / span) * 25));
  }
  return null;
}

export function resolveHudHistoricalReachRows(
  hist: { reach?: Array<{ label: string; rate?: number | null }>; totalSample?: number; meanReactionSec?: number | null; meanReactionLabel?: string } | null | undefined,
  plan: Eagle1MainPlan | null
): { rows: string[]; reaction: string } {
  if (hist?.reach?.length) {
    return {
      rows: hist.reach.slice(0, 6).map((r) => `${r.label} ${formatSamplePct(hist.totalSample ?? 0, r.rate ?? null)}`),
      reaction: formatReactionTime(hist.meanReactionSec ?? null, hist.meanReactionLabel || '—'),
    };
  }
  const sample = plan?.sampleSize ?? 0;
  return {
    rows: [formatSamplePct(sample, plan?.calibratedProbability ?? null), `n=${sample}`],
    reaction: plan?.expectedPath ?? '경로 근사',
  };
}

export type HudCompassRow = {
  tf: string;
  arrow: '↑' | '↓' | '→';
  bias: 'up' | 'down' | 'flat';
  note: string;
};

export type HudCandidatePack = {
  active: boolean;
  checks: HudCheck[];
};

const COMPASS_TFS = ['1M', '1W', '1D', '4H', '1H', '15m', '5m', '1m'] as const;

function biasFromText(s: string | undefined | null): 'up' | 'down' | 'flat' {
  if (!s) return 'flat';
  const low = String(s).toLowerCase();
  if (low.includes('long') || low.includes('bull') || low.includes('up') || low.includes('상')) return 'up';
  if (low.includes('short') || low.includes('bear') || low.includes('down') || low.includes('하')) return 'down';
  return 'flat';
}

function compassRowFromBias(tf: string, bias: 'up' | 'down' | 'flat', note: string): HudCompassRow {
  if (bias === 'up') return { tf, arrow: '↑', bias: 'up', note };
  if (bias === 'down') return { tf, arrow: '↓', bias: 'down', note };
  return { tf, arrow: '→', bias: 'flat', note };
}

function buildCompassFromFrameViews(
  frames: Array<{ tf: string; state: string; bias: 'bullish' | 'bearish' | null }>
): HudCompassRow[] {
  return COMPASS_TFS.map((tf) => {
    const row = frames.find((f) => normalizeMtfTf(String(f.tf)) === tf);
    if (!row || row.bias == null) {
      return compassRowFromBias(tf, 'flat', row?.state && row.state !== '데이터 없음' ? row.state : '수집 대기');
    }
    return compassRowFromBias(tf, row.bias === 'bullish' ? 'up' : 'down', row.state);
  });
}

export function resolveHudMtfCompassRows(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null
): HudCompassRow[] {
  if (hud?.mtfCompass?.length) {
    return COMPASS_TFS.map((tf) => {
      const row = hud.mtfCompass.find((r) => normalizeMtfTf(r.tf) === tf);
      if (row) return row;
      return compassRowFromBias(tf, 'flat', '수집 대기');
    });
  }
  const frames = analysis?.eagle1CompassFrames;
  if (frames?.length) return buildCompassFromFrameViews(frames);
  const acc = analysis?.eagle1Acceptance as StructureAcceptanceReport | null | undefined;
  if (acc?.mtfBias?.length) {
    const biasMap = new Map<string, 'up' | 'down'>();
    for (const row of acc.mtfBias) {
      if (!row.bias) continue;
      for (const part of row.tfs.split(/[,/·]/)) {
        const tf = normalizeMtfTf(part.trim());
        if (tf) biasMap.set(tf, row.bias);
      }
    }
    return COMPASS_TFS.map((tf) => {
      const b = biasMap.get(tf);
      if (b) return compassRowFromBias(tf, b, rowNoteForTf(acc, tf));
      return compassRowFromBias(tf, 'flat', 'MTF 바이어스 대기');
    });
  }
  const mtf = analysis?.mtf;
  if (mtf) {
    const htf = biasFromText(mtf.htfBias);
    const mid = biasFromText(mtf.mtfBias ?? mtf.mtfStructure);
    const ltf = biasFromText(mtf.ltfEntryBias ?? mtf.ltfBias);
    return COMPASS_TFS.map((tf) => {
      if (['1M', '1W', '1D', '4H'].includes(tf)) return compassRowFromBias(tf, htf, mtf.htfBias || 'HTF');
      if (tf === '1H' || tf === '15m') return compassRowFromBias(tf, mid, mtf.mtfStructure || 'MTF');
      return compassRowFromBias(tf, ltf, mtf.ltfEntryBias || 'LTF');
    });
  }
  const st = analysis?.eagle1Structure as { regime?: string; state?: string } | null | undefined;
  if (st?.regime) {
    const chartBias =
      st.regime.includes('BULL') ? 'up' : st.regime.includes('BEAR') ? 'down' : 'flat';
    return COMPASS_TFS.map((tf) =>
      compassRowFromBias(tf, chartBias as 'up' | 'down' | 'flat', `${st.regime} · ${st.state ?? '—'}`)
    );
  }
  return COMPASS_TFS.map((tf) => compassRowFromBias(tf, 'flat', '수집 대기'));
}

function rowNoteForTf(acc: StructureAcceptanceReport, tf: string): string {
  const row = acc.mtfBias.find((r) => r.tfs.includes(tf));
  return row?.note ?? acc.uiLabel ?? 'MTF';
}

export function resolveHudCompassConflict(rows: HudCompassRow[]): string | null {
  const ltf = rows.filter((r) => ['1m', '5m', '15m', '1H'].includes(r.tf) && r.bias !== 'flat');
  const htf = rows.filter((r) => ['4H', '1D', '1W', '1M'].includes(r.tf) && r.bias !== 'flat');
  if (!ltf.length || !htf.length) return null;
  const side = (xs: HudCompassRow[]) => {
    const up = xs.filter((r) => r.bias === 'up').length;
    const dn = xs.filter((r) => r.bias === 'down').length;
    if (up === dn) return null;
    return up > dn ? 'up' : 'down';
  };
  const a = side(ltf);
  const b = side(htf);
  if (!a || !b || a === b) return null;
  return a === 'up' ? '단기 상승 / 상위 하락' : '단기 하락 / 상위 상승';
}

function asStructureSnapshot(raw: unknown): StructureSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const st = raw as StructureSnapshot;
  if (!st.regime || !Array.isArray(st.events)) return null;
  return st;
}

export function resolveHudSchematicCompare(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null,
  plan: Eagle1MainPlan | null
): SchematicCompareReport {
  if (hud?.schematic?.features?.length) return hud.schematic;
  const st = asStructureSnapshot(analysis?.eagle1Structure);
  if (!st) {
    return {
      referenceKo: '와이코프 대기',
      currentKo: '구조 수집 중',
      chartLabelKo: '대기',
      tone: 'wait',
      features: [{ id: 'wait', labelKo: '구조 이벤트', hit: null, note: '수집 대기' }],
      sampleSize: plan?.sampleSize ?? 0,
      note: '엔진 구조 대기 · 확률 아님',
    };
  }
  const zones = analysis?.eagle1Zones as { profile?: { pocState?: unknown } } | null | undefined;
  const candles = analysis?.eagle1SparkCandles?.map((c) => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
  return runSchematicCompare({
    structure: st,
    candles: candles ?? null,
    pocState: (zones?.profile?.pocState ?? null) as PocState | null,
    sampleSize: plan?.sampleSize ?? 0,
  });
}

function candidateCheck(id: string, labelKo: string, hit: boolean | null): HudCheck {
  return {
    id,
    labelKo,
    hit,
    note: hit == null ? '수집 대기' : hit ? '충족' : '미충족',
  };
}

export function resolveHudBigLongCandidate(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null,
  plan: Eagle1MainPlan | null
): HudCandidatePack {
  if (hud?.bigLong?.checks?.length) return hud.bigLong;
  const acc = analysis?.eagle1Acceptance as StructureAcceptanceReport | null | undefined;
  const closeOk = acc?.state === 'CLOSE_CONFIRM' || acc?.state === 'HOLD' || acc?.state === 'ACCEPTED';
  const retestOk = acc?.state === 'HOLD' || acc?.state === 'ACCEPTED';
  const bookUp =
    typeof analysis?.orderbookImbalance === 'number' ? analysis.orderbookImbalance > 0.05 : null;
  const cvdUp = typeof analysis?.volumeDelta === 'number' ? analysis.volumeDelta > 0 : null;
  const checks: HudCheck[] = [
    candidateCheck(
      'resBreak',
      '저항 돌파',
      acc?.bias === 'bullish' && (acc.state === 'BREAK' || closeOk || retestOk)
    ),
    candidateCheck('close', '15m 종가 확인', acc?.bias === 'bullish' && closeOk),
    candidateCheck('retest', '재시험 유지', acc?.bias === 'bullish' && retestOk),
    candidateCheck('book', '라이브 호가', bookUp),
    candidateCheck('cvd', 'CVD 상승', cvdUp),
    candidateCheck('sample', '표본 충분', (plan?.sampleSize ?? 0) >= 30),
  ];
  const hits = checks.filter((c) => c.hit === true).length;
  return {
    active: hits >= 4 && (plan?.direction === 'LONG' || acc?.bias === 'bullish'),
    checks,
  };
}

export function resolveHudCascadeShortCandidate(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null,
  plan: Eagle1MainPlan | null
): HudCandidatePack {
  if (hud?.cascadeShort?.checks?.length) return hud.cascadeShort;
  const acc = analysis?.eagle1Acceptance as StructureAcceptanceReport | null | undefined;
  const fb = analysis?.eagle1FalseBreak as { kind?: string } | null | undefined;
  const closeOk = acc?.state === 'CLOSE_CONFIRM' || acc?.state === 'HOLD' || acc?.state === 'ACCEPTED';
  const bookUp =
    typeof analysis?.orderbookImbalance === 'number' ? analysis.orderbookImbalance > 0.05 : null;
  const cvdUp = typeof analysis?.volumeDelta === 'number' ? analysis.volumeDelta > 0 : null;
  const checks: HudCheck[] = [
    candidateCheck(
      'supBreak',
      '지지 이탈',
      acc?.bias === 'bearish' && (acc.state === 'BREAK' || closeOk)
    ),
    candidateCheck('closeDn', '종가 아래', acc?.bias === 'bearish' && closeOk),
    candidateCheck(
      'retestFail',
      '재시험 실패',
      fb?.kind === 'FAKE_BREAKDOWN' ? false : acc?.activeFail === 'FAILED_RECLAIM'
    ),
    candidateCheck('bookDn', '호가 매도', bookUp == null ? null : !bookUp),
    candidateCheck('cvdDn', 'CVD 하락', cvdUp == null ? null : !cvdUp),
    candidateCheck('sample', '표본 충분', (plan?.sampleSize ?? 0) >= 30),
  ];
  const hits = checks.filter((c) => c.hit === true).length;
  return {
    active: hits >= 4 && (plan?.direction === 'SHORT' || acc?.bias === 'bearish'),
    checks,
  };
}

export function resolveHudPlanEntryRange(
  plan: Eagle1MainPlan | null,
  execLv: { entry: string } | null,
  zoneLevels: HudZoneLevels,
  dir: 'LONG' | 'SHORT' | null | undefined
): string {
  if (plan?.entryLow != null && plan.entryHigh != null) {
    return `${formatPriceCompact(plan.entryLow)}~${formatPriceCompact(plan.entryHigh)}`;
  }
  if (execLv?.entry && execLv.entry !== '—') return execLv.entry;
  if (dir === 'LONG' && zoneLevels.supportText !== '—') return zoneLevels.supportText;
  if (dir === 'SHORT' && zoneLevels.resistText !== '—') return zoneLevels.resistText;
  const st = plan?.structureState;
  if (st) return `${st} · 진입 대기`;
  return '—';
}

export function resolveHudAiScoreDisplay(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null,
  plan: Eagle1MainPlan | null
): string {
  const fromHud = hud?.scoreCalibration?.aiScore;
  if (fromHud != null) return String(fromHud);
  if (plan?.aiScore != null) return String(plan.aiScore);
  if (typeof analysis?.longScore === 'number') {
    const avg = Math.round((analysis.longScore + (analysis.shortScore ?? analysis.longScore)) / 2);
    return `${avg}(근사)`;
  }
  return '—';
}

export function resolveHudMtfSmartZoneDetail(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null,
  plan: Eagle1MainPlan | null
): { summary: string; longLine: string | null; shortLine: string | null } {
  if (hud?.mtfSmartZone) {
    const z = hud.mtfSmartZone;
    return {
      summary: z.summaryKo,
      longLine: z.long
        ? `${z.long.labelEn} · n=${z.long.sampleSize} · ${z.long.note}`
        : null,
      shortLine: z.short
        ? `${z.short.labelEn} · n=${z.short.sampleSize} · ${z.short.note}`
        : null,
    };
  }
  const sample = plan?.sampleSize ?? 0;
  const summary = resolveHudMtfSmartZoneKo(hud, analysis);
  const v = analysis?.verdict;
  return {
    summary,
    longLine: v === 'LONG' ? `WATCH LONG · n=${sample} · MTF 정렬 근사` : null,
    shortLine: v === 'SHORT' ? `WATCH SHORT · n=${sample} · MTF 정렬 근사` : null,
  };
}

export function resolveHudBreakQualityFactors(
  acc: StructureAcceptanceReport | null | undefined,
  plan: Eagle1MainPlan | null
): Array<{ id: string; labelKo: string; score: number | null; note: string }> {
  if (acc?.factors?.length) {
    return acc.factors.slice(0, 8).map((f) => ({
      id: f.id,
      labelKo: f.labelKo,
      score: f.score,
      note: f.note || (f.score == null ? '근사 대기' : ''),
    }));
  }
  const rows: Array<{ id: string; labelKo: string; score: number | null; note: string }> = [];
  if (acc?.breakQualityScore != null) {
    rows.push({
      id: 'quality',
      labelKo: '돌파 품질',
      score: acc.breakQualityScore,
      note: acc.breakQualityNote,
    });
  }
  for (const [i, reason] of (plan?.reasons ?? []).slice(0, 4).entries()) {
    rows.push({ id: `r${i}`, labelKo: reason, score: null, note: '플랜 근거' });
  }
  if (!rows.length) {
    rows.push({ id: 'wait', labelKo: '구조 수용', score: null, note: '이벤트 대기' });
  }
  return rows;
}