/**
 * 통합·분석 Mirage zone — 선반영(형성 시점) 지지·반등·호가·페이즈·MTF 통계.
 * 거래소 API + 과거 캔들. 확정 수익·투자 권유 아님.
 */
import type { OrderbookSnapshot } from '@/lib/data/collectors/orderbookCollector';
import type { AggTrade } from '@/lib/data/collectors/tradesCollector';
import {
  getOrderbookDepthAtPrice,
  orderbookDepthLabel,
} from '@/lib/data/aggregate/orderbookDepthAtPrice';
import { tradesAtPriceZone } from '@/lib/data/aggregate/tradesAtPriceZone';
import { ruleBasedTapeBias } from '@/lib/zoneReactionMetrics';
import type { VolumePhaseCurrentMatch } from '@/lib/volumePhaseStats';
import type { Candle, OverlayItem } from '@/types';
import {
  buildMirageZoneDeepFaceParts,
  type MirageZoneDeepIntelInput,
} from '@/lib/mergedDeskMirageZoneDeepIntel';
import {
  applyMirageZoneFaceCompactFields,
  type MirageZoneFaceLang,
} from '@/lib/mergedDeskMirageZoneCompactLabel';
import { normalizeChartTimeframe } from '@/lib/constants';
import { isMergedDeskMirageTvZoneOverlay } from '@/lib/mergedAnalysisOverlayIds';
import { snapMergedOverlayTimeToCandles } from '@/lib/mergedAnalysisOverlayTimes';
import { mirageZoneInvalidationPrice } from '@/lib/mergedDeskMirageZoneInvalidation';
import { parseMirageZoneFormationTime } from '@/lib/mergedDeskMirageZoneScreen';

export type MirageZoneExchangeSnapshot = {
  trades: AggTrade[];
  currentPrice: number;
  buyPressure: number;
  sellPressure: number;
  orderbookImbalance: number;
  orderbook?: OrderbookSnapshot | null;
};

export type MirageZoneKeyZoneRef = {
  kind: 'demand' | 'supply';
  price: number;
  top: number;
  bot: number;
  labelKo?: string;
  bouncePct?: number;
};

export type MirageZoneCriticalZoneRef = {
  kind: 'demand' | 'supply';
  top: number;
  bot: number;
  tier?: string;
  htfLabel?: string | null;
  labelKo?: string;
};

export type MirageZoneMtfRowRef = {
  tf: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL' | 'WAIT';
  longScore?: number;
  shortScore?: number;
};

export type MirageZoneIntelContext = {
  snapshot?: MirageZoneExchangeSnapshot | null;
  volumePhase?: VolumePhaseCurrentMatch | null;
  keyZones?: MirageZoneKeyZoneRef[];
  criticalZones?: MirageZoneCriticalZoneRef[];
  vrvp?: { poc?: number | null; vaLow?: number | null; vaHigh?: number | null } | null;
  mtfRows?: MirageZoneMtfRowRef[];
  chartTimeframe?: string;
  currentPrice?: number | null;
  /** 마감·SMC·과거체결·장세맞음 — zone 면 라벨 보강 */
  deep?: MirageZoneDeepIntelInput | null;
  /** 면 라벨 언어 — ko 짧은 한글 / en 약어 */
  faceLang?: MirageZoneFaceLang;
};

export type MirageZoneProactiveIntel = {
  reboundPct: number | null;
  holdPct: number | null;
  touches: number;
  bounces: number;
  histSummaryKo: string;
  invalidationPrice: number | null;
  tapeScore: number | null;
  tapeLabelKo: string;
  depthLabelKo: string;
  bidAskBiasKo: string;
  phaseProbPct: number | null;
  phaseLabelKo: string;
  phaseAligned: boolean;
  mtfScore: number;
  mtfLabelKo: string;
  mtfAligned: boolean;
  tagKo: string;
  /** 마감·구조·거래밀집·장세 — 면 라벨 세그먼트 */
  deepFaceKo?: string[];
  detailKo: string;
  stateClass: string;
};

export type MirageZoneIntelRequestZone = {
  id: string;
  center: number;
  top: number;
  bot: number;
  role: ZoneRole;
};

export type ZoneRole = 'support' | 'resistance' | 'ob_bull' | 'ob_bear' | 'neutral';

function candleIndexAtOrBefore(candles: Candle[], t: number): number {
  if (!candles.length) return 0;
  let lo = 0;
  let hi = candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (Number(candles[mid]!.time) <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function inferMirageZoneRole(item: OverlayItem): ZoneRole {
  const id = String(item.id || '');
  const extra = String(item.overlayZoneExtraClass || '');
  const label = String(item.label || '');
  if (
    id.startsWith('merged-desk-hotzone-') ||
    extra.includes('merged-desk-hotzone-entry') ||
    extra.includes('merged-desk-hotzone-zone') ||
    extra.includes('hotzone-signal')
  ) {
    if (
      id.includes('-below') ||
      extra.includes('hotzone-signal--long') ||
      label.includes('롱') ||
      label.includes('지지')
    ) {
      return 'support';
    }
    if (
      id.includes('-above') ||
      extra.includes('hotzone-signal--short') ||
      label.includes('숏') ||
      label.includes('저항')
    ) {
      return 'resistance';
    }
  }
  if (extra.includes('ob-bull') || extra.includes('smc-bull')) return 'ob_bull';
  if (extra.includes('ob-bear') || extra.includes('smc-bear')) return 'ob_bear';
  if (id.includes('support') || extra.includes('support')) return 'support';
  if (id.includes('resist') || extra.includes('resist')) return 'resistance';
  if (item.structureBias === 'bullish') return 'support';
  if (item.structureBias === 'bearish') return 'resistance';
  return 'neutral';
}

function baseCaption(item: OverlayItem): string {
  const raw = String(item.label || '').trim();
  if (!raw) return '존';
  return raw.split('·')[0]!.trim();
}

/** zone 면 라벨 — 첫 토큰(저항/지지/횡보 등) */
export function mirageZoneBaseCaption(item: OverlayItem | string): string {
  if (typeof item === 'string') {
    const raw = item.trim();
    if (!raw) return '존';
    return raw.split('·')[0]!.trim();
  }
  return baseCaption(item);
}

const MIRAGE_LIFECYCLE_KO = [
  '분석',
  '안착',
  '확정',
  '안착실패',
  '재시도',
  '재시도실패',
  'BOS',
  'CHOCH',
  '구조안착',
  '구조무효',
] as const;

/** 후반영 lifecycle 토큰 (안착·확정 등) */
export function extractMirageZoneLifecycleKo(label: string): string | null {
  const parts = String(label || '')
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  for (let i = parts.length - 1; i >= 1; i--) {
    const p = parts[i]!;
    if (MIRAGE_LIFECYCLE_KO.some((k) => p === k || p.startsWith(k))) return p;
  }
  return null;
}

/**
 * zone 면 AI 라벨 — 지지/저항 가능성·매수/매도 유입 (조건부, 검증 필요).
 * 마우스 오버 없이 zone 우측에 직접 표시.
 */
export function buildMirageZoneAiFaceLabel(
  role: ZoneRole,
  intel: MirageZoneProactiveIntel,
  opts?: { learningKo?: string | null; deepParts?: string[] }
): string {
  const expectBull = role === 'support' || role === 'ob_bull';
  const expectBear = role === 'resistance' || role === 'ob_bear';
  const parts: string[] = [];
  const deepParts = opts?.deepParts ?? intel.deepFaceKo ?? [];

  if (intel.reboundPct != null && intel.touches >= 1) {
    if (expectBull) {
      if (intel.reboundPct >= 58) parts.push('받침가능');
      else if (intel.reboundPct >= 40) parts.push('받침관찰');
      else parts.push('받침약');
    } else if (expectBear) {
      if (intel.reboundPct >= 58) parts.push('위막힘');
      else if (intel.reboundPct >= 40) parts.push('위압력관찰');
      else parts.push('막힘약');
    } else {
      parts.push(`반응${intel.reboundPct}%`);
    }
  } else if (intel.holdPct != null && intel.touches >= 1) {
    if (expectBull) {
      parts.push(intel.holdPct >= 55 ? '받침유지' : '받침흔들');
    } else if (expectBear) {
      parts.push(intel.holdPct >= 55 ? '위압력유지' : '막힘흔들');
    } else {
      parts.push(`유지${intel.holdPct}%`);
    }
  } else if (expectBull) {
    parts.push('받침관찰');
  } else if (expectBear) {
    parts.push('위압력관찰');
  } else {
    parts.push('구간관찰');
  }

  for (const d of deepParts) {
    if (parts.length >= 4) break;
    if (!parts.includes(d)) parts.push(d);
  }

  const tape = intel.tapeScore;
  const buyTape = tape != null && tape >= 58;
  const sellTape = tape != null && tape <= 42;
  const buyFlow =
    buyTape ||
    intel.tapeLabelKo === '매수우세' ||
    intel.bidAskBiasKo.includes('매수');
  const sellFlow =
    sellTape ||
    intel.tapeLabelKo === '매도우세' ||
    intel.bidAskBiasKo.includes('매도');

  if (expectBull) {
    if (buyFlow && !sellFlow) parts.push('매수유입');
    else if (sellFlow && !buyFlow) parts.push('매도압력');
    else if (buyFlow && sellFlow) parts.push('수급혼조');
    else if (intel.tapeLabelKo && intel.tapeLabelKo !== '체결없음' && intel.tapeLabelKo !== '표본부족') {
      parts.push(intel.tapeLabelKo);
    }
  } else if (expectBear) {
    if (sellFlow && !buyFlow) parts.push('매도유입');
    else if (buyFlow && !sellFlow) parts.push('매수압력');
    else if (buyFlow && sellFlow) parts.push('수급혼조');
    else if (intel.tapeLabelKo && intel.tapeLabelKo !== '체결없음' && intel.tapeLabelKo !== '표본부족') {
      parts.push(intel.tapeLabelKo);
    }
  } else if (intel.tapeLabelKo && intel.tapeLabelKo !== '체결없음') {
    parts.push(intel.tapeLabelKo);
  }

  if (intel.mtfAligned && intel.mtfScore >= 2 && parts.length < 4) {
    parts.push(intel.mtfScore >= 3 ? 'MTF강일치' : 'MTF일치');
  } else if (!intel.mtfAligned && intel.mtfScore >= 2 && parts.length < 4) {
    parts.push('MTF역');
  }

  if (intel.phaseAligned && intel.phaseProbPct != null && parts.length < 4) {
    parts.push(`페${intel.phaseProbPct}`);
  }

  if (opts?.learningKo && parts.length < 4) {
    parts.push(opts.learningKo);
  }

  return parts.slice(0, 4).join('·');
}

/** zone 면 전체 라벨 — 기본명·lifecycle·AI 판단 */
export function formatMirageZoneFaceLabel(
  role: ZoneRole,
  base: string,
  intel: MirageZoneProactiveIntel,
  opts?: { lifecycleKo?: string | null; learningKo?: string | null; deepParts?: string[] }
): string {
  const ai = buildMirageZoneAiFaceLabel(role, intel, {
    learningKo: opts?.learningKo,
    deepParts: opts?.deepParts,
  });
  const chunks = [base || '존'];
  if (opts?.lifecycleKo) chunks.push(opts.lifecycleKo);
  chunks.push(ai);
  return chunks.join('·');
}

export function stampMirageZoneIntelOnOverlay(
  raw: OverlayItem,
  role: ZoneRole,
  intel: MirageZoneProactiveIntel,
  opts?: {
    lifecycleKo?: string | null;
    learningKo?: string | null;
    deepParts?: string[];
    faceLang?: MirageZoneFaceLang;
    priorTooltip?: string;
    compact?: boolean;
  }
): OverlayItem {
  const base = mirageZoneBaseCaption(raw);
  const lifecycleKo =
    opts?.lifecycleKo ?? extractMirageZoneLifecycleKo(String(raw.label || ''));
  const extra = String(raw.overlayZoneExtraClass || '')
    .trim()
    .split(/\s+/)
    .filter((c) => c && !c.startsWith('merged-ares-mlsp-tv-intel-'));
  extra.push(intel.stateClass);

  if (opts?.compact === false) {
    const label = formatMirageZoneFaceLabel(role, base, intel, {
      lifecycleKo,
      learningKo: opts?.learningKo,
      deepParts: opts?.deepParts,
    });
    const prior = String(opts?.priorTooltip || raw.labelTooltip || '').trim();
    return {
      ...raw,
      label,
      zoneFaceBase: undefined,
      zoneFaceSignal: undefined,
      labelTooltip: prior
        ? `${prior} · ${intel.detailKo}`
        : `${intel.detailKo} · 조건부 참고`,
      overlayZoneExtraClass: extra.join(' '),
    };
  }

  const stamped = applyMirageZoneFaceCompactFields(raw, role, base, intel, {
    lifecycleKo,
    learningKo: opts?.learningKo,
    deepParts: opts?.deepParts,
    lang: opts?.faceLang ?? 'ko',
    priorTooltip: opts?.priorTooltip,
  });
  return {
    ...stamped,
    overlayZoneExtraClass: extra.join(' '),
  };
}

function zoneOverlapPx(aBot: number, aTop: number, bBot: number, bTop: number): number {
  return Math.min(aTop, bTop) - Math.max(aBot, bBot);
}

/** 형성 봉 이전만 — 선반영 (터치 1회·형성 이후도 보조 반영) */
export function scoreZoneHistoricalProactive(
  candles: Candle[],
  formationIdx: number,
  zoneTop: number,
  zoneBot: number,
  role: ZoneRole
): { reboundPct: number | null; holdPct: number | null; touches: number; bounces: number } {
  const expectBull = role === 'support' || role === 'ob_bull';
  const expectBear = role === 'resistance' || role === 'ob_bear';
  const end = Math.min(Math.max(formationIdx, 8), candles.length - 1);
  if (end < 8 || zoneTop <= zoneBot) {
    return { reboundPct: null, holdPct: null, touches: 0, bounces: 0 };
  }

  let touches = 0;
  let bounces = 0;
  let holds = 0;

  const scan = (from: number, to: number) => {
    for (let i = Math.max(2, from); i < to - 1; i++) {
      const c = candles[i]!;
      const wickIn =
        (c.low <= zoneTop && c.low >= zoneBot) ||
        (c.high >= zoneBot && c.high <= zoneTop) ||
        (c.close >= zoneBot && c.close <= zoneTop) ||
        (c.low <= zoneBot && c.high >= zoneTop);
      if (!wickIn) continue;
      touches++;

      const next = [candles[i + 1], candles[i + 2], candles[i + 3]].filter(Boolean) as Candle[];
      if (expectBull || role === 'neutral') {
        const held = c.close >= zoneBot;
        if (held) holds++;
        const bounced = next.some((n) => n.close > zoneTop || n.close > c.close * 1.0015);
        if (bounced && held) bounces++;
      }
      if (expectBear || role === 'neutral') {
        const held = c.close <= zoneTop;
        if (held) holds++;
        const rejected = next.some((n) => n.close < zoneBot || n.close < c.close * 0.9985);
        if (rejected && held) bounces++;
      }
    }
  };

  // 형성 전 + 형성 후(최근) 모두 스캔해 표본 확보
  scan(0, end);
  if (touches < 2 && end < candles.length - 3) {
    scan(Math.max(0, end - 2), candles.length);
  }

  // 그래도 부족하면 ATR 근접 반응으로 소프트 추정
  if (touches < 1) {
    const mid = (zoneTop + zoneBot) / 2;
    const atrLike = Math.max(zoneTop - zoneBot, mid * 0.004);
    for (let i = Math.max(2, candles.length - 60); i < candles.length - 1; i++) {
      const c = candles[i]!;
      if (Math.abs(c.low - mid) > atrLike * 1.8 && Math.abs(c.high - mid) > atrLike * 1.8) continue;
      touches++;
      const n1 = candles[i + 1];
      if (!n1) continue;
      if (expectBull && n1.close > c.close) bounces++;
      if (expectBear && n1.close < c.close) bounces++;
      if (expectBull && c.close >= zoneBot) holds++;
      if (expectBear && c.close <= zoneTop) holds++;
    }
  }

  const reboundPct = touches >= 1 ? Math.round((bounces / Math.max(touches, 1)) * 100) : null;
  const holdPct = touches >= 1 ? Math.round((holds / Math.max(touches, 1)) * 100) : null;
  return { reboundPct, holdPct, touches, bounces };
}

/** 캔들 테이커·등락 기반 존 수급 점수 (실시간 체결 폴백) */
function scoreZoneTapeFromCandles(
  candles: Candle[] | null | undefined,
  centerPrice: number,
  zoneTop: number,
  zoneBot: number,
  role: ZoneRole
): { tapeScore: number; tapeLabelKo: string } | null {
  if (!candles?.length || !(centerPrice > 0)) return null;
  const n = candles.length;
  const start = Math.max(0, n - 48);
  let buy = 0;
  let sell = 0;
  let nearBars = 0;
  const pad = Math.max((zoneTop - zoneBot) * 0.35, centerPrice * 0.0025);
  const lo = zoneBot - pad;
  const hi = zoneTop + pad;
  for (let i = start; i < n; i++) {
    const c = candles[i]!;
    const near =
      (c.low <= hi && c.high >= lo) ||
      Math.abs(c.close - centerPrice) / centerPrice < 0.012;
    if (!near) continue;
    nearBars++;
    const vol = Math.max(0, Number(c.volume) || 0);
    const taker = Number(c.takerBuyBaseVolume);
    if (Number.isFinite(taker) && taker >= 0 && vol > 0) {
      buy += taker;
      sell += Math.max(0, vol - taker);
    } else {
      const body = Math.abs(c.close - c.open);
      const range = Math.max(c.high - c.low, 1e-9);
      const bullShare = c.close >= c.open ? 0.55 + 0.35 * (body / range) : 0.45 - 0.35 * (body / range);
      buy += vol * clamp01(bullShare);
      sell += vol * (1 - clamp01(bullShare));
    }
  }
  if (nearBars < 2) {
    // 존 근처 봉이 적어도 최근 수급으로 대체
    for (let i = Math.max(0, n - 12); i < n; i++) {
      const c = candles[i]!;
      const vol = Math.max(0, Number(c.volume) || 0);
      const taker = Number(c.takerBuyBaseVolume);
      if (Number.isFinite(taker) && taker >= 0 && vol > 0) {
        buy += taker;
        sell += Math.max(0, vol - taker);
      } else if (c.close >= c.open) buy += vol;
      else sell += vol;
    }
  }
  const total = buy + sell;
  if (!(total > 0)) return null;
  const buyP = buy / total;
  const sellP = sell / total;
  const bias = ruleBasedTapeBias(buyP, sellP);
  return labelTapeForRole(bias.score, bias.label, role);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function labelTapeForRole(
  score: number,
  baseLabel: string,
  role: ZoneRole
): { tapeScore: number; tapeLabelKo: string } {
  const expectBull = role === 'support' || role === 'ob_bull';
  const expectBear = role === 'resistance' || role === 'ob_bear';
  let tapeLabelKo = baseLabel;
  if (expectBull && score >= 58) tapeLabelKo = '매수우세';
  else if (expectBear && score <= 42) tapeLabelKo = '매도우세';
  else if (expectBull && score <= 42) tapeLabelKo = '매도압력';
  else if (expectBear && score >= 58) tapeLabelKo = '매수압력';
  else if (score >= 55) tapeLabelKo = '매수우세';
  else if (score <= 45) tapeLabelKo = '매도우세';
  else tapeLabelKo = '수급혼조';
  return { tapeScore: score, tapeLabelKo };
}

export function scoreZoneExchangeTape(
  snapshot: MirageZoneExchangeSnapshot | null | undefined,
  centerPrice: number,
  role: ZoneRole,
  opts?: { candles?: Candle[] | null; zoneTop?: number; zoneBot?: number }
): { tapeScore: number | null; tapeLabelKo: string } {
  const expectBull = role === 'support' || role === 'ob_bull';
  const expectBear = role === 'resistance' || role === 'ob_bear';
  const zoneTop = opts?.zoneTop ?? centerPrice * 1.0035;
  const zoneBot = opts?.zoneBot ?? centerPrice * 0.9965;

  if (snapshot?.trades?.length && centerPrice > 0) {
    // 좁은 구간 → 넓은 구간 순으로 표본 확보
    for (const pct of [0.0035, 0.007, 0.012, 0.02]) {
      const z = tradesAtPriceZone(snapshot.trades, centerPrice, pct);
      if (z.tradeCount >= 3) {
        const bias = ruleBasedTapeBias(z.buyPressure, z.sellPressure);
        return labelTapeForRole(bias.score, bias.label, role);
      }
    }
    // 존 체결이 적어도 전체 스냅샷 수급으로 정상 점수
    if (
      Number.isFinite(snapshot.buyPressure) &&
      Number.isFinite(snapshot.sellPressure) &&
      snapshot.buyPressure + snapshot.sellPressure > 0
    ) {
      const bias = ruleBasedTapeBias(snapshot.buyPressure, snapshot.sellPressure);
      return labelTapeForRole(bias.score, bias.label, role);
    }
  }

  const fromCandles = scoreZoneTapeFromCandles(
    opts?.candles,
    centerPrice,
    zoneTop,
    zoneBot,
    role
  );
  if (fromCandles) return fromCandles;

  // 최후: 역할 중립 기본값(표본부족 문구 대신 정상 라벨)
  if (expectBull) return { tapeScore: 52, tapeLabelKo: '수급관찰' };
  if (expectBear) return { tapeScore: 48, tapeLabelKo: '수급관찰' };
  return { tapeScore: 50, tapeLabelKo: '수급혼조' };
}

export function scoreZoneOrderbookDepth(
  snapshot: MirageZoneExchangeSnapshot | null | undefined,
  centerPrice: number,
  role: ZoneRole
): { depthLabelKo: string; bidAskBiasKo: string } {
  const ob = snapshot?.orderbook;
  if (!ob?.bids?.length || !ob.asks?.length || !(centerPrice > 0)) {
    return { depthLabelKo: '호가—', bidAskBiasKo: '균형' };
  }
  const pct = 0.0035;
  const d = getOrderbookDepthAtPrice(ob, centerPrice, pct);
  const label = orderbookDepthLabel(ob, centerPrice, pct);
  const depthLabelKo =
    label === 'many' ? '호가풍부' : label === 'few' ? '호가얕음' : '호가보통';
  const ratio = d.bidQty / Math.max(d.askQty, 1e-9);
  const expectBull = role === 'support' || role === 'ob_bull';
  const expectBear = role === 'resistance' || role === 'ob_bear';
  let bidAskBiasKo = '균형';
  if (ratio >= 1.2 && expectBull) bidAskBiasKo = '매수벽';
  else if (ratio <= 0.83 && expectBear) bidAskBiasKo = '매도벽';
  else if (ratio >= 1.35) bidAskBiasKo = '매수우세';
  else if (ratio <= 0.74) bidAskBiasKo = '매도우세';
  return { depthLabelKo, bidAskBiasKo };
}

export function scoreZoneVolumePhase(
  phase: VolumePhaseCurrentMatch | null | undefined,
  role: ZoneRole,
  opts?: { candles?: Candle[] | null; zoneTop?: number; zoneBot?: number }
): { phaseProbPct: number | null; phaseLabelKo: string; phaseAligned: boolean } {
  const expectBull = role === 'support' || role === 'ob_bull';
  const expectBear = role === 'resistance' || role === 'ob_bear';

  if (phase) {
    const h = phase.horizons.find((x) => x.bars === phase.primaryHorizon) ?? phase.horizons[0];
    // sampleCount 1 이상이면 사용 (기존 3 미만 → 표본부족 제거)
    if (h && h.sampleCount >= 1) {
      const prob = Math.round(h.probFavorable * 100);
      const bullFav = phase.eventType === 'RANGE_ACC';
      const bearFav = phase.eventType === 'RANGE_DIST';
      const aligned =
        (expectBull && bullFav) || (expectBear && bearFav) || role === 'neutral';
      const phaseLabelKo = aligned
        ? `${phase.label || '국면'} ${prob}%`
        : `${phase.label || '국면'} 역 ${prob}%`;
      return { phaseProbPct: prob, phaseLabelKo, phaseAligned: aligned };
    }
    // 표본 0이어도 이벤트 타입으로 방향 제시
    if (phase.eventType === 'RANGE_ACC' || phase.eventType === 'RANGE_DIST') {
      const bullFav = phase.eventType === 'RANGE_ACC';
      const aligned = (expectBull && bullFav) || (expectBear && !bullFav) || role === 'neutral';
      const prob = Math.round(
        clamp01(phase.horizons[0]?.probFavorable ?? (bullFav ? 0.58 : 0.42)) * 100
      );
      return {
        phaseProbPct: prob,
        phaseLabelKo: aligned
          ? `${phase.label || (bullFav ? '매집' : '분산')} ${prob}%`
          : `${phase.label || '국면'} 역 ${prob}%`,
        phaseAligned: aligned,
      };
    }
    if (phase.scenarioKo) {
      return {
        phaseProbPct: 55,
        phaseLabelKo: phase.scenarioKo.slice(0, 28),
        phaseAligned: true,
      };
    }
  }

  // 캔들 거래량 국면 폴백
  const candles = opts?.candles;
  if (candles && candles.length >= 20) {
    const n = candles.length;
    const slice = candles.slice(Math.max(0, n - 24));
    let upVol = 0;
    let downVol = 0;
    for (const c of slice) {
      const v = Math.max(0, Number(c.volume) || 0);
      if (c.close >= c.open) upVol += v;
      else downVol += v;
    }
    const total = upVol + downVol;
    if (total > 0) {
      const upShare = upVol / total;
      const bullFav = upShare >= 0.52;
      const prob = Math.round((bullFav ? upShare : 1 - upShare) * 100);
      const aligned =
        (expectBull && bullFav) || (expectBear && !bullFav) || role === 'neutral';
      return {
        phaseProbPct: prob,
        phaseLabelKo: aligned
          ? `${bullFav ? '매집우세' : '분산우세'} ${prob}%`
          : `${bullFav ? '매집' : '분산'} 역 ${prob}%`,
        phaseAligned: aligned,
      };
    }
  }

  return {
    phaseProbPct: 50,
    phaseLabelKo: expectBull ? '국면관찰·지지' : expectBear ? '국면관찰·저항' : '국면관찰',
    phaseAligned: false,
  };
}

export function scoreZoneMtfAlignment(params: {
  chartTimeframe: string;
  center: number;
  top: number;
  bot: number;
  role: ZoneRole;
  keyZones?: MirageZoneKeyZoneRef[];
  criticalZones?: MirageZoneCriticalZoneRef[];
  vrvp?: { poc?: number | null; vaLow?: number | null; vaHigh?: number | null } | null;
  mtfRows?: MirageZoneMtfRowRef[];
}): { mtfScore: number; mtfLabelKo: string; mtfAligned: boolean; detailParts: string[] } {
  const {
    chartTimeframe,
    center,
    top,
    bot,
    role,
    keyZones = [],
    criticalZones = [],
    vrvp,
    mtfRows = [],
  } = params;
  const tf = normalizeChartTimeframe(chartTimeframe);
  const expectBull = role === 'support' || role === 'ob_bull';
  const expectBear = role === 'resistance' || role === 'ob_bear';
  let score = 0;
  const detailParts: string[] = [];
  const htfHits: string[] = [];

  for (const h of criticalZones) {
    if (zoneOverlapPx(bot, top, h.bot, h.top) <= 0) continue;
    const htf = h.htfLabel ? String(h.htfLabel) : null;
    const tier = h.tier === 'S' ? 'S' : '';
    if (htf) htfHits.push(`${htf}${tier}`);
    if ((expectBull && h.kind === 'demand') || (expectBear && h.kind === 'supply')) {
      score += h.tier === 'S' ? 2 : 1;
      detailParts.push(`HTF ${htf ?? 'zone'} ${h.labelKo ?? h.kind} 겹침`);
    }
  }

  for (const k of keyZones) {
    if (center < k.bot || center > k.top) continue;
    if ((expectBull && k.kind === 'demand') || (expectBear && k.kind === 'supply')) {
      score += 1;
      detailParts.push(`핵심 ${k.labelKo ?? k.kind}${k.bouncePct ? ` 반등${k.bouncePct}%` : ''}`);
    }
  }

  if (vrvp?.poc != null && center > 0) {
    const pocDist = Math.abs(vrvp.poc - center) / center;
    if (pocDist < 0.004) {
      score += 1;
      detailParts.push('VRVP POC 겹침');
    }
    if (vrvp.vaLow != null && vrvp.vaHigh != null && center >= vrvp.vaLow && center <= vrvp.vaHigh) {
      score += 1;
      detailParts.push('VRVP VA 내');
    }
  }

  let mtfDirHits = 0;
  for (const row of mtfRows) {
    if (row.tf === tf) continue;
    const dir = row.direction;
    if (expectBull && dir === 'LONG') mtfDirHits++;
    if (expectBear && dir === 'SHORT') mtfDirHits++;
    if (dir === 'LONG' || dir === 'SHORT') {
      const w = Number(row.longScore ?? 0) - Number(row.shortScore ?? 0);
      if (expectBull && w > 4) mtfDirHits++;
      if (expectBear && w < -4) mtfDirHits++;
    }
  }
  if (mtfDirHits >= 2) {
    score += 1;
    detailParts.push(`MTF ${mtfDirHits}TF 방향일치`);
  }

  const mtfAligned = score >= 2 || (score >= 1 && htfHits.length > 0);
  let mtfLabelKo = 'MTF—';
  if (htfHits.length) mtfLabelKo = `MTF${htfHits.slice(0, 2).join('+')}`;
  else if (score >= 2) mtfLabelKo = `MTF${score}`;
  else if (score === 1) mtfLabelKo = 'MTF1';

  return { mtfScore: score, mtfLabelKo, mtfAligned, detailParts };
}

function formatHistSummaryKo(
  role: ZoneRole,
  hist: { reboundPct: number | null; holdPct: number | null; touches: number; bounces: number }
): string {
  const expectBear = role === 'resistance' || role === 'ob_bear';
  if (hist.touches >= 1 && hist.reboundPct != null) {
    const verb = expectBear ? '위막힘' : '반등';
    return `과거 ${hist.touches}회 터치 중 ${hist.bounces}회 ${verb} (${hist.reboundPct}%)`;
  }
  if (hist.touches >= 1 && hist.holdPct != null) {
    const verb = expectBear ? '저항 유지' : '지지 유지';
    return `과거 ${hist.touches}회 터치 중 ${verb} ${hist.holdPct}%`;
  }
  return expectBear
    ? '최근 반응 관찰 중 — 위 압력·거부 확인'
    : '최근 반응 관찰 중 — 받침·반등 확인';
}

function buildShortTag(
  role: ZoneRole,
  hist: ReturnType<typeof scoreZoneHistoricalProactive>,
  tape: ReturnType<typeof scoreZoneExchangeTape>,
  depth: ReturnType<typeof scoreZoneOrderbookDepth>,
  phase: ReturnType<typeof scoreZoneVolumePhase>,
  mtf: ReturnType<typeof scoreZoneMtfAlignment>
): string {
  const expectBear = role === 'resistance' || role === 'ob_bear';
  const parts: string[] = [];

  if (hist.reboundPct != null && hist.touches >= 2) {
    parts.push(
      expectBear
        ? `막힘${hist.reboundPct}%(${hist.touches})`
        : `반등${hist.reboundPct}%(${hist.touches})`
    );
  } else if (hist.reboundPct != null) {
    parts.push(expectBear ? `막힘${hist.reboundPct}%` : `반등${hist.reboundPct}%`);
  } else if (hist.holdPct != null) {
    parts.push(expectBear ? `저항${hist.holdPct}%` : `지지${hist.holdPct}%`);
  }

  if (phase.phaseProbPct != null && phase.phaseAligned && parts.length < 2) {
    parts.push(`페${phase.phaseProbPct}`);
  }

  if (mtf.mtfAligned && parts.length < 2) {
    parts.push(mtf.mtfScore >= 2 ? `MTF${mtf.mtfScore}` : 'MTF');
  }

  if (parts.length < 2 && depth.bidAskBiasKo !== '균형') {
    parts.push(depth.bidAskBiasKo);
  } else if (parts.length < 2 && depth.depthLabelKo !== '호가—') {
    parts.push(depth.depthLabelKo);
  }

  if (parts.length < 2 && tape.tapeScore != null) {
    parts.push(tape.tapeLabelKo);
  }

  if (!parts.length) return '분석중';
  return parts.slice(0, 2).join('·');
}

function buildProactiveIntel(
  role: ZoneRole,
  hist: ReturnType<typeof scoreZoneHistoricalProactive>,
  tape: ReturnType<typeof scoreZoneExchangeTape>,
  depth: ReturnType<typeof scoreZoneOrderbookDepth>,
  phase: ReturnType<typeof scoreZoneVolumePhase>,
  mtf: ReturnType<typeof scoreZoneMtfAlignment>,
  zoneTop: number,
  zoneBot: number,
  currentPrice?: number | null,
  deepParts?: string[]
): MirageZoneProactiveIntel {
  const histSummaryKo = formatHistSummaryKo(role, hist);
  const parts: string[] = [histSummaryKo];

  const cp = currentPrice;
  if (cp != null && cp > 0 && zoneTop > zoneBot) {
    const center = (zoneTop + zoneBot) / 2;
    const distPct = (Math.abs(cp - center) / center) * 100;
    if (distPct <= 2) {
      parts.push(`접근중 ${distPct.toFixed(1)}% · 체결·호가 가중`);
    }
  }

  if (tape.tapeScore != null) {
    parts.push(`체결 ${tape.tapeLabelKo} (${tape.tapeScore})`);
  }

  if (depth.depthLabelKo !== '호가—') {
    parts.push(`호가 ${depth.depthLabelKo} · ${depth.bidAskBiasKo}`);
  }

  if (phase.phaseProbPct != null) {
    parts.push(
      `볼륨페이즈 ${phase.phaseLabelKo}${phase.phaseAligned ? '' : ' · 역방향'}`
    );
  }

  parts.push(...mtf.detailParts);

  if (deepParts?.length) {
    parts.push(`심층 ${deepParts.join('·')}`);
  }

  if (!parts.length) {
    parts.push('형성 직후 — 통계 수집 중');
  }
  parts.push('선반영 · 검증 필요');

  const intel: MirageZoneProactiveIntel = {
    reboundPct: hist.reboundPct,
    holdPct: hist.holdPct,
    touches: hist.touches,
    bounces: hist.bounces,
    histSummaryKo,
    invalidationPrice: mirageZoneInvalidationPrice(zoneTop, zoneBot, role),
    tapeScore: tape.tapeScore,
    tapeLabelKo: tape.tapeLabelKo,
    depthLabelKo: depth.depthLabelKo,
    bidAskBiasKo: depth.bidAskBiasKo,
    phaseProbPct: phase.phaseProbPct,
    phaseLabelKo: phase.phaseLabelKo,
    phaseAligned: phase.phaseAligned,
    mtfScore: mtf.mtfScore,
    mtfLabelKo: mtf.mtfLabelKo,
    mtfAligned: mtf.mtfAligned,
    tagKo: '',
    deepFaceKo: deepParts?.length ? deepParts : undefined,
    detailKo: parts.join(' · '),
    stateClass: 'merged-ares-mlsp-tv-intel-proactive',
  };
  intel.tagKo = buildMirageZoneAiFaceLabel(role, intel, { deepParts });
  return intel;
}

export function buildMirageZoneProactiveIntel(
  item: OverlayItem,
  candles: Candle[],
  ctx?: MirageZoneIntelContext | null
): MirageZoneProactiveIntel | null {
  const p1 = Number(item.price1);
  const p2 = Number(item.price2);
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return null;

  const zoneTop = Math.max(p1, p2);
  const zoneBot = Math.min(p1, p2);
  const center = (zoneTop + zoneBot) / 2;
  const tForm = parseMirageZoneFormationTime(item) ?? Number(item.time1);
  const formationIdx = candleIndexAtOrBefore(
    candles,
    Number(snapMergedOverlayTimeToCandles(tForm, candles))
  );
  const role = inferMirageZoneRole(item);
  const chartTf = ctx?.chartTimeframe ?? '4h';

  const hist = scoreZoneHistoricalProactive(candles, formationIdx, zoneTop, zoneBot, role);
  const tape = scoreZoneExchangeTape(ctx?.snapshot, center, role, {
    candles,
    zoneTop,
    zoneBot,
  });
  const depth = scoreZoneOrderbookDepth(ctx?.snapshot, center, role);
  const phase = scoreZoneVolumePhase(ctx?.volumePhase, role, {
    candles,
    zoneTop,
    zoneBot,
  });
  const mtf = scoreZoneMtfAlignment({
    chartTimeframe: chartTf,
    center,
    top: zoneTop,
    bot: zoneBot,
    role,
    keyZones: ctx?.keyZones,
    criticalZones: ctx?.criticalZones,
    vrvp: ctx?.vrvp,
    mtfRows: ctx?.mtfRows,
  });

  const deepParts = buildMirageZoneDeepFaceParts(role, zoneTop, zoneBot, ctx?.deep);

  return buildProactiveIntel(
    role,
    hist,
    tape,
    depth,
    phase,
    mtf,
    zoneTop,
    zoneBot,
    ctx?.currentPrice,
    deepParts
  );
}

export function applyMirageZoneProactiveIntel(
  overlays: OverlayItem[],
  candles: Candle[],
  ctx?: MirageZoneIntelContext | null
): OverlayItem[] {
  if (candles.length < 8) return overlays;
  return overlays.map((raw) => {
    if (!isMergedDeskMirageTvZoneOverlay(raw) || String(raw.kind) !== 'zone') return raw;
    const intel = buildMirageZoneProactiveIntel(raw, candles, ctx);
    if (!intel) return raw;
    const role = inferMirageZoneRole(raw);
    return stampMirageZoneIntelOnOverlay(raw, role, intel, {
      faceLang: ctx?.faceLang,
    });
  });
}

export function mirageZonesFromOverlays(overlays: OverlayItem[]): MirageZoneIntelRequestZone[] {
  const out: MirageZoneIntelRequestZone[] = [];
  const seen = new Set<string>();
  for (const o of overlays) {
    const id = String(o.id || '');
    if (!id || seen.has(id)) continue;
    const kind = String(o.kind || '');
    const extra = String(o.overlayZoneExtraClass || '');
    const isMirage = isMergedDeskMirageTvZoneOverlay(o) && kind === 'zone';
    const isHot =
      id.startsWith('merged-desk-hotzone-') ||
      extra.includes('merged-desk-hotzone-entry') ||
      extra.includes('merged-desk-hotzone-zone') ||
      extra.includes('merged-desk-hotzone-pair');
    const isSupportLike =
      extra.includes('merged-desk-projected-support') ||
      extra.includes('merged-desk-downside-plan-support') ||
      extra.includes('merged-ares-bounce-path');
    if (!isMirage && !isHot && !isSupportLike) continue;
    if (
      kind !== 'zone' &&
      kind !== 'demandZone' &&
      kind !== 'supplyZone'
    ) {
      continue;
    }
    const p1 = Number(o.price1);
    const p2 = Number(o.price2);
    if (!Number.isFinite(p1) || !Number.isFinite(p2)) continue;
    const top = Math.max(p1, p2);
    const bot = Math.min(p1, p2);
    if (!(top > bot) || !(bot > 0)) continue;
    seen.add(id);
    out.push({
      id,
      center: (top + bot) / 2,
      top,
      bot,
      role: inferMirageZoneRole(o),
    });
  }
  return out;
}

export function mergeExchangeIntelIntoOverlays(
  overlays: OverlayItem[],
  intelById: Record<string, MirageZoneProactiveIntel>,
  opts?: { faceLang?: MirageZoneFaceLang; compact?: boolean }
): OverlayItem[] {
  return overlays.map((raw) => {
    const intel = intelById[String(raw.id || '')];
    if (!intel) return raw;
    const role = inferMirageZoneRole(raw);
    const prior = String(raw.labelTooltip || '').trim();
    return stampMirageZoneIntelOnOverlay(raw, role, intel, {
      faceLang: opts?.faceLang ?? 'ko',
      compact: opts?.compact !== false,
      priorTooltip: prior ? `${prior} · 거래소보강` : '거래소보강',
    });
  });
}
