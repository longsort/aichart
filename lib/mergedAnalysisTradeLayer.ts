/**
 * 통합·분석 — 매매용 롱/숏 zone · E/SL/TP · VRVP (차트 작도 + 우측 프로파일).
 * 조건부 참고용 — 확정 수익·투자 권유 아님.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe, visibleLimit } from '@/lib/constants';
import { MERGED_VRVP_KO } from '@/lib/mergedAnalysisVrvpLabels';
import type { MonthDeskStrikeDeskBundle, MonthDeskStrikeLeg } from '@/lib/monthDeskStrikeDesk';
import { buildMonthDeskStrikeDeskOverlays, MONTH_DESK_STRIKE_IDS } from '@/lib/monthDeskStrikeDesk';
import { mergedDeskLastCandleZoneTimes, mergedWorkCandles } from '@/lib/mergedAnalysisOverlayTimes';
import type { MonthDeskBandFusionContext } from '@/lib/institutionalSuperBand';
import {
  buildMergedAresNumberedLevels,
  type MergedAresLevel,
} from '@/lib/mergedAnalysisAresVisual';
import { isMergedDeskChartTimeframe } from '@/lib/mergedDesk4hReference';
import {
  buildMergedKeyZoneMarkers,
  buildMergedKeyZoneOverlays,
  detectMergedAnalysisKeyZones,
  type MergedKeyZone,
} from '@/lib/mergedAnalysisKeyZones';
import {
  buildMergedDirectionConfirmMarkers,
  detectMergedDirectionConfirms,
  type MergedDirectionConfirm,
} from '@/lib/mergedAnalysisDirectionConfirm';
import {
  buildMergedConfirmZoneOverlays,
} from '@/lib/mergedAnalysisVisualLayers';
import {
  buildMergedCriticalZoneOverlays,
  detectMergedCriticalZones,
  type MergedCriticalZone,
} from '@/lib/mergedAnalysisCriticalZones';
import {
  detectMergedBounceScenarios,
  type MergedBounceScenario,
} from '@/lib/mergedAnalysisBounceTargets';
import {
  detectMergedSmcLeadingContext,
  type MergedSmcLeadingContext,
} from '@/lib/mergedAnalysisSmcLeading';
import { filterMergedDeskChartOverlays } from '@/lib/mergedAnalysisOverlayIds';
import { buildMergedFusionStructureByTime } from '@/lib/mergedAnalysisDeskHud';
import { buildMergedDeskStructureScenarioOverlays } from '@/lib/mergedAnalysisStructureScenario';
import {
  pickMergedDeskCoreChartZones,
  pickMergedDeskCoreConfirmConfirms,
} from '@/lib/mergedAnalysisCoreChartZones';
import { buildMergedDeskSupportReboundAnalysis } from '@/lib/mergedDeskSupportReboundAnalysis';
import {
  MERGED_ARES_ZONE_CAPTION_CLASS,
  buildMergedZoneIndexById,
} from '@/lib/mergedAnalysisOverlayTimes';

export type {
  MergedAresLevel,
  MergedKeyZone,
  MergedDirectionConfirm,
  MergedCriticalZone,
  MergedBounceScenario,
  MergedSmcLeadingContext,
};

export type MergedTradeSignal = {
  primary: 'LONG' | 'SHORT' | 'NEUTRAL';
  primaryLeg: MonthDeskStrikeLeg | null;
  longLeg: MonthDeskStrikeLeg | null;
  shortLeg: MonthDeskStrikeLeg | null;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  invalidationKo: string;
};

export type MergedVrvpBar = {
  price: number;
  ratio: number;
  isPoc: boolean;
  /** 해당 빈 매수 비중 0~1 (추정 포함) */
  buyShare?: number;
};

export type MergedVrvpSideBias = 'buy' | 'sell' | 'balanced';

/** 현물 대비 최다거래가 위치·반응 (확정 아님 · 터치만으로 진입 근거 아님) */
export type MergedVrvpPocState =
  | 'ABOVE'
  | 'BELOW'
  | 'APPROACH'
  | 'AT'
  | 'RETEST_FROM_ABOVE'
  | 'RETEST_FROM_BELOW';

export type MergedVrvpProfile = {
  bars: MergedVrvpBar[];
  poc: number | null;
  vaHigh: number | null;
  vaLow: number | null;
  /** POC 구간 거래량 / 전체 (%) */
  pocVolumePct: number | null;
  /** Value Area 70% 커버리지 (%) */
  vaCoveragePct: number | null;
  priceMin: number;
  priceMax: number;
  /** 차트 TF — visibleLimit와 동일 윈도우 */
  timeframe: string;
  candleCount: number;
  /** POC 빈 매수 거래량 합 */
  pocBuyVolume: number | null;
  /** POC 빈 매도 거래량 합 */
  pocSellVolume: number | null;
  /** POC 매수 비중 % */
  pocBuyPct: number | null;
  /** POC 매도 비중 % */
  pocSellPct: number | null;
  /** 매수/매도 최다거래 판정 */
  pocSideBias: MergedVrvpSideBias | null;
  /** 현물(종가) 기준 VAL→VAH 회전 시 상승 가능 % (조건부 추정) */
  spotUpsidePct: number | null;
  /** 현물 기준 VAH→VAL 회전 시 하락 가능 % (조건부 추정) */
  spotDownsidePct: number | null;
  /** HUD/축 라벨용 한 줄 요약 */
  pocBiasKo: string | null;
  /** 현물 vs POC 상태 */
  pocState: MergedVrvpPocState | null;
  pocStateKo: string | null;
  /** 현물→POC 거리 % (양=POC가 위, 음=POC가 아래) */
  spotToPocPct: number | null;
  /** 강도 0~100 (거래량 비중 + 수급 불균형) */
  pocStrength: number | null;
  /** POC 위쪽 다음 고거래(HVN) */
  nextHvnAbove: number | null;
  /** POC 아래쪽 다음 고거래(HVN) */
  nextHvnBelow: number | null;
  /**
   * 진행(Developing) 최다거래 — 최근 스윙~현재 구간 POC.
   * 가격이 급등·급락해도 멀리 남은 고정 POC와 구분.
   */
  developingPoc: number | null;
  developingPocBuyPct: number | null;
  developingPocSellPct: number | null;
  developingPocSideBias: MergedVrvpSideBias | null;
  developingBars: number;
  /** 현물가에 가장 가까운 고거래 노드(위) */
  nearHvnAbove: number | null;
  /** 현물가에 가장 가까운 고거래 노드(아래) */
  nearHvnBelow: number | null;
  /** 시나리오 한 줄 (조건부 · 확정 아님) */
  scenarioKo: string | null;
};

/** 차트에 보이는 봉 수(분·시·일·주·월)와 동일 slice */
/** 통합·분석 ST 구름 — 융합 편향(Strike primary + analyze) + SMC structureByTime */
export function buildMergedAnalysisBandFusionContext(params: {
  timeframe: string;
  bundle: MonthDeskStrikeDeskBundle;
  analysis?: AnalyzeResponse | null;
  candles?: Candle[];
  smcLeading?: MergedSmcLeadingContext | null;
}): MonthDeskBandFusionContext {
  const av = params.analysis?.verdict;
  const analyzeVerdict =
    av === 'LONG' || av === 'SHORT' ? av : params.bundle.primary !== 'NEUTRAL' ? params.bundle.primary : null;
  const structureByTime = buildMergedFusionStructureByTime(
    params.candles,
    params.smcLeading,
    params.analysis
  );
  return {
    analyzeVerdict,
    closingScenarioBias: null,
    lastClosingVerdict: null,
    timeframe: normalizeChartTimeframe(params.timeframe),
    structureByTime: structureByTime.size > 0 ? structureByTime : null,
    rocketByBarTime: null,
    cpBiasScores: null,
    linRegBiasScores: null,
    hotZoneBiasScores: null,
    obFvgBiasScores: null,
  };
}

/** 통합분석 — 4h 작업창 캔들만 (visibleLimit 재슬라이스 금지) */
export function mergedVrvpSourceCandles(candles: Candle[], timeframe: string): Candle[] {
  if (isMergedDeskChartTimeframe(timeframe)) {
    return mergedWorkCandles(candles, timeframe);
  }
  const lim = visibleLimit(timeframe);
  return candles.slice(Math.max(0, candles.length - lim));
}

function mergedVrvpBinCount(timeframe: string): number {
  if (isMergedDeskChartTimeframe(timeframe)) return 56; // 4h
  const tf = normalizeChartTimeframe(timeframe);
  if (tf === '1M' || tf === '1w') return 64;
  if (tf === '1d' || tf === '4h') return 56;
  if (tf === '1h' || tf === '15m') return 48;
  return 40;
}

export function extractMergedTradeSignal(bundle: MonthDeskStrikeDeskBundle): MergedTradeSignal {
  const pri =
    bundle.primary === 'LONG'
      ? bundle.long
      : bundle.primary === 'SHORT'
        ? bundle.short
        : bundle.long ?? bundle.short;
  return {
    primary: bundle.primary,
    primaryLeg: pri,
    longLeg: bundle.long,
    shortLeg: bundle.short,
    entry: pri?.entry ?? bundle.close,
    stopLoss: pri?.stopLoss ?? bundle.close,
    tp1: pri?.tp1 ?? bundle.close,
    tp2: pri?.tp2 ?? bundle.close,
    tp3: pri?.tp3 ?? bundle.close,
    invalidationKo: pri
      ? `${pri.side === 'LONG' ? '롱' : '숏'} SL ${pri.stopLoss.toFixed(2)} 이탈 시 무효`
      : '관망 — 진입 조건 미충족',
  };
}

/** 통합·분석 차트 — atlas·잡음 zone 제거, Strike·AI선·밴드만 */
export function filterUnifiedOverlaysForMergedTrade(items: OverlayItem[]): OverlayItem[] {
  return items.filter((o) => {
    const id = String(o.id || '');
    const kind = String(o.kind || '');
    if (id.startsWith('pulse-pro-ai-') || id.startsWith('atlas-pulse-settle')) return kind === 'keyLevel';
    if (id.startsWith('pulse-pro-ai-')) return true;
    if (kind === 'keyLevel' && (id.startsWith('key-mustHold-') || id.startsWith('key-invalidation-'))) {
      return true;
    }
    if (id.startsWith('atlas-pulse') || id.startsWith('pulse-pro-invalid') || id.startsWith('pulse-pro-whale')) {
      return false;
    }
    if (id.startsWith('pulse-pro-vrvp') || id.startsWith('merged-ribbon') || id.startsWith('merged-advanced')) {
      return false;
    }
    if (kind === 'demandZone' || kind === 'supplyZone' || kind === 'zone') return false;
    if (id.startsWith('month-desk-strike-')) return false;
    return kind === 'keyLevel' || kind === 'label';
  });
}

/** Strike overlay — primary E/SL/TP + 롱·숏 zone (양방향 참고), 빔·핀 제거 */
export function buildMergedStrikeTradeOverlays(
  bundle: MonthDeskStrikeDeskBundle,
  candles: Candle[]
): OverlayItem[] {
  const raw = buildMonthDeskStrikeDeskOverlays(bundle, candles);
  const pri = bundle.primary;
  const ids = MONTH_DESK_STRIKE_IDS;

  const keep = raw.filter((o) => {
    const id = String(o.id || '');
    if (id.includes('beam') || id.includes('pin')) return false;
    const isLong = id.includes('long');
    const isShort = id.includes('short');
    const isLevel = id.includes('entry') || id.includes('-sl') || id.includes('-tp');
    if (id.includes('zone')) {
      if (pri === 'LONG' && isShort) return false;
      if (pri === 'SHORT' && isLong) return false;
      return true;
    }
    if (isLevel) {
      if (pri === 'LONG' && isLong) return true;
      if (pri === 'SHORT' && isShort) return true;
      if (pri === 'NEUTRAL') return true;
      return false;
    }
    if (pri === 'LONG' && isLong) return true;
    if (pri === 'SHORT' && isShort) return true;
    if (pri === 'NEUTRAL') return true;
    return false;
  });

  const zoneTimes = mergedDeskLastCandleZoneTimes(
    candles,
    normalizeChartTimeframe(bundle.timeframe ?? '4h')
  );
  if (!zoneTimes) return keep;
  const { t1, t2 } = zoneTimes;
  const lastT = Number(candles[candles.length - 1]?.time) as UTCTimestamp;
  const out: OverlayItem[] = keep.map((o) => {
    const id = String(o.id || '');
    const isZone = id.includes('zone');
    return {
      ...o,
      time1: isZone ? t1 : o.time1,
      time2: isZone ? t2 : o.time2,
      label:
        id === ids.longZone
          ? '▲ LONG · 수요존'
          : id === ids.shortZone
            ? '▼ SHORT · 공급존'
            : o.label,
      overlayZoneExtraClass: [
        o.overlayZoneExtraClass,
        'merged-ares-zone',
        MERGED_ARES_ZONE_CAPTION_CLASS,
        id === ids.longZone ? 'merged-trade-long-zone' : '',
        id === ids.shortZone ? 'merged-trade-short-zone' : '',
        pri === 'LONG' && id === ids.longZone ? 'merged-trade-zone-active' : '',
        pri === 'SHORT' && id === ids.shortZone ? 'merged-trade-zone-active' : '',
      ]
        .filter(Boolean)
        .join(' '),
    };
  });

  if (bundle.long && Number.isFinite(lastT)) {
    out.push({
      id: 'merged-trade-long-signal-label',
      kind: 'label',
      label: pri === 'LONG' ? '▲ LONG' : 'LONG',
      x1: 1,
      y1: 0.5,
      x2: 1,
      y2: 0.5,
      time1: lastT,
      time2: lastT,
      price1: bundle.long.entry,
      confidence: bundle.long.score,
      color: pri === 'LONG' ? '#22c55e' : '#64748b',
      category: 'scenario',
      labelTooltip: bundle.long.headlineKo,
      labelBackgroundColor: pri === 'LONG' ? 'rgba(22,101,52,0.92)' : 'rgba(30,41,59,0.75)',
      labelTextColor: '#ecfdf5',
      overlayZoneExtraClass: 'merged-trade-signal-label',
    });
  }
  if (bundle.short && Number.isFinite(lastT)) {
    out.push({
      id: 'merged-trade-short-signal-label',
      kind: 'label',
      label: pri === 'SHORT' ? '▼ SHORT' : 'SHORT',
      x1: 1,
      y1: 0.5,
      x2: 1,
      y2: 0.5,
      time1: lastT,
      time2: lastT,
      price1: bundle.short.entry,
      confidence: bundle.short.score,
      color: pri === 'SHORT' ? '#ef4444' : '#64748b',
      category: 'scenario',
      labelTooltip: bundle.short.headlineKo,
      labelBackgroundColor: pri === 'SHORT' ? 'rgba(127,29,29,0.92)' : 'rgba(30,41,59,0.75)',
      labelTextColor: '#fff1f2',
      overlayZoneExtraClass: 'merged-trade-signal-label',
    });
  }

  return out;
}

/** VRVP — visibleLimit(TF) 캔들 구간 거래량 프로파일 + 70% Value Area */
function computeValueAreaFromBins(
  bins: number[],
  pMin: number,
  step: number,
  targetPct = 0.7
): { poc: number; pocIdx: number; vaLow: number; vaHigh: number; vaCoveragePct: number; pocVolumePct: number } {
  const total = bins.reduce((a, b) => a + b, 0) || 1;
  let pocIdx = 0;
  for (let i = 1; i < bins.length; i++) {
    if (bins[i]! > bins[pocIdx]!) pocIdx = i;
  }
  const poc = pMin + (pocIdx + 0.5) * step;
  let lo = pocIdx;
  let hi = pocIdx;
  let covered = bins[pocIdx]!;
  while (covered / total < targetPct && (lo > 0 || hi < bins.length - 1)) {
    const below = lo > 0 ? bins[lo - 1]! : -1;
    const above = hi < bins.length - 1 ? bins[hi + 1]! : -1;
    if (below >= above && lo > 0) {
      lo--;
      covered += bins[lo]!;
    } else if (hi < bins.length - 1) {
      hi++;
      covered += bins[hi]!;
    } else if (lo > 0) {
      lo--;
      covered += bins[lo]!;
    } else break;
  }
  return {
    poc,
    pocIdx,
    vaLow: pMin + lo * step,
    vaHigh: pMin + (hi + 1) * step,
    vaCoveragePct: (covered / total) * 100,
    pocVolumePct: (bins[pocIdx]! / total) * 100,
  };
}

export function buildMergedVrvpVaOverlay(
  profile: MergedVrvpProfile,
  candles: Candle[]
): OverlayItem | null {
  if (profile.vaHigh == null || profile.vaLow == null || !candles.length) return null;
  const n = candles.length;
  const zoneTimes = mergedDeskLastCandleZoneTimes(
    candles,
    normalizeChartTimeframe(profile.timeframe)
  );
  if (!zoneTimes) return null;
  const { t1, t2 } = zoneTimes;
  const t1n = Number(t1);
  const t2n = Number(t2);
  if (!Number.isFinite(t1n) || !Number.isFinite(t2n)) return null;
  const top = Math.max(profile.vaHigh, profile.vaLow);
  const bot = Math.min(profile.vaHigh, profile.vaLow);
  return {
    id: 'merged-ares-va-band',
    kind: 'demandZone',
    label: `${MERGED_VRVP_KO.vaBand} · ${profile.timeframe}`,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: t1n as UTCTimestamp,
    time2: t2n as UTCTimestamp,
    price1: top,
    price2: bot,
    confidence: profile.vaCoveragePct ?? 70,
    color: '#FDE047',
    category: 'scenario',
    overlayZoneExtraClass: [
      'merged-ares-va-band',
      'merged-ares-zone',
      MERGED_ARES_ZONE_CAPTION_CLASS,
    ].join(' '),
    labelTooltip: `${MERGED_VRVP_KO.poc} ${profile.poc?.toFixed(0) ?? '—'} · ${MERGED_VRVP_KO.vaRange} ${bot.toFixed(0)}~${top.toFixed(0)} · ${profile.candleCount}봉`,
    labelBackgroundColor: 'rgba(120,53,15,0.55)',
    labelTextColor: '#fef9c3',
  };
}

/** 봉별 매수/매도 거래량 — takerBuy 우선, 없으면 양·음봉 휴리스틱 */
function candleBuySellVolumes(c: Candle): { buy: number; sell: number } {
  const vol = c.volume > 0 ? c.volume : 1;
  const taker = Number(c.takerBuyBaseVolume);
  if (Number.isFinite(taker) && taker >= 0 && taker <= vol) {
    return { buy: taker, sell: Math.max(0, vol - taker) };
  }
  if (c.close >= c.open) {
    const buy = vol * 0.62;
    return { buy, sell: vol - buy };
  }
  const sell = vol * 0.62;
  return { buy: vol - sell, sell };
}

/** POC 제외 HVN — ratio 로컬 피크 */
function findAdjacentHvn(
  bars: Array<{ price: number; ratio: number; isPoc: boolean }>,
  pocPrice: number
): { above: number | null; below: number | null } {
  const peaks: number[] = [];
  for (let i = 1; i < bars.length - 1; i++) {
    const b = bars[i]!;
    if (b.isPoc || b.ratio < 0.62) continue;
    if (b.ratio >= bars[i - 1]!.ratio && b.ratio >= bars[i + 1]!.ratio) {
      peaks.push(b.price);
    }
  }
  let above: number | null = null;
  let below: number | null = null;
  let bestA = Infinity;
  let bestB = Infinity;
  for (const p of peaks) {
    if (p > pocPrice && p - pocPrice < bestA) {
      bestA = p - pocPrice;
      above = p;
    }
    if (p < pocPrice && pocPrice - p < bestB) {
      bestB = pocPrice - p;
      below = p;
    }
  }
  return { above, below };
}

function resolvePocState(params: {
  spot: number;
  poc: number;
  prevClose: number | null;
  bandPct: number;
}): { state: MergedVrvpPocState; stateKo: string; spotToPocPct: number } {
  const { spot, poc, prevClose, bandPct } = params;
  const spotToPocPct = Math.round(((poc - spot) / spot) * 1000) / 10;
  const dist = Math.abs(spot - poc) / poc;
  const at = dist <= bandPct;
  const approach = dist <= bandPct * 2.2;

  if (at) {
    if (prevClose != null && prevClose > poc * (1 + bandPct) && spot <= poc * (1 + bandPct)) {
      return { state: 'RETEST_FROM_ABOVE', stateKo: '위서재접근', spotToPocPct };
    }
    if (prevClose != null && prevClose < poc * (1 - bandPct) && spot >= poc * (1 - bandPct)) {
      return { state: 'RETEST_FROM_BELOW', stateKo: '아래서재접근', spotToPocPct };
    }
    return { state: 'AT', stateKo: '최다접촉', spotToPocPct };
  }
  if (approach) {
    return {
      state: 'APPROACH',
      stateKo: spot < poc ? '아래에서접근' : '위에서접근',
      spotToPocPct,
    };
  }
  if (spot > poc) {
    /** 캔들 위 · 최다거래 아래 = 위이탈, 선은 아래에서 대기 */
    return { state: 'ABOVE', stateKo: '위이탈·아래대기', spotToPocPct };
  }
  return { state: 'BELOW', stateKo: '아래이탈·위대기', spotToPocPct };
}

/** 최근 스윙저/스윙고 이후(또는 최근 28% 봉) — Developing POC 윈도우 */
function developingPocWindow(source: Candle[]): { from: number; to: number } {
  const n = source.length;
  const to = n - 1;
  const minLen = Math.max(16, Math.floor(n * 0.18));
  const fallbackFrom = Math.max(0, n - Math.max(minLen, Math.floor(n * 0.32)));
  if (n < 20) return { from: fallbackFrom, to };

  let swingLowIdx = -1;
  let swingHighIdx = -1;
  const rad = 3;
  const scanStart = Math.max(rad, Math.floor(n * 0.25));
  for (let i = n - 1 - rad; i >= scanStart; i--) {
    const lo = Number(source[i]!.low);
    const hi = Number(source[i]!.high);
    let isLow = true;
    let isHigh = true;
    for (let j = i - rad; j <= i + rad; j++) {
      if (j === i) continue;
      if (Number(source[j]!.low) < lo) isLow = false;
      if (Number(source[j]!.high) > hi) isHigh = false;
    }
    if (isLow && swingLowIdx < 0) swingLowIdx = i;
    if (isHigh && swingHighIdx < 0) swingHighIdx = i;
    if (swingLowIdx >= 0 && swingHighIdx >= 0) break;
  }

  const spot = Number(source[to]!.close);
  const lastSwing =
    swingLowIdx >= 0 && swingHighIdx >= 0
      ? Math.abs(Number(source[swingLowIdx]!.low) - spot) <=
        Math.abs(Number(source[swingHighIdx]!.high) - spot)
        ? swingLowIdx
        : swingHighIdx
      : swingLowIdx >= 0
        ? swingLowIdx
        : swingHighIdx;

  if (lastSwing >= 0 && to - lastSwing + 1 >= 12) {
    return { from: lastSwing, to };
  }
  return { from: fallbackFrom, to };
}

function profilePocOnSlice(
  source: Candle[],
  from: number,
  to: number,
  numBins: number
): {
  poc: number;
  buyPct: number | null;
  sellPct: number | null;
  side: MergedVrvpSideBias | null;
} | null {
  if (to - from + 1 < 8) return null;
  let pMin = Infinity;
  let pMax = -Infinity;
  for (let i = from; i <= to; i++) {
    pMin = Math.min(pMin, source[i]!.low);
    pMax = Math.max(pMax, source[i]!.high);
  }
  if (!(pMax > pMin)) return null;
  const step = (pMax - pMin) / numBins;
  const bins = new Array<number>(numBins).fill(0);
  const buyBins = new Array<number>(numBins).fill(0);
  const sellBins = new Array<number>(numBins).fill(0);
  for (let i = from; i <= to; i++) {
    const c = source[i]!;
    const { buy, sell } = candleBuySellVolumes(c);
    const v = buy + sell > 0 ? buy + sell : c.volume > 0 ? c.volume : 1;
    let i0 = Math.floor((c.low - pMin) / step);
    let i1 = Math.floor((c.high - pMin) / step);
    i0 = Math.max(0, Math.min(numBins - 1, i0));
    i1 = Math.max(0, Math.min(numBins - 1, i1));
    if (i0 > i1) [i0, i1] = [i1, i0];
    const span = i1 - i0 + 1;
    const add = v / span;
    for (let b = i0; b <= i1; b++) {
      bins[b] += add;
      buyBins[b] += buy / span;
      sellBins[b] += sell / span;
    }
  }
  let pocIdx = 0;
  for (let i = 1; i < bins.length; i++) {
    if (bins[i]! > bins[pocIdx]!) pocIdx = i;
  }
  const poc = pMin + (pocIdx + 0.5) * step;
  const pb = buyBins[pocIdx] ?? 0;
  const ps = sellBins[pocIdx] ?? 0;
  const tot = pb + ps;
  const buyPct = tot > 0 ? Math.round((pb / tot) * 1000) / 10 : null;
  const sellPct = tot > 0 ? Math.round((ps / tot) * 1000) / 10 : null;
  let side: MergedVrvpSideBias | null = null;
  if (buyPct != null && sellPct != null) {
    if (buyPct > sellPct) side = 'buy';
    else if (sellPct > buyPct) side = 'sell';
    else side = 'balanced';
  }
  return { poc, buyPct, sellPct, side };
}

/** 현물가 기준 가장 가까운 고거래 피크(위/아래) */
function findNearSpotHvn(
  bars: Array<{ price: number; ratio: number; isPoc: boolean }>,
  spot: number,
  maxDistPct = 0.085
): { above: number | null; below: number | null } {
  if (!(spot > 0) || bars.length < 3) return { above: null, below: null };
  const peaks: number[] = [];
  for (let i = 1; i < bars.length - 1; i++) {
    const b = bars[i]!;
    if (b.ratio < 0.48) continue;
    if (b.ratio >= bars[i - 1]!.ratio * 0.98 && b.ratio >= bars[i + 1]!.ratio * 0.98) {
      peaks.push(b.price);
    }
  }
  let above: number | null = null;
  let below: number | null = null;
  let bestA = Infinity;
  let bestB = Infinity;
  const maxDist = spot * maxDistPct;
  for (const p of peaks) {
    const d = Math.abs(p - spot);
    if (d > maxDist || d < spot * 0.0004) continue;
    if (p > spot && d < bestA) {
      bestA = d;
      above = p;
    }
    if (p < spot && d < bestB) {
      bestB = d;
      below = p;
    }
  }
  return { above, below };
}

function buildPocScenarioKo(params: {
  side: MergedVrvpSideBias | null;
  state: MergedVrvpPocState;
  strength: number;
  upside: number | null;
  downside: number | null;
  developingPoc?: number | null;
  spot?: number | null;
}): string {
  const { side, state, strength, upside, downside } = params;
  const tone =
    side === 'buy' ? '매수우세' : side === 'sell' ? '매도우세' : '수급균형';
  const path =
    state === 'BELOW' || state === 'RETEST_FROM_BELOW' || (state === 'APPROACH' && (upside ?? 0) > 0)
      ? upside != null && upside > 0
        ? `상단VA 약+${upside.toFixed(1)}% 여력(추정)`
        : '상단 여력 재확인'
      : state === 'ABOVE' || state === 'RETEST_FROM_ABOVE'
        ? downside != null && downside > 0
          ? `하단VA 약-${downside.toFixed(1)}% 여력(추정)`
          : '하단 여력 재확인'
        : '회전·대기';
  let devBit = '';
  if (
    params.developingPoc != null &&
    params.spot != null &&
    params.spot > 0 &&
    Number.isFinite(params.developingPoc)
  ) {
    const d = ((params.developingPoc - params.spot) / params.spot) * 100;
    devBit =
      Math.abs(d) < 0.15
        ? ' · 진행최다≈현재'
        : d > 0
          ? ` · 진행최다 +${d.toFixed(1)}%위`
          : ` · 진행최다 ${d.toFixed(1)}%아래`;
  }
  return `${tone} · ${path} · 강도${Math.round(strength)}${devBit} · 터치≠확정`;
}

/** VRVP — visibleLimit(TF) 캔들 구간 거래량 프로파일 + POC 완전판 */
export function computeMergedVrvpProfile(candles: Candle[], timeframe: string): MergedVrvpProfile | null {
  const source = mergedVrvpSourceCandles(candles, timeframe);
  if (source.length < 8) return null;

  let pMin = Infinity;
  let pMax = -Infinity;
  for (const c of source) {
    pMin = Math.min(pMin, c.low);
    pMax = Math.max(pMax, c.high);
  }
  if (!(pMax > pMin)) return null;

  const numBins = mergedVrvpBinCount(timeframe);
  const step = (pMax - pMin) / numBins;
  const bins = new Array<number>(numBins).fill(0);
  const buyBins = new Array<number>(numBins).fill(0);
  const sellBins = new Array<number>(numBins).fill(0);

  for (const c of source) {
    const { buy, sell } = candleBuySellVolumes(c);
    const v = buy + sell > 0 ? buy + sell : c.volume > 0 ? c.volume : 1;
    let i0 = Math.floor((c.low - pMin) / step);
    let i1 = Math.floor((c.high - pMin) / step);
    i0 = Math.max(0, Math.min(numBins - 1, i0));
    i1 = Math.max(0, Math.min(numBins - 1, i1));
    if (i0 > i1) [i0, i1] = [i1, i0];
    const span = i1 - i0 + 1;
    const add = v / span;
    const addBuy = buy / span;
    const addSell = sell / span;
    for (let i = i0; i <= i1; i++) {
      bins[i] += add;
      buyBins[i] += addBuy;
      sellBins[i] += addSell;
    }
  }
  const maxV = Math.max(...bins, 1e-9);
  const va = computeValueAreaFromBins(bins, pMin, step, 0.7);
  const poc = va.poc;
  const pocIdx = va.pocIdx;
  const pocBuy = buyBins[pocIdx] ?? 0;
  const pocSell = sellBins[pocIdx] ?? 0;
  const pocTotal = pocBuy + pocSell;
  const pocBuyPct = pocTotal > 0 ? Math.round((pocBuy / pocTotal) * 1000) / 10 : null;
  const pocSellPct = pocTotal > 0 ? Math.round((pocSell / pocTotal) * 1000) / 10 : null;
  /** 매수≥매도 → 매수(녹) · 매도>매수 → 매도(빨) — 노랑(균형)은 완전 동일일 때만 */
  let pocSideBias: MergedVrvpSideBias | null = null;
  if (pocBuyPct != null && pocSellPct != null) {
    if (pocBuyPct > pocSellPct) pocSideBias = 'buy';
    else if (pocSellPct > pocBuyPct) pocSideBias = 'sell';
    else pocSideBias = 'balanced';
  }

  const spot = Number(source[source.length - 1]?.close);
  const prevClose = source.length >= 2 ? Number(source[source.length - 2]?.close) : null;
  let spotUpsidePct: number | null = null;
  let spotDownsidePct: number | null = null;
  if (spot > 0 && va.vaHigh != null && va.vaLow != null) {
    spotUpsidePct = Math.round(((va.vaHigh - spot) / spot) * 1000) / 10;
    spotDownsidePct = Math.round(((spot - va.vaLow) / spot) * 1000) / 10;
  }

  const bars: MergedVrvpBar[] = bins.map((v, i) => {
    const price = pMin + (i + 0.5) * step;
    const b = buyBins[i] ?? 0;
    const s = sellBins[i] ?? 0;
    const t = b + s;
    return {
      price,
      ratio: v / maxV,
      isPoc: i === pocIdx,
      buyShare: t > 0 ? b / t : 0.5,
    };
  });

  const hvn = findAdjacentHvn(bars, poc);
  const nearSpot = spot > 0 ? findNearSpotHvn(bars, spot) : { above: null, below: null };
  const bandPct = Math.max(0.0012, Math.min(0.006, step / Math.max(poc, 1) * 1.15));
  const statePack =
    spot > 0
      ? resolvePocState({ spot, poc, prevClose, bandPct })
      : { state: 'AT' as MergedVrvpPocState, stateKo: '최다대기', spotToPocPct: 0 };

  const win = developingPocWindow(source);
  const devBins = Math.max(18, Math.min(numBins, Math.round(numBins * 0.85)));
  const developing = profilePocOnSlice(source, win.from, win.to, devBins);
  let developingPoc: number | null = developing?.poc ?? null;
  /** 전체 POC와 거의 같으면 중복 표시 생략 */
  if (
    developingPoc != null &&
    Math.abs(developingPoc - poc) / Math.max(poc, 1) < 0.0012
  ) {
    developingPoc = null;
  }
  const developingBars = win.to - win.from + 1;

  const imbalance =
    pocBuyPct != null && pocSellPct != null ? Math.abs(pocBuyPct - pocSellPct) : 0;
  const volShare = Math.min(40, Number(va.pocVolumePct) || 0);
  const pocStrength = Math.round(
    Math.min(100, volShare * 1.6 + imbalance * 1.1 + (bars[pocIdx]?.ratio ?? 0) * 25)
  );

  const scenarioKo = buildPocScenarioKo({
    side: pocSideBias,
    state: statePack.state,
    strength: pocStrength,
    upside: spotUpsidePct,
    downside: spotDownsidePct,
    developingPoc,
    spot,
  });

  const sideKo =
    pocSideBias === 'buy'
      ? '매수최다'
      : pocSideBias === 'sell'
        ? '매도최다'
        : pocSideBias === 'balanced'
          ? '매수·매도균형'
          : '최다거래';
  const upKo =
    spotUpsidePct != null && spotUpsidePct > 0
      ? `↑${Math.abs(spotUpsidePct).toFixed(1)}%`
      : spotUpsidePct != null && spotUpsidePct < 0
        ? `VAH아래`
        : '↑—';
  const dnKo =
    spotDownsidePct != null && spotDownsidePct > 0
      ? `↓${Math.abs(spotDownsidePct).toFixed(1)}%`
      : spotDownsidePct != null && spotDownsidePct < 0
        ? `VAL위`
        : '↓—';
  const distKo =
    statePack.spotToPocPct > 0
      ? `최다까지+${statePack.spotToPocPct}%`
      : statePack.spotToPocPct < 0
        ? `최다까지${statePack.spotToPocPct}%`
        : '최다일치';
  const nearKo =
    nearSpot.above != null || nearSpot.below != null
      ? ` · 근처고거래${nearSpot.above != null ? '↑' : ''}${nearSpot.below != null ? '↓' : ''}`
      : '';
  const devKo =
    developingPoc != null ? ` · 진행최다 ${Math.round(developingPoc)}` : '';
  const pocBiasKo = `${sideKo}${pocBuyPct != null ? ` 매${Math.round(pocBuyPct)}` : ''}${
    pocSellPct != null ? `/도${Math.round(pocSellPct)}` : ''
  } · ${statePack.stateKo} · ${distKo} · VA ${upKo}/${dnKo} · 강도${pocStrength}${devKo}${nearKo}`;

  return {
    bars,
    poc,
    vaHigh: va.vaHigh,
    vaLow: va.vaLow,
    pocVolumePct: va.pocVolumePct,
    vaCoveragePct: va.vaCoveragePct,
    priceMin: pMin,
    priceMax: pMax,
    timeframe: normalizeChartTimeframe(timeframe),
    candleCount: source.length,
    pocBuyVolume: pocTotal > 0 ? pocBuy : null,
    pocSellVolume: pocTotal > 0 ? pocSell : null,
    pocBuyPct,
    pocSellPct,
    pocSideBias,
    spotUpsidePct,
    spotDownsidePct,
    pocBiasKo,
    pocState: statePack.state,
    pocStateKo: statePack.stateKo,
    spotToPocPct: statePack.spotToPocPct,
    pocStrength,
    nextHvnAbove: hvn.above,
    nextHvnBelow: hvn.below,
    developingPoc,
    developingPocBuyPct: developing?.buyPct ?? null,
    developingPocSellPct: developing?.sellPct ?? null,
    developingPocSideBias: developing?.side ?? null,
    developingBars,
    nearHvnAbove: nearSpot.above,
    nearHvnBelow: nearSpot.below,
    scenarioKo,
  };
}

export function buildMergedTradeOverlayPack(params: {
  bundle: MonthDeskStrikeDeskBundle;
  candles: Candle[];
  timeframe: string;
  fusion?: MonthDeskBandFusionContext | null;
  unifiedOverlays: OverlayItem[];
  analysis?: AnalyzeResponse | null;
  whaleMemoryZones?: Array<{ price1: number; price2: number; confidence?: number }>;
}): {
  overlays: OverlayItem[];
  swingChartMarkers: [];
  signal: MergedTradeSignal;
  vrvp: MergedVrvpProfile | null;
  aresLevels: MergedAresLevel[];
  keyZones: MergedKeyZone[];
  keyZoneMarkers: ReturnType<typeof buildMergedKeyZoneMarkers>;
  directionConfirms: MergedDirectionConfirm[];
  directionConfirmMarkers: ReturnType<typeof buildMergedDirectionConfirmMarkers>;
  criticalZones: MergedCriticalZone[];
  bounceScenarios: MergedBounceScenario[];
  smcLeading: MergedSmcLeadingContext;
  supportReboundKo: string;
  supportReboundDetailKo: string;
  projectedDownsideKo: string;
  projectedUpsideKo: string;
} {
  const leg =
    params.bundle.primary === 'LONG'
      ? params.bundle.long
      : params.bundle.primary === 'SHORT'
        ? params.bundle.short
        : params.bundle.long ?? params.bundle.short;
  const aresLevels = leg ? buildMergedAresNumberedLevels(leg, params.candles) : [];
  const keyZonesAll = detectMergedAnalysisKeyZones(params.candles, params.timeframe);
  const vrvp = computeMergedVrvpProfile(params.candles, params.timeframe);
  const criticalZonesAll = detectMergedCriticalZones({
    candles: params.candles,
    timeframe: params.timeframe,
    analysis: params.analysis,
    vrvp,
    bundle: params.bundle,
    keyZones: keyZonesAll,
    whaleMemoryZones: params.whaleMemoryZones,
  });
  const { keyZones, criticalZones } = pickMergedDeskCoreChartZones(
    keyZonesAll,
    criticalZonesAll,
    params.candles
  );
  const zoneIndexById = buildMergedZoneIndexById([
    ...keyZones.map((z) => ({ id: z.id, price: z.price })),
    ...criticalZones.map((z) => ({ id: z.id, price: z.price })),
  ]);
  const keyZoneOverlays = buildMergedKeyZoneOverlays(
    params.candles,
    params.timeframe,
    keyZones,
    zoneIndexById
  );
  const keyZoneMarkers = buildMergedKeyZoneMarkers(params.candles, params.timeframe, keyZones);
  const directionConfirmsAll = detectMergedDirectionConfirms({
    candles: params.candles,
    timeframe: params.timeframe,
    keyZones: keyZonesAll,
    bundle: params.bundle,
    analysis: params.analysis,
  });
  const chartConfirms = pickMergedDeskCoreConfirmConfirms(directionConfirmsAll);
  const directionConfirmMarkers = buildMergedDirectionConfirmMarkers(chartConfirms);
  const criticalZoneOverlays = buildMergedCriticalZoneOverlays(
    params.candles,
    criticalZones,
    params.timeframe,
    zoneIndexById
  );
  const smcLeading = detectMergedSmcLeadingContext({
    candles: params.candles,
    timeframe: params.timeframe,
    analysis: params.analysis,
  });
  const bounceScenarios = detectMergedBounceScenarios({
    candles: params.candles,
    timeframe: params.timeframe,
    keyZones: keyZonesAll,
    criticalZones: criticalZonesAll,
    vrvp,
    analysis: params.analysis,
    bundle: params.bundle,
    smcLeading,
  });
  const confirmZones = buildMergedConfirmZoneOverlays(chartConfirms, params.candles, params.timeframe);
  const structureScenarios = buildMergedDeskStructureScenarioOverlays({
    candles: params.candles,
    timeframe: params.timeframe,
    analysis: params.analysis,
    smcLeading,
    bounceScenarios,
  });
  const supportRebound = buildMergedDeskSupportReboundAnalysis({
    candles: params.candles,
    timeframe: params.timeframe,
    keyZones: keyZonesAll,
    bounceScenarios,
    smcLeading,
    criticalZones: criticalZonesAll,
    vrvp,
    analysis: params.analysis,
    whaleMemoryZones: params.whaleMemoryZones,
  });
  /** 차트 — 참조 ZONE + 구조·안착·반등/하락 시나리오 + 캔들 추세선·지지반등 */
  const overlays = filterMergedDeskChartOverlays(
    dedupeOverlays([
      ...criticalZoneOverlays,
      ...keyZoneOverlays,
      ...confirmZones,
      ...structureScenarios,
      ...supportRebound.overlays,
    ])
  );
  return {
    overlays,
    swingChartMarkers: [],
    signal: extractMergedTradeSignal(params.bundle),
    vrvp,
    aresLevels,
    keyZones: keyZonesAll,
    keyZoneMarkers,
    directionConfirms: directionConfirmsAll,
    directionConfirmMarkers,
    criticalZones: criticalZonesAll,
    bounceScenarios,
    smcLeading,
    supportReboundKo: supportRebound.summaryKo,
    supportReboundDetailKo: supportRebound.detailKo,
    projectedDownsideKo: supportRebound.projectedDownsideKo,
    projectedUpsideKo: supportRebound.projectedUpsideKo,
  };
}

function dedupeOverlays(items: OverlayItem[]): OverlayItem[] {
  const seen = new Set<string>();
  const out: OverlayItem[] = [];
  for (const o of items) {
    const key = String(o.id || `${o.kind}-${o.price1}-${o.time1}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}
