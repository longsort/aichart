/**
 * 통합·분석 — HotZone (HOT_ZONE 모드 볼륨 레이더 공유).
 * 스윙·중투 관점 · 마지막 캔들 기준 **위 1개(저항/숏) + 아래 1개(지지/롱)**.
 * 작도: 형성봉→마지막봉 zone 면 + 전폭 가격선(중·상·하 + E/SL/TP/무효).
 * 승률·수익 보장 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  buildVolumeHotZoneClustersFromArr,
  type HotZoneVolumeCluster,
} from '@/lib/hotZoneRadar';
import { mergedDesk4hReferenceBarCap } from '@/lib/mergedDesk4hReference';
import { isMergedDeskSharedFeatureTf } from '@/lib/mergedDeskSharedTfFeatures';
import {
  findMergedDeskZoneFormationBarTime,
  mergedDeskAnalyzedZoneSpanTimes,
  mergedWorkCandles,
} from '@/lib/mergedAnalysisOverlayTimes';
import type { HqEntryZonesPack } from '@/lib/mergedDeskHqEntryZones';
import type { SwingMidEntryPack } from '@/lib/mergedDeskSwingMidEntry';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import type { MergedCriticalZone } from '@/lib/mergedAnalysisCriticalZones';
import type { UnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';
import type { MasterFuturesDecision } from '@/lib/mergedDeskMasterFuturesDecision';
import { calcTradeRewardRisk } from '@/lib/mergedDeskUnifiedTradeRails';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import { gradeMergedDeskRbBounceStrength } from '@/lib/mergedDeskRbBounceStrength';
import { candleTouchesZone } from '@/lib/mergedDeskSignalOutcomeEngine';

export type MergedDeskHotZoneStatus = 'WAIT' | 'TOUCH' | 'ENTER';

export type MergedDeskHotZoneEntry = {
  id: string;
  side: 'LONG' | 'SHORT';
  grade: 'A' | 'B';
  top: number;
  bot: number;
  mid: number;
  score: number;
  strength: number;
  labelKo: string;
  reasonKo: string;
  primary: boolean;
  touchedNow: boolean;
  /** 대기 / 터치 / 진입가능 */
  status: MergedDeskHotZoneStatus;
  statusKo: string;
  sources: string[];
  /** 형성봉 (작도 좌측) */
  time1?: number;
};

export type MergedDeskHotZonePrecision = {
  side: 'LONG' | 'SHORT';
  entry: number;
  stopLoss: number;
  tp1: number;
  rr: number;
  invalidationKo: string;
  invalidationPrice: number;
};

export type MergedDeskHotZoneEntryPack = {
  /** 마지막 봉 아래 = 롱/지지 1개 */
  below: MergedDeskHotZoneEntry | null;
  /** 마지막 봉 위 = 숏/저항 1개 */
  above: MergedDeskHotZoneEntry | null;
  longEntries: MergedDeskHotZoneEntry[];
  shortEntries: MergedDeskHotZoneEntry[];
  all: MergedDeskHotZoneEntry[];
  /** ★쪽 Hot존에 붙인 E/SL/TP1 · 무효화 */
  precision: MergedDeskHotZonePrecision | null;
  overlays: OverlayItem[];
  /** 차트 전체 가로 LineSeries (지표형 E/SL/TP1/무효) */
  priceLines: AtlasPulsePriceLine[];
  summaryKo: string;
  whereLongKo: string;
  whereShortKo: string;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** HotZone 가격 고정 — 안착 유지, 밀리면 삭제. 틱마다 위아래 점프 금지 */
type HzLock = {
  top: number;
  bot: number;
  mid: number;
  time1?: number;
};
const hzLocks = new Map<string, HzLock>();

function zoneTouchedByPriceOrWick(
  price: number,
  bot: number,
  top: number,
  last?: Candle | null
): boolean {
  const closeTouch = price >= bot && price <= top;
  const wickTouch = last ? candleTouchesZone(last, bot, top) : false;
  return closeTouch || wickTouch;
}

function persistHotZoneBand(
  tf: string,
  side: 'LONG' | 'SHORT',
  next: MergedDeskHotZoneEntry | null,
  price: number,
  atrVal: number,
  last?: Candle | null
): MergedDeskHotZoneEntry | null {
  const key = `${tf}|${side}`;
  const prev = hzLocks.get(key);
  const slip = Math.max(atrVal * 0.28, Math.abs(price) * 0.0012);
  if (prev) {
    const slipped = side === 'LONG' ? price < prev.bot - slip : price > prev.top + slip;
    if (slipped) {
      hzLocks.delete(key);
      if (!next) return null;
      const settling = price >= next.bot - slip && price <= next.top + slip;
      if (!settling) return null;
    } else {
      const kept: MergedDeskHotZoneEntry = next
        ? {
            ...next,
            top: prev.top,
            bot: prev.bot,
            mid: prev.mid,
            time1: prev.time1 ?? next.time1,
            id: `merged-desk-hotzone-${side === 'LONG' ? 'below' : 'above'}-${Math.round(prev.mid * 100)}`,
          }
        : {
            id: `merged-desk-hotzone-${side === 'LONG' ? 'below' : 'above'}-${Math.round(prev.mid * 100)}`,
            side,
            grade: 'B',
            top: prev.top,
            bot: prev.bot,
            mid: prev.mid,
            score: 70,
            strength: 0.6,
            labelKo: side === 'LONG' ? '$$$$롱' : '$$$$숏',
            reasonKo: '안착유지',
            primary: side === 'LONG',
            touchedNow: zoneTouchedByPriceOrWick(price, prev.bot, prev.top, last),
            status: zoneTouchedByPriceOrWick(price, prev.bot, prev.top, last) ? 'TOUCH' : 'WAIT',
            statusKo: zoneTouchedByPriceOrWick(price, prev.bot, prev.top, last) ? '터치' : '대',
            sources: ['HotZone'],
            time1: prev.time1,
          };
      hzLocks.set(key, {
        top: prev.top,
        bot: prev.bot,
        mid: prev.mid,
        time1: kept.time1,
      });
      return kept;
    }
  }
  if (!next) return null;
  hzLocks.set(key, { top: next.top, bot: next.bot, mid: next.mid, time1: next.time1 });
  return next;
}

function fmt(p: number): string {
  if (!(p > 0)) return '—';
  if (p >= 1000) return p.toFixed(1);
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function atr(candles: Candle[], end: number, period = 14): number {
  if (end < 1) return Math.abs(candles[end]?.close ?? 1) * 0.01;
  let sum = 0;
  let n = 0;
  const start = Math.max(1, end - period + 1);
  for (let i = start; i <= end; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    n++;
  }
  return n > 0 ? sum / n : Math.abs(candles[end]?.close ?? 1) * 0.01;
}

function enrichHorizon(clusters: HotZoneVolumeCluster[], arr: Candle[], horizon: number): void {
  if (arr.length < horizon + 20 || !clusters.length) return;
  const top = [...clusters].sort((a, b) => b.strength - a.strength).slice(0, 4);
  for (const z of top) {
    let longCnt = 0;
    let shortCnt = 0;
    for (let j = 0; j < arr.length - horizon; j++) {
      const c = arr[j]!;
      if (c.close < z.bot || c.close > z.top) continue;
      const ret = (arr[j + horizon]!.close - c.close) / Math.max(1e-9, c.close);
      if (ret >= 0) longCnt++;
      else shortCnt++;
    }
    const n = longCnt + shortCnt;
    if (n < 8) continue;
    z.longProb = longCnt / n;
    z.shortProb = shortCnt / n;
    z.probSampleN = n;
  }
}

type Cand = {
  top: number;
  bot: number;
  mid: number;
  strength: number;
  score: number;
  reasonKo: string;
  sources: string[];
  /** 형성봉 시각 — 마지막 봉/last-N 금지 */
  time1?: number;
  bounceN?: number;
};

/** 존 터치→이탈 반응 · 형성봉 거래량 · 최근 잠식(참고용, 승률 아님) */
function analyzeHotZoneTouches(
  arr: Candle[],
  top: number,
  bot: number,
  wantLong: boolean
): { originTime?: number; bounceN: number; chopN: number; lastInsideAgo: number; originVolRatio: number } {
  const hi = Math.max(top, bot);
  const lo = Math.min(top, bot);
  let originI = -1;
  let bounceN = 0;
  let chopN = 0;
  let lastInsideI = -1;
  let volSum = 0;
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i]!;
    const vol = Number(c.volume) || 0;
    volSum += vol;
    const touch = c.high >= lo && c.low <= hi;
    const insideClose = c.close >= lo && c.close <= hi;
    if (insideClose) {
      chopN++;
      lastInsideI = i;
    }
    if (!touch) continue;
    if (originI < 0 && i < arr.length - 2) originI = i;
    const next = arr[i + 1];
    if (!next) continue;
    if (wantLong && next.close > hi) bounceN++;
    if (!wantLong && next.close < lo) bounceN++;
  }
  const avgVol = arr.length > 0 ? volSum / arr.length : 1;
  const originVol = originI >= 0 ? Number(arr[originI]!.volume) || 0 : avgVol;
  return {
    originTime: originI >= 0 ? Number(arr[originI]!.time) : undefined,
    bounceN,
    chopN,
    lastInsideAgo: lastInsideI < 0 ? 99 : arr.length - 1 - lastInsideI,
    originVolRatio: originVol / Math.max(1e-9, avgVol),
  };
}

function applyHotReactionScore(cand: Cand, arr: Candle[], wantLong: boolean): Cand {
  const st = analyzeHotZoneTouches(arr, cand.top, cand.bot, wantLong);
  let score = cand.score;
  score += Math.min(16, st.bounceN * 4);
  if (st.chopN > 5) score -= Math.min(14, Math.round((st.chopN - 5) * 1.4));
  if (st.lastInsideAgo >= 8 && st.bounceN >= 1) score += 8;
  else if (st.lastInsideAgo <= 1 && st.bounceN >= 1) score += 5;
  if (st.originVolRatio >= 1.55) score += 6;
  else if (st.originVolRatio >= 1.2) score += 3;
  const bits: string[] = [];
  if (st.bounceN > 0) bits.push(`반등${st.bounceN}`);
  if (st.originVolRatio >= 1.4) bits.push('형성볼륨');
  if (st.lastInsideAgo >= 8) bits.push('미잠식');
  else if (st.chopN > 6) bits.push('잠식주의');
  return {
    ...cand,
    score,
    bounceN: st.bounceN,
    time1: cand.time1 ?? st.originTime,
    reasonKo: bits.length ? `${cand.reasonKo}·${bits.join('·')}` : cand.reasonKo,
  };
}

function emptyPack(): MergedDeskHotZoneEntryPack {
  return {
    below: null,
    above: null,
    longEntries: [],
    shortEntries: [],
    all: [],
    precision: null,
    overlays: [],
    priceLines: [],
    summaryKo: 'HotZone 스윙 — 위·아래 대기',
    whereLongKo: '아래(지지) 없음',
    whereShortKo: '위(저항) 없음',
  };
}

/** ★ Hot존 E/SL/TP1/무효 — TradingView식 전폭 수평선 (LineSeries·축 라벨)
 *  status에 따라 강조: ENTER=진입가능 · TOUCH=터치대기 · WAIT=대기
 *  참고용 · 수익·승률 보장 아님
 *  차트에는 ActiveTrade가 타점 단일 소스일 때 중복을 피하고,
 *  Hot 밴드(중/상/하) 선 + (필요 시) 이 precision 선을 합친다.
 */
export function buildMergedDeskHotZonePrecisionPriceLines(
  precision: MergedDeskHotZonePrecision | null | undefined,
  status: MergedDeskHotZoneStatus | null | undefined = 'WAIT'
): AtlasPulsePriceLine[] {
  if (!precision || !(precision.entry > 0)) return [];
  const sideTag = precision.side === 'LONG' ? '▲' : '▼';
  const long = precision.side === 'LONG';
  const st = status ?? 'WAIT';
  const stanceKo = st === 'ENTER' ? '진입' : st === 'TOUCH' ? '터치' : '대';
  const go = st === 'ENTER';
  const touch = st === 'TOUCH';

  const eColor = go
    ? long
      ? '#4ADE80'
      : '#F87171'
    : touch
      ? long
        ? 'rgba(74,222,128,0.85)'
        : 'rgba(248,113,113,0.85)'
      : long
        ? 'rgba(74,222,128,0.55)'
        : 'rgba(248,113,113,0.55)';
  const slColor = go ? '#F87171' : touch ? 'rgba(248,113,113,0.8)' : 'rgba(248,113,113,0.45)';
  const tpColor = go ? '#38BDF8' : touch ? 'rgba(56,189,248,0.85)' : 'rgba(56,189,248,0.5)';
  const invColor = go ? '#FACC15' : touch ? 'rgba(250,204,21,0.85)' : 'rgba(250,204,21,0.45)';

  const eWidth: 1 | 2 | 3 | 4 = go ? 3 : touch ? 2 : 1;
  const eStyle: 'solid' | 'dashed' | 'dotted' = go ? 'solid' : touch ? 'solid' : 'dashed';
  const otherStyle: 'solid' | 'dashed' | 'dotted' = go ? 'dashed' : 'dotted';

  const dirKo = long ? '롱' : '숏';
  return [
    {
      price: precision.entry,
      color: eColor,
      title: `${sideTag}진입E·Hot·${stanceKo}`,
      lineWidth: eWidth,
      lineStyle: eStyle,
      axisLabel: true,
    },
    {
      price: precision.stopLoss,
      color: slColor,
      title: `${sideTag}손절SL·Hot`,
      lineWidth: go ? 2 : 1,
      lineStyle: otherStyle,
      axisLabel: true,
    },
    {
      price: precision.tp1,
      color: tpColor,
      title: `${sideTag}익절TP1·Hot`,
      lineWidth: go ? 2 : 1,
      lineStyle: 'dotted',
      axisLabel: true,
    },
    {
      price: precision.invalidationPrice,
      color: invColor,
      title: `${sideTag}무효·Hot·${dirKo}`,
      lineWidth: go ? 2 : 1,
      lineStyle: 'dashed',
      axisLabel: true,
    },
  ];
}

/**
 * Hot존 위치선 — **중선만** (상·하 점선은 zone 네모와 중복·라벨 혼동 → 제거).
 * zone 면과 병행. 참고용 · 확정 매매 아님.
 */
export function buildMergedDeskHotZoneBandPriceLines(
  below: MergedDeskHotZoneEntry | null | undefined,
  above: MergedDeskHotZoneEntry | null | undefined
): AtlasPulsePriceLine[] {
  const out: AtlasPulsePriceLine[] = [];
  const pushBand = (z: MergedDeskHotZoneEntry, isLong: boolean) => {
    const tag = isLong ? '$$$$롱·Hot' : '$$$$숏·Hot';
    const midColor = isLong ? '#4ADE80' : '#F87171';
    const st =
      z.status === 'ENTER' ? '진입' : z.status === 'TOUCH' ? '터치' : z.primary ? '주시' : '대';
    out.push({
      price: z.mid,
      color: midColor,
      title: `${tag}·${st}`,
      lineWidth: z.primary || z.status === 'ENTER' || z.status === 'TOUCH' ? 2 : 1,
      lineStyle: z.status === 'ENTER' ? 'solid' : 'dashed',
      axisLabel: true,
    });
  };
  if (below) pushBand(below, true);
  if (above) pushBand(above, false);
  return out;
}

function capHeight(top: number, bot: number, maxH: number): { top: number; bot: number; mid: number } {
  let t = top;
  let b = bot;
  const mid = (t + b) / 2;
  if (t - b > maxH) {
    t = mid + maxH / 2;
    b = mid - maxH / 2;
  }
  return { top: t, bot: b, mid: (t + b) / 2 };
}

/** 타점 헌팅용 얇은 띠 — 클러스터 전체 폭 대신 POC/중간가 중심 */
function tightenHuntBand(c: Cand, atrVal: number, price: number): Cand {
  const mid = Number.isFinite(c.mid) && c.mid > 0 ? c.mid : (c.top + c.bot) / 2;
  const ref = Math.max(Math.abs(mid), Math.abs(price), 1e-9);
  const maxSpan = Math.min(
    Math.max(atrVal * 0.26, ref * 0.0016),
    Math.max(atrVal * 0.42, ref * 0.0028),
    Math.max(c.top - c.bot, atrVal * 0.12)
  );
  const half = maxSpan / 2;
  return { ...c, top: mid + half, bot: mid - half, mid };
}

function toEntry(
  side: 'LONG' | 'SHORT',
  c: Cand,
  price: number,
  primary: boolean,
  last?: Candle | null
): MergedDeskHotZoneEntry {
  const score = clamp(Math.round(c.score), 0, 99);
  const grade: 'A' | 'B' = score >= 70 ? 'A' : 'B';
  const sideKo = side === 'LONG' ? '$$$$롱' : '$$$$숏';
  const touchedNow = zoneTouchedByPriceOrWick(price, c.bot, c.top, last);
  return {
    id: `merged-desk-hotzone-${side === 'LONG' ? 'below' : 'above'}-${Math.round(c.mid * 100)}`,
    side,
    grade,
    top: c.top,
    bot: c.bot,
    mid: c.mid,
    score,
    strength: c.strength,
    labelKo: primary ? sideKo : sideKo,
    reasonKo: c.reasonKo,
    primary,
    touchedNow,
    status: touchedNow ? 'TOUCH' : 'WAIT',
    statusKo: touchedNow ? '터치' : '대',
    sources: c.sources,
    time1: c.time1,
  };
}

function resolveStatus(
  z: MergedDeskHotZoneEntry,
  price: number,
  swing: SwingMidEntryPack | null | undefined,
  master: MasterFuturesDecision | null | undefined,
  last?: Candle | null
): void {
  const inZone = zoneTouchedByPriceOrWick(price, z.bot, z.top, last);
  z.touchedNow = inZone;
  const enterReady =
    z.primary &&
    ((swing?.side === z.side &&
      (swing.stance === 'ENTER_LONG' ||
        swing.stance === 'ENTER_SHORT' ||
        swing.stance === 'WAIT_PULLBACK')) ||
      (master?.side === z.side && master.entryAllowed));
  if (inZone && enterReady) {
    z.status = 'ENTER';
    z.statusKo = '진입';
  } else if (inZone) {
    z.status = 'TOUCH';
    z.statusKo = '터치';
  } else {
    z.status = 'WAIT';
    z.statusKo = '대';
  }
  const base = z.labelKo
    .replace(/^★/, '')
    .replace(/\s*·\s*(대기|대|터치|진입가능|진입)$/, '')
    .replace(/·롱|·숏/g, '');
  /** $$$$ 돈구간 캡션 고정 — 상태는 precision 가격선으로 */
  z.labelKo = /\$\$\$\$/.test(base) ? base : z.primary ? `★${base}` : base;
}

function buildPrecisionForPrimary(
  primary: MergedDeskHotZoneEntry,
  price: number,
  atrVal: number,
  swing: SwingMidEntryPack | null | undefined,
  tradePlan: UnifiedDeskTradePlan | null | undefined,
  master: MasterFuturesDecision | null | undefined
): MergedDeskHotZonePrecision {
  const side = primary.side;
  let entry = primary.mid;
  let stopLoss = side === 'LONG' ? primary.bot : primary.top;

  if (swing?.active && swing.side === side && swing.entryMid > 0 && swing.stopLoss > 0) {
    entry = swing.entryMid;
    stopLoss = swing.stopLoss;
  } else if (master?.side === side && master.entryAllowed && master.entryPrice > 0 && master.stopPrice > 0) {
    entry = master.entryPrice;
    stopLoss = master.stopPrice;
  } else if (
    tradePlan &&
    (tradePlan.direction === 'LONG' || tradePlan.direction === 'SHORT') &&
    tradePlan.direction === side &&
    tradePlan.entry > 0 &&
    tradePlan.stopLoss > 0
  ) {
    entry = tradePlan.entry;
    stopLoss = tradePlan.stopLoss;
  }

  // 존 밖으로 튀지 않게 클램프
  if (side === 'LONG') {
    entry = clamp(entry, primary.bot, primary.top);
    if (stopLoss >= entry) stopLoss = Math.min(primary.bot, entry - atrVal * 0.35);
  } else {
    entry = clamp(entry, primary.bot, primary.top);
    if (stopLoss <= entry) stopLoss = Math.max(primary.top, entry + atrVal * 0.35);
  }

  const risk = Math.max(Math.abs(entry - stopLoss), atrVal * 0.25);
  let tp1 =
    swing?.side === side && swing.tp1 > 0
      ? swing.tp1
      : tradePlan?.direction === side && tradePlan.tp1 > 0
        ? tradePlan.tp1
        : side === 'LONG'
          ? entry + risk * 1.5
          : entry - risk * 1.5;

  if (side === 'LONG' && tp1 <= entry) tp1 = entry + risk * 1.5;
  if (side === 'SHORT' && tp1 >= entry) tp1 = entry - risk * 1.5;

  const rr = calcTradeRewardRisk(entry, stopLoss, tp1) ?? 1.5;
  const invalidationPrice = side === 'LONG' ? Math.min(stopLoss, primary.bot) : Math.max(stopLoss, primary.top);
  const invalidationKo =
    side === 'LONG'
      ? `종가 ${fmt(invalidationPrice)} 이탈 시 롱 Hot존 무효`
      : `종가 ${fmt(invalidationPrice)} 돌파 시 숏 Hot존 무효`;

  void price;
  return { side, entry, stopLoss, tp1, rr, invalidationKo, invalidationPrice };
}

/**
 * 마지막 캔들 close 기준 — 아래 1(지지/롱) + 위 1(저항/숏).
 * 소스: HOT_ZONE 볼륨 클러스터 + 스윙중투/HQ/핵심존 합류 가점.
 */
export function buildMergedDeskHotZoneEntryPack(params: {
  candles: Candle[];
  timeframe: string;
  hqEntryZones?: HqEntryZonesPack | null;
  swingMidEntry?: SwingMidEntryPack | null;
  keyZones?: MergedKeyZone[];
  criticalZones?: MergedCriticalZone[];
  tradePlan?: UnifiedDeskTradePlan | null;
  masterFutures?: MasterFuturesDecision | null;
  masterSide?: 'LONG' | 'SHORT' | 'WAIT' | null;
  analyzeVerdict?: 'LONG' | 'SHORT' | null;
  currentPrice?: number | null;
}): MergedDeskHotZoneEntryPack {
  if (!isMergedDeskSharedFeatureTf(params.timeframe)) return emptyPack();

  const tf = normalizeChartTimeframe(params.timeframe);
  const candles = mergedWorkCandles(params.candles, tf);
  if (candles.length < 30) return emptyPack();

  const last = candles[candles.length - 1]!;
  const price =
    params.currentPrice && params.currentPrice > 0 ? params.currentPrice : last.close;
  const atrVal = atr(candles, candles.length - 1);
  const maxH = Math.max(atrVal * 1.85, price * 0.012);

  const primarySide: 'LONG' | 'SHORT' | 'WAIT' =
    params.swingMidEntry?.side === 'LONG' || params.swingMidEntry?.side === 'SHORT'
      ? params.swingMidEntry.side
      : params.masterFutures?.side === 'LONG' || params.masterFutures?.side === 'SHORT'
        ? params.masterFutures.side
        : params.masterSide === 'LONG' || params.masterSide === 'SHORT'
          ? params.masterSide
          : params.analyzeVerdict ?? 'WAIT';

  const lookback = Math.min(mergedDesk4hReferenceBarCap(tf), candles.length);
  const arr = candles.slice(-lookback);
  // HOT_ZONE 모드와 동일 계열 — 해상도·임계 약간 타이트하게 (깔끔)
  const clusters = buildVolumeHotZoneClustersFromArr(arr, 42, 78) ?? [];
  enrichHorizon(clusters, arr, 3);

  const belowCands: Cand[] = [];
  const aboveCands: Cand[] = [];

  for (const z of clusters) {
    const huntMid = z.poc > 0 ? z.poc : z.center > 0 ? z.center : (z.top + z.bot) / 2;
    const capped = capHeight(z.top, z.bot, maxH);
    if (!(capped.top > capped.bot)) continue;
    let score = 48 + Math.round(z.strength * 32);
    if (z.longProb != null && z.shortProb != null && (z.probSampleN ?? 0) >= 8) {
      score += Math.round(Math.abs(z.longProb - z.shortProb) * 18);
    }
    const cand: Cand = {
      ...capped,
      mid: huntMid,
      strength: z.strength,
      score,
      reasonKo: '볼륨Hot',
      sources: ['HotZone'],
    };
    if (capped.mid < price - atrVal * 0.08) belowCands.push({ ...cand, score: score + (z.longProb != null && z.longProb >= (z.shortProb ?? 0) ? 6 : 0) });
    else if (capped.mid > price + atrVal * 0.08) aboveCands.push({ ...cand, score: score + (z.shortProb != null && z.shortProb >= (z.longProb ?? 0) ? 6 : 0) });
  }

  // HQ / key / critical — 같은 쪽 가점 또는 후보 추가
  const boostFromZones = (side: 'below' | 'above', list: Cand[]) => {
    const hqList =
      side === 'below' ? params.hqEntryZones?.longZones ?? [] : params.hqEntryZones?.shortZones ?? [];
    for (const z of hqList) {
      const capped = capHeight(z.top, z.bot, maxH);
      const mid = capped.mid;
      if (side === 'below' && mid >= price) continue;
      if (side === 'above' && mid <= price) continue;
      const hit = list.find((c) => Math.abs(c.mid - mid) < atrVal * 0.5);
      if (hit) {
        hit.score += z.grade === 'A' ? 14 : 10;
        hit.reasonKo = `${hit.reasonKo}·HQ${z.grade}`;
        if (!hit.sources.includes('HQ')) hit.sources.push('HQ');
        if (Number.isFinite(z.time1)) {
          hit.time1 =
            hit.time1 != null ? Math.min(hit.time1, Number(z.time1)) : Number(z.time1);
        }
      } else {
        list.push({
          ...capped,
          strength: 0.7,
          score: 56 + (z.grade === 'A' ? 12 : 6),
          reasonKo: `HQ${z.grade}`,
          sources: ['HQ', 'HotZone'],
          time1: Number(z.time1) || undefined,
        });
      }
    }
    for (const z of params.keyZones ?? []) {
      const isDemand = z.kind === 'demand';
      if (side === 'below' && !isDemand) continue;
      if (side === 'above' && isDemand) continue;
      const capped = capHeight(z.top, z.bot, maxH);
      if (side === 'below' && capped.mid >= price) continue;
      if (side === 'above' && capped.mid <= price) continue;
      const hit = list.find((c) => Math.abs(c.mid - capped.mid) < atrVal * 0.5);
      if (hit) {
        hit.score += 8;
        hit.reasonKo = `${hit.reasonKo}·${z.labelKo}`;
        if (Number.isFinite(z.time1)) {
          hit.time1 =
            hit.time1 != null ? Math.min(hit.time1, Number(z.time1)) : Number(z.time1);
        }
      } else {
        list.push({
          ...capped,
          strength: 0.55,
          score: 52 + Math.min(12, z.score * 2),
          reasonKo: z.labelKo || (isDemand ? '지지' : '저항'),
          sources: ['핵심존', 'HotZone'],
          time1: Number(z.time1) || undefined,
        });
      }
    }
    for (const z of params.criticalZones ?? []) {
      const isDemand = z.scenario === 'if_decline' || z.kind === 'demand';
      if (side === 'below' && !isDemand) continue;
      if (side === 'above' && isDemand) continue;
      const half = Math.max((z.top - z.bot) / 2, atrVal * 0.35);
      const capped = capHeight(z.price + half, z.price - half, maxH);
      if (side === 'below' && capped.mid >= price) continue;
      if (side === 'above' && capped.mid <= price) continue;
      const hit = list.find((c) => Math.abs(c.mid - capped.mid) < atrVal * 0.5);
      const add = z.tier === 'S' ? 12 : z.tier === 'A' ? 8 : 4;
      if (hit) {
        hit.score += add;
        hit.reasonKo = `${hit.reasonKo}·임계${z.tier}`;
        if (Number.isFinite(z.time1)) {
          hit.time1 =
            hit.time1 != null ? Math.min(hit.time1, Number(z.time1)) : Number(z.time1);
        }
      } else {
        list.push({
          ...capped,
          strength: 0.65,
          score: 54 + add,
          reasonKo: z.headlineKo || z.labelKo || '임계',
          sources: ['임계', 'HotZone'],
          time1: Number(z.time1) || undefined,
        });
      }
    }
  };
  boostFromZones('below', belowCands);
  boostFromZones('above', aboveCands);

  // 스윙·중투 진입 구간 — 해당 쪽 최우선
  const swing = params.swingMidEntry;
  if (swing?.active && swing.entryHigh > swing.entryLow) {
    const capped = capHeight(swing.entryHigh, swing.entryLow, maxH);
    const list = capped.mid <= price ? belowCands : aboveCands;
    const swingT1 = findMergedDeskZoneFormationBarTime(
      candles,
      capped.top,
      capped.bot,
      null
    );
    const hit = list.find((c) => Math.abs(c.mid - capped.mid) < atrVal * 0.6);
    if (hit) {
      hit.score += 20;
      hit.top = capped.top;
      hit.bot = capped.bot;
      hit.mid = capped.mid;
      hit.reasonKo = `스윙중투·${hit.reasonKo}`;
      if (!hit.sources.includes('스윙')) hit.sources.push('스윙');
      hit.time1 = hit.time1 != null ? Math.min(hit.time1, swingT1) : swingT1;
    } else {
      list.push({
        ...capped,
        strength: 0.9,
        score: 78,
        reasonKo: '스윙중투',
        sources: ['스윙', 'HotZone'],
        time1: swingT1,
      });
    }
  }

  // 스윙 저/고 폴백 (볼륨 비었을 때)
  if (!belowCands.length || !aboveCands.length) {
    const start = Math.max(2, candles.length - 55);
    let minL = Infinity;
    let maxHbar = -Infinity;
    let minI = start;
    let maxI = start;
    for (let i = start; i < candles.length - 1; i++) {
      if (candles[i]!.low < minL) {
        minL = candles[i]!.low;
        minI = i;
      }
      if (candles[i]!.high > maxHbar) {
        maxHbar = candles[i]!.high;
        maxI = i;
      }
    }
    const half = atrVal * 0.38;
    if (!belowCands.length && minL < price) {
      belowCands.push({
        top: minL + half,
        bot: minL - half * 0.55,
        mid: minL,
        strength: 0.5,
        score: 54,
        reasonKo: '스윙저점',
        sources: ['스윙', 'HotZone'],
        time1: Number(candles[minI]!.time),
      });
    }
    if (!aboveCands.length && maxHbar > price) {
      aboveCands.push({
        top: maxHbar + half * 0.55,
        bot: maxHbar - half,
        mid: maxHbar,
        strength: 0.5,
        score: 54,
        reasonKo: '스윙고점',
        sources: ['스윙', 'HotZone'],
        time1: Number(candles[maxI]!.time),
      });
    }
  }

  const scoredBelow = belowCands.map((c) => applyHotReactionScore(c, arr, true));
  const scoredAbove = aboveCands.map((c) => applyHotReactionScore(c, arr, false));

  const pickBest = (list: Cand[]): Cand | null => {
    if (!list.length) return null;
    return [...list].sort(
      (a, b) => b.score - a.score || Math.abs(a.mid - price) - Math.abs(b.mid - price)
    )[0]!;
  };

  const bestBelow = pickBest(scoredBelow);
  const bestAbove = pickBest(scoredAbove);
  /** tightenHuntBand 제거 — 얇은 띠는 가로점선처럼 보임. 클러스터 폭의 zone 네모 유지 */
  const huntBelow = bestBelow;
  const huntAbove = bestAbove;

  const belowRaw = huntBelow
    ? toEntry('LONG', huntBelow, price, primarySide === 'LONG' || primarySide === 'WAIT', last)
    : null;
  const aboveRaw = huntAbove
    ? toEntry('SHORT', huntAbove, price, primarySide === 'SHORT', last)
    : null;
  const below = persistHotZoneBand(tf, 'LONG', belowRaw, price, atrVal, last);
  const above = persistHotZoneBand(tf, 'SHORT', aboveRaw, price, atrVal, last);

  // 스윙 방향이 있으면 그쪽을 primary
  if (below && above) {
    if (primarySide === 'LONG') {
      below.primary = true;
      below.labelKo = '$$$$롱';
      above.primary = false;
      above.labelKo = '$$$$숏';
    } else if (primarySide === 'SHORT') {
      above.primary = true;
      above.labelKo = '$$$$숏';
      below.primary = false;
      below.labelKo = '$$$$롱';
    } else if (below.score >= above.score) {
      below.primary = true;
      below.labelKo = '$$$$롱';
      above.primary = false;
      above.labelKo = '$$$$숏';
    } else {
      above.primary = true;
      above.labelKo = '$$$$숏';
      below.primary = false;
      below.labelKo = '$$$$롱';
    }
  }

  const all = [below, above].filter(Boolean) as MergedDeskHotZoneEntry[];
  for (const z of all) {
    resolveStatus(z, price, params.swingMidEntry, params.masterFutures ?? null, last);
  }

  const primary = all.find((z) => z.primary) ?? all[0] ?? null;
  const precision = primary
    ? buildPrecisionForPrimary(
        primary,
        price,
        atrVal,
        params.swingMidEntry,
        params.tradePlan,
        params.masterFutures ?? null
      )
    : null;

  /**
   * Hot존 작도 = 형성봉→마지막봉 zone 면 + 전폭 가격선.
   * E/SL/TP·무효는 ActiveTrade가 단일 소스일 때 차트 선 중복을 줄이고,
   * 밴드(중/상/하) + (필요 시) precision 선은 유지.
   */
  const overlays: OverlayItem[] = [];
  const pushZoneFace = (z: MergedDeskHotZoneEntry) => {
    const isLong = z.side === 'LONG';
    const formT =
      z.time1 && Number(z.time1) > 0
        ? Number(z.time1)
        : findMergedDeskZoneFormationBarTime(candles, z.top, z.bot, z.time1 ?? null);
    z.time1 = formT;
    const zoneTimes = mergedDeskAnalyzedZoneSpanTimes(candles, {
      id: z.id,
      time1: formT,
      price1: z.top,
      price2: z.bot,
    });
    if (!zoneTimes) return;
    const go = z.status === 'ENTER';
    const touch = z.status === 'TOUCH';
    const strength = gradeMergedDeskRbBounceStrength({
      side: isLong ? 'LONG' : 'SHORT',
      baseScore: z.score,
      status: z.status,
    });
    const faceBase = strength.labelKo;
    const fill = go
      ? isLong
        ? 'rgba(245,158,11,0.40)'
        : 'rgba(249,115,22,0.38)'
      : touch
        ? isLong
          ? 'rgba(74,222,128,0.32)'
          : 'rgba(248,113,113,0.30)'
        : isLong
          ? 'rgba(245,158,11,0.26)'
          : 'rgba(251,146,60,0.24)';
    overlays.push({
      id: z.id,
      kind: isLong ? 'demandZone' : 'supplyZone',
      label: faceBase,
      labelTooltip: `${z.reasonKo} · ${strength.labelKo}(${strength.shortKo}) · ${fmt(z.bot)}~${fmt(z.top)} · ${z.sources.join('+')} (참고·승률 아님)`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: zoneTimes.t1 as UTCTimestamp,
      time2: zoneTimes.t2 as UTCTimestamp,
      price1: z.top,
      price2: z.bot,
      confidence: z.score,
      color: fill,
      category: 'zones',
      zonePulse: go || touch || z.primary,
      zoneFillPreserve: true,
      zoneSpanOnly: false,
      structureBias: isLong ? 'bullish' : 'bearish',
      zoneFaceBase: faceBase,
      zoneFaceSignal: undefined,
      zoneFaceDetailKo: `${z.labelKo} · ${z.statusKo} · ${strength.labelKo} · ${z.reasonKo} · ${fmt(z.bot)}~${fmt(z.top)} (참고용)`,
      zoneFaceLang: 'ko',
      lineLabelColor: isLong ? '#bbf7d0' : '#fecaca',
      labelBackgroundColor: isLong ? 'rgba(20,40,12,0.94)' : 'rgba(60,20,12,0.94)',
      labelTextColor: '#f8fafc',
      overlayZoneExtraClass: [
        'merged-desk-hotzone-zone',
        'merged-desk-hotzone-entry',
        isLong ? 'overlay-zone--hotzone-signal--long' : 'overlay-zone--hotzone-signal--short',
        z.primary ? 'merged-desk-hotzone-entry--primary' : '',
        touch ? 'merged-desk-hotzone-entry--touch' : '',
        go ? 'merged-desk-hotzone-entry--enter' : '',
        `merged-desk-rb-bounce-grade--${strength.grade}`,
        'merged-desk-zone-label-on',
        'merged-desk-zone-label-solo',
        'merged-desk-money-zone-keep',
        'merged-desk-zone-pro-hero',
      ]
        .filter(Boolean)
        .join(' '),
    });
  };
  if (below) pushZoneFace(below);
  if (above) pushZoneFace(above);

  const bandLines = buildMergedDeskHotZoneBandPriceLines(below, above);
  const precisionLines = buildMergedDeskHotZonePrecisionPriceLines(
    precision,
    primary?.status ?? null
  );

  const whereLongKo = below
    ? `${below.labelKo} ${fmt(below.bot)}~${fmt(below.top)} (${below.reasonKo})`
    : '아래(지지) 없음';
  const whereShortKo = above
    ? `${above.labelKo} ${fmt(above.bot)}~${fmt(above.top)} (${above.reasonKo})`
    : '위(저항) 없음';

  const precKo = precision
    ? ` · E${fmt(precision.entry)} SL${fmt(precision.stopLoss)} TP1${fmt(precision.tp1)}`
    : '';

  return {
    below,
    above,
    longEntries: below ? [below] : [],
    shortEntries: above ? [above] : [],
    all,
    precision,
    overlays,
    priceLines: [...bandLines, ...precisionLines],
    summaryKo: `스윙Hot(참고) · 아래 ${below ? fmt(below.mid) : '—'} · 위 ${above ? fmt(above.mid) : '—'}${precKo}`,
    whereLongKo,
    whereShortKo,
  };
}

export function summarizeMergedDeskHotZoneEntryKo(pack: MergedDeskHotZoneEntryPack): string {
  const prec = pack.precision
    ? ` | ★ E ${fmt(pack.precision.entry)} · SL ${fmt(pack.precision.stopLoss)} · TP1 ${fmt(pack.precision.tp1)} (${pack.precision.rr.toFixed(1)}R)`
    : '';
  const st = pack.all.find((z) => z.primary)?.statusKo ?? '';
  const stTag = st ? ` · ${st}` : '';
  return `아래: ${pack.whereLongKo} | 위: ${pack.whereShortKo}${stTag}${prec} · 참고용`;
}
