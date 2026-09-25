/**
 * 차트 알림 · LIVE 브리핑 — SWEEP/CHoCH 등 이벤트 + AI판정 + 고래·수급을 한 줄 방향으로.
 * 확정 수익·고정 승률 금지.
 */
import type { AnalyzeResponse } from '@/types';
import type { Eagle1MainPlan } from './signalEngine';
import type { Eagle1HudPack } from './hudPack';
import type { Eagle1CanonicalTradeDisplay } from './canonicalTradeDisplay';
import { formatEagle1EventKo, eagle1EventExplainKo } from './hudSynthesis';
import { formatPriceCompact } from './chartUx';
import { AI_SUPER_BIANSHEN_STATS } from './aiSuperBianShenStats';

export type BriefVerdict = 'LONG' | 'SHORT' | 'WAIT';

export type Eagle1LiveBriefing = {
  verdict: BriefVerdict;
  verdictKo: string;
  /** AI 최종 결론 — 롱 / 숏 / 대기 (한 단어) */
  conclusion: BriefVerdict;
  conclusionKo: string;
  /** 화면 큰 글씨 — 확정 롱 · 롱 · 대기(충돌) */
  resultKo: string;
  confirmed: boolean;
  /** 한 줄 — "숏 · AI超级变身统计" */
  headlineKo: string;
  structureKo: string;
  liveFlowKo: string;
  whaleDefenseKo: string;
  conflict: boolean;
  lines: string[];
};

export type Eagle1ChartAlertEnriched = {
  id: string;
  en: string;
  ko: string;
  tone: 'bear' | 'bull' | 'warn' | 'info';
  priceHint: number | null;
  /** 이벤트 단독 시사 방향 */
  eventVerdict: BriefVerdict;
  eventVerdictKo: string;
  briefingKo: string;
};

type CandleEv = { kind?: string; bias?: string; labelKo?: string };

function asPlan(raw: unknown): Eagle1MainPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as Eagle1MainPlan;
}

function biasToDir(bias: string | undefined): BriefVerdict | null {
  const b = String(bias || '').toLowerCase();
  if (b === 'bullish' || b === 'bull' || b === 'up') return 'LONG';
  if (b === 'bearish' || b === 'bear' || b === 'down') return 'SHORT';
  return null;
}

function eventImpliedVerdict(kind: string, bias: string | undefined): BriefVerdict {
  const k = kind.toUpperCase();
  const d = biasToDir(bias);
  if (d) return d;
  if (k === 'STACK_BUY' || k === 'ABSORB') return 'LONG';
  if (k === 'STACK_SELL') return 'SHORT';
  if (k === 'FAKE_BREAKOUT') return 'SHORT';
  if (k === 'FAKE_BREAKDOWN' || k === 'FAILED_BREAK') return 'LONG';
  return 'WAIT';
}

function verdictKo(v: BriefVerdict, confirmed = false): string {
  if (v === 'LONG') return confirmed ? '확정 롱' : '롱';
  if (v === 'SHORT') return confirmed ? '확정 숏' : '숏';
  return '대기';
}

function conclusionLabel(v: BriefVerdict): string {
  if (v === 'LONG') return '롱';
  if (v === 'SHORT') return '숏';
  return '대기';
}

function resultLabel(v: BriefVerdict, confirmed: boolean, conflict: boolean): string {
  if (v === 'WAIT') return conflict ? '대기 · 구조충돌' : '대기 · 합의부족';
  if (confirmed) return v === 'LONG' ? '확정 롱' : '확정 숏';
  return v === 'LONG' ? '롱' : '숏';
}

function masterVerdict(params: {
  canonical?: Eagle1CanonicalTradeDisplay | null;
  analysis?: AnalyzeResponse | null;
}): { verdict: BriefVerdict; confirmed: boolean; sourceKo: string } {
  const canon = params.canonical;
  if (canon?.direction === 'LONG' || canon?.direction === 'SHORT') {
    const confirmed =
      canon.superStats?.verdict === 'CONFIRMED_LONG' ||
      canon.superStats?.verdict === 'CONFIRMED_SHORT' ||
      canon.entryAllowed === true;
    return {
      verdict: canon.direction,
      confirmed,
      sourceKo: canon.sourceKo || AI_SUPER_BIANSHEN_STATS,
    };
  }
  const plan = asPlan(params.analysis?.eagle1MainPlan);
  if (plan?.status === 'CONFIRMED_LONG' || plan?.direction === 'LONG') {
    return { verdict: 'LONG', confirmed: plan.status === 'CONFIRMED_LONG', sourceKo: '메인플랜' };
  }
  if (plan?.status === 'CONFIRMED_SHORT' || plan?.direction === 'SHORT') {
    return { verdict: 'SHORT', confirmed: plan.status === 'CONFIRMED_SHORT', sourceKo: '메인플랜' };
  }
  if (params.analysis?.verdict === 'LONG' || params.analysis?.verdict === 'SHORT') {
    return { verdict: params.analysis.verdict, confirmed: false, sourceKo: 'AI캔들' };
  }
  return { verdict: 'WAIT', confirmed: false, sourceKo: '합류 대기' };
}

function liveFlowKo(analysis: AnalyzeResponse | null | undefined): string {
  const parts: string[] = [];
  const a = analysis;
  if (typeof a?.volumeDelta === 'number') {
    parts.push(
      a.volumeDelta > 0
        ? `체결 순매수 +${a.volumeDelta.toFixed(2)}`
        : a.volumeDelta < 0
          ? `매도압력·터짐 ${a.volumeDelta.toFixed(2)}`
          : '체결 중립'
    );
  }
  if (typeof a?.buyPressure === 'number') {
    const pct = Math.round(a.buyPressure * 100);
    parts.push(pct >= 55 ? `매수비중 ${pct}%↑` : pct <= 45 ? `매도비중 ${100 - pct}%↑` : `매수 ${pct}%`);
  }
  const wz = a?.volumeWhaleZoneConfluence;
  if (wz?.lastBarWhaleBuy) parts.push('고래 BUY 급증');
  if (wz?.lastBarWhaleSell) parts.push('고래 SELL·매도터짐');
  if (wz?.confluentLong) parts.push('고래+존 롱합류');
  if (wz?.confluentShort) parts.push('고래+존 숏합류');
  const vf = a?.volumeFlowSummary;
  if (vf && vf.spikeCount > 0) {
    parts.push(`WAD 고래 ${vf.whaleBuyCount}B/${vf.whaleSellCount}S`);
  }
  const oi = a?.oiState;
  if (oi === 'increasing') parts.push('OI↑');
  else if (oi === 'decreasing') parts.push('OI↓');
  return parts.length ? parts.join(' · ') : '라이브 수급 수집중';
}

function whaleDefenseKo(analysis: AnalyzeResponse | null | undefined, px: number | null): string {
  const wz = analysis?.volumeWhaleZoneConfluence;
  const parts: string[] = [];
  if (wz?.lastBarInBuyZone) {
    parts.push('세력매수·방어구간 터치 — 저점 방어 감시');
  }
  if (wz?.lastBarInSellZone) {
    parts.push('세력매도·방어구간 — 매도터짐·저항 방어');
  }
  if (wz?.zoneDataProvided === false && !parts.length) {
    parts.push('고래존 데이터 대기');
  }
  const zones = analysis?.strongZoneOverlays;
  if (Array.isArray(zones) && zones.length && px != null) {
    const near = zones.find((z) => {
      const p1 = Number(z.price1);
      const p2 = Number(z.price2);
      if (!(p1 > 0) || !(p2 > 0)) return false;
      const lo = Math.min(p1, p2);
      const hi = Math.max(p1, p2);
      return px >= lo * 0.998 && px <= hi * 1.002;
    });
    if (near?.label) {
      parts.push(`호가고래 ${String(near.label).slice(0, 20)}`);
    }
  }
  if (!parts.length) return '세력·고래 방어구간 — 실시간 갱신';
  return parts.join(' · ');
}

function structureFromEvents(marks: CandleEv[]): { ko: string; dirs: BriefVerdict[]; conflict: boolean } {
  const priority = ['SWEEP', 'CHOCH', 'BOS', 'FAKE_BREAK', 'MSS'];
  const picked: Array<{ kind: string; label: string; dir: BriefVerdict }> = [];
  for (const kind of priority) {
    const ev = [...marks].reverse().find((m) => String(m.kind || '').toUpperCase() === kind);
    if (!ev) continue;
    const k = String(ev.kind || '').toUpperCase();
    picked.push({
      kind: k,
      label: formatEagle1EventKo(ev as { kind: string; bias?: string }),
      dir: eventImpliedVerdict(k, ev.bias),
    });
    if (picked.length >= 2) break;
  }
  if (!picked.length) return { ko: '구조 이벤트 없음', dirs: [], conflict: false };
  const dirs = picked.map((p) => p.dir).filter((d) => d !== 'WAIT');
  const longN = dirs.filter((d) => d === 'LONG').length;
  const shortN = dirs.filter((d) => d === 'SHORT').length;
  const conflict = longN > 0 && shortN > 0;
  const detail = picked
    .map((p) => `${p.label}→${verdictKo(p.dir)}`)
    .join(' · ');
  if (conflict) {
    return {
      ko: `${detail} · 구조 충돌 → 확정 전 대기`,
      dirs: picked.map((p) => p.dir),
      conflict: true,
    };
  }
  return { ko: detail, dirs: picked.map((p) => p.dir), conflict: false };
}

/** 차트 좌측 LIVE 브리핑 — 롱/숏/대기 + 구조 + 수급 + 고래 */
export function buildEagle1LiveBriefing(params: {
  analysis?: AnalyzeResponse | null;
  hud?: Eagle1HudPack | null;
  canonical?: Eagle1CanonicalTradeDisplay | null;
  lastClose?: number | null;
}): Eagle1LiveBriefing {
  const marks = (params.hud?.candleEvidence?.marks ?? params.hud?.events ?? []) as CandleEv[];
  const master = masterVerdict({ canonical: params.canonical, analysis: params.analysis });
  const struct = structureFromEvents(marks);
  const flow = liveFlowKo(params.analysis);
  const whale = whaleDefenseKo(params.analysis, params.lastClose ?? null);

  let verdict = master.verdict;
  if (verdict === 'WAIT' && struct.dirs.length && !struct.conflict) {
    const longN = struct.dirs.filter((d) => d === 'LONG').length;
    const shortN = struct.dirs.filter((d) => d === 'SHORT').length;
    if (longN > shortN) verdict = 'LONG';
    else if (shortN > longN) verdict = 'SHORT';
  }
  if (struct.conflict && !master.confirmed && master.verdict === 'WAIT') {
    verdict = 'WAIT';
  }

  /** Hub·플랜 방향이 있으면 충돌 없을 때 숏/롱 결론 고정 */
  if (!struct.conflict && (master.verdict === 'LONG' || master.verdict === 'SHORT')) {
    verdict = master.verdict;
  }

  /** 점수 격차로 결론 보강 */
  if (verdict === 'WAIT' && !struct.conflict) {
    const lp = Number(params.canonical?.superStats?.longPct ?? params.analysis?.longScore);
    const sp = Number(params.canonical?.superStats?.shortPct ?? params.analysis?.shortScore);
    if (Number.isFinite(lp) && Number.isFinite(sp)) {
      const gap = lp - sp;
      if (gap >= 10) verdict = 'LONG';
      else if (gap <= -10) verdict = 'SHORT';
    }
  }

  const acc = params.analysis?.eagle1Acceptance as { bias?: string; state?: string } | null | undefined;
  if (!master.confirmed && struct.conflict) verdict = 'WAIT';

  const confirmed = master.confirmed && (verdict === 'LONG' || verdict === 'SHORT');
  const conclusion = verdict;
  const conclusionKo = conclusionLabel(conclusion);
  const resultKo = resultLabel(conclusion, confirmed, struct.conflict);
  const vKo = verdictKo(conclusion, confirmed);
  const headlineKo = struct.conflict
    ? `${resultKo} · SWEEP/CHoCH 충돌`
    : `${resultKo} · ${master.sourceKo}`;

  const plan = asPlan(params.analysis?.eagle1MainPlan);
  const eText =
    params.canonical?.entry != null
      ? formatPriceCompact(params.canonical.entry)
      : plan?.entryLow != null
        ? formatPriceCompact(plan.entryLow)
        : null;

  const lines: string[] = [
    `① AI결론: ${resultKo}${confirmed ? '' : ' · 진입 전 조건확인'}`,
    `② 구조: ${struct.ko}`,
    `③ LIVE: ${flow}`,
    `④ 고래방어: ${whale}`,
  ];
  if (eText) lines.push(`⑤ 타점 E ${eText} · 조건부`);

  return {
    verdict: conclusion,
    verdictKo: vKo,
    conclusion,
    conclusionKo,
    resultKo,
    confirmed,
    headlineKo,
    structureKo: struct.ko,
    liveFlowKo: flow,
    whaleDefenseKo: whale,
    conflict: struct.conflict,
    lines,
  };
}

export function enrichChartAlertFromEvent(
  ev: CandleEv,
  sym: string,
  briefing: Eagle1LiveBriefing
): Pick<Eagle1ChartAlertEnriched, 'eventVerdict' | 'eventVerdictKo' | 'briefingKo' | 'ko' | 'tone'> {
  const kind = String(ev.kind || '').toUpperCase();
  const eventVerdict = eventImpliedVerdict(kind, ev.bias);
  const label = formatEagle1EventKo(ev as { kind: string; bias?: string });
  const explain = eagle1EventExplainKo(kind).slice(0, 56);
  const align =
    briefing.conclusion === 'WAIT'
      ? '종합 대기'
      : briefing.conclusion === eventVerdict
        ? '결론 일치'
        : '이벤트≠결론';
  return {
    eventVerdict,
    eventVerdictKo: eventVerdict === 'LONG' ? '롱' : eventVerdict === 'SHORT' ? '숏' : '대기',
    ko: `${label} · ${explain}`,
    briefingKo: `${align} · AI결론 ${briefing.resultKo} · ${briefing.liveFlowKo.slice(0, 36)}`,
    tone: eventVerdict === 'LONG' ? 'bull' : eventVerdict === 'SHORT' ? 'bear' : 'warn',
  };
}
