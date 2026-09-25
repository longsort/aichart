/**
 * Eagle1 chart-ux — practical/analysis/research filtering + Korean labels.
 * Engines stay intact; this only decides what the default chart shows.
 */

import type { Eagle1MainPlan } from './signalEngine';
import type { FrozenPathPoint, FrozenTrade } from './tradeManage';

export type Eagle1ChartMode = 'practical' | 'analysis' | 'research';
export type Eagle1LabelLang = 'ko' | 'en' | 'both';

export const EAGLE1_TERM_KO: Record<string, string> = {
  BOS: '구조돌파',
  CHOCH: '추세전환',
  CHoCH: '추세전환',
  MSS: '추세전환',
  Sweep: '유동성털기',
  SWEEP: '유동성털기',
  BSL: '위쪽 유동성',
  SSL: '아래쪽 유동성',
  OB: '기관 주문구간',
  FVG: '가격빈틈',
  BPR: '균형가격구간',
  Breaker: '돌파전환구간',
  Demand: '매수수요',
  Supply: '매도공급',
  Retest: '재확인',
  Reclaim: '재탈환',
  'Fake Breakout': '가짜돌파',
  'Fake Breakdown': '가짜이탈',
  Pullback: '눌림',
  Entry: '진입',
  ENTRY: '진입',
  SL: '손절',
  STOP: '손절',
  TP: '목표',
  TP1: '첫 목표',
  TP2: '두 번째 목표',
  TP3: '세 번째 목표',
  Invalidation: '무효가격',
  POC: '최다거래가격',
  ACCEPT: '안착',
  BREAK: '돌파',
  CLOSE: '마감확인',
  FAKE: '가짜돌파',
  SQUEEZE: '청산몰림',
  CASCADE: '청산연쇄',
  BUILDUP: '스퀴즈축적',
  'A+ LONG': 'A+ 롱합의',
  'A+ SHORT': 'A+ 숏합의',
  'A LONG': 'A 롱구간',
  'A SHORT': 'A 숏구간',
  'LONG LIQ ZONE': '롱청산구간',
  'SHORT LIQ ZONE': '숏청산구간',
  TRIGGER: '스퀴즈트리거',
};

export function eagle1DecisionKo(status: Eagle1MainPlan['status']): string {
  switch (status) {
    case 'CONFIRMED_LONG':
      return '확정롱';
    case 'CONFIRMED_SHORT':
      return '확정숏';
    case 'LONG_WATCH':
      return '롱감시';
    case 'SHORT_WATCH':
      return '숏감시';
    case 'LONG_MISSED':
      return '롱놓침';
    case 'SHORT_MISSED':
      return '숏놓침';
    default:
      return '대기';
  }
}

export function formatPriceCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1000) return Math.round(n).toLocaleString('en-US');
  return n.toFixed(2);
}

export function formatEagle1MainPlanCompact(plan: Eagle1MainPlan): string {
  const d = eagle1DecisionKo(plan.status);
  if (plan.status === 'WAIT') {
    const gate = plan.noTradeGates[0] ? ` | ${plan.noTradeGates[0]}` : '';
    return `${d}${gate}`;
  }
  const entry =
    plan.entryLow != null && plan.entryHigh != null
      ? `${formatPriceCompact(plan.entryLow)}-${formatPriceCompact(plan.entryHigh)}`
      : '—';
  const tps = [plan.tp1, plan.tp2, plan.tp3].map(formatPriceCompact).join(' / ');
  const rr = plan.netRr != null ? `1:${plan.netRr.toFixed(1)}` : '통계 부족';
  const prob = plan.calibratedProbability != null ? `${Math.round(plan.calibratedProbability * 100)}%` : '통계 부족';
  return `${d} | 진입 ${entry} | 손절 ${formatPriceCompact(plan.sl)} | 목표 ${tps} | RR ${rr} | 검증확률 ${prob} | ${plan.invalidation}`;
}

export type Eagle1ChartUx = {
  mode: Eagle1ChartMode;
  decisionKo: string;
  compactLine: string;
  why: {
    reasons: string[];
    opposing: string[];
    sampleSize: number;
    calibratedLabel: string;
    tpBeforeSlRate: number | null;
    slFirstRate: number | null;
    medianMfe: number | null;
    medianMae: number | null;
    netExpectancy: number | null;
    sizeNote: string;
    sizeUnits: number | null;
    aiScore: number | null;
    tp1Reason?: string;
    tp2Reason?: string;
    tp3Reason?: string;
  };
  priceLines: Array<{
    price: number;
    title: string;
    color: string;
    lineWidth: 1 | 2 | 3 | 4;
    lineStyle: 'solid' | 'dashed' | 'dotted';
    axisLabel: boolean;
  }>;
  path: FrozenTrade | null;
};

export function buildEagle1ChartUx(
  plan: Eagle1MainPlan,
  mode: Eagle1ChartMode = 'practical',
  trade?: FrozenTrade | null,
  extras?: {
    poc?: number | null;
    vah?: number | null;
    val?: number | null;
    clusterUpper?: number | null;
    clusterLower?: number | null;
    clusterBias?: 'bullish' | 'bearish' | null;
    clusterLabel?: string | null;
    eqh?: number | null;
    eql?: number | null;
    ssl?: number | null;
    bsl?: number | null;
  }
): Eagle1ChartUx {
  const priceLines: Eagle1ChartUx['priceLines'] = [];
  if (extras?.poc != null && Number.isFinite(extras.poc)) {
    priceLines.push({
      price: extras.poc,
      title: 'POC',
      color: '#22d3ee',
      lineWidth: 2,
      lineStyle: 'solid',
      axisLabel: true,
    });
  }
  if (mode !== 'practical' && extras?.vah != null && Number.isFinite(extras.vah)) {
    priceLines.push({
      price: extras.vah,
      title: '거래량상단',
      color: '#f87171',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  if (mode !== 'practical' && extras?.val != null && Number.isFinite(extras.val)) {
    priceLines.push({
      price: extras.val,
      title: '거래량하단',
      color: '#34d399',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  if (
    extras?.clusterUpper != null &&
    extras?.clusterLower != null &&
    Number.isFinite(extras.clusterUpper) &&
    Number.isFinite(extras.clusterLower)
  ) {
    const bear = extras.clusterBias === 'bearish';
    const base = extras.clusterLabel?.split('·')[0]?.trim() || (bear ? '핵심 매도구간' : '핵심 매수구간');
    priceLines.push({
      price: extras.clusterUpper,
      title: `${base} 상단`,
      color: bear ? '#f87171' : '#34d399',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
    priceLines.push({
      price: extras.clusterLower,
      title: `${base} 하단`,
      color: bear ? '#f87171' : '#34d399',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  /** 대기(레벨 없음)는 선 없음. 감시·확정·놓침은 숫자 레벨이 있으면 전체 가로 가격선. */
  const showExec =
    (plan.entryLow != null && plan.entryHigh != null) ||
    plan.sl != null ||
    plan.tp1 != null ||
    plan.tp2 != null ||
    plan.tp3 != null;
  if (extras?.eqh != null && Number.isFinite(extras.eqh)) {
    priceLines.push({
      price: extras.eqh,
      title: 'EQH',
      color: '#f87171',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  if (extras?.eql != null && Number.isFinite(extras.eql)) {
    priceLines.push({
      price: extras.eql,
      title: 'EQL',
      color: '#e2e8f0',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  if (extras?.ssl != null && Number.isFinite(extras.ssl) && (extras.eql == null || Math.abs(extras.ssl - extras.eql) > 1e-8)) {
    priceLines.push({
      price: extras.ssl,
      title: 'SSL',
      color: '#38bdf8',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  if (extras?.bsl != null && Number.isFinite(extras.bsl) && (extras.eqh == null || Math.abs(extras.bsl - extras.eqh) > 1e-8)) {
    priceLines.push({
      price: extras.bsl,
      title: 'BSL',
      color: '#fb7185',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  if (showExec && plan.entryLow != null && plan.entryHigh != null) {
    const mid = (plan.entryLow + plan.entryHigh) / 2;
    priceLines.push({
      price: mid,
      title: `ENTRY ${formatPriceCompact(mid)}`,
      color: plan.direction === 'SHORT' ? '#ef4444' : '#22c55e',
      lineWidth: 2,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  if (showExec && plan.sl != null) {
    priceLines.push({
      price: plan.sl,
      title: `STOP ${formatPriceCompact(plan.sl)}`,
      color: '#f97316',
      lineWidth: 2,
      lineStyle: 'solid',
      axisLabel: true,
    });
  }
  const tps = [
    { p: plan.tp1, t: 'TP1' },
    { p: plan.tp2, t: 'TP2' },
    { p: plan.tp3, t: 'TP3' },
  ];
  if (showExec) {
    for (const row of tps) {
      if (row.p == null) continue;
      priceLines.push({
        price: row.p,
        title: `${row.t} ${formatPriceCompact(row.p)}`,
        color: '#4ade80',
        lineWidth: 1,
        lineStyle: 'dotted',
        axisLabel: true,
      });
    }
  }
  return {
    mode,
    decisionKo: eagle1DecisionKo(plan.status),
    compactLine: formatEagle1MainPlanCompact(plan),
    why: {
      reasons: plan.reasons,
      opposing: plan.opposing,
      sampleSize: plan.sampleSize,
      calibratedLabel: plan.calibratedLabel,
      tpBeforeSlRate: plan.stats?.tpBeforeSlRate ?? null,
      slFirstRate: plan.stats?.slFirstRate ?? null,
      medianMfe: plan.stats?.medianMfe ?? null,
    medianMae: plan.stats?.medianMae ?? null,
    netExpectancy: plan.stats?.netExpectancy ?? null,
    sizeNote: plan.sizeNote,
    sizeUnits: plan.sizeUnits,
    aiScore: plan.aiScore ?? null,
  },
    priceLines,
    path: trade ?? plan.trade ?? null,
  };
}

/**
 * A+ / SQUEEZE 가격선 — MA처럼 전폭 가로선. zone 좌표는 그대로(이동 금지).
 */
export function appendSmartZoneSqueezePriceLines(
  ux: Eagle1ChartUx,
  opts: {
    mtfSmartZone?: import('./mtfSmartZoneEngine').MtfSmartZoneReport | null;
    squeezeRadar?: import('./squeezeRadarEngine').SqueezeRadarReport | null;
    liqZones?: import('./liqZoneEngine').LiqZoneReport | null;
    legendaryTag?: import('./legendaryStrategyFusion').LegendaryChartTag | null;
    tradeOpportunity?: import('./tradeOpportunityEngine').TradeOpportunityReport | null;
    executionLevels?: import('./executionLevels').ExecutionLevelsReport | null;
    lastClose?: number | null;
  }
): Eagle1ChartUx {
  const lines = [...ux.priceLines];
  const mode = ux.mode;
  const pushZone = (z: import('./mtfSmartZoneEngine').MtfSmartZone | null | undefined) => {
    if (!z) return;
    if (mode === 'practical' && z.grade !== 'A_PLUS') return;
    if (mode === 'analysis' && z.grade === 'WATCH') return;
    const long = z.side === 'LONG';
    const color = long ? '#4ade80' : '#f87171';
    lines.push({
      price: z.upper,
      title: `${z.labelEn} 상단`,
      color,
      lineWidth: z.grade === 'A_PLUS' ? 2 : 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
    lines.push({
      price: z.lower,
      title: `${z.labelEn} 하단`,
      color,
      lineWidth: z.grade === 'A_PLUS' ? 2 : 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
    if (z.grade === 'A_PLUS' || mode === 'research') {
      lines.push({
        price: z.mid,
        title: z.grade === 'A_PLUS' ? (long ? 'LONG BUILDUP' : 'SHORT BUILDUP') : z.labelEn,
        color,
        lineWidth: 2,
        lineStyle: 'solid',
        axisLabel: true,
      });
    }
  };
  const smart = opts.mtfSmartZone;
  if (smart?.primary) pushZone(smart.primary);
  else {
    pushZone(smart?.long);
    pushZone(smart?.short);
  }

  const pushLiq = (b: import('./liqZoneEngine').LiqZoneBand | null | undefined) => {
    if (!b) return;
    if (mode === 'practical' && !b.active) return;
    const color = b.side === 'LONG' ? '#a3e635' : '#fb7185';
    lines.push({
      price: b.upper,
      title: `${b.labelEn} 상단`,
      color,
      lineWidth: b.active ? 2 : 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
    lines.push({
      price: b.lower,
      title: `${b.labelEn} 하단`,
      color,
      lineWidth: b.active ? 2 : 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
    if (b.active || mode === 'research') {
      lines.push({
        price: b.mid,
        title: b.side === 'LONG' ? 'LONG LIQUIDATION ZONE' : 'SHORT LIQUIDATION ZONE',
        color,
        lineWidth: 2,
        lineStyle: 'solid',
        axisLabel: true,
      });
    }
  };
  const liq = opts.liqZones;
  if (liq?.primary?.active) pushLiq(liq.primary);
  else {
    pushLiq(liq?.longLiq);
    pushLiq(liq?.shortLiq);
  }

  const sq = opts.squeezeRadar;
  const tag = sq?.chartTag;
  const close = opts.lastClose;
  if (
    tag &&
    tag !== '×' &&
    close != null &&
    Number.isFinite(close) &&
    (mode !== 'practical' || tag === 'SQUEEZE' || tag === 'CASCADE')
  ) {
    const side = sq?.activeSide;
    lines.push({
      price: close,
      title: tag === 'BUILDUP' ? 'BUILDUP' : tag,
      color: side === 'SHORT' ? '#fb7185' : side === 'LONG' ? '#34d399' : '#fbbf24',
      lineWidth: tag === 'CASCADE' ? 3 : 2,
      lineStyle: tag === 'BUILDUP' ? 'dashed' : 'solid',
      axisLabel: true,
    });
  }
  if (tag === '×' && close != null && Number.isFinite(close) && mode !== 'practical') {
    lines.push({
      price: close,
      title: '×',
      color: '#94a3b8',
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: true,
    });
  }

  /** Legendary 차트 태그 — 전략 이름 나열 금지, 태그만 */
  const leg = opts.legendaryTag;
  if (
    leg &&
    close != null &&
    Number.isFinite(close) &&
    (mode !== 'practical' || leg.startsWith('A+') || leg === 'BREAKOUT')
  ) {
    const already = lines.some((l) => l.title === leg || l.title.startsWith('A+ '));
    if (!already) {
      lines.push({
        price: close,
        title: leg,
        color: leg.includes('SHORT') ? '#f87171' : leg.includes('LONG') ? '#4ade80' : '#38bdf8',
        lineWidth: leg.startsWith('A+') ? 2 : 1,
        lineStyle: leg.startsWith('A+') ? 'solid' : 'dashed',
        axisLabel: true,
      });
    }
  }

  const opp = opts.tradeOpportunity;
  if (opp?.grade === 'NO_ENTRY' && close != null && Number.isFinite(close) && mode !== 'practical') {
    lines.push({
      price: close,
      title: 'NO ENTRY',
      color: '#94a3b8',
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: true,
    });
  }

  /** MAIN ENTRY / STOP / TP — 이미 ENTRY·STOP·TP가 있으면 중복 스킵 */
  const exec = opts.executionLevels;
  const hasEntry = lines.some((l) => /^ENTRY\b/i.test(l.title) || l.title === 'MAIN ENTRY');
  if (exec?.entry.zone && !hasEntry) {
    const z = exec.entry.zone;
    lines.push({
      price: z.mid,
      title: `ENTRY ${formatPriceCompact(z.mid)}`,
      color: exec.entry.allowEntry ? '#22c55e' : '#94a3b8',
      lineWidth: 2,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  if (exec?.stop.executableSl != null && !lines.some((l) => /^STOP\b/i.test(l.title))) {
    lines.push({
      price: exec.stop.executableSl,
      title: `STOP ${formatPriceCompact(exec.stop.executableSl)}`,
      color: '#f97316',
      lineWidth: 2,
      lineStyle: 'solid',
      axisLabel: true,
    });
  }
  for (const lv of exec?.target.levels ?? []) {
    if (lv.price == null || lines.some((l) => l.title === lv.id || l.title.startsWith(`${lv.id} `))) continue;
    lines.push({
      price: lv.price,
      title: `${lv.id} ${formatPriceCompact(lv.price)}`,
      color: '#4ade80',
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: true,
    });
  }

  return { ...ux, priceLines: lines };
}

const PRACTICAL_ID_RE =
  /^(eagle1-(poc|cluster-main|cluster-sup|cluster-res|path-|entry|sl|tp|eqh|eql)|ls-plan-|smc-composite-(entry|sl|tp)|merged-ares-line-|merged-desk-trade-rail-|key-invalidation|key-mustHold|vrvp-poc|pulse-pro-vrvp|merged-desk-vrvp|merged-poc)/i;

const ANALYSIS_ID_RE =
  /(ob|fvg|bpr|breaker|bos|choch|liquidity|liq|sweep|fake|hotzone|core-sr|demand|supply|institutional|cptc|parkf|cloud|btccion|choch-ob|swing-mid|vah|val|hvn|lvn)/i;

const ZONE_FACE_KINDS = new Set([
  'zone',
  'box',
  'supplyZone',
  'demandZone',
  'fvg',
  'ob',
  'reactionZone',
  'bprZone',
  'channelBand',
]);

/** 차트에 쌓이면 안 되는 약/중/강/초강력 면 라벨 */
const GRADE_STACK_RE =
  /초강력|수급적반등|★\s*(약|중|강)|약반등|중반등|강반등|약하락|중하락|강하락|약저항|중저항|강저항/;

export function isEagle1OverlayId(id: string | undefined | null): boolean {
  return String(id || '').startsWith('eagle1-');
}

/** HUD 차트는 목업 작도만. 통합데스크 추세부채·Parkf·diag 는 엔진 유지하되 여기서 그리지 않는다. */
export function overlayAllowedOnEagle1HudChart(id: string | undefined | null): boolean {
  return isEagle1OverlayId(id);
}

export function isEagle1ZoneFaceKind(kind?: string | null): boolean {
  return ZONE_FACE_KINDS.has(String(kind || ''));
}

/**
 * 실전: 핵심 존 면은 보이게. 약/중/강/초강력 스택·잡박스만 숨김.
 * 파랑/빨강 띠는 엔진 유지 + 현재가 근처 압력 띠만 표시.
 * 분석: Hot존·돈구간·구조. 연구: 전부.
 */
function isPracticalKeptZoneFace(id: string, blob: string): boolean {
  if (/eagle1-(cluster|poc)/i.test(id) || /eagle1-zone/.test(blob)) return true;
  if (blob.includes('merged-desk-strongest-analysis-zone') || /★\s*최강/.test(blob)) return true;
  if (id.startsWith('merged-desk-hotzone-') || blob.includes('merged-desk-hotzone')) return true;
  if (id.startsWith('merged-desk-hq-') || blob.includes('merged-hq-entry')) return true;
  if (id.startsWith('merged-ares-key-') || id.startsWith('merged-ares-critical-')) return true;
  if (id.startsWith('merged-desk-core-sr-')) return true;
  if (id.startsWith('merged-desk-support-rebound-')) return true;
  if (/\$\$\$\$|money-zone-keep/.test(blob)) return true;
  if (id.startsWith('merged-ares-mlsp-tv-') && /support|resist|fvg|confluence|zone/i.test(`${id} ${blob}`)) return true;
  if (/rb-rail-bounce|rb-pullback|rb-core-settle|rb-core-fail|rb-core-break/.test(`${id} ${blob}`)) return true;
  return false;
}

export function deskOverlayKeptForEagle1Mode(params: {
  id: string;
  kind?: string;
  category?: string;
  extraClass?: string;
  label?: string;
  mode: Eagle1ChartMode;
}): boolean {
  const mode = params.mode || 'practical';
  if (mode === 'research') return true;
  const id = String(params.id || '');
  const kind = String(params.kind || '');
  const blob = `${id} ${kind} ${params.category || ''} ${params.extraClass || ''} ${params.label || ''}`;
  if (GRADE_STACK_RE.test(blob)) return false;
  if (isEagle1OverlayId(id)) return overlayPassesEagle1ChartMode(params);

  const isFace = isEagle1ZoneFaceKind(kind);
  const isRbPressureBand =
    kind === 'channelBand' &&
    /merged-desk-rb-|merged-desk-blue-red-channel|eagle1-money-pressure/.test(blob) &&
    !/rail-bounce/.test(blob);
  const isRbPressureEdge = /^merged-desk-rb-(short|long|fb)-(upper|lower|mid)$/.test(id);
  const isExecLine =
    PRACTICAL_ID_RE.test(id) || /손절|진입|목표|최다거래|무효가격|\b무효\b/.test(blob);
  if (isExecLine && !isFace) return true;
  if (isRbPressureBand || isRbPressureEdge) return true;
  if (mode === 'practical') {
    if (isFace) return isPracticalKeptZoneFace(id, blob);
    return true;
  }
  if (isFace) {
    if (isPracticalKeptZoneFace(id, blob)) return true;
    return overlayPassesEagle1ChartMode({ ...params, mode: 'analysis' });
  }
  return true;
}

export function capDeskZoneFacesForAnalysis<T extends { id?: string; kind?: string; confidence?: number; label?: string }>(
  items: T[]
): T[] {
  const faces: T[] = [];
  const rest: T[] = [];
  for (const o of items) {
    if (isEagle1ZoneFaceKind(o.kind)) faces.push(o);
    else rest.push(o);
  }
  const demand = faces.filter((o) => {
    const s = `${o.id || ''} ${o.kind || ''} ${o.label || ''}`;
    return o.kind === 'demandZone' || /long|support|매수|반등|demand|hotzone-below|hotzone-long/i.test(s);
  });
  const supply = faces.filter((o) => {
    const s = `${o.id || ''} ${o.kind || ''} ${o.label || ''}`;
    return o.kind === 'supplyZone' || /short|resist|매도|하락|supply|hotzone-above|hotzone-short/i.test(s);
  });
  const used = new Set([...demand, ...supply]);
  const other = faces.filter((o) => !used.has(o));
  const take = (arr: T[], n: number) =>
    [...arr].sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0)).slice(0, n);
  return [...rest, ...take(demand, 3), ...take(supply, 3), ...take(other, 2)];
}

export function attachFunctionalOverlayLabel<
  T extends {
    id?: string;
    kind?: string;
    label?: string;
    zoneFaceBase?: string;
    labelTooltip?: string;
  }
>(o: T): T {
  const kind = String(o.kind || '');
  const fallback =
    kind === 'demandZone'
      ? '핵심 매수구간'
      : kind === 'supplyZone'
        ? '핵심 매도구간'
        : kind === 'fvg'
          ? '가격빈틈'
          : kind === 'ob'
            ? '핵심 구간'
            : kind === 'keyLevel'
              ? '가격선'
              : kind === 'bprZone'
                ? '균형가격구간'
                : String(o.label || '').trim() || '구간';
  const label = String(o.label || '').trim() || fallback;
  const base = String(o.zoneFaceBase || '').trim() || label.split('·')[0]!.trim() || fallback;
  const prior = String(o.labelTooltip || '').trim();
  const tip = prior || `${base} · 클릭: 구간 설명 · 확률 단정 아님`;
  return { ...o, label, zoneFaceBase: o.zoneFaceBase || base, labelTooltip: tip };
}

export function applyEagle1DeskOverlayMode<
  T extends {
    id?: string;
    kind?: string;
    category?: string;
    overlayZoneExtraClass?: string;
    label?: string;
    confidence?: number;
    zoneFaceBase?: string;
    labelTooltip?: string;
  }
>(list: T[], mode: Eagle1ChartMode): T[] {
  if (mode === 'research') return list.map((o) => attachFunctionalOverlayLabel(o));
  const kept = list
    .filter((o) =>
      deskOverlayKeptForEagle1Mode({
        id: String(o.id || ''),
        kind: String(o.kind || ''),
        category: String(o.category || ''),
        extraClass: String(o.overlayZoneExtraClass || ''),
        label: String(o.label || ''),
        mode,
      })
    )
    .map((o) => attachFunctionalOverlayLabel(o));
  return capDeskZoneFacesForAnalysis(kept);
}

export function mergedDeskZoneFaceAllowed(
  item: {
    id?: string;
    kind?: string;
    overlayZoneExtraClass?: string;
    label?: string;
    zoneFaceBase?: string;
    zoneFaceSignal?: string;
  },
  mode: Eagle1ChartMode,
  requestedVisible: boolean
): boolean {
  if (mode === 'research') return requestedVisible || isEagle1OverlayId(item.id);
  if (requestedVisible && isEagle1OverlayId(item.id)) return true;
  return deskOverlayKeptForEagle1Mode({
    id: String(item.id || ''),
    kind: String(item.kind || ''),
    extraClass: String(item.overlayZoneExtraClass || ''),
    label: `${item.label || ''}${item.zoneFaceBase || ''}${item.zoneFaceSignal || ''}`,
    mode,
  });
}

export function overlayPassesEagle1ChartMode(params: {
  id: string;
  kind?: string;
  category?: string;
  extraClass?: string;
  label?: string;
  mode: Eagle1ChartMode;
}): boolean {
  const mode = params.mode || 'practical';
  if (mode === 'research') return true;
  const blob = `${params.id} ${params.kind || ''} ${params.category || ''} ${params.extraClass || ''} ${params.label || ''}`.toLowerCase();
  if (mode !== 'research' && /(^|[-_])broken(\b|[-_])|obsolete|폐기/.test(blob)) return false;
  if (PRACTICAL_ID_RE.test(params.id) || /poc|invalid|손절|진입|목표|최다거래/.test(blob)) {
    return true;
  }
  if (mode === 'practical') {
    if (params.kind === 'entry' || params.kind === 'stop' || params.kind === 'target') return true;
    return false;
  }
  if (mode === 'analysis') {
    if (ANALYSIS_ID_RE.test(params.id) || ANALYSIS_ID_RE.test(blob)) return true;
    if (params.kind === 'ob' || params.kind === 'fvg' || params.kind === 'bprZone' || params.kind === 'bos' || params.kind === 'choch') {
      return true;
    }
    if (params.kind === 'keyLevel' && /liq|유동성|vah|val|hvn|lvn/.test(blob)) return true;
    if (params.kind === 'zone' || params.kind === 'demandZone' || params.kind === 'supplyZone') return true;
    return PRACTICAL_ID_RE.test(params.id);
  }
  return true;
}

export type Eagle1DeskPriceLine = {
  price: number;
  title: string;
  color: string;
  lineWidth: 1 | 2 | 3 | 4;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  axisLabel?: boolean;
};

/** Practical: Eagle1 E/SL/TP + POC only. Analysis/research keep pack lines. */
export function mergeEagle1DeskPriceLines(
  pack: Eagle1DeskPriceLine[],
  eagle1: Eagle1DeskPriceLine[],
  mode: Eagle1ChartMode,
  status: Eagle1MainPlan['status']
): Eagle1DeskPriceLine[] {
  void mode;
  void status;
  if (!eagle1.length) return pack;
  return [...eagle1, ...pack];
}

export function applyEagle1TermKo(label: string, lang: Eagle1LabelLang = 'ko'): string {
  if (lang === 'en') return label;
  let out = label;
  for (const [en, ko] of Object.entries(EAGLE1_TERM_KO)) {
    const re = new RegExp(`\\b${en}\\b`, 'g');
    if (lang === 'both') {
      out = out.replace(re, `${ko}(${en})`);
    } else {
      out = out.replace(re, ko);
    }
  }
  return out;
}

export function eagle1PathSegments(
  trade: FrozenTrade | null | undefined,
  smartPath?: {
    main?: { points?: FrozenPathPoint[]; state?: string };
    alt?: { points?: FrozenPathPoint[] };
    break?: { points?: FrozenPathPoint[] };
    invalid?: { points?: FrozenPathPoint[] };
  } | null
): Array<{
  id: string;
  time1: number;
  price1: number;
  time2: number;
  price2: number;
  label: string;
  color: string;
  dashed: boolean;
  arrowHead: boolean;
}> {
  const mainPts = trade?.path?.length ? trade.path : smartPath?.main?.points ?? [];
  const altPts = smartPath?.alt?.points ?? [];
  const breakPts = smartPath?.break?.points?.length
    ? smartPath.break.points
    : trade?.altPath?.length
      ? trade.altPath
      : smartPath?.invalid?.points ?? [];
  const pathState = trade?.pathState ?? smartPath?.main?.state ?? '대기';
  if (!mainPts.length && !altPts.length && !breakPts.length) return [];
  const segs: Array<{
    id: string;
    time1: number;
    price1: number;
    time2: number;
    price2: number;
    label: string;
    color: string;
    dashed: boolean;
    arrowHead: boolean;
  }> = [];
  const mainColor = pathState === '무효' ? 'rgba(148,163,184,0.7)' : 'rgba(34,197,94,0.92)';
  const push = (
    pts: FrozenPathPoint[],
    idPref: string,
    label: string,
    color: string
  ) => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      segs.push({
        id: `${idPref}-${i}`,
        time1: a.time,
        price1: a.price,
        time2: b.time,
        price2: b.price,
        label: i === 1 ? label : '',
        color,
        dashed: true,
        arrowHead: i === pts.length - 1,
      });
    }
  };
  push(mainPts, 'eagle1-path-main', 'MAIN PATH', mainColor);
  push(altPts, 'eagle1-path-alt', 'ALT PATH', 'rgba(250,204,21,0.92)');
  push(breakPts, 'eagle1-path-break', 'BREAK PATH', 'rgba(249,115,22,0.92)');
  return segs;
}

/** SVG local coords — last path segment arrow head. */
export function eagle1PathArrowPolygon(x1: number, y1: number, x2: number, y2: number, size = 9): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const bx = x2 - ux * size;
  const by = y2 - uy * size;
  const w = size * 0.42;
  return `${x2},${y2} ${bx + px * w},${by + py * w} ${bx - px * w},${by - py * w}`;
}

export type Eagle1LabelBox = {
  id: string;
  y: number;
  h: number;
  priority: number;
};

const PROTECT_LABEL_RE =
  /^(eagle1-(entry|sl|tp)|merged-ares-line-(entry|sl|stop|tp)|ls-plan-(entry|sl|tp)|smc-composite-(entry|sl|tp))/i;

/**
 * Chart-ux priority: 1 decision … 9 auxiliary.
 * Lower number wins. Protected E/SL/TP captions are never hidden.
 */
export function eagle1LabelPriority(id: string): number {
  const s = String(id || '').toLowerCase();
  if (/(decision|확정롱|확정숏|대기|mainplan|eagle1-status)/.test(s)) return 1;
  if (/(entry|진입|eagle1-e\b)/.test(s) && !/(late|watch|retest)/.test(s)) return 2;
  if (/(^|-)sl(\b|-)|손절|invalid|무효|musthold/.test(s)) return 3;
  if (/(^|-)tp\d?(\b|-)|목표가|target/.test(s)) return 4;
  if (/(poc|최다거래|vrvp)/.test(s)) return 5;
  if (/(ob|fvg|demand|supply|핵심.?매수|핵심.?매도|hotzone)/.test(s)) return 6;
  if (/(bos|choch|구조돌파|추세전환)/.test(s)) return 7;
  if (/(sweep|유동성털기|liq)/.test(s)) return 8;
  return 9;
}

export function isEagle1ProtectedPriceLabel(id: string): boolean {
  return PROTECT_LABEL_RE.test(String(id || ''));
}

/** Hide lower-priority overlapping captions. Do not move them in price. */
export function hideCollidingLabels(boxes: Eagle1LabelBox[], minGap = 14): Set<string> {
  const hidden = new Set<string>();
  const sorted = [...boxes].sort((a, b) => a.priority - b.priority || a.y - b.y);
  const kept: Eagle1LabelBox[] = [];
  for (const b of sorted) {
    if (isEagle1ProtectedPriceLabel(b.id)) {
      kept.push(b);
      continue;
    }
    const gap = Math.max(minGap, b.h);
    const hit = kept.some((k) => Math.abs(k.y - b.y) < Math.max(k.h, gap) * 0.85);
    if (hit) hidden.add(b.id);
    else kept.push(b);
  }
  return hidden;
}

/** Mobile practical crowded-label audit. Do not move labels in price. */
export function renderEagle1MobileLabelAuditSvg(params: {
  width?: number;
  height?: number;
  boxes: Eagle1LabelBox[];
}): { svg: string; hidden: string[]; visible: string[]; entrySlTpVisible: boolean } {
  const width = params.width ?? 390;
  const height = params.height ?? 844;
  const hidden = hideCollidingLabels(params.boxes, 14);
  const visible = params.boxes.filter((b) => !hidden.has(b.id)).map((b) => b.id);
  const entrySlTpVisible = ['eagle1-entry', 'eagle1-sl', 'eagle1-tp1'].every((id) => !hidden.has(id));
  const lines = params.boxes
    .filter((b) => !hidden.has(b.id))
    .map((b) => {
      const y = Math.max(18, Math.min(height - 18, b.y));
      return `<text x="${width - 8}" y="${y}" text-anchor="end" font-size="11" fill="#e2e8f0">${b.id}</text>`;
    });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#0b1220"/>
  ${lines.join('\n  ')}
</svg>`;
  return { svg, hidden: [...hidden], visible, entrySlTpVisible };
}
