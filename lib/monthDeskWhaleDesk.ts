import type { AnalyzeResponse, Candle } from '@/types';
import { evalWadBar } from '@/lib/volumeHistogramIntelligence';
import {
  candleOverlapsAnyBuyZone,
  candleOverlapsAnySellZone,
  type WhaleZoneBand,
} from '@/lib/volumeZoneOverlap';

export type MonthDeskWhalePhase =
  | 'buy_incoming'
  | 'buy_done'
  | 'sell_incoming'
  | 'sell_done'
  | 'defend_long'
  | 'defend_short'
  | 'sell_zone'
  | 'neutral';

export type WhaleTimelineKind =
  | 'idle'
  | 'buy'
  | 'sell'
  | 'buy_zone'
  | 'sell_zone'
  | 'conf_long'
  | 'conf_short';

export type WhaleTimelineBar = {
  kind: WhaleTimelineKind;
  /** true = 가장 최근 봉 */
  isLast: boolean;
};

export type WhaleFlowStage = 'incoming' | 'arrived' | 'defend' | 'distribute' | 'idle';

export type WhalePriceZoneStatus = 'inside_buy' | 'inside_sell' | 'outside' | 'between';

export type MonthDeskWhaleZone = {
  id: string;
  side: 'buy' | 'sell';
  low: number;
  high: number;
  label: string;
};

export type MonthDeskWhaleSnapshot = {
  phase: MonthDeskWhalePhase;
  headlineKo: string;
  detailKo: string;
  buyPressure: number;
  sellPressure: number;
  whaleBuyRecent: number;
  whaleSellRecent: number;
  lastBarBuy: boolean;
  lastBarSell: boolean;
  inBuyZone: boolean;
  inSellZone: boolean;
  confluentLong: boolean;
  confluentShort: boolean;
  defendPrice: number | null;
  defendLabel: string | null;
  attackPrice: number | null;
  attackLabel: string | null;
  mvpWhaleScore: number | null;
  cvdBias: string | null;
  frontRunKo: string | null;
  zones: MonthDeskWhaleZone[];
  flowLabel: string | null;
  /** 최근 N봉 WAD·존 타임라인 (오래된→최신) */
  timeline: WhaleTimelineBar[];
  /** 들어온다→들어왔다→지킴→분산 파이프라인 단계 */
  flowStage: WhaleFlowStage;
  flowStageKo: string;
  flowStageIndex: number;
  /** 0–100 고래 활동 강도 */
  activityScore: number;
  /** 현재가 vs 고래존 */
  priceZoneStatus: WhalePriceZoneStatus;
  zoneBannerKo: string;
  /** 현재가가 겹치는 존 (표시용) */
  activeZone: MonthDeskWhaleZone | null;
  closePrice: number | null;
  recentConfluentLong: number;
  recentConfluentShort: number;
};

const TIMELINE_BARS = 14;

const PHASE_COPY: Record<MonthDeskWhalePhase, { headline: string; detail: string }> = {
  buy_incoming: {
    headline: '고래 매수 유입 중',
    detail: 'WAD 급증 + 매수(지지) 존 겹침 — 세력 매수 체결 프록시',
  },
  sell_incoming: {
    headline: '고래 매도 유입 중',
    detail: 'WAD 급증 + 매도(저항) 존 겹침',
  },
  buy_done: {
    headline: '고래 매수 들어옴',
    detail: '최근 봉 WAD 매수 급증 — 존 겹침은 약함',
  },
  sell_done: {
    headline: '고래 매도 나옴',
    detail: '최근 봉 WAD 매도 급증',
  },
  defend_long: {
    headline: '고래 지지·방어 구간',
    detail: '매수존/지지 근처 — 세력이 지키는 자리 후보',
  },
  defend_short: {
    headline: '고래 저항·방어(숏)',
    detail: '매도존/저항 근처 — 되밀기·분산 구간 후보',
  },
  sell_zone: {
    headline: '고래 매도·분산 자리',
    detail: '매도존 안 — 공급/매도 우위 참고',
  },
  neutral: {
    headline: '고래 신호 약함',
    detail: '최근 WAD·존 겹침 뚜렷하지 않음',
  },
};

const FLOW_STAGE_KO: Record<WhaleFlowStage, string> = {
  incoming: '들어온다',
  arrived: '들어왔다',
  defend: '지키는 중',
  distribute: '분산·매도',
  idle: '대기',
};

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function bandsFromAnalysis(analysis: AnalyzeResponse | null): { buy: WhaleZoneBand[]; sell: WhaleZoneBand[] } {
  const buy = (analysis?.buyZones ?? []).map((z) => ({ low: z.low, high: z.high }));
  const sell = (analysis?.sellZones ?? []).map((z) => ({ low: z.low, high: z.high }));
  return { buy, sell };
}

function mergeDeskZones(
  analysis: AnalyzeResponse | null,
  memoryZones?: MonthDeskWhaleZone[]
): MonthDeskWhaleZone[] {
  const zones: MonthDeskWhaleZone[] = [...(memoryZones ?? [])];
  const support = num(analysis?.supportLevel?.price);
  const resistance = num(analysis?.resistanceLevel?.price);
  if (support != null) {
    const pad = support * 0.0015;
    zones.push({ id: 'whale-desk-support', side: 'buy', low: support - pad, high: support + pad, label: '지지' });
  }
  if (resistance != null) {
    const pad = resistance * 0.0015;
    zones.push({ id: 'whale-desk-resist', side: 'sell', low: resistance - pad, high: resistance + pad, label: '저항' });
  }
  for (const z of analysis?.buyZones ?? []) {
    zones.push({ id: `api-buy-${z.low}`, side: 'buy', low: z.low, high: z.high, label: '매수존' });
  }
  for (const z of analysis?.sellZones ?? []) {
    zones.push({ id: `api-sell-${z.low}`, side: 'sell', low: z.low, high: z.high, label: '매도존' });
  }
  return zones;
}

function priceInZone(price: number, z: MonthDeskWhaleZone): boolean {
  const lo = Math.min(z.low, z.high);
  const hi = Math.max(z.low, z.high);
  return price >= lo && price <= hi;
}

function findActiveZone(price: number | null, zones: MonthDeskWhaleZone[]): MonthDeskWhaleZone | null {
  if (price == null) return null;
  const hits = zones.filter((z) => priceInZone(price, z));
  if (!hits.length) return null;
  return hits.reduce((best, z) => {
    const span = Math.abs(z.high - z.low);
    const bestSpan = Math.abs(best.high - best.low);
    return span < bestSpan ? z : best;
  });
}

function buildTimeline(
  candles: Candle[] | null,
  buyBands: WhaleZoneBand[],
  sellBands: WhaleZoneBand[]
): WhaleTimelineBar[] {
  if (!candles?.length) {
    return Array.from({ length: TIMELINE_BARS }, (_, i) => ({
      kind: 'idle' as const,
      isLast: i === TIMELINE_BARS - 1,
    }));
  }
  const n = candles.length;
  const from = Math.max(0, n - TIMELINE_BARS);
  const bars: WhaleTimelineBar[] = [];
  for (let i = from; i < n; i++) {
    const c = candles[i];
    const e = evalWadBar(candles, i, {});
    const inBuy = candleOverlapsAnyBuyZone(c, buyBands);
    const inSell = candleOverlapsAnySellZone(c, sellBands);
    const wb = !!e?.whaleBuy;
    const ws = !!e?.whaleSell;
    let kind: WhaleTimelineKind = 'idle';
    if (wb && inBuy) kind = 'conf_long';
    else if (ws && inSell) kind = 'conf_short';
    else if (wb) kind = 'buy';
    else if (ws) kind = 'sell';
    else if (inBuy) kind = 'buy_zone';
    else if (inSell) kind = 'sell_zone';
    bars.push({ kind, isLast: i === n - 1 });
  }
  while (bars.length < TIMELINE_BARS) {
    bars.unshift({ kind: 'idle', isLast: false });
  }
  if (bars.length) bars[bars.length - 1].isLast = true;
  return bars;
}

function phaseToFlowStage(phase: MonthDeskWhalePhase): { stage: WhaleFlowStage; index: number } {
  switch (phase) {
    case 'buy_incoming':
    case 'sell_incoming':
      return { stage: 'incoming', index: 0 };
    case 'buy_done':
    case 'sell_done':
      return { stage: 'arrived', index: 1 };
    case 'defend_long':
    case 'defend_short':
      return { stage: 'defend', index: 2 };
    case 'sell_zone':
      return { stage: 'distribute', index: 3 };
    default:
      return { stage: 'idle', index: -1 };
  }
}

function zoneBanner(
  status: WhalePriceZoneStatus,
  active: MonthDeskWhaleZone | null,
  phase: MonthDeskWhalePhase
): string {
  if (status === 'inside_buy' && active) return `현재가 · 고래 매수존 안 (${active.label})`;
  if (status === 'inside_sell' && active) return `현재가 · 고래 매도존 안 (${active.label})`;
  if (status === 'between') return '현재가 · 매수·매도 존 사이';
  if (phase === 'buy_incoming') return '현재가 · 고래 매수 유입 구간 근처';
  if (phase === 'sell_incoming') return '현재가 · 고래 매도 유입 구간 근처';
  return '현재가 · 고래 존 밖';
}

export function buildMonthDeskWhaleSnapshot(
  analysis: AnalyzeResponse | null,
  candles: Candle[] | null,
  memoryZones?: MonthDeskWhaleZone[]
): MonthDeskWhaleSnapshot {
  const wzc = analysis?.volumeWhaleZoneConfluence;
  const vfs = analysis?.volumeFlowSummary;
  const sm = analysis?.smartMoneyMvpSignal;
  const fr = analysis?.frontRunSignal;
  const settle = analysis?.settlementZone;
  const { buy: buyBands, sell: sellBands } = bandsFromAnalysis(analysis);
  const zones = mergeDeskZones(analysis, memoryZones);
  const closePrice = candles?.length ? candles[candles.length - 1].close : null;

  const wadLast =
    candles && candles.length >= 20
      ? (() => {
          const e = evalWadBar(candles, candles.length - 1, {});
          return { buy: !!e?.whaleBuy, sell: !!e?.whaleSell };
        })()
      : { buy: false, sell: false };

  const lastBarBuy = wzc?.lastBarWhaleBuy ?? wadLast.buy;
  const lastBarSell = wzc?.lastBarWhaleSell ?? wadLast.sell;
  const inBuyZone = !!wzc?.lastBarInBuyZone;
  const inSellZone = !!wzc?.lastBarInSellZone;
  const confluentLong = !!wzc?.confluentLong;
  const confluentShort = !!wzc?.confluentShort;
  const recentConfluentLong = wzc?.recentConfluentLong ?? 0;
  const recentConfluentShort = wzc?.recentConfluentShort ?? 0;

  const whaleBuyRecent = vfs?.whaleBuyCount ?? recentConfluentLong + (lastBarBuy ? 1 : 0);
  const whaleSellRecent = vfs?.whaleSellCount ?? recentConfluentShort + (lastBarSell ? 1 : 0);
  const totalW = Math.max(1, whaleBuyRecent + whaleSellRecent);
  const buyPressure = Math.round((whaleBuyRecent / totalW) * 100);
  const sellPressure = 100 - buyPressure;

  let phase: MonthDeskWhalePhase = 'neutral';
  if (confluentLong) phase = 'buy_incoming';
  else if (confluentShort) phase = 'sell_incoming';
  else if (lastBarBuy && !lastBarSell) phase = 'buy_done';
  else if (lastBarSell && !lastBarBuy) phase = 'sell_done';
  else if (inBuyZone && buyPressure >= 55) phase = 'defend_long';
  else if (inSellZone && sellPressure >= 55) phase = 'defend_short';
  else if (inSellZone) phase = 'sell_zone';
  else if (whaleBuyRecent > whaleSellRecent + 1) phase = 'buy_done';
  else if (whaleSellRecent > whaleBuyRecent + 1) phase = 'sell_done';

  const support = num(analysis?.supportLevel?.price);
  const resistance = num(analysis?.resistanceLevel?.price);
  const invalidation = num(analysis?.invalidationLevel?.price);

  let defendPrice: number | null = null;
  let defendLabel: string | null = null;
  if (settle?.state === 'confirmed' && settle.level != null && settle.direction === 'LONG') {
    defendPrice = settle.level;
    defendLabel = '안착·방어(롱)';
  } else if (phase === 'defend_long' || phase === 'buy_incoming' || phase === 'buy_done') {
    defendPrice = support;
    defendLabel = support != null ? '핵심 지지' : null;
  } else if (settle?.state === 'confirmed' && settle.level != null && settle.direction === 'SHORT') {
    defendPrice = settle.level;
    defendLabel = '안착·방어(숏)';
  }

  let attackPrice: number | null = null;
  let attackLabel: string | null = null;
  if (phase === 'sell_incoming' || phase === 'sell_done' || phase === 'sell_zone' || phase === 'defend_short') {
    attackPrice = resistance;
    attackLabel = resistance != null ? '핵심 저항·매도' : null;
  }
  if (invalidation != null && (phase === 'defend_long' || phase === 'buy_incoming')) {
    defendPrice = defendPrice ?? invalidation;
    defendLabel = defendLabel ?? '무효(이탈)';
  }

  let frontRunKo: string | null = null;
  if (fr && fr.state !== 'INVALID' && fr.state !== 'WATCH') {
    const dir = fr.direction === 'LONG' ? '롱' : fr.direction === 'SHORT' ? '숏' : '';
    frontRunKo = `선행 ${fr.state}${dir ? ` · ${dir}` : ''}`;
    if (fr.state === 'TRIGGERED' && fr.direction === 'LONG') phase = 'buy_incoming';
    if (fr.state === 'TRIGGERED' && fr.direction === 'SHORT') phase = 'sell_incoming';
  }

  const activeZone = findActiveZone(closePrice, zones);
  let priceZoneStatus: WhalePriceZoneStatus = 'outside';
  if (closePrice != null) {
    const inBuy = zones.some((z) => z.side === 'buy' && priceInZone(closePrice, z));
    const inSell = zones.some((z) => z.side === 'sell' && priceInZone(closePrice, z));
    if (inBuy && inSell) priceZoneStatus = 'between';
    else if (inBuy) priceZoneStatus = 'inside_buy';
    else if (inSell) priceZoneStatus = 'inside_sell';
    else priceZoneStatus = 'outside';
  }

  const timeline = buildTimeline(candles, buyBands, sellBands);
  const { stage: flowStage, index: flowStageIndex } = phaseToFlowStage(phase);

  let activityScore = Math.min(
    100,
    Math.round(
      (whaleBuyRecent + whaleSellRecent) * 8 +
        recentConfluentLong * 12 +
        recentConfluentShort * 12 +
        (confluentLong || confluentShort ? 22 : 0) +
        (inBuyZone || inSellZone ? 18 : 0) +
        (lastBarBuy || lastBarSell ? 14 : 0) +
        (priceZoneStatus !== 'outside' ? 16 : 0) +
        (sm?.whaleScore != null ? Math.min(20, sm.whaleScore / 5) : 0)
    )
  );
  if (phase === 'neutral') activityScore = Math.min(activityScore, 35);

  const copy = PHASE_COPY[phase];
  let detailKo = copy.detail;
  if (wzc?.caption) detailKo = `${copy.detail} · ${wzc.caption}`;
  else if (vfs?.label) detailKo = vfs.label;
  if (frontRunKo) detailKo = `${detailKo} · ${frontRunKo}`;
  if (sm?.alertText) detailKo = `${detailKo} · ${sm.alertText}`;

  return {
    phase,
    headlineKo: copy.headline,
    detailKo,
    buyPressure,
    sellPressure,
    whaleBuyRecent,
    whaleSellRecent,
    lastBarBuy,
    lastBarSell,
    inBuyZone,
    inSellZone,
    confluentLong,
    confluentShort,
    defendPrice,
    defendLabel,
    attackPrice,
    attackLabel,
    mvpWhaleScore: sm?.whaleScore ?? null,
    cvdBias: sm?.venueCvdBias ?? null,
    frontRunKo,
    zones,
    flowLabel: vfs?.label ?? null,
    timeline,
    flowStage,
    flowStageKo: FLOW_STAGE_KO[flowStage],
    flowStageIndex,
    activityScore,
    priceZoneStatus,
    zoneBannerKo: zoneBanner(priceZoneStatus, activeZone, phase),
    activeZone,
    closePrice,
    recentConfluentLong,
    recentConfluentShort,
  };
}
