/**
 * 통합·분석 — 파란·빨간 띠 눌림 진입 zone.
 *
 * 상위(장기) 채널이 방향을 정하고, 각 채널의 되돌림 레일이 타점 자리를 정한다.
 * 기관밴드 방향 · $$$$ 머니존 겹침 · 로켓 방향 · 거래량(흡수·RVOL·테이커) ·
 * 단기∩장기 중착 복도를 합류 점수로 합산해 주 타점 1개(+역추세 보조 1개)를 뽑는다.
 * 확정 수익·승률이 아니라 조건부 근거 점수다.
 */
import type { Candle, OverlayItem } from '@/types';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import type {
  MergedDeskChannelGeom,
  MergedDeskChannelHorizon,
} from '@/lib/mergedDeskBlueRedChannels';
import type { MonthDeskMoneyZone, MonthDeskMoneyZoneHud } from '@/lib/monthDeskMoneyZone';
import { mergedWorkCandles } from '@/lib/mergedAnalysisOverlayTimes';
import { gradeMergedDeskRbBounceStrength } from '@/lib/mergedDeskRbBounceStrength';
import {
  candleBodyRatioOfRange,
  sanitizeChartCandlesForSeries,
  smaTotalVolumeAt,
  volumeCandleDirectionBias,
} from '@/lib/volumeHistogramIntelligence';
import {
  computeInstitutionalSuperTrendMeta,
  getLastInstitutionalBandEdges,
} from '@/lib/institutionalSuperBand';
import type { MergedDeskRbFullConfluencePack } from '@/lib/mergedDeskRbFullConfluence';

export type ChannelPullbackSide = 'LONG' | 'SHORT';
export type ChannelPullbackStatus = 'WAIT' | 'NEAR' | 'READY' | 'INVALID';

export type ChannelPullbackReason = {
  ko: string;
  points: number;
  ok: boolean;
};

export type MergedDeskChannelPullbackEntry = {
  side: ChannelPullbackSide;
  horizon: MergedDeskChannelHorizon;
  horizonKo: string;
  /** 상위(장기) 채널 방향과 같은 편인지 — 역추세면 false */
  alignedWithBias: boolean;
  /** 주 타점 여부. 보조는 zone만 그리고 가격선은 내지 않는다 */
  primary: boolean;
  /** 눌림 타점 zone */
  zoneTop: number;
  zoneBot: number;
  zoneMid: number;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  invalidation: number;
  rr: number;
  /** 0~100 합류 점수 */
  score: number;
  grade: 'A' | 'B' | 'C';
  status: ChannelPullbackStatus;
  statusKo: string;
  labelKo: string;
  /** 면 보조 라벨 (도달·등급 등) */
  signalKo?: string;
  tooltipKo: string;
  reasons: ChannelPullbackReason[];
  /** 현재가에서 zone 중심까지 ATR 배수 */
  distanceAtr: number;
  /** zone 좌측 시작 시각(되돌림 시작 봉) */
  timeStart: number;
  timeEnd: number;
};

export type MergedDeskChannelPullbackEntryPack = {
  overlays: OverlayItem[];
  priceLines: AtlasPulsePriceLine[];
  /** 주 타점 */
  entry: MergedDeskChannelPullbackEntry | null;
  /** 주 + 보조(역추세) 전부 */
  entries: MergedDeskChannelPullbackEntry[];
  /** 상위(장기) 채널이 정의한 방향 */
  biasSide: ChannelPullbackSide | null;
  biasKo: string;
  summaryKo: string;
};

const EMPTY_PACK: MergedDeskChannelPullbackEntryPack = {
  overlays: [],
  priceLines: [],
  entry: null,
  entries: [],
  biasSide: null,
  biasKo: '',
  summaryKo: '눌림 타점 — 근거 부족',
};

function work(candles: Candle[], timeframe: string): Candle[] {
  return sanitizeChartCandlesForSeries(mergedWorkCandles(candles, timeframe), timeframe);
}

function atrOf(candles: Candle[], period = 14): number {
  const n = candles.length;
  if (n < 3) return 0;
  let sum = 0;
  let cnt = 0;
  for (let i = Math.max(1, n - period); i < n; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    cnt += 1;
  }
  return cnt ? sum / cnt : 0;
}

function fmtPrice(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return '—';
  if (p >= 1000) return p.toFixed(0);
  if (p >= 1) return p.toFixed(1);
  return p.toFixed(4);
}

/** 상위 구조 채널 — 장기 우선, 없으면 품질 최고 */
function pickBiasGeom(geoms: MergedDeskChannelGeom[]): MergedDeskChannelGeom | null {
  if (!geoms.length) return null;
  return (
    geoms.find((g) => g.horizon === 'long') ??
    [...geoms].sort((a, b) => b.quality - a.quality)[0] ??
    null
  );
}

/** 단기∩장기 tip 겹침 구간 */
function confluenceRange(geoms: MergedDeskChannelGeom[]): { top: number; bot: number } | null {
  const s = geoms.find((g) => g.horizon === 'short');
  const l = geoms.find((g) => g.horizon === 'long');
  if (!s || !l) return null;
  const top = Math.min(s.tipUpper, l.tipUpper);
  const bot = Math.max(s.tipLower, l.tipLower);
  return top > bot ? { top, bot } : null;
}

/** zone과 겹치는 같은 방향 머니 풀 */
function overlappingMoneyPool(
  hud: MonthDeskMoneyZoneHud | null | undefined,
  side: ChannelPullbackSide,
  top: number,
  bot: number,
  atr: number
): { pool: MonthDeskMoneyZone; overlap: boolean } | null {
  if (!hud) return null;
  const pools = [hud.long, hud.short, ...(hud.pools ?? [])].filter(
    (p): p is MonthDeskMoneyZone => !!p && p.side === side
  );
  let near: { pool: MonthDeskMoneyZone; overlap: boolean } | null = null;
  for (const p of pools) {
    const pTop = Math.max(p.priceTop, p.priceBot);
    const pBot = Math.min(p.priceTop, p.priceBot);
    if (pTop >= bot && pBot <= top) return { pool: p, overlap: true };
    const gap = pBot > top ? pBot - top : bot - pTop;
    if (atr > 0 && gap <= atr * 1.5 && !near) near = { pool: p, overlap: false };
  }
  return near;
}

/** 최근 봉에서 zone 근처 거래량 근거 (흡수·RVOL·테이커) */
function volumeEvidence(
  candles: Candle[],
  side: ChannelPullbackSide,
  top: number,
  bot: number,
  lookback = 14
): { rvol: number; absorption: boolean; takerAligned: boolean } {
  const n = candles.length;
  let rvolMax = 0;
  let absorption = false;
  let takerAligned = false;
  for (let i = Math.max(1, n - lookback); i < n; i++) {
    const c = candles[i];
    if (!c) continue;
    /** zone에 닿은 봉만 근거로 인정 */
    if (c.low > top || c.high < bot) continue;
    const sma = smaTotalVolumeAt(candles, i, 20);
    const rvol = sma > 0 ? Math.max(0, Number(c.volume) || 0) / sma : 0;
    if (rvol > rvolMax) rvolMax = rvol;
    const bodyRatio = candleBodyRatioOfRange(c);
    if (rvol >= 1.35 && bodyRatio != null && bodyRatio <= 0.24) absorption = true;
    const vol = Math.max(0, Number(c.volume) || 0);
    const tb = Number((c as Candle & { takerBuyBaseVolume?: number }).takerBuyBaseVolume);
    if (vol > 0 && Number.isFinite(tb)) {
      const ratio = tb / vol;
      if (side === 'LONG' ? ratio >= 0.6 : ratio <= 0.4) takerAligned = true;
    } else if (volumeCandleDirectionBias(c) === (side === 'LONG' ? 'long' : 'short')) {
      takerAligned = true;
    }
  }
  return { rvol: rvolMax, absorption, takerAligned };
}

/** 되돌림이 시작된 봉 — zone에 마지막으로 닿은 지점, 없으면 최근 구간 */
function pullbackStartTime(
  candles: Candle[],
  top: number,
  bot: number,
  fallbackBars: number
): number {
  const n = candles.length;
  for (let i = n - 1; i >= Math.max(0, n - 80); i--) {
    const c = candles[i];
    if (!c) continue;
    if (c.low <= top && c.high >= bot) return Number(c.time);
  }
  const idx = Math.max(0, n - 1 - fallbackBars);
  return Number(candles[idx]?.time ?? candles[0]?.time ?? 0);
}

type BandContext = {
  dir: ChannelPullbackSide | null;
  edges: { upper: number; lower: number } | null;
};

/** 채널 1개 → 눌림 타점 후보 */
function buildCandidate(params: {
  candles: Candle[];
  geom: MergedDeskChannelGeom;
  atr: number;
  close: number;
  biasSide: ChannelPullbackSide | null;
  isBiasGeom: boolean;
  confluence: { top: number; bot: number } | null;
  band: BandContext;
  moneyHud?: MonthDeskMoneyZoneHud | null;
  rocketDirection?: ChannelPullbackSide | null;
}): MergedDeskChannelPullbackEntry | null {
  const { candles, geom, atr, close, biasSide, isBiasGeom, confluence, band } = params;

  const side: ChannelPullbackSide = geom.descending ? 'SHORT' : 'LONG';
  const width = Math.max(geom.width, atr * 0.8);
  const rail = side === 'LONG' ? geom.tipLower : geom.tipUpper;
  if (!Number.isFinite(rail) || rail <= 0) return null;

  /** 되돌림 타점 폭 — 채널 폭의 일부, ATR로 하한 */
  const bandW = Math.max(atr * 0.45, Math.min(width * 0.3, atr * 1.35));
  const zoneTop = side === 'LONG' ? rail + bandW * 0.9 : rail + bandW * 0.45;
  const zoneBot = side === 'LONG' ? rail - bandW * 0.45 : rail - bandW * 0.9;
  const zoneMid = (zoneTop + zoneBot) / 2;

  const entry = zoneMid;
  const slPad = Math.max(atr * 0.7, width * 0.12);
  const stopLoss = side === 'LONG' ? zoneBot - slPad : zoneTop + slPad;
  const invalidation =
    side === 'LONG' ? geom.tipLower - width * 0.35 : geom.tipUpper + width * 0.35;

  const tp1 = geom.tipMid;
  const tp2 = side === 'LONG' ? geom.tipUpper : geom.tipLower;
  const tp3 = side === 'LONG' ? geom.tipUpper + width * 0.6 : geom.tipLower - width * 0.6;

  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(tp2 - entry);
  const rr = risk > 0 ? reward / risk : 0;

  const reasons: ChannelPullbackReason[] = [];
  let score = 0;

  const qPts = Math.round((Math.max(0, Math.min(96, geom.quality)) / 96) * 20);
  score += qPts;
  reasons.push({
    ko: `${geom.horizonKo}채널 품질 ${geom.quality} · 터치 상${geom.touchHigh}/하${geom.touchLow}`,
    points: qPts,
    ok: geom.quality >= 55,
  });

  const containment = geom.containment ?? 0;
  const structOk = containment >= 0.78 && geom.touchHigh >= 2 && geom.touchLow >= 2;
  const structPts = structOk ? 9 : containment >= 0.6 ? 4 : 0;
  score += structPts;
  reasons.push({
    ko: `구조 포함률 ${(containment * 100).toFixed(0)}%`,
    points: structPts,
    ok: structOk,
  });

  /** 상위 구조 정렬 — 장기 채널이 방향을 정한다 */
  const alignedWithBias = biasSide == null || side === biasSide;
  let mtfPts = 0;
  let mtfKo: string;
  if (biasSide == null) {
    mtfKo = '상위 채널 없음 — 단일 채널 판단';
  } else if (isBiasGeom) {
    mtfPts = 8;
    mtfKo = '상위(장기) 채널 본체 — 구조 기준';
  } else if (alignedWithBias) {
    mtfPts = 14;
    mtfKo = `상위(장기) ${biasSide === 'LONG' ? '상승' : '하락'} 정렬 — 상위 구조 + 하위 타이밍`;
  } else {
    mtfPts = -16;
    mtfKo = `상위(장기) ${biasSide === 'LONG' ? '상승' : '하락'} 역행 — 역추세 눌림`;
  }
  score += mtfPts;
  reasons.push({ ko: mtfKo, points: mtfPts, ok: alignedWithBias });

  const inConfluence =
    !!confluence && zoneTop >= confluence.bot && zoneBot <= confluence.top;
  const confPts = inConfluence ? 8 : 0;
  score += confPts;
  reasons.push({
    ko: inConfluence ? '단기∩장기 중착 복도 안' : '중착 복도 밖',
    points: confPts,
    ok: inConfluence,
  });

  const bandAligned = band.dir === side;
  let bandPts = bandAligned ? 15 : band.dir ? -8 : 0;
  const bandEdgeInZone =
    !!band.edges &&
    ((band.edges.lower <= zoneTop && band.edges.lower >= zoneBot) ||
      (band.edges.upper <= zoneTop && band.edges.upper >= zoneBot));
  if (bandAligned && bandEdgeInZone) bandPts += 6;
  score += bandPts;
  reasons.push({
    ko: band.dir
      ? `기관밴드 ${band.dir === 'LONG' ? '롱' : '숏'}${bandAligned ? ' 정렬' : ' 역행'}${bandEdgeInZone ? ' · 밴드선 zone 내' : ''}`
      : '기관밴드 판정 없음',
    points: bandPts,
    ok: bandAligned,
  });

  const money = overlappingMoneyPool(params.moneyHud, side, zoneTop, zoneBot, atr);
  const moneyPts = money?.overlap ? 15 : money ? 7 : 0;
  score += moneyPts;
  reasons.push({
    ko: money
      ? `$$$$ ${side === 'LONG' ? '롱' : '숏'}존 ${money.overlap ? '겹침' : '근접'} · ${money.pool.headlineKo}`
      : '$$$$ 존 겹침 없음',
    points: moneyPts,
    ok: !!money?.overlap,
  });

  const rocketOk = params.rocketDirection === side;
  const rocketPts = rocketOk ? 9 : params.rocketDirection ? -5 : 0;
  score += rocketPts;
  reasons.push({
    ko: params.rocketDirection
      ? `로켓 ${params.rocketDirection === 'LONG' ? '🚀 롱' : '📉 숏'}${rocketOk ? ' 일치' : ' 반대'}`
      : '로켓 신호 없음',
    points: rocketPts,
    ok: rocketOk,
  });

  const vol = volumeEvidence(candles, side, zoneTop, zoneBot);
  let volPts = 0;
  if (vol.absorption) volPts += 10;
  if (vol.rvol >= 1.8) volPts += 4;
  if (vol.takerAligned) volPts += 4;
  score += volPts;
  reasons.push({
    ko: vol.absorption
      ? `zone 흡수 확인 · RVOL ${vol.rvol.toFixed(1)}×${vol.takerAligned ? ' · 테이커 일치' : ''}`
      : vol.rvol > 0
        ? `zone 거래량 RVOL ${vol.rvol.toFixed(1)}×`
        : 'zone 접촉 거래량 없음',
    points: volPts,
    ok: vol.absorption || vol.rvol >= 1.8,
  });

  const brokeAgainst =
    (side === 'LONG' && geom.breakout === 'down') || (side === 'SHORT' && geom.breakout === 'up');
  if (brokeAgainst) {
    const pen = Math.min(25, 10 + (geom.breakoutBars ?? 0) * 5);
    score -= pen;
    reasons.push({
      ko: `채널 ${side === 'LONG' ? '하단' : '상단'} 이탈 ${geom.breakoutBars ?? 0}봉 — 무효화 확인 필요`,
      points: -pen,
      ok: false,
    });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const distanceAtr = Math.abs(close - zoneMid) / atr;
  let status: ChannelPullbackStatus;
  if (brokeAgainst && (geom.breakoutBars ?? 0) >= 2) status = 'INVALID';
  else if (close <= zoneTop && close >= zoneBot) status = 'READY';
  else if (distanceAtr <= 1.5) status = 'NEAR';
  else status = 'WAIT';

  const statusKo =
    status === 'READY'
      ? '도달'
      : status === 'NEAR'
        ? '접근'
        : status === 'INVALID'
          ? '무효'
          : '대기';
  const grade: 'A' | 'B' | 'C' = score >= 72 ? 'A' : score >= 52 ? 'B' : 'C';
  const sideKo = side === 'LONG' ? '롱' : '숏';
  const strength = gradeMergedDeskRbBounceStrength({
    side,
    baseScore: score,
    status,
  });
  const labelKo =
    status === 'READY' || status === 'NEAR'
      ? strength.labelKo
      : `${geom.horizonKo}눌림${sideKo}${grade}`;
  const signalKo = `${geom.horizonKo}·${statusKo}·${strength.shortKo}·${grade}${score}`;

  const iEnd = candles.length - 1;
  const timeEnd = Number(candles[iEnd]!.time);
  const timeStart = pullbackStartTime(candles, zoneTop, zoneBot, 26);

  const tooltipKo = [
    `${geom.horizonKo}채널 ${side === 'LONG' ? '상승' : '하락'} — 눌림 ${sideKo} 타점`,
    `상태 ${statusKo} · 합류 ${score}점(${grade}) · 현재가에서 ${distanceAtr.toFixed(1)}ATR`,
    `zone ${fmtPrice(zoneBot)}~${fmtPrice(zoneTop)}`,
    `E ${fmtPrice(entry)} · SL ${fmtPrice(stopLoss)} · TP1 ${fmtPrice(tp1)} · TP2 ${fmtPrice(tp2)}`,
    `무효 ${fmtPrice(invalidation)} · R:R ≈ ${rr.toFixed(2)}`,
    '',
    ...reasons.map((r) => `${r.ok ? '○' : '×'} ${r.ko} (${r.points >= 0 ? '+' : ''}${r.points})`),
    '',
    '조건부 근거 점수 — 확정 수익·승률 아님. 마감 확인 후 대응.',
  ].join('\n');

  return {
    side,
    horizon: geom.horizon,
    horizonKo: geom.horizonKo,
    alignedWithBias,
    primary: false,
    zoneTop,
    zoneBot,
    zoneMid,
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    invalidation,
    rr,
    score,
    grade,
    status,
    statusKo,
    labelKo,
    signalKo,
    tooltipKo,
    reasons,
    distanceAtr,
    timeStart,
    timeEnd,
  };
}

function buildZoneOverlay(e: MergedDeskChannelPullbackEntry): OverlayItem {
  const isLong = e.side === 'LONG';
  const faceHex = isLong ? '#22C55E' : '#EF4444';
  const base = e.status === 'READY' ? 0.32 : e.status === 'NEAR' ? 0.24 : 0.16;
  const alpha = e.primary ? base : base * 0.55;
  const fill = isLong ? `rgba(34,197,94,${alpha})` : `rgba(239,68,68,${alpha})`;
  const label = e.primary ? e.labelKo : `보조${e.labelKo}`;
  const gradeCls =
    e.score >= 86 ? 'ultra' : e.score >= 70 ? 'strong' : e.score >= 55 ? 'mid' : 'weak';

  return {
    id: e.primary
      ? 'merged-desk-rb-pullback-entry-zone'
      : `merged-desk-rb-pullback-alt-${e.horizon}-zone`,
    kind: 'zone',
    label,
    zoneFaceBase: label,
    zoneFaceSignal: undefined,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: e.timeStart,
    time2: e.timeEnd,
    price1: e.zoneTop,
    price2: e.zoneBot,
    confidence: Math.max(20, Math.min(96, e.score)),
    color: fill,
    category: 'scenario',
    structureBias: isLong ? 'bullish' : 'bearish',
    zoneFillPreserve: true,
    zonePulse: e.primary && (e.status === 'READY' || e.status === 'NEAR'),
    lineDash: e.primary ? undefined : '5 4',
    overlayZoneExtraClass: [
      'merged-desk-rb-pullback-entry',
      'merged-desk-rb-channel',
      'merged-desk-rb-channel-keep',
      'merged-desk-money-zone-keep',
      'merged-desk-zone-pro-hero',
      'merged-desk-zone-label-on',
      `merged-desk-rb-bounce-grade--${gradeCls}`,
      isLong ? 'merged-desk-rb-pullback-long' : 'merged-desk-rb-pullback-short',
      `merged-desk-rb-pullback-${e.status.toLowerCase()}`,
      e.primary ? 'merged-desk-rb-pullback-primary' : 'merged-desk-rb-pullback-alt',
      e.alignedWithBias ? 'merged-desk-rb-pullback-aligned' : 'merged-desk-rb-pullback-counter',
      'merged-desk-zone-caption-clean',
    ].join(' '),
    labelTooltip: e.tooltipKo,
    lineLabelColor: faceHex,
    labelBackgroundColor: e.primary
      ? isLong
        ? 'rgba(6,78,59,0.94)'
        : 'rgba(127,29,29,0.94)'
      : 'rgba(30,41,59,0.85)',
    labelTextColor: '#f8fafc',
  };
}

function buildPriceLines(e: MergedDeskChannelPullbackEntry): AtlasPulsePriceLine[] {
  const faceHex = e.side === 'LONG' ? '#22C55E' : '#EF4444';
  return (
    [
      {
        price: e.entry,
        color: faceHex,
        title: `눌림진입E ${e.labelKo}`,
        lineWidth: 2 as const,
        lineStyle: 'solid' as const,
        axisLabel: true,
      },
      {
        price: e.stopLoss,
        color: '#F87171',
        title: '눌림손절SL',
        lineWidth: 1 as const,
        lineStyle: 'dashed' as const,
        axisLabel: true,
      },
      {
        price: e.tp1,
        color: '#38BDF8',
        title: '눌림익절TP1',
        lineWidth: 1 as const,
        lineStyle: 'dotted' as const,
        axisLabel: true,
      },
      {
        price: e.tp2,
        color: '#34D399',
        title: '눌림익절TP2',
        lineWidth: 1 as const,
        lineStyle: 'dotted' as const,
        axisLabel: true,
      },
      {
        price: e.invalidation,
        color: '#FBBF24',
        title: '눌림무효',
        lineWidth: 1 as const,
        lineStyle: 'dashed' as const,
        axisLabel: true,
      },
    ] satisfies AtlasPulsePriceLine[]
  ).filter((l) => Number.isFinite(l.price) && l.price > 0);
}

export function buildMergedDeskChannelPullbackEntryPack(params: {
  candles: Candle[];
  timeframe: string;
  geoms: MergedDeskChannelGeom[];
  moneyHud?: MonthDeskMoneyZoneHud | null;
  rocketDirection?: ChannelPullbackSide | null;
  /** 이 점수 미만이면 그리지 않음 */
  minScore?: number;
  /** 역추세 보조 타점도 그릴지 (기본 true) */
  showCounterTrend?: boolean;
  /** 파랑빨강띠 전면 합류(승률 아님) */
  fullConfluence?: MergedDeskRbFullConfluencePack | null;
}): MergedDeskChannelPullbackEntryPack {
  const { timeframe, geoms, moneyHud, rocketDirection } = params;
  const safe = work(params.candles, timeframe);
  if (safe.length < 30 || !geoms.length) return EMPTY_PACK;

  const iEnd = safe.length - 1;
  const close = Number(safe[iEnd]!.close);
  const atr = atrOf(safe, 14);
  if (!(close > 0) || !(atr > 0)) return EMPTY_PACK;

  const minScore = Math.max(0, Math.min(90, Number(params.minScore ?? 0)));
  const biasGeom = pickBiasGeom(geoms);
  const biasSide: ChannelPullbackSide | null = biasGeom
    ? biasGeom.descending
      ? 'SHORT'
      : 'LONG'
    : null;
  const biasKo = biasGeom
    ? `${biasGeom.horizonKo}채널 ${biasGeom.descending ? '하락' : '상승'} 기준`
    : '';
  const conf = confluenceRange(geoms);

  const meta = computeInstitutionalSuperTrendMeta(safe);
  const band: BandContext = {
    dir: meta?.lastDir === 'long' ? 'LONG' : meta?.lastDir === 'short' ? 'SHORT' : null,
    edges: getLastInstitutionalBandEdges(safe),
  };

  /** 채널마다 눌림 후보 — 같은 호라이즌 중복 제거 */
  const seen = new Set<MergedDeskChannelHorizon>();
  const candidates: MergedDeskChannelPullbackEntry[] = [];
  for (const g of geoms) {
    if (seen.has(g.horizon)) continue;
    seen.add(g.horizon);
    const c = buildCandidate({
      candles: safe,
      geom: g,
      atr,
      close,
      biasSide,
      isBiasGeom: g === biasGeom,
      confluence: conf,
      band,
      moneyHud,
      rocketDirection,
    });
    if (c) candidates.push(c);
  }
  if (!candidates.length) return EMPTY_PACK;

  const full = params.fullConfluence;
  if (full) {
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i]!;
      let delta = 0;
      let ko = full.shortKo;
      if (full.side === 'WAIT' || full.grade === 'WAIT') {
        delta = -10;
        ko = `${full.shortKo} · 눌림 감점`;
      } else if (c.side === full.side) {
        delta = full.grade === 'A' ? 12 : full.grade === 'B' ? 7 : 3;
        ko = `${full.shortKo} · 눌림 가점`;
      } else {
        delta = -14;
        ko = `${full.shortKo} · 반대방향 감점`;
      }
      candidates[i] = {
        ...c,
        score: Math.max(0, Math.min(100, c.score + delta)),
        reasons: [...c.reasons, { ko, points: delta, ok: delta > 0 }],
        tooltipKo: `${c.tooltipKo}\n${full.summaryKo}`,
      };
    }
  }

  /** 근접한 자리가 동점이면 현재가에 가까운 쪽을 먼저 */
  candidates.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : a.distanceAtr - b.distanceAtr
  );

  const primary = candidates[0]!;
  primary.primary = true;

  const drawn: MergedDeskChannelPullbackEntry[] = [];
  if (primary.score >= minScore) drawn.push(primary);

  /** 보조: 방향이 반대인 후보만, 주 타점보다 확실히 낮지 않을 때 */
  if (params.showCounterTrend !== false) {
    const alt = candidates.find(
      (c) => c !== primary && c.side !== primary.side && c.score >= Math.max(minScore, 45)
    );
    if (alt && drawn.length) drawn.push(alt);
  }

  if (!drawn.length) {
    return {
      ...EMPTY_PACK,
      biasSide,
      biasKo,
      entries: [],
      summaryKo: `눌림 타점 — 합류 ${primary.score}점, 기준 ${minScore} 미만`,
    };
  }

  const overlays = drawn.map(buildZoneOverlay);
  const priceLines = drawn[0]!.score >= minScore ? buildPriceLines(drawn[0]!) : [];

  const altNote =
    drawn.length > 1
      ? ` · 보조 ${drawn[1]!.horizonKo}${drawn[1]!.side === 'LONG' ? '롱' : '숏'}${drawn[1]!.score}`
      : '';

  return {
    overlays,
    priceLines,
    entry: drawn[0]!,
    entries: drawn,
    biasSide,
    biasKo,
    summaryKo: `${biasKo} · 눌림 ${primary.horizonKo}${primary.side === 'LONG' ? '롱' : '숏'} ${primary.statusKo} · ${primary.grade}${primary.score} · zone ${fmtPrice(primary.zoneBot)}~${fmtPrice(primary.zoneTop)} · R:R≈${primary.rr.toFixed(2)}${altNote}`,
  };
}
