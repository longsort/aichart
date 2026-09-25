import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import { extractChartPrimeBandEdges } from '@/lib/extractChartPrimeBandPrices';

function asNum(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
}

function zoneOverlay(args: {
  id: string;
  label: string;
  from: number;
  to: number;
  t1: number;
  t2: number;
  fill: string;
  line: string;
  core?: boolean;
  zoneSpanOnly?: boolean;
}): OverlayItem {
  const hi = Math.max(args.from, args.to);
  const lo = Math.min(args.from, args.to);
  return {
    id: args.id,
    kind: 'zone',
    label: args.label,
    confidence: 82,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: args.t1,
    time2: args.t2,
    price1: hi,
    price2: lo,
    color: args.fill,
    lineLabelColor: args.line,
    category: 'labels',
    zonePulse: args.core === true,
    zoneSpanOnly: args.zoneSpanOnly === true,
  };
}

function levelOverlay(args: {
  id: string;
  label: string;
  price: number;
  t1: number;
  t2: number;
  color: string;
  noProject?: boolean;
}): OverlayItem {
  return {
    id: args.id,
    kind: 'keyLevel',
    label: args.label,
    confidence: 80,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: args.t1,
    time2: args.t2,
    price1: args.price,
    price2: args.price,
    color: args.color,
    lineLabelColor: args.color,
    category: 'keyLevel',
    noProject: args.noProject === true,
  };
}

function gradeLabel(score: number): '강' | '중' | '약' {
  if (score >= 75) return '강';
  if (score >= 55) return '중';
  return '약';
}

function fmt(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return '-';
  if (Math.abs(p) >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (Math.abs(p) >= 1) return p.toLocaleString('en-US', { maximumFractionDigits: 3 });
  return p.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

function stateChip(status: string, side: 'L' | 'S'): string {
  const p = side === 'L' ? '롱' : '숏';
  if (status.includes('진입구간 도달')) return `${p}진입`;
  if (status.includes('미도달')) return `${p}대기`;
  return `${p}재평가`;
}

function marketFlowSummary(analysis: AnalyzeResponse | null | undefined): {
  bias: 'LONG' | 'SHORT' | 'NEUTRAL';
  score: number;
  text: string;
} {
  const buyP = Number(analysis?.buyPressure ?? NaN);
  const sellP = Number(analysis?.sellPressure ?? NaN);
  const volDelta = Number(analysis?.volumeDelta ?? 0);
  const um = analysis?.unifiedMarketMetrics;
  const buyUsd = Number(um?.buyVolumeUsd ?? 0);
  const sellUsd = Number(um?.sellVolumeUsd ?? 0);
  const cvd = Number(um?.aggregatedCvdUsd ?? 0);
  const flow = analysis?.volumeFlowSummary;
  const whales = analysis?.volumeWhaleZoneConfluence;
  const pressureEdge =
    Number.isFinite(buyP) && Number.isFinite(sellP) ? (buyP - sellP) * 100 : 0;
  const usdEdge = buyUsd + sellUsd > 0 ? ((buyUsd - sellUsd) / (buyUsd + sellUsd)) * 100 : 0;
  const whaleEdge = (flow?.whaleBuyCount ?? 0) - (flow?.whaleSellCount ?? 0);
  const confluenceEdge =
    whales?.confluentLong && !whales?.confluentShort
      ? 8
      : whales?.confluentShort && !whales?.confluentLong
        ? -8
        : 0;
  const raw =
    pressureEdge * 0.32 +
    usdEdge * 0.42 +
    (volDelta >= 0 ? 6 : -6) +
    (cvd >= 0 ? 6 : -6) +
    whaleEdge * 2 +
    confluenceEdge;
  const score = Math.max(0, Math.min(100, Math.round(50 + raw)));
  const bias: 'LONG' | 'SHORT' | 'NEUTRAL' =
    score >= 56 ? 'LONG' : score <= 44 ? 'SHORT' : 'NEUTRAL';
  const text = `체결흐름: ${bias === 'LONG' ? '매수우위' : bias === 'SHORT' ? '매도우위' : '중립'} (${score}) · CVD ${cvd >= 0 ? '+' : ''}${Math.round(cvd)} · ΔV ${volDelta >= 0 ? '+' : ''}${Math.round(volDelta)}`;
  return { bias, score, text };
}

function newsRiskSummary(analysis: AnalyzeResponse | null | undefined): {
  level: 'LOW' | 'MID' | 'HIGH';
  text: string;
} {
  const now = Date.now();
  const sym = String(analysis?.symbol ?? '').toUpperCase();
  const calendarRisk = (() => {
    if (typeof window === 'undefined') return null as null | { level: 'LOW' | 'MID' | 'HIGH'; text: string };
    try {
      const raw = window.localStorage.getItem('ailongshort-news-events-v1');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Array<{
        title?: string;
        timeMs?: number;
        symbols?: string[];
      }>;
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      const events = parsed
        .map((e) => ({
          title: String(e?.title ?? '뉴스 이벤트'),
          timeMs: Number(e?.timeMs ?? NaN),
          symbols: Array.isArray(e?.symbols) ? e.symbols.map((s) => String(s).toUpperCase()) : [],
        }))
        .filter((e) => Number.isFinite(e.timeMs));
      if (!events.length) return null;
      const scoped = events.filter((e) => e.symbols.length === 0 || e.symbols.some((s) => sym.startsWith(s)));
      if (!scoped.length) return null;
      scoped.sort((a, b) => Math.abs(a.timeMs - now) - Math.abs(b.timeMs - now));
      const near = scoped[0]!;
      const dtMin = Math.round((near.timeMs - now) / 60000);
      const absMin = Math.abs(dtMin);
      const when = dtMin >= 0 ? `${dtMin}분 후` : `${absMin}분 전`;
      if (absMin <= 90) {
        return { level: 'HIGH' as const, text: `뉴스 리스크: 높음(${near.title} ${when})` };
      }
      if (absMin <= 360) {
        return { level: 'MID' as const, text: `뉴스 리스크: 중간(${near.title} ${when})` };
      }
      return { level: 'LOW' as const, text: `뉴스 리스크: 낮음(다음 이벤트 ${near.title} ${when})` };
    } catch {
      return null;
    }
  })();
  if (calendarRisk) return calendarRisk;

  const flags = Array.isArray(analysis?.riskFlags) ? analysis!.riskFlags : [];
  const joined = flags.join(' ').toLowerCase();
  const hasNewsWord = /news|fomc|cpi|ppi|powell|rate|금리|고용|물가|뉴스/.test(joined);
  const hasHighVolWord = /high[_\s-]?vol|spike|event|변동성 급증/.test(joined);
  if (hasNewsWord || hasHighVolWord) {
    return { level: 'HIGH', text: '뉴스 리스크: 높음(이벤트/변동성 플래그 감지)' };
  }
  if (flags.length > 0) {
    return { level: 'MID', text: `뉴스 리스크: 중간(리스크 플래그 ${flags.length}개)` };
  }
  return { level: 'LOW', text: '뉴스 리스크: 낮음(특이 플래그 없음)' };
}

function cptcFlowSummary(
  analysis: AnalyzeResponse | null | undefined,
  candles: Candle[]
): {
  bias: 'LONG' | 'SHORT' | 'NEUTRAL';
  score: number;
  text: string;
  confluenceText: string;
  centerPrice: number | null;
} {
  const cptc = extractChartPrimeBandEdges(analysis?.overlays);
  const lastPx = asNum(analysis?.currentPrice) ?? candles[candles.length - 1]?.close ?? null;
  const flow = marketFlowSummary(analysis);
  const centerLine = (analysis?.overlays ?? []).find(
    (o) => o.category === 'chartPrimeTrendChannels' && o.kind === 'trendLine' && /cptc-(down|up)-center$/.test(String(o.id || ''))
  );
  const c1 = asNum(centerLine?.price1);
  const c2 = asNum(centerLine?.price2);
  const centerSlopeUp = c1 != null && c2 != null ? c2 >= c1 : null;
  if (!cptc || lastPx == null) {
    return {
      bias: 'NEUTRAL',
      score: 50,
      text: 'CPTC+체결: 데이터 부족',
      confluenceText: 'CPTC+체결 합성: 대기',
      centerPrice: null,
    };
  }
  let cptcBias: 'LONG' | 'SHORT' = 'LONG';
  if (lastPx >= cptc.top) cptcBias = 'LONG';
  else if (lastPx <= cptc.bottom) cptcBias = 'SHORT';
  else if (lastPx >= cptc.center) cptcBias = 'LONG';
  else cptcBias = 'SHORT';
  const slopeBias: 'LONG' | 'SHORT' | 'NEUTRAL' =
    centerSlopeUp == null ? 'NEUTRAL' : centerSlopeUp ? 'LONG' : 'SHORT';
  const flowBias = flow.bias;
  let score = 50;
  score += cptcBias === 'LONG' ? 8 : -8;
  if (slopeBias !== 'NEUTRAL') score += slopeBias === 'LONG' ? 6 : -6;
  if (flowBias !== 'NEUTRAL') score += flowBias === 'LONG' ? 8 : -8;
  score = Math.max(0, Math.min(100, score));
  const bias: 'LONG' | 'SHORT' | 'NEUTRAL' = score >= 56 ? 'LONG' : score <= 44 ? 'SHORT' : 'NEUTRAL';
  const text = `CPTC+체결: ${bias === 'LONG' ? '롱 우위' : bias === 'SHORT' ? '숏 우위' : '중립'} (${Math.round(score)}) · 상:${fmt(cptc.top)} 중:${fmt(cptc.center)} 하:${fmt(cptc.bottom)}`;
  const confluenceText =
    bias === 'NEUTRAL'
      ? 'CPTC+체결 합성: 관망'
      : `CPTC+체결 합성: ${bias === 'LONG' ? '롱 강화' : '숏 강화'} (${flowBias === bias ? '체결 합치' : '체결 엇갈림'})`;
  return { bias, score: Math.round(score), text, confluenceText, centerPrice: cptc.center };
}

type FusionCore = {
  direction: 'LONG' | 'SHORT' | 'MIXED' | 'NONE';
  score: number;
  strength: '강' | '중' | '약';
  status: string;
  structureState: string;
  zone: [number, number] | null;
  entries: number[];
  trigger: number | null;
  invalid: number | null;
  support: number | null;
  resistance: number | null;
  breakout: number | null;
  note: string;
  mtfAgreementScore: number;
  mtfAgreementText: string;
  strictReady: boolean;
  strictReason: string;
};

export type FusionStructureHudData = {
  direction: 'LONG' | 'SHORT' | 'MIXED' | 'NONE';
  score: number;
  strength: '강' | '중' | '약';
  status: string;
  structureState: string;
  zoneText: string;
  entriesText: string[];
  triggerText: string;
  invalidText: string;
  rrText: string;
  note: string;
  checklist: string[];
  actionText: string;
  riskText: string;
  probabilityText: string;
  mtfAgreementText: string;
  modeText: string;
  scenarioTracks: string[];
  marketFlowText: string;
  newsRiskText: string;
  cptcText: string;
  cptcConfluenceText: string;
};

function buildFusionCore(
  analysis: AnalyzeResponse | null | undefined,
  candles: Candle[]
): FusionCore | null {
  if (!analysis || candles.length < 24) return null;
  const recent = candles.slice(-Math.min(160, candles.length));
  if (recent.length < 24) return null;
  const swingHigh = recent.reduce((p, c) => (c.high > p.high ? c : p), recent[0]);
  const swingLow = recent.reduce((p, c) => (c.low < p.low ? c : p), recent[0]);
  const support = asNum(analysis.supportLevel?.price);
  const resistance = asNum(analysis.resistanceLevel?.price);
  const breakout = asNum(analysis.breakoutLevel?.price);
  const invalid = asNum(analysis.invalidationLevel?.price);
  const currentPrice = asNum(analysis.currentPrice) ?? recent[recent.length - 1].close;
  const baseScore = Math.max(0, Math.min(100, Math.round(Number(analysis.zoneSignal?.score ?? analysis.confidence ?? 50))));
  const structureState = analysis.structureState?.state ?? 'unknown';
  const zone = analysis.zoneSignal?.zone;
  const longBias = zone === 'long_confirm' || structureState === 'trend_up' || analysis.verdict === 'LONG';
  const shortBias = zone === 'short_confirm' || structureState === 'trend_down' || analysis.verdict === 'SHORT';
  if (!longBias && !shortBias) {
    const strength = gradeLabel(baseScore);
    return {
      direction: 'NONE',
      score: baseScore,
      strength,
      status: '구조 대기',
      structureState,
      zone: null,
      entries: [],
      trigger: null,
      invalid,
      support,
      resistance,
      breakout,
      note: '구조 확정 전',
      mtfAgreementScore: 50,
      mtfAgreementText: '상위TF 합의: 데이터 부족',
      strictReady: false,
      strictReason: '대기',
    };
  }

  const direction: FusionCore['direction'] = longBias && shortBias ? 'MIXED' : longBias ? 'LONG' : 'SHORT';
  const recentRange = Math.max(1e-9, swingHigh.high - swingLow.low);
  const invalidDistNorm = invalid != null ? Math.abs(currentPrice - invalid) / recentRange : null;
  const breakoutAlignBonus =
    direction === 'LONG'
      ? breakout != null && currentPrice >= breakout
        ? 8
        : 0
      : direction === 'SHORT'
        ? breakout != null && currentPrice <= breakout
          ? 8
          : 0
        : 0;
  const invalidPenalty =
    invalidDistNorm == null
      ? 6
      : invalidDistNorm < 0.12
        ? 12
        : invalidDistNorm < 0.2
          ? 8
          : invalidDistNorm > 0.9
            ? 4
            : 0;
  const stateBonus =
    structureState === 'trend_up' || structureState === 'trend_down'
      ? 8
      : structureState === 'reversal'
        ? -10
        : 0;
  const weeklyState = String((analysis as { weeklyState?: string | null } | null)?.weeklyState ?? '');
  const monthlyState = String((analysis as { monthlyState?: string | null } | null)?.monthlyState ?? '');
  const upAligned = weeklyState === 'accepted_above' || monthlyState === 'accepted_above';
  const dnAligned = weeklyState === 'accepted_below' || monthlyState === 'accepted_below';
  const mtfBias = upAligned && !dnAligned ? 'LONG' : dnAligned && !upAligned ? 'SHORT' : 'MIXED';
  const mtfAgreementScore = mtfBias === 'MIXED' ? 50 : mtfBias === direction ? 78 : 32;
  const mtfAgreementText =
    mtfBias === 'MIXED'
      ? '상위TF 합의: 혼조(중립)'
      : mtfBias === 'LONG'
        ? `상위TF 합의: 상승 우위 (${mtfAgreementScore})`
        : `상위TF 합의: 하락 우위 (${mtfAgreementScore})`;
  const mtfBonus = mtfBias === 'MIXED' ? 0 : mtfBias === direction ? 8 : -10;
  const score = Math.max(0, Math.min(100, Math.round(baseScore + breakoutAlignBonus + stateBonus + mtfBonus - invalidPenalty)));
  const strength = gradeLabel(score);
  const strictReadyBase =
    (mtfAgreementScore >= 60 || mtfBias === 'MIXED') &&
    (invalidDistNorm == null || (invalidDistNorm >= 0.14 && invalidDistNorm <= 0.95)) &&
    score >= 60;
  const strictReason = strictReadyBase ? '조건충족' : '조건미충족';
  if (direction === 'LONG' || direction === 'MIXED') {
    const low = support ?? swingLow.low;
    const high = breakout ?? resistance ?? swingHigh.high;
    if (high > low) {
      const r = high - low;
      const zHi = high - r * 0.382;
      const zLo = high - r * 0.618;
      const trigger = high - r * 0.5;
      const status = currentPrice > zHi
        ? '미도달(대기)'
        : currentPrice >= zLo
          ? strictReadyBase
            ? '진입구간 도달'
            : '대기(조건미충족)'
          : '과눌림(재평가)';
      return {
        direction: direction === 'MIXED' ? 'MIXED' : 'LONG',
        score,
        strength,
        status,
        structureState,
        zone: [zLo, zHi],
        entries: [zHi, trigger, zLo],
        trigger,
        invalid,
        support,
        resistance,
        breakout,
        note: `고점-저점 스윙 0.382~0.618 눌림 · 무효거리 ${invalidDistNorm == null ? '-' : invalidDistNorm.toFixed(2)}R`,
        mtfAgreementScore,
        mtfAgreementText,
        strictReady: strictReadyBase && currentPrice >= zLo && currentPrice <= zHi,
        strictReason,
      };
    }
  }

  const high = resistance ?? swingHigh.high;
  const low = breakout ?? support ?? swingLow.low;
  if (high > low) {
    const r = high - low;
    const zLo = low + r * 0.382;
    const zHi = low + r * 0.618;
    const trigger = low + r * 0.5;
    const status = currentPrice < zLo
      ? '미도달(대기)'
      : currentPrice <= zHi
        ? strictReadyBase
          ? '진입구간 도달'
          : '대기(조건미충족)'
        : '과반등(재평가)';
    return {
      direction: direction === 'MIXED' ? 'MIXED' : 'SHORT',
      score,
      strength,
      status,
      structureState,
      zone: [zLo, zHi],
      entries: [zLo, trigger, zHi],
      trigger,
      invalid,
      support,
      resistance,
      breakout,
      note: `저점-고점 스윙 0.382~0.618 반등 · 무효거리 ${invalidDistNorm == null ? '-' : invalidDistNorm.toFixed(2)}R`,
      mtfAgreementScore,
      mtfAgreementText,
      strictReady: strictReadyBase && currentPrice >= zLo && currentPrice <= zHi,
      strictReason,
    };
  }
  return null;
}

export function buildFusionStructureHudData(
  analysis: AnalyzeResponse | null | undefined,
  candles: Candle[]
): FusionStructureHudData | null {
  const core = buildFusionCore(analysis, candles);
  if (!core) return null;
  const target = (() => {
    const arr = (analysis?.targets ?? [])
      .map((t) => asNum(t))
      .filter((x): x is number => x != null);
    if (!arr.length) return null;
    return core.direction === 'SHORT' ? Math.min(...arr) : Math.max(...arr);
  })();
  const e2 = core.entries[1] ?? null;
  const invalid = core.invalid;
  let rrText = '-';
  let rrValue: number | null = null;
  if (e2 != null && invalid != null && target != null && target !== e2 && invalid !== e2) {
    const reward = Math.abs(target - e2);
    const risk = Math.abs(e2 - invalid);
    if (risk > 0) {
      rrValue = reward / risk;
      rrText = `RR ${rrValue.toFixed(2)}`;
    }
  }
  const upBias = core.direction === 'LONG' ? 1 : core.direction === 'SHORT' ? -1 : 0;
  const rrBoost = rrValue == null ? -4 : rrValue >= 2 ? 9 : rrValue >= 1.3 ? 4 : -6;
  const scoreAdj = Math.max(0, Math.min(100, core.score + rrBoost));
  const mtfShift = (core.mtfAgreementScore - 50) * 0.22;
  const cptcFlow = cptcFlowSummary(analysis, candles);
  const cptcBias = cptcFlow.bias;
  const cptcText = cptcFlow.text;
  const cptcShift =
    cptcBias === 'NEUTRAL'
      ? 0
      : core.direction === cptcBias
        ? 6
        : -9;
  const flow = marketFlowSummary(analysis);
  const flowShift =
    (flow.score - 50) * 0.18 * (flow.bias === 'LONG' ? 1 : flow.bias === 'SHORT' ? -1 : 0);
  const up = Math.max(
    8,
    Math.min(84, Math.round(50 + upBias * 16 + (scoreAdj - 50) * 0.38 + mtfShift + flowShift + cptcShift))
  );
  const down = Math.max(8, Math.min(84, Math.round(100 - up - 16)));
  const neutral = Math.max(4, 100 - up - down);
  const probabilityText = `확률범위: 상승 ${up}% · 하락 ${down}% · 중립 ${neutral}%`;
  const news = newsRiskSummary(analysis);
  const checklist: string[] = [
    `구조: ${core.structureState}`,
    `강도: ${core.strength} ${core.score} (보정 ${scoreAdj})`,
    `상태: ${core.status}`,
    core.mtfAgreementText,
    `진입엄격: ${core.strictReason}`,
    cptcText,
    cptcFlow.confluenceText,
    flow.text,
    news.text,
  ];
  if (core.trigger != null) checklist.push(`트리거: ${fmt(core.trigger)}`);
  if (core.invalid != null) checklist.push(`무효: ${fmt(core.invalid)}`);
  const rrWeak = rrValue == null || rrValue < 1.2;
  const mtfConflict = core.mtfAgreementScore <= 36;
  const overstretch = core.status.includes('과눌림') || core.status.includes('과반등');
  const invalidTight =
    invalid != null && e2 != null && Math.abs(e2 - invalid) / Math.max(1e-9, Math.abs(e2)) < 0.002;
  const flowConflict =
    (core.direction === 'LONG' && flow.bias === 'SHORT') ||
    (core.direction === 'SHORT' && flow.bias === 'LONG');
  const cptcConflict =
    cptcBias !== 'NEUTRAL' &&
    ((core.direction === 'LONG' && cptcBias === 'SHORT') ||
      (core.direction === 'SHORT' && cptcBias === 'LONG'));
  const downgradeScore =
    (rrWeak ? 1 : 0) +
    (mtfConflict ? 1 : 0) +
    (overstretch ? 1 : 0) +
    (invalidTight ? 1 : 0) +
    (flowConflict ? 1 : 0) +
    (cptcConflict ? 1 : 0) +
    (news.level === 'HIGH' ? 1 : 0);
  const modeText =
    downgradeScore >= 3
      ? '운용모드: 관망(자동 강등)'
      : downgradeScore >= 2
        ? '운용모드: 보수(자동 강등)'
        : '운용모드: 표준';
  checklist.push(modeText);
  const actionText =
    core.status.includes('미도달')
      ? '액션: 아직 구간 미도달, 무리진입 금지(패스)'
      : core.status.includes('진입구간 도달')
        ? downgradeScore >= 3
          ? '액션: 관망 유지, 트리거 재확인 전 진입 금지'
          : rrValue != null && rrValue < 1.2
          ? '액션: 분할1만 탐색, RR 개선 전 비중확대 금지'
          : '액션: 분할1→2→3 순서로 대응, 트리거 확인 후 비중 확대'
        : '액션: 과확장/과눌림 구간, 재구조 확인 전 대기';
  const riskText =
    rrText === '-'
      ? '리스크: RR 계산 제한(목표/무효 데이터 부족)'
      : rrValue != null && rrValue < 1.2
        ? `리스크: ${rrText} 낮음, 보수 대응`
        : invalid != null && e2 != null && Math.abs(e2 - invalid) / Math.max(1e-9, Math.abs(e2)) < 0.002
          ? `리스크: 무효선 근접(노이즈 취약), 추격 금지`
        : `리스크: ${rrText} 확보, 계획 진입 가능`;
  const longTrack =
    core.direction === 'SHORT'
      ? `롱 시나리오: 확률 ${Math.max(8, up - 12)}% · 조건 약함(역추세)`
      : `롱 시나리오: 확률 ${up}% · 트리거 ${fmt(core.trigger)} / 목표 상단 확장`;
  const shortTrack =
    core.direction === 'LONG'
      ? `숏 시나리오: 확률 ${Math.max(8, down - 12)}% · 조건 약함(역추세)`
      : `숏 시나리오: 확률 ${down}% · 트리거 ${fmt(core.trigger)} / 목표 하단 확장`;
  const invalidTrack = `무효 시나리오: 확률 ${neutral}% · 무효 ${fmt(core.invalid)} 이탈/돌파 시 재평가`;
  return {
    direction: core.direction,
    score: core.score,
    strength: core.strength,
    status: core.status,
    structureState: core.structureState,
    zoneText: core.zone ? `${fmt(core.zone[0])} ~ ${fmt(core.zone[1])}` : '-',
    entriesText: core.entries.slice(0, 3).map((p, i) => `분할${i + 1} ${fmt(p)}`),
    triggerText: fmt(core.trigger),
    invalidText: fmt(core.invalid),
    rrText,
    note: core.note,
    checklist,
    actionText,
    riskText,
    probabilityText,
    mtfAgreementText: core.mtfAgreementText,
    modeText,
    scenarioTracks: [longTrack, shortTrack, invalidTrack],
    marketFlowText: flow.text,
    newsRiskText: news.text,
    cptcText,
    cptcConfluenceText: cptcFlow.confluenceText,
  };
}

export function buildFusionStructureZones(
  analysis: AnalyzeResponse | null | undefined,
  candles: Candle[]
): OverlayItem[] {
  if (!analysis || candles.length < 24) return [];
  const recent = candles.slice(-Math.min(160, candles.length));
  if (recent.length < 24) return [];
  const t1 = Number(recent[0].time);
  const t2 = Number(recent[recent.length - 1].time);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return [];
  const swingHigh = recent.reduce((p, c) => (c.high > p.high ? c : p), recent[0]);
  const swingLow = recent.reduce((p, c) => (c.low < p.low ? c : p), recent[0]);
  const swingStart = Math.min(Number(swingHigh.time), Number(swingLow.time));
  const anchorStart = Number.isFinite(swingStart) ? Math.max(t1, swingStart) : t1;
  const support = asNum(analysis.supportLevel?.price);
  const resistance = asNum(analysis.resistanceLevel?.price);
  const breakout = asNum(analysis.breakoutLevel?.price);
  const invalid = asNum(analysis.invalidationLevel?.price);
  const state = analysis.structureState?.state;
  const zone = analysis.zoneSignal?.zone;
  const longBias = zone === 'long_confirm' || state === 'trend_up' || analysis.verdict === 'LONG';
  const shortBias = zone === 'short_confirm' || state === 'trend_down' || analysis.verdict === 'SHORT';
  if (!longBias && !shortBias) return [];

  const out: OverlayItem[] = [];
  const core = buildFusionCore(analysis, candles);
  const coreDir = core?.direction ?? 'NONE';
  const showLong =
    coreDir === 'LONG' ||
    (coreDir === 'MIXED' && (state === 'trend_up' || analysis.verdict === 'LONG'));
  const showShort =
    coreDir === 'SHORT' ||
    (coreDir === 'MIXED' && (state === 'trend_down' || analysis.verdict === 'SHORT'));
  const zoneScore = core?.score ?? Math.max(0, Math.min(100, Math.round(Number(analysis.zoneSignal?.score ?? analysis.confidence ?? 50))));
  const strength = core?.strength ?? gradeLabel(zoneScore);
  const currentPrice = asNum(analysis.currentPrice) ?? recent[recent.length - 1].close;
  const cptcFlow = cptcFlowSummary(analysis, candles);
  const cptcChipPrice = cptcFlow.centerPrice ?? currentPrice;

  out.push(
    levelOverlay({
      id: 'fusion-structure-cptc-flow-chip',
      label: cptcFlow.confluenceText,
      price: cptcChipPrice,
      t1: anchorStart,
      t2,
      color: cptcFlow.bias === 'LONG' ? '#34d399' : cptcFlow.bias === 'SHORT' ? '#fb7185' : '#93c5fd',
      noProject: true,
    })
  );

  if (longBias && showLong) {
    const low = support ?? swingLow.low;
    const high = breakout ?? resistance ?? swingHigh.high;
    if (high > low) {
      const r = high - low;
      const pullbackHi = high - r * 0.382;
      const pullbackLo = high - r * 0.618;
      const trigger = high - r * 0.5;
      const entry1 = pullbackHi;
      const entry2 = trigger;
      const entry3 = pullbackLo;
      const mustHold = pullbackLo;
      const mustBreak = high;
      const tpSafe = high + r * 0.272;
      const tpStretch = high + r * 0.618;
      const status =
        currentPrice > pullbackHi
          ? '미도달(대기)'
          : currentPrice >= pullbackLo
            ? '진입구간 도달'
            : '과눌림(재평가)';
      const isReady = status.includes('진입구간 도달');
      const longZoneLabel =
        status.includes('미도달')
          ? `[롱대기] 눌림 ${strength}${zoneScore}`
          : status.includes('과눌림')
            ? `[롱재평가] 눌림 ${strength}${zoneScore}`
            : `[롱진입] 눌림 ${strength}${zoneScore}`;
      out.push(
        zoneOverlay({
          id: 'fusion-structure-long-pullback-zone',
          label: `${longZoneLabel} · ${core?.mtfAgreementScore ?? 50}`,
          from: pullbackLo,
          to: pullbackHi,
          t1,
          t2,
          fill: isReady ? 'rgba(34,197,94,0.16)' : 'rgba(34,197,94,0.10)',
          line: '#22c55e',
          core: isReady,
          zoneSpanOnly: true,
        }),
        levelOverlay({
          id: 'fusion-structure-long-trigger',
          label: `[롱확인] ${fmt(trigger)}`,
          price: trigger,
          t1: anchorStart,
          t2,
          color: '#86efac',
          noProject: true,
        }),
        levelOverlay({
          id: 'fusion-structure-long-entry1',
          label: `[롱1차] ${fmt(entry1)}`,
          price: entry1,
          t1: anchorStart,
          t2,
          color: '#4ade80',
          noProject: true,
        }),
        levelOverlay({
          id: 'fusion-structure-long-entry2',
          label: `[롱2차] ${fmt(entry2)}`,
          price: entry2,
          t1: anchorStart,
          t2,
          color: '#22c55e',
          noProject: true,
        }),
        levelOverlay({
          id: 'fusion-structure-long-entry3',
          label: `[롱3차] ${fmt(entry3)}`,
          price: entry3,
          t1: anchorStart,
          t2,
          color: '#16a34a',
          noProject: true,
        }),
        levelOverlay({
          id: 'fusion-structure-long-must-hold',
          label: `[롱방어] ${fmt(mustHold)}`,
          price: mustHold,
          t1: anchorStart,
          t2,
          color: '#22c55e',
          noProject: true,
        }),
        levelOverlay({
          id: 'fusion-structure-long-must-break',
          label: `[롱돌파확인] ${fmt(mustBreak)}`,
          price: mustBreak,
          t1: anchorStart,
          t2,
          color: '#86efac',
          noProject: true,
        }),
        zoneOverlay({
          id: 'fusion-structure-long-tp-safe-zone',
          label: `[롱목표1] ${fmt(tpSafe)}`,
          from: tpSafe - r * 0.06,
          to: tpSafe + r * 0.06,
          t1,
          t2,
          fill: 'rgba(56,189,248,0.14)',
          line: '#38bdf8',
          zoneSpanOnly: true,
        }),
        zoneOverlay({
          id: 'fusion-structure-long-tp-stretch-zone',
          label: `[롱목표2] ${fmt(tpStretch)}`,
          from: tpStretch - r * 0.075,
          to: tpStretch + r * 0.075,
          t1,
          t2,
          fill: 'rgba(147,51,234,0.12)',
          line: '#a78bfa',
          zoneSpanOnly: true,
        }),
        levelOverlay({
          id: 'fusion-structure-long-status-chip',
          label: `[${stateChip(status, 'L')}]`,
          price: high - r * 0.2,
          t1: anchorStart,
          t2,
          color: '#bbf7d0',
          noProject: true,
        })
      );
      if (invalid != null) {
        const w = Math.max(r * 0.035, Math.abs(invalid) * 0.0006);
        out.push(
          zoneOverlay({
            id: 'fusion-structure-long-invalid-zone',
            label: '구조 이탈 무효구간',
            from: invalid - w,
            to: invalid + w,
            t1,
            t2,
            fill: 'rgba(239,68,68,0.16)',
            line: '#f87171',
            zoneSpanOnly: true,
          })
        );
      }
    }
  }

  if (shortBias && showShort) {
    const high = resistance ?? swingHigh.high;
    const low = breakout ?? support ?? swingLow.low;
    if (high > low) {
      const r = high - low;
      const reboundLo = low + r * 0.382;
      const reboundHi = low + r * 0.618;
      const trigger = low + r * 0.5;
      const entry1 = reboundLo;
      const entry2 = trigger;
      const entry3 = reboundHi;
      const mustHold = reboundHi;
      const mustBreak = low;
      const tpSafe = low - r * 0.272;
      const tpStretch = low - r * 0.618;
      const status =
        currentPrice < reboundLo
          ? '미도달(대기)'
          : currentPrice <= reboundHi
            ? '진입구간 도달'
            : '과반등(재평가)';
      const isReady = status.includes('진입구간 도달');
      const shortZoneLabel =
        status.includes('미도달')
          ? `[숏대기] 반등 ${strength}${zoneScore}`
          : status.includes('과반등')
            ? `[숏재평가] 반등 ${strength}${zoneScore}`
            : `[숏진입] 반등 ${strength}${zoneScore}`;
      out.push(
        zoneOverlay({
          id: 'fusion-structure-short-rebound-zone',
          label: `${shortZoneLabel} · ${core?.mtfAgreementScore ?? 50}`,
          from: reboundLo,
          to: reboundHi,
          t1,
          t2,
          fill: isReady ? 'rgba(239,68,68,0.16)' : 'rgba(239,68,68,0.10)',
          line: '#ef4444',
          core: isReady,
          zoneSpanOnly: true,
        }),
        levelOverlay({
          id: 'fusion-structure-short-trigger',
          label: `[숏확인] ${fmt(trigger)}`,
          price: trigger,
          t1: anchorStart,
          t2,
          color: '#fca5a5',
          noProject: true,
        }),
        levelOverlay({
          id: 'fusion-structure-short-entry1',
          label: `[숏1차] ${fmt(entry1)}`,
          price: entry1,
          t1: anchorStart,
          t2,
          color: '#fca5a5',
          noProject: true,
        }),
        levelOverlay({
          id: 'fusion-structure-short-entry2',
          label: `[숏2차] ${fmt(entry2)}`,
          price: entry2,
          t1: anchorStart,
          t2,
          color: '#ef4444',
          noProject: true,
        }),
        levelOverlay({
          id: 'fusion-structure-short-entry3',
          label: `[숏3차] ${fmt(entry3)}`,
          price: entry3,
          t1: anchorStart,
          t2,
          color: '#dc2626',
          noProject: true,
        }),
        levelOverlay({
          id: 'fusion-structure-short-must-hold',
          label: `[숏방어] ${fmt(mustHold)}`,
          price: mustHold,
          t1: anchorStart,
          t2,
          color: '#ef4444',
          noProject: true,
        }),
        levelOverlay({
          id: 'fusion-structure-short-must-break',
          label: `[숏이탈확인] ${fmt(mustBreak)}`,
          price: mustBreak,
          t1: anchorStart,
          t2,
          color: '#fca5a5',
          noProject: true,
        }),
        zoneOverlay({
          id: 'fusion-structure-short-tp-safe-zone',
          label: `[숏목표1] ${fmt(tpSafe)}`,
          from: tpSafe - r * 0.06,
          to: tpSafe + r * 0.06,
          t1,
          t2,
          fill: 'rgba(56,189,248,0.14)',
          line: '#38bdf8',
          zoneSpanOnly: true,
        }),
        zoneOverlay({
          id: 'fusion-structure-short-tp-stretch-zone',
          label: `[숏목표2] ${fmt(tpStretch)}`,
          from: tpStretch - r * 0.075,
          to: tpStretch + r * 0.075,
          t1,
          t2,
          fill: 'rgba(147,51,234,0.12)',
          line: '#a78bfa',
          zoneSpanOnly: true,
        }),
        levelOverlay({
          id: 'fusion-structure-short-status-chip',
          label: `[${stateChip(status, 'S')}]`,
          price: low + r * 0.2,
          t1: anchorStart,
          t2,
          color: '#fecaca',
          noProject: true,
        })
      );
      if (invalid != null) {
        const w = Math.max(r * 0.035, Math.abs(invalid) * 0.0006);
        out.push(
          zoneOverlay({
            id: 'fusion-structure-short-invalid-zone',
            label: '구조 이탈 무효구간',
            from: invalid - w,
            to: invalid + w,
            t1,
            t2,
            fill: 'rgba(96,165,250,0.15)',
            line: '#93c5fd',
            zoneSpanOnly: true,
          })
        );
      }
    }
  }

  if (state === 'reversal') {
    const hi = swingHigh.high;
    const lo = swingLow.low;
    if (hi > lo) {
      const mid = (hi + lo) / 2;
      const w = Math.max((hi - lo) * 0.12, Math.abs(mid) * 0.0008);
      out.push(
        zoneOverlay({
          id: 'fusion-structure-reversal-watch-zone',
          label: '구조 전환 감시구간',
          from: mid - w,
          to: mid + w,
          t1,
          t2,
          fill: 'rgba(245,158,11,0.16)',
          line: '#f59e0b',
          zoneSpanOnly: true,
        })
      );
    }
  }

  return out;
}

