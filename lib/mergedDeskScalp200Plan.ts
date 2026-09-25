/**
 * 200x 타점 — micro-SL · 청산가 · ARMED/FIRE · 하드게이트 통합.
 * 가격선 중심 (카드/HUD 없음). 고정 승률·수익 보장 없음.
 */
import type { Candle, OverlayItem } from '@/types';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import type { MergedDeskActiveTradePlan } from '@/lib/mergedDeskActiveTradePlan';
import { buildMergedDeskActiveTradePriceLines } from '@/lib/mergedDeskActiveTradePlan';
import { calcTradeRewardRisk } from '@/lib/mergedDeskUnifiedTradeRails';
import type { PracticeAiPlanPack } from '@/lib/mergedDeskPracticeAiPlan';
import type { MasterFuturesDecision } from '@/lib/mergedDeskMasterFuturesDecision';
import type { MergedDeskHotZoneEntryPack } from '@/lib/mergedDeskHotZoneEntry';
import {
  evalMergedDeskNewsEntryGate,
  mergedDeskHtfSplitBlocksEnter,
  type MergedDeskNewsHintLite,
} from '@/lib/mergedDeskEntryHardGates';
import { normalizeChartTimeframe } from '@/lib/constants';
import { loadSettings } from '@/lib/settings';
import {
  evalDumpBottomLongBounceOverride,
  evalScalp200BandTouchBundle,
  hasRecentJournalBandTouchForScalp200,
  hotZoneWickTouchOk,
  scalp200BandTouchMomentumOk,
} from '@/lib/mergedDeskScalp200BandTouchBridge';
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';
import { macd, rsi } from '@/lib/indicators';
import { mergedLeadingMomentumGate } from '@/lib/mergedAnalysisLeadingBar';
import {
  evaluateScalp200AiZoneLife,
  type Scalp200AiZoneLife,
} from '@/lib/mergedDeskScalp200ZoneLife';
import { AI200_ZONE_COLORS } from '@/lib/mergedDeskAi200ZoneColors';
import {
  candleTouchesPriceLevel,
  evalJournalScalp200Conflict,
  refineEntryFromJournalTouch,
} from '@/lib/mergedDeskTradeEventJournal';

export type Scalp200State = 'WAIT' | 'ARMED' | 'FIRE' | 'MISSED' | 'INVALID';

export type Scalp200TriggerStep = {
  id: string;
  labelKo: string;
  done: boolean;
};

export type Scalp200PlanPack = {
  state: Scalp200State;
  stateKo: string;
  entryAllowed: boolean;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  invalidationPrice: number;
  liquidationPrice: number;
  maxLeverage: number;
  actualLeverage: number;
  roeAtSlPct: number;
  rr: number;
  gatesPassed: number;
  gatesTotal: number;
  gateStepsKo: string[];
  triggerSteps: Scalp200TriggerStep[];
  blockersKo: string[];
  summaryKo: string;
  detailKo: string;
  titleKo: string;
  priceLines: AtlasPulsePriceLine[];
  overlays: OverlayItem[];
  disclaimerKo: string;
  /** 기록부 E 터치 확인 (FIRE 게이트) */
  journalTouchOk?: boolean;
  /** 기록부 터치가로 E 미세 보정 적용 */
  journalEntryRefined?: boolean;
  /** AI 200x 타점 zone (폭락구간형) */
  zoneLife?: Scalp200AiZoneLife;
};

const STATE_KO: Record<Scalp200State, string> = {
  WAIT: '대기',
  ARMED: 'ARMED',
  FIRE: 'FIRE',
  MISSED: '놓침',
  INVALID: '무효',
};

const DISCLAIMER =
  '200x 타점은 조건부 참고용입니다. 승률·수익 고정 아님. 청산·슬리피지·표본 검증 필요.';

const SCALP_TFS = new Set(['1m', '3m', '5m', '15m']);

function fmt(p: number): string {
  if (!(p > 0) || !Number.isFinite(p)) return '—';
  if (p >= 1000) return p.toFixed(0);
  if (p >= 1) return p.toFixed(1);
  return p.toFixed(3);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function microSlBand(): { minPct: number; maxPct: number } {
  return { minPct: 0.0003, maxPct: 0.0015 };
}

function approxAtr(candles: Candle[]): number {
  const n = candles.length;
  if (n < 8) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.001;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    const tr = Math.max(
      Number(a.high) - Number(a.low),
      Math.abs(Number(a.high) - Number(b.close)),
      Math.abs(Number(a.low) - Number(b.close))
    );
    if (Number.isFinite(tr)) {
      s += tr;
      c += 1;
    }
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.001;
}

function recentSwingExtreme(candles: Candle[], dir: 'LONG' | 'SHORT', lookback = 12): number {
  const slice = candles.slice(Math.max(0, candles.length - lookback));
  if (!slice.length) return 0;
  if (dir === 'LONG') {
    return Math.min(...slice.map((c) => Number(c.low)).filter(Number.isFinite));
  }
  return Math.max(...slice.map((c) => Number(c.high)).filter(Number.isFinite));
}

function liquidationPrice(direction: 'LONG' | 'SHORT', entry: number, maxLev: number): number {
  const dist = 1 / Math.max(maxLev, 1);
  return direction === 'LONG' ? entry * (1 - dist) : entry * (1 + dist);
}

function computeLeverageAndRoe(
  entry: number,
  sl: number,
  accountUsdt: number,
  riskPct: number,
  maxLev: number
): { actualLeverage: number; roeAtSlPct: number; qty: number } {
  const stopDist = Math.abs(entry - sl);
  if (!(entry > 0) || !(stopDist > 0) || !(accountUsdt > 0)) {
    return { actualLeverage: 0, roeAtSlPct: 0, qty: 0 };
  }
  const riskUsdt = accountUsdt * (riskPct / 100);
  const qty = riskUsdt / stopDist;
  const notional = qty * entry;
  const actualLeverage = clamp(notional / accountUsdt, 1, maxLev);
  const movePct = stopDist / entry;
  const roeAtSlPct = movePct * actualLeverage * 100;
  return { actualLeverage, roeAtSlPct, qty };
}

function resolveMicroStop(params: {
  direction: 'LONG' | 'SHORT';
  entry: number;
  structuralSl: number;
  candles: Candle[];
  hotZone: MergedDeskHotZoneEntryPack | null | undefined;
  liquidation: number;
}): number {
  const { direction, entry, structuralSl, candles, hotZone, liquidation } = params;
  const { minPct, maxPct } = microSlBand();
  const atr = approxAtr(candles);
  const tickBuf = Math.max(atr * 0.08, entry * 0.00005);

  const candidates: number[] = [];
  if (structuralSl > 0) candidates.push(structuralSl);
  const swing = recentSwingExtreme(candles, direction);
  if (swing > 0) {
    candidates.push(direction === 'LONG' ? swing - tickBuf : swing + tickBuf);
  }
  const hz = hotZone?.precision;
  if (hz && hz.side === direction && hz.stopLoss > 0) candidates.push(hz.stopLoss);

  const minSl = direction === 'LONG' ? entry * (1 - maxPct) : entry * (1 + maxPct);
  const maxSl = direction === 'LONG' ? entry * (1 - minPct) : entry * (1 + minPct);

  let best = direction === 'LONG' ? entry * (1 - maxPct * 0.85) : entry * (1 + maxPct * 0.85);
  for (const c of candidates) {
    if (!(c > 0)) continue;
    const clamped =
      direction === 'LONG'
        ? clamp(c, minSl, maxSl)
        : clamp(c, maxSl, minSl);
    const valid =
      direction === 'LONG'
        ? clamped < entry && clamped > liquidation * 1.0002
        : clamped > entry && clamped < liquidation * 0.9998;
    if (!valid) continue;
    const tighter =
      direction === 'LONG'
        ? clamped > best
        : clamped < best || best <= 0;
    if (tighter) best = clamped;
  }

  if (direction === 'LONG' && best <= liquidation * 1.0002) {
    best = Math.max(minSl, liquidation * 1.0005);
  }
  if (direction === 'SHORT' && best >= liquidation * 0.9998) {
    best = Math.min(maxSl, liquidation * 0.9995);
  }
  return best;
}

function closeInvalidated(
  candles: Candle[],
  direction: 'LONG' | 'SHORT',
  inv: number
): boolean {
  if (!(inv > 0) || candles.length < 2) return false;
  const last = candles[candles.length - 1]!;
  const cl = Number(last.close);
  if (!Number.isFinite(cl)) return false;
  return direction === 'LONG' ? cl < inv : cl > inv;
}

function hotZoneTouchOk(
  hotZone: MergedDeskHotZoneEntryPack | null | undefined,
  direction: 'LONG' | 'SHORT',
  lastBar?: Candle | null
): boolean {
  const p = hotZone?.precision;
  if (!p || p.side !== direction) {
    if (lastBar && hotZoneWickTouchOk(hotZone, direction, lastBar)) return true;
    return false;
  }
  const side = direction === 'LONG' ? hotZone?.below : hotZone?.above;
  if (side?.status === 'TOUCH' || side?.status === 'ENTER' || side?.touchedNow === true) {
    return true;
  }
  return hotZoneWickTouchOk(hotZone, direction, lastBar);
}

function buildScalpPriceLines(
  pack: Pick<
    Scalp200PlanPack,
    | 'direction'
    | 'entry'
    | 'stopLoss'
    | 'tp1'
    | 'tp2'
    | 'tp3'
    | 'invalidationPrice'
    | 'liquidationPrice'
    | 'state'
    | 'entryAllowed'
    | 'rr'
    | 'roeAtSlPct'
    | 'actualLeverage'
    | 'maxLeverage'
  >,
  showTp23: boolean
): AtlasPulsePriceLine[] {
  if (pack.direction === 'NEUTRAL' || !(pack.entry > 0) || !(pack.stopLoss > 0)) return [];

  const fire = pack.state === 'FIRE' && pack.entryAllowed;
  const armed = pack.state === 'ARMED';
  const dead = pack.state === 'INVALID';

  const base = buildMergedDeskActiveTradePriceLines({
    direction: pack.direction,
    entry: pack.entry,
    stopLoss: pack.stopLoss,
    tp1: pack.tp1,
    tp2: showTp23 ? pack.tp2 : 0,
    tp3: showTp23 ? pack.tp3 : 0,
    invalidationPrice: pack.invalidationPrice,
    invalidationKo: '',
    rr: pack.rr,
    status: fire ? 'ENTER' : armed ? 'TOUCH' : dead ? 'INVALID' : 'WAIT',
    statusKo: fire ? '진입' : armed ? '터치' : '대기',
    source: 'unified',
    sourceKo: 'AI200',
    entryAllowed: pack.entryAllowed,
    asUnifiedPlan: {
      direction: pack.direction,
      entry: pack.entry,
      stopLoss: pack.stopLoss,
      tp1: pack.tp1,
      tp2: pack.tp2,
      tp3: pack.tp3,
      invalidationKo: '',
      sourceKo: 'AI200',
      alignedWithChart: true,
      warningsKo: [],
    },
  });

  const lines: AtlasPulsePriceLine[] = base.map((ln) => {
    const t = String(ln.title || '');
    if (/^진입/.test(t)) {
      return {
        ...ln,
        color: fire ? AI200_ZONE_COLORS.entry.line : armed ? AI200_ZONE_COLORS.entry.line : 'rgba(99,102,241,0.75)',
        title: `AI200 E ${fmt(pack.entry)}`,
        lineWidth: fire ? 3 : 2,
      };
    }
    if (/^손절/.test(t)) {
      return {
        ...ln,
        color: AI200_ZONE_COLORS.sl.line,
        title: `AI200 SL ${fmt(pack.stopLoss)} · ROE${pack.roeAtSlPct.toFixed(0)}%`,
      };
    }
    if (/^목표 1/.test(t)) {
      return { ...ln, color: AI200_ZONE_COLORS.tp1.line, title: `AI200 TP1 ${fmt(pack.tp1)}` };
    }
    if (/^목표 2/.test(t)) {
      return { ...ln, color: AI200_ZONE_COLORS.tp2.line, title: `AI200 TP2 ${fmt(pack.tp2)}` };
    }
    if (/^목표 3/.test(t)) {
      return { ...ln, color: AI200_ZONE_COLORS.tp3.line, title: `AI200 TP3 ${fmt(pack.tp3)}` };
    }
    if (/^목표/.test(t)) return ln;
    return ln;
  });

  if (pack.liquidationPrice > 0) {
    lines.push({
      price: pack.liquidationPrice,
      color: dead ? 'rgba(148,163,184,0.45)' : '#94A3B8',
      title: `AI200 청산 ${pack.maxLeverage}x ${fmt(pack.liquidationPrice)}`,
      lineWidth: 2,
      lineStyle: 'dotted',
      axisLabel: true,
    });
  }

  const invSame =
    Math.abs(pack.invalidationPrice - pack.stopLoss) / Math.max(pack.stopLoss, 1) <= 0.0004;
  if (!invSame && pack.invalidationPrice > 0) {
    lines.push({
      price: pack.invalidationPrice,
      color: 'rgba(250,204,21,0.85)',
      title: `무효 ${fmt(pack.invalidationPrice)}`,
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: true,
    });
  }

  return lines;
}

function evalScalp200MacdOk(candles: Candle[], direction: 'LONG' | 'SHORT'): boolean {
  if (candles.length < 20) return false;
  const pack = macd(candles, 12, 26, 9);
  const n = candles.length - 1;
  const h = pack.hist[n];
  const ph = n > 0 ? pack.hist[n - 1] : null;
  if (!Number.isFinite(h)) return false;
  if (direction === 'LONG') {
    if (h >= 0) return true;
    return ph != null && Number.isFinite(ph) && h > ph;
  }
  if (h <= 0) return true;
  return ph != null && Number.isFinite(ph) && h < ph;
}

function lastRsiVal(candles: Candle[]): number | null {
  if (candles.length < 16) return null;
  const s = rsi(candles, 14);
  const v = s[s.length - 1];
  return Number.isFinite(v) ? Number(v) : null;
}

export function buildMergedDeskScalp200Plan(params: {
  symbol: string;
  candles: Candle[];
  timeframe: string;
  activeTrade: MergedDeskActiveTradePlan;
  practiceAi?: PracticeAiPlanPack | null;
  master?: MasterFuturesDecision | null;
  hotZone?: MergedDeskHotZoneEntryPack | null;
  newsHint?: MergedDeskNewsHintLite | null;
  mtfAligned?: boolean | null;
  mtfAlignmentScore?: number | null;
  spotPx?: number | null;
  dumpZones?: MtfDumpZoneSpec[] | null;
}): Scalp200PlanPack | null {
  const {
    symbol,
    candles,
    timeframe,
    activeTrade,
    practiceAi,
    master,
    hotZone,
    newsHint,
    mtfAligned,
    mtfAlignmentScore,
    spotPx,
  } = params;
  if (candles.length < 24) return null;

  const settings = loadSettings();
  const maxLeverage = Math.max(
    1,
    Math.min(200, Number(settings.chartMergedDeskScalp200MaxLeverage) || 200)
  );
  const riskPct = clamp(Number(settings.chartMergedDeskScalp200RiskPct) || 1, 0.2, 5);
  const minRr = clamp(Number(settings.chartMergedDeskScalp200MinRr) || 2, 1.5, 4);
  const accountUsdt = Math.max(100, Number(settings.swingSeedUsdt) || 3000);
  const showTp23 = settings.chartMergedDeskTradeShowTp2Tp3 !== false;
  const tf = normalizeChartTimeframe(timeframe);

  const emptyWait = (reason: string): Scalp200PlanPack => ({
    state: 'WAIT',
    stateKo: STATE_KO.WAIT,
    entryAllowed: false,
    direction: 'NEUTRAL',
    entry: 0,
    stopLoss: 0,
    tp1: 0,
    tp2: 0,
    tp3: 0,
    invalidationPrice: 0,
    liquidationPrice: 0,
    maxLeverage,
    actualLeverage: 0,
    roeAtSlPct: 0,
    rr: 0,
    gatesPassed: 0,
    gatesTotal: 12,
    gateStepsKo: ['WATCH ○', 'ARMED ○', 'FIRE ○'],
    triggerSteps: [],
    blockersKo: [reason],
    summaryKo: `200x · 대기 — ${reason}`,
    detailKo: reason,
    titleKo: `200x 타점 · ${maxLeverage}x`,
    priceLines: [],
    overlays: [],
    disclaimerKo: DISCLAIMER,
  });

  const active = activeTrade;
  const lastBar = candles[candles.length - 1] ?? null;
  const bounceOverride = evalDumpBottomLongBounceOverride({
    candles,
    chartTf: tf,
    activeTrade: active,
    hotZone,
    dumpZones: params.dumpZones,
  });

  let dir: 'LONG' | 'SHORT' = active.direction === 'LONG' || active.direction === 'SHORT' ? active.direction : 'LONG';
  let bouncePath = false;

  if (bounceOverride) {
    dir = bounceOverride.direction;
    bouncePath = true;
  } else if (active.direction === 'NEUTRAL' || !(active.entry > 0)) {
    return emptyWait('ActiveTrade 방향·E 없음');
  }

  let baseEntry =
    bounceOverride?.entry ??
    (hotZone?.precision?.side === dir && hotZone.precision.entry > 0
      ? hotZone.precision.entry
      : active.entry);

  const bandTouch = evalScalp200BandTouchBundle({
    symbol,
    chartTf: tf,
    candles,
    direction: dir,
    entry: baseEntry,
    hotZone,
    dumpZones: params.dumpZones,
  });

  const journalTouch = hasRecentJournalBandTouchForScalp200({
    symbol,
    chartTf: tf,
    entry: baseEntry,
    direction: dir,
  });
  const barTouchEntry =
    candleTouchesPriceLevel(lastBar, baseEntry) ||
    (bandTouch.wickTouch && bandTouch.touchPrice != null);
  const entryRefined = refineEntryFromJournalTouch({
    entry: baseEntry,
    direction: dir,
    touchPrice: journalTouch.touchPrice ?? bandTouch.touchPrice ?? undefined,
  });
  const entry = entryRefined;
  const journalEntryRefined = Math.abs(entry - baseEntry) / Math.max(baseEntry, 1) > 0.00001;

  const journalConflict = evalJournalScalp200Conflict({
    symbol,
    chartTf: tf,
    direction: dir,
  });
  const fireTouchOk =
    journalTouch.ok ||
    barTouchEntry ||
    bandTouch.wickTouch ||
    active.status === 'ENTER';
  const journalTouchOk =
    journalTouch.ok || barTouchEntry || bandTouch.wickTouch || bandTouch.journalBandTouch;

  const liq = liquidationPrice(dir, entry, maxLeverage);
  let structuralSl =
    bounceOverride?.structuralSl ??
    (active.stopLoss > 0 && active.direction === dir
      ? active.stopLoss
      : hotZone?.precision?.side === dir && hotZone.precision.stopLoss > 0
        ? hotZone.precision.stopLoss
        : dir === 'LONG'
          ? entry * 0.9985
          : entry * 1.0015);
  const sl = resolveMicroStop({
    direction: dir,
    entry,
    structuralSl,
    candles,
    hotZone,
    liquidation: liq,
  });

  const riskUnit = Math.abs(entry - sl);
  const tp1 =
    active.tp1 > 0 && Math.abs(active.tp1 - entry) > riskUnit * 0.5
      ? active.tp1
      : dir === 'LONG'
        ? entry + riskUnit * 2
        : entry - riskUnit * 2;
  const tp2 =
    active.tp2 > 0
      ? active.tp2
      : dir === 'LONG'
        ? entry + riskUnit * 2.5
        : entry - riskUnit * 2.5;
  const tp3 =
    active.tp3 > 0
      ? active.tp3
      : dir === 'LONG'
        ? entry + riskUnit * 4
        : entry - riskUnit * 4;
  const inv =
    bounceOverride?.invalidationPrice ??
    (active.invalidationPrice > 0 && active.direction === dir ? active.invalidationPrice : sl);

  const rr = calcTradeRewardRisk(entry, sl, tp1) ?? 0;
  const { actualLeverage, roeAtSlPct, qty } = computeLeverageAndRoe(
    entry,
    sl,
    accountUsdt,
    riskPct,
    maxLeverage
  );

  const px =
    spotPx != null && Number(spotPx) > 0
      ? Number(spotPx)
      : Number(candles[candles.length - 1]?.close) || entry;
  const missDist = Math.abs(px - entry) / Math.max(entry, 1);
  const missThreshold = microSlBand().maxPct * 2.5;

  const newsGate = evalMergedDeskNewsEntryGate(newsHint ?? null);
  const mtfBlock = mergedDeskHtfSplitBlocksEnter({ mtfAligned, mtfAlignmentScore });
  const tfOk = SCALP_TFS.has(tf);
  const slLiqOk =
    dir === 'LONG'
      ? sl > liq * 1.0003 && sl < entry
      : sl < liq * 0.9997 && sl > entry;
  const invBroken =
    bouncePath && dir === 'LONG'
      ? closeInvalidated(candles, dir, inv)
      : active.status === 'INVALID' || closeInvalidated(candles, dir, inv);
  const hotTouch = hotZoneTouchOk(hotZone, dir, lastBar) || bandTouch.wickTouch;
  const practiceOk =
    !practiceAi ||
    (!practiceAi.state.includes('MISSED') &&
      (practiceAi.direction === 'NEUTRAL' || practiceAi.direction === dir));
  const practiceFire =
    practiceAi?.state === 'CONFIRMED_LONG' || practiceAi?.state === 'CONFIRMED_SHORT'
      ? practiceAi.direction === dir
      : false;
  const masterOk =
    !master ||
    (master.side === dir && master.entryAllowed !== false) ||
    (master.side === 'WAIT' && master.rawDirection === dir);
  const masterBlock =
    master && master.side !== 'WAIT' && master.side !== dir
      ? `마스터 ${master.side} · 방향불일치`
      : master && !master.entryAllowed
        ? master.gateBlockReasons[0] ?? '마스터 진입잠금'
        : null;

  const rsiVal = lastRsiVal(candles);
  const momentumBase =
    rsiVal != null && mergedLeadingMomentumGate(rsiVal, dir, true);
  const momentumOk = scalp200BandTouchMomentumOk({
    rsiVal,
    direction: dir,
    bandTouch,
    baseOk: momentumBase,
    last: lastBar,
  });
  const macdOk = evalScalp200MacdOk(candles, dir);

  const gateChecks: Array<{ ok: boolean; label: string }> = [
    { ok: tfOk, label: tfOk ? `TF ${tf} OK` : `TF ${tf} — 1m~15m 권장` },
    {
      ok: hotTouch || active.status !== 'WAIT' || bouncePath,
      label: bandTouch.wickTouch ? '존·wick터치' : '터치/존',
    },
    { ok: rr >= minRr, label: `RR≥${minRr.toFixed(1)} (${rr.toFixed(1)})` },
    { ok: roeAtSlPct <= riskPct * 25 && roeAtSlPct > 0, label: `ROE@SL ${roeAtSlPct.toFixed(0)}%` },
    { ok: slLiqOk, label: 'SL·청산 거리' },
    { ok: !newsGate?.blockEnter, label: newsGate?.blockEnter ? newsGate.reasonKo : '뉴스창 OK' },
    { ok: !mtfBlock?.block, label: mtfBlock?.block ? mtfBlock.reasonKo : 'MTF OK' },
    { ok: practiceOk && !masterBlock, label: masterBlock ?? (practiceOk ? '실전AI·마스터 OK' : '실전AI 충돌') },
    {
      ok: journalTouchOk,
      label: journalTouch.ok
        ? `${journalTouch.sourceKo ?? '기록부'} ✓`
        : bandTouch.journalBandTouch
          ? '기록부밴드 ✓'
          : barTouchEntry
            ? '봉·E터치 ✓'
            : bandTouch.wickTouch
              ? 'wick터치 ✓'
              : '기록부·E터치 대기',
    },
    {
      ok: !journalConflict.block,
      label: journalConflict.reasonKo ?? '기록부·충돌없음',
    },
    {
      ok: momentumOk,
      label: momentumOk
        ? `RSI ${Math.round(rsiVal!)} ✓`
        : rsiVal != null
          ? `RSI ${Math.round(rsiVal)} · 모멘텀대기`
          : 'RSI · 데이터부족',
    },
    {
      ok: macdOk,
      label: macdOk ? 'MACD·방향 ✓' : 'MACD·방향대기',
    },
  ];

  const gatesPassed = gateChecks.filter((g) => g.ok).length;
  const blockersKo = gateChecks.filter((g) => !g.ok).map((g) => g.label);

  const triggerSteps: Scalp200TriggerStep[] = [
    { id: 'setup', labelKo: '셋업', done: entry > 0 },
    { id: 'zone', labelKo: '존·터치', done: hotTouch || active.status !== 'WAIT' || bouncePath },
    {
      id: 'struct',
      labelKo: '구조',
      done: active.status === 'ENTER' || practiceFire || active.entryAllowed,
    },
    { id: 'journal', labelKo: '기록부E', done: journalTouchOk },
    { id: 'momentum', labelKo: 'RSI·MACD', done: momentumOk && macdOk },
    { id: 'gate', labelKo: '게이트', done: gatesPassed >= 10 },
    { id: 'fire', labelKo: '타점확정', done: false },
  ];

  const readyForConfirm =
    fireTouchOk &&
    (active.status === 'ENTER' || active.entryAllowed || bouncePath || bandTouch.dumpFloorBounce) &&
    gatesPassed >= (bouncePath || bandTouch.dumpFloorBounce ? 9 : 10) &&
    !invBroken &&
    slLiqOk &&
    !journalConflict.block &&
    momentumOk &&
    (macdOk || (bouncePath && bandTouch.wickTouch));

  let state: Scalp200State = 'WAIT';
  if ((active.status === 'INVALID' && !bouncePath) || (invBroken && !bouncePath) || journalConflict.block) {
    state = 'INVALID';
  } else if (missDist > missThreshold && active.status !== 'ENTER' && !hotTouch && !bouncePath) {
    state = 'MISSED';
  } else if (readyForConfirm) {
    state = 'FIRE';
  } else if (
    active.status === 'TOUCH' ||
    hotTouch ||
    journalTouchOk ||
    bandTouch.wickTouch ||
    bouncePath ||
    missDist <= microSlBand().maxPct * 1.5
  ) {
    state = 'ARMED';
  }

  const zoneLife = evaluateScalp200AiZoneLife({
    candles,
    direction: dir,
    entry,
    engineState: state,
    entryAllowed: readyForConfirm,
    journalTouchOk,
    hotTouch,
    practiceFire,
    masterOk: masterOk && !masterBlock,
    gatesPassed,
    gatesTotal: 12,
    invBroken: invBroken && !bouncePath,
    journalConflict: journalConflict.block,
    missDist,
    missThreshold,
    spotPx,
    bandTouch,
  });

  if (zoneLife.lifeState === 'CONFIRM_ENTRY') {
    state = 'FIRE';
    triggerSteps[6]!.done = true;
  } else if (zoneLife.lifeState === 'ARMED') {
    state = 'ARMED';
  } else if (zoneLife.lifeState === 'INVALID') {
    state = 'INVALID';
  } else if (zoneLife.lifeState === 'MISSED') {
    state = 'MISSED';
  } else if (state === 'FIRE') {
    state = 'ARMED';
  }

  const entryAllowed = zoneLife.lifeState === 'CONFIRM_ENTRY';

  const gateStepsKo = [
    `WATCH ${zoneLife.lifeState === 'WATCH' ? '●' : '✓'}`,
    `ARMED ${zoneLife.lifeState === 'ARMED' || zoneLife.lifeState === 'CONFIRM_ENTRY' ? '✓' : '○'}`,
    `확정 ${zoneLife.lifeState === 'CONFIRM_ENTRY' ? '●' : '○'}`,
  ];

  const summaryKo = [
    `AI200 · ${zoneLife.lifeKo}`,
    `${dir} E${fmt(entry)}`,
    bouncePath ? 'V반등' : null,
    bandTouch.evidenceKo.slice(0, 2).join('+') || zoneLife.evidenceKo.slice(0, 2).join('+') || null,
    `RR ${rr.toFixed(1)} · ${gatesPassed}/12`,
  ]
    .filter(Boolean)
    .join(' · ');

  const detailKo = [
    zoneLife.reasonsKo.join(' · '),
    `ROE@SL ${roeAtSlPct.toFixed(0)}% · ≈${actualLeverage.toFixed(0)}x/${maxLeverage}x`,
    triggerSteps.map((t) => `${t.labelKo}${t.done ? '✓' : '○'}`).join(' → '),
    blockersKo.length ? `보류: ${blockersKo.slice(0, 3).join(' · ')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const pack: Scalp200PlanPack = {
    state,
    stateKo:
      zoneLife.lifeState === 'CONFIRM_ENTRY' ? '타점확정' : STATE_KO[state],
    entryAllowed,
    direction: dir,
    entry,
    stopLoss: sl,
    tp1,
    tp2,
    tp3,
    invalidationPrice: inv,
    liquidationPrice: liq,
    maxLeverage,
    actualLeverage,
    roeAtSlPct,
    rr,
    gatesPassed,
    gatesTotal: 12,
    gateStepsKo,
    triggerSteps,
    blockersKo,
    summaryKo,
    detailKo,
    titleKo: `AI200 · ${maxLeverage}x · ${tf}`,
    priceLines: [],
    overlays: [],
    disclaimerKo: DISCLAIMER,
    journalTouchOk,
    journalEntryRefined,
    zoneLife,
  };
  pack.priceLines = buildScalpPriceLines(pack, showTp23);
  pack.overlays = [];
  return pack;
}

export function summarizeScalp200PlanKo(pack: Scalp200PlanPack | null | undefined): string | null {
  return pack?.summaryKo ?? null;
}
