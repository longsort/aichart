/**
 * 4전략 탐지 — 필수조건 정확히 3개 + 보너스(진입 차단 아님).
 * 마감봉만 구조 확정. 추격·단순 wick Sweep 금지.
 * 확정 승률·수익 아님.
 */
import type { Candle } from '@/types';
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';
import type {
  BonusItem,
  FourStrategyId,
  FourStrategySignal,
  FourStrategySide,
  MandatoryCheck,
  MarketRegime,
} from '@/lib/doksuri1/fourStrategyTypes';
import { gradeFromScore } from '@/lib/doksuri1/fourStrategyTypes';
import { resolveUltraScalpRoeCaps, roeTargetPriceSafe } from '@/lib/doksuri1/fourStrategyHelpers';

export type FourDetectContext = {
  symbol: string;
  timeframe: string;
  closedCandles: Candle[];
  dumpZones?: MtfDumpZoneSpec[] | null;
  rocketDir?: 'LONG' | 'SHORT' | null;
  sfp?: { side: 'bull' | 'bear'; price: number } | null;
  leverage: number;
  tp1RoePct?: number;
  tp2RoePct?: number;
  tp3RoePct?: number;
  /** 선택 보너스 입력 (없으면 캔들 근사) */
  cvdAgree?: boolean | null;
  oiRising?: boolean | null;
  htfTrend?: 'UP' | 'DOWN' | 'FLAT' | null;
};

function atr14(candles: Candle[]): number {
  const n = candles.length;
  if (n < 5) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    s += Math.max(a.high - a.low, Math.abs(a.high - b.close), Math.abs(a.low - b.close));
    c += 1;
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
}

function swingLow(candles: Candle[], look: number): { price: number; i: number } | null {
  const n = candles.length;
  if (n < 5) return null;
  const from = Math.max(2, n - look);
  let best = Number.POSITIVE_INFINITY;
  let bi = -1;
  for (let i = from; i < n - 1; i++) {
    const a = Number(candles[i - 1]!.low);
    const b = Number(candles[i]!.low);
    const c = Number(candles[i + 1]!.low);
    if (b <= a && b <= c && b < best) {
      best = b;
      bi = i;
    }
  }
  return bi >= 0 ? { price: best, i: bi } : null;
}

function swingHigh(candles: Candle[], look: number): { price: number; i: number } | null {
  const n = candles.length;
  if (n < 5) return null;
  const from = Math.max(2, n - look);
  let best = 0;
  let bi = -1;
  for (let i = from; i < n - 1; i++) {
    const a = Number(candles[i - 1]!.high);
    const b = Number(candles[i]!.high);
    const c = Number(candles[i + 1]!.high);
    if (b >= a && b >= c && b > best) {
      best = b;
      bi = i;
    }
  }
  return bi >= 0 ? { price: best, i: bi } : null;
}

function volExpand(candles: Candle[], at = -1): boolean {
  const n = candles.length;
  const idx = at < 0 ? n + at : at;
  if (idx < 7 || idx >= n) return false;
  const last = Number(candles[idx]!.volume) || 0;
  let s = 0;
  for (let i = idx - 6; i < idx; i++) s += Number(candles[i]!.volume) || 0;
  const avg = s / 6;
  return avg > 0 && last >= avg * 1.25;
}

function volShrink(candles: Candle[], at = -1): boolean {
  const n = candles.length;
  const idx = at < 0 ? n + at : at;
  if (idx < 7 || idx >= n) return false;
  const last = Number(candles[idx]!.volume) || 0;
  let s = 0;
  for (let i = idx - 6; i < idx; i++) s += Number(candles[i]!.volume) || 0;
  const avg = s / 6;
  return avg > 0 && last <= avg * 0.85;
}

/** Micro CHOCH / MSS — 마감봉 기준 */
function microChoCh(candles: Candle[], side: FourStrategySide): boolean {
  const n = candles.length;
  if (n < 6) return false;
  const a = candles[n - 3]!;
  const b = candles[n - 2]!;
  const c = candles[n - 1]!;
  if (side === 'LONG') {
    return Number(c.close) > Number(a.high) && Number(c.close) > Number(b.open);
  }
  return Number(c.close) < Number(a.low) && Number(c.close) < Number(b.open);
}

function displacementAt(
  candles: Candle[],
  atr: number,
  side: FourStrategySide,
  idx: number
): boolean {
  if (idx < 0 || idx >= candles.length) return false;
  const c = candles[idx]!;
  const body = Math.abs(Number(c.close) - Number(c.open));
  if (body < atr * 0.55) return false;
  if (side === 'LONG') return Number(c.close) > Number(c.open);
  return Number(c.close) < Number(c.open);
}

/** BOS — 최근 스윙 고/저 종가 돌파 (마감) */
function detectBos(
  candles: Candle[],
  side: FourStrategySide,
  look = 20
): { ok: boolean; level: number; i: number } {
  const n = candles.length;
  if (n < 10) return { ok: false, level: 0, i: -1 };
  const from = Math.max(2, n - look);
  if (side === 'LONG') {
    let best = 0;
    let bi = -1;
    for (let i = from; i < n - 2; i++) {
      const a = Number(candles[i - 1]!.high);
      const b = Number(candles[i]!.high);
      const c = Number(candles[i + 1]!.high);
      if (b >= a && b >= c && b > best) {
        best = b;
        bi = i;
      }
    }
    if (bi < 0) return { ok: false, level: 0, i: -1 };
    for (let i = bi + 2; i < n; i++) {
      if (Number(candles[i]!.close) > best) return { ok: true, level: best, i };
    }
    return { ok: false, level: best, i: -1 };
  }
  let best = Number.POSITIVE_INFINITY;
  let bi = -1;
  for (let i = from; i < n - 2; i++) {
    const a = Number(candles[i - 1]!.low);
    const b = Number(candles[i]!.low);
    const c = Number(candles[i + 1]!.low);
    if (b <= a && b <= c && b < best) {
      best = b;
      bi = i;
    }
  }
  if (bi < 0) return { ok: false, level: 0, i: -1 };
  for (let i = bi + 2; i < n; i++) {
    if (Number(candles[i]!.close) < best) return { ok: true, level: best, i };
  }
  return { ok: false, level: best, i: -1 };
}

export function inferMarketRegime(candles: Candle[]): MarketRegime {
  const n = candles.length;
  if (n < 20) return 'UNKNOWN';
  const atr = atr14(candles);
  const last = Number(candles[n - 1]!.close);
  const mid = Number(candles[n - 10]!.close);
  const early = Number(candles[n - 20]!.close);
  if (!(last > 0 && mid > 0 && early > 0)) return 'UNKNOWN';
  const range =
    Math.max(...candles.slice(n - 20).map((x) => x.high)) -
    Math.min(...candles.slice(n - 20).map((x) => x.low));
  if (atr / last > 0.012) return 'HIGH_VOL';
  if (atr / last < 0.0025) return 'LOW_VOL';
  const up = last > mid && mid > early;
  const dn = last < mid && mid < early;
  if (up && range / last > 0.008) return 'TREND_UP';
  if (dn && range / last > 0.008) return 'TREND_DOWN';
  if (range / last < 0.006) return 'RANGE';
  const recent = candles.slice(n - 5);
  const brokeHi =
    Number(recent[recent.length - 1]!.close) >
    Math.max(...candles.slice(n - 20, n - 5).map((x) => x.high));
  const brokeLo =
    Number(recent[recent.length - 1]!.close) <
    Math.min(...candles.slice(n - 20, n - 5).map((x) => x.low));
  if (brokeHi || brokeLo) return 'BREAKOUT';
  return 'CHOP';
}

function targets(
  entry: number,
  side: FourStrategySide,
  lev: number,
  tp1Pct: number,
  tp2Pct: number,
  tp3Pct: number,
  structureTp: number | null
): { tp1: number; tp2: number; tp3: number } {
  const caps = resolveUltraScalpRoeCaps({
    leverage: lev,
    tp1RoePct: tp1Pct,
    tp2RoePct: tp2Pct,
  });
  let tp1 = roeTargetPriceSafe(entry, side, lev, caps.tp1Roe);
  let tp2 = roeTargetPriceSafe(entry, side, lev, caps.tp2Roe);
  let tp3 = roeTargetPriceSafe(entry, side, lev, Math.max(caps.tp2Roe, tp3Pct / 100));
  if (structureTp != null && structureTp > 0) {
    if (side === 'LONG') {
      if (structureTp > entry) {
        tp1 = Math.min(tp1, structureTp);
        if (structureTp < tp2) tp2 = Math.max(tp1 * 1.0001, Math.min(tp2, structureTp * 1.002));
      }
    } else if (structureTp < entry) {
      tp1 = Math.max(tp1, structureTp);
      if (structureTp > tp2) tp2 = Math.min(tp1 * 0.9999, Math.max(tp2, structureTp * 0.998));
    }
  }
  return { tp1, tp2, tp3 };
}

function dedupeBonus(items: BonusItem[]): BonusItem[] {
  const seen = new Set<string>();
  const out: BonusItem[] = [];
  for (const it of items) {
    if (it.points <= 0) continue;
    if (seen.has(it.key)) continue;
    seen.add(it.key);
    out.push(it);
  }
  return out;
}

function buildSignal(
  id: FourStrategyId,
  side: FourStrategySide,
  ctx: FourDetectContext,
  mandatory: MandatoryCheck[],
  bonusRaw: BonusItem[],
  entry: number,
  stop: number,
  reason: string,
  regime: MarketRegime,
  structureTp: number | null
): FourStrategySignal | null {
  const mandatoryCount = mandatory.filter((m) => m.ok).length;
  if (mandatoryCount < 3) return null;

  const bonusItems = dedupeBonus(bonusRaw);
  let bonusScore = bonusItems.reduce((s, b) => s + b.points, 0);
  bonusScore = Math.min(40, bonusScore);
  const score = Math.min(100, 60 + bonusScore);
  const grade = gradeFromScore(mandatoryCount, score);
  const t = targets(
    entry,
    side,
    ctx.leverage,
    ctx.tp1RoePct ?? 5,
    ctx.tp2RoePct ?? 7,
    ctx.tp3RoePct ?? 10,
    structureTp
  );
  const move = side === 'LONG' ? (t.tp1 - entry) / entry : (entry - t.tp1) / entry;
  const evidence = [
    ...mandatory.filter((m) => m.ok).map((m) => m.key),
    ...bonusItems.map((b) => b.key),
  ];
  return {
    strategyId: id,
    side,
    score,
    mandatoryCount,
    mandatory,
    bonusScore,
    bonusItems,
    grade,
    entry,
    stop,
    tp1: t.tp1,
    tp2: t.tp2,
    tp3: t.tp3,
    evidence,
    entryReason: reason,
    failureRisk: Math.max(5, Math.min(80, 100 - score)),
    expectedNetRoiPct: move * ctx.leverage * 100 * 0.7,
    timestamp: Date.now(),
    regime,
  };
}

function regimeBonus(id: FourStrategyId, regime: MarketRegime): BonusItem | null {
  if (id === 'TREND_CONTINUATION' && (regime === 'TREND_UP' || regime === 'TREND_DOWN')) {
    return { key: 'regime', labelKo: '레짐추세', points: 5 };
  }
  if (id === 'BREAKOUT_RETEST' && (regime === 'BREAKOUT' || regime === 'TREND_UP' || regime === 'TREND_DOWN')) {
    return { key: 'regime', labelKo: '레짐돌파', points: 5 };
  }
  if (id === 'SWEEP_REVERSAL' && (regime === 'RANGE' || regime === 'CHOP')) {
    return { key: 'regime', labelKo: '레짐레인지', points: 5 };
  }
  if (id === 'ZONE_DEFENSE' && (regime === 'RANGE' || regime === 'CHOP' || regime === 'LOW_VOL')) {
    return { key: 'regime', labelKo: '레짐존', points: 5 };
  }
  return null;
}

function commonFlowBonus(
  ctx: FourDetectContext,
  side: FourStrategySide,
  candles: Candle[]
): BonusItem[] {
  const out: BonusItem[] = [];
  if (volExpand(candles)) out.push({ key: 'vol', labelKo: '거래량확대', points: 8 });
  if (ctx.cvdAgree === true) out.push({ key: 'cvd', labelKo: 'CVD동방', points: 8 });
  if (ctx.oiRising === true) out.push({ key: 'oi', labelKo: 'OI증가', points: 5 });
  if (
    (side === 'LONG' && ctx.htfTrend === 'UP') ||
    (side === 'SHORT' && ctx.htfTrend === 'DOWN')
  ) {
    out.push({ key: 'htf', labelKo: 'HTF일치', points: 5 });
  } else if (ctx.rocketDir === side) {
    out.push({ key: 'htf', labelKo: '구조로켓일치', points: 5 });
  }
  return out;
}

/** A — Sweep + Reclaim + CHOCH/MSS (필수) · 단순 wick만으로 금지 */
export function detectSweepReversal(ctx: FourDetectContext): FourStrategySignal | null {
  const c = ctx.closedCandles;
  const n = c.length;
  if (n < 16) return null;
  const atr = atr14(c);
  const regime = inferMarketRegime(c);
  const last = c[n - 1]!;
  const sweepBar = c[n - 2]!;
  const entry = Number(last.close);
  const sl = swingLow(c.slice(0, n - 2), 24);
  const sh = swingHigh(c.slice(0, n - 2), 24);

  /** LONG */
  {
    const level = ctx.sfp?.side === 'bull' ? ctx.sfp.price : sl?.price;
    if (level != null && level > 0) {
      const swept =
        Number(sweepBar.low) < level - atr * 0.02 ||
        (ctx.sfp?.side === 'bull' && Number(sweepBar.low) <= ctx.sfp.price + atr * 0.05);
      const reclaim = entry > level && Number(last.close) > level;
      const choch = microChoCh(c, 'LONG');
      const mandatory: MandatoryCheck[] = [
        { key: 'sweep', labelKo: 'Sweep/SFP', ok: !!swept },
        { key: 'reclaim', labelKo: 'Reclaim', ok: !!reclaim },
        { key: 'choch', labelKo: 'CHOCH/MSS', ok: !!choch },
      ];
      if (mandatory.every((m) => m.ok)) {
        const bonus: BonusItem[] = [
          ...commonFlowBonus(ctx, 'LONG', c),
          ...(displacementAt(c, atr, 'LONG', n - 1)
            ? [{ key: 'disp', labelKo: 'Displacement', points: 5 }]
            : []),
          ...(ctx.sfp?.side === 'bull' ? [{ key: 'sfp', labelKo: 'SFP확인', points: 4 }] : []),
          ...(regimeBonus('SWEEP_REVERSAL', regime)
            ? [regimeBonus('SWEEP_REVERSAL', regime)!]
            : []),
        ];
        const stop = Math.min(Number(sweepBar.low), level) - atr * 0.15;
        const zoneTp =
          ctx.dumpZones?.find((z) => z.bandRole === 'ceiling' && z.mid > entry)?.mid ??
          sh?.price ??
          null;
        return buildSignal(
          'SWEEP_REVERSAL',
          'LONG',
          ctx,
          mandatory,
          bonus,
          entry,
          stop,
          'SWEEP_RECLAIM_CHOCH',
          regime,
          zoneTp
        );
      }
    }
  }

  /** SHORT */
  {
    const level = ctx.sfp?.side === 'bear' ? ctx.sfp.price : sh?.price;
    if (level != null && level > 0) {
      const swept =
        Number(sweepBar.high) > level + atr * 0.02 ||
        (ctx.sfp?.side === 'bear' && Number(sweepBar.high) >= ctx.sfp.price - atr * 0.05);
      const reclaim = entry < level && Number(last.close) < level;
      const choch = microChoCh(c, 'SHORT');
      const mandatory: MandatoryCheck[] = [
        { key: 'sweep', labelKo: 'Sweep/SFP', ok: !!swept },
        { key: 'reclaim', labelKo: 'Reclaim', ok: !!reclaim },
        { key: 'choch', labelKo: 'CHOCH/MSS', ok: !!choch },
      ];
      if (mandatory.every((m) => m.ok)) {
        const bonus: BonusItem[] = [
          ...commonFlowBonus(ctx, 'SHORT', c),
          ...(displacementAt(c, atr, 'SHORT', n - 1)
            ? [{ key: 'disp', labelKo: 'Displacement', points: 5 }]
            : []),
          ...(ctx.sfp?.side === 'bear' ? [{ key: 'sfp', labelKo: 'SFP확인', points: 4 }] : []),
          ...(regimeBonus('SWEEP_REVERSAL', regime)
            ? [regimeBonus('SWEEP_REVERSAL', regime)!]
            : []),
        ];
        const stop = Math.max(Number(sweepBar.high), level) + atr * 0.15;
        const zoneTp =
          ctx.dumpZones?.find((z) => z.bandRole !== 'ceiling' && z.mid < entry)?.mid ??
          sl?.price ??
          null;
        return buildSignal(
          'SWEEP_REVERSAL',
          'SHORT',
          ctx,
          mandatory,
          bonus,
          entry,
          stop,
          'SWEEP_RECLAIM_CHOCH',
          regime,
          zoneTp
        );
      }
    }
  }
  return null;
}

/** B — BOS + Displacement + First OB/FVG Retest · 추격 금지 */
export function detectTrendContinuation(ctx: FourDetectContext): FourStrategySignal | null {
  const c = ctx.closedCandles;
  const n = c.length;
  if (n < 24) return null;
  const atr = atr14(c);
  const regime = inferMarketRegime(c);
  const last = c[n - 1]!;
  const entry = Number(last.close);

  for (const side of ['LONG', 'SHORT'] as const) {
    const bos = detectBos(c, side, 22);
    if (!bos.ok || bos.i < 0) continue;

    /** Displacement after BOS, before last bar (추격 금지: 마지막이 대형 변위면 제외) */
    let dispI = -1;
    for (let i = Math.max(bos.i, n - 8); i < n - 1; i++) {
      if (displacementAt(c, atr, side, i)) dispI = i;
    }
    if (dispI < 0) continue;
    if (displacementAt(c, atr, side, n - 1) && dispI === n - 2 && !volShrink(c, n - 1)) {
      /** 대형 상승/하락 직후 추격 */
      const lastBody = Math.abs(Number(last.close) - Number(last.open));
      if (lastBody >= atr * 0.7) continue;
    }

    const disp = c[dispI]!;
    const zoneTop = Math.max(Number(disp.open), Number(disp.close));
    const zoneBot = Math.min(Number(disp.open), Number(disp.close));
    const zonePad = atr * 0.15;
    const retest =
      side === 'LONG'
        ? Number(last.low) <= zoneTop + zonePad &&
          Number(last.low) >= zoneBot - zonePad * 2 &&
          Number(last.close) > zoneBot &&
          Number(last.close) > Number(last.open)
        : Number(last.high) >= zoneBot - zonePad &&
          Number(last.high) <= zoneTop + zonePad * 2 &&
          Number(last.close) < zoneTop &&
          Number(last.close) < Number(last.open);

    const dumpTouch = (ctx.dumpZones ?? []).some((z) => {
      if (side === 'LONG') {
        return z.bandRole !== 'ceiling' && entry >= z.bot - atr * 0.2 && entry <= z.top + atr * 0.35;
      }
      return z.bandRole === 'ceiling' && entry <= z.top + atr * 0.2 && entry >= z.bot - atr * 0.35;
    });

    const firstRetest = retest || dumpTouch;
    const mandatory: MandatoryCheck[] = [
      { key: 'bos', labelKo: 'BOS', ok: true },
      { key: 'disp', labelKo: 'Displacement', ok: true },
      { key: 'retest', labelKo: '첫 OB/FVG Retest', ok: !!firstRetest },
    ];
    if (!firstRetest) continue;

    const slPivot = side === 'LONG' ? swingLow(c, 16) : swingHigh(c, 16);
    if (!slPivot) continue;
    const stop =
      side === 'LONG'
        ? Math.min(slPivot.price, zoneBot) - atr * 0.1
        : Math.max(slPivot.price, zoneTop) + atr * 0.1;

    const bonus: BonusItem[] = [
      ...commonFlowBonus(ctx, side, c),
      ...(dumpTouch ? [{ key: 'fresh', labelKo: 'Fresh존', points: 5 }] : []),
      { key: 'first', labelKo: 'FirstRetest', points: 4 },
      ...(regimeBonus('TREND_CONTINUATION', regime)
        ? [regimeBonus('TREND_CONTINUATION', regime)!]
        : []),
    ];
    const sh = swingHigh(c, 30);
    const sl = swingLow(c, 30);
    const sig = buildSignal(
      'TREND_CONTINUATION',
      side,
      ctx,
      mandatory,
      bonus,
      entry,
      stop,
      'BOS_DISP_RETEST',
      regime,
      side === 'LONG' ? sh?.price ?? null : sl?.price ?? null
    );
    if (sig) return sig;
  }
  return null;
}

/** C — Absorption Defense: Strong Zone + Absorption + Reclaim */
export function detectZoneDefense(ctx: FourDetectContext): FourStrategySignal | null {
  const c = ctx.closedCandles;
  const n = c.length;
  if (n < 12) return null;
  const atr = atr14(c);
  const regime = inferMarketRegime(c);
  const last = c[n - 1]!;
  const prev = c[n - 2]!;
  const entry = Number(last.close);

  type Zone = { bot: number; top: number; mid: number; bandRole: 'floor' | 'ceiling'; fresh: boolean };
  const zones: Zone[] = [];
  for (const z of ctx.dumpZones ?? []) {
    zones.push({
      bot: z.bot,
      top: z.top,
      mid: z.mid,
      bandRole: z.bandRole === 'ceiling' ? 'ceiling' : 'floor',
      fresh: true,
    });
  }
  const sl = swingLow(c, 30);
  const sh = swingHigh(c, 30);
  if (sl) {
    zones.push({
      bot: sl.price - atr * 0.1,
      top: sl.price + atr * 0.25,
      mid: sl.price,
      bandRole: 'floor',
      fresh: false,
    });
  }
  if (sh) {
    zones.push({
      bot: sh.price - atr * 0.25,
      top: sh.price + atr * 0.1,
      mid: sh.price,
      bandRole: 'ceiling',
      fresh: false,
    });
  }
  if (!zones.length) return null;

  for (const z of zones) {
    const touched =
      Number(prev.low) <= z.top &&
      Number(prev.high) >= z.bot &&
      Math.abs(entry - z.mid) / Math.max(z.mid, 1e-9) < 0.012;
    if (!touched) continue;

    if (z.bandRole === 'floor') {
      const aggressiveSell =
        Number(prev.close) < Number(prev.open) &&
        Math.abs(Number(prev.close) - Number(prev.open)) >= atr * 0.25;
      const failLower =
        Number(prev.low) >= z.bot - atr * 0.05 &&
        (n < 4 || Number(prev.low) >= Number(c[n - 4]!.low) - atr * 0.02);
      const absorb = aggressiveSell && failLower;
      const reclaim = entry > z.mid && Number(last.close) > Number(last.open);
      const mandatory: MandatoryCheck[] = [
        { key: 'zone', labelKo: 'Strong Zone', ok: true },
        { key: 'absorb', labelKo: 'Absorption', ok: !!absorb },
        { key: 'reclaim', labelKo: 'Zone Reclaim', ok: !!reclaim },
      ];
      if (!absorb || !reclaim) continue;
      const bonus: BonusItem[] = [
        ...commonFlowBonus(ctx, 'LONG', c),
        ...(z.fresh ? [{ key: 'fresh', labelKo: 'Fresh존', points: 5 }] : []),
        ...(microChoCh(c, 'LONG') ? [{ key: 'mchoch', labelKo: 'MicroCHOCH', points: 5 }] : []),
        ...(volExpand(c) ? [] : []),
        ...(regimeBonus('ZONE_DEFENSE', regime) ? [regimeBonus('ZONE_DEFENSE', regime)!] : []),
      ];
      const stop = z.bot - atr * 0.12;
      const sig = buildSignal(
        'ZONE_DEFENSE',
        'LONG',
        ctx,
        mandatory,
        bonus,
        entry,
        stop,
        'ABSORB_RECLAIM',
        regime,
        zones.find((x) => x.bandRole === 'ceiling' && x.mid > entry)?.mid ?? null
      );
      if (sig) return sig;
    } else {
      const aggressiveBuy =
        Number(prev.close) > Number(prev.open) &&
        Math.abs(Number(prev.close) - Number(prev.open)) >= atr * 0.25;
      const failHigher =
        Number(prev.high) <= z.top + atr * 0.05 &&
        (n < 4 || Number(prev.high) <= Number(c[n - 4]!.high) + atr * 0.02);
      const absorb = aggressiveBuy && failHigher;
      const reclaim = entry < z.mid && Number(last.close) < Number(last.open);
      const mandatory: MandatoryCheck[] = [
        { key: 'zone', labelKo: 'Strong Zone', ok: true },
        { key: 'absorb', labelKo: 'Absorption', ok: !!absorb },
        { key: 'reclaim', labelKo: 'Zone Reclaim', ok: !!reclaim },
      ];
      if (!absorb || !reclaim) continue;
      const bonus: BonusItem[] = [
        ...commonFlowBonus(ctx, 'SHORT', c),
        ...(z.fresh ? [{ key: 'fresh', labelKo: 'Fresh존', points: 5 }] : []),
        ...(microChoCh(c, 'SHORT') ? [{ key: 'mchoch', labelKo: 'MicroCHOCH', points: 5 }] : []),
        ...(regimeBonus('ZONE_DEFENSE', regime) ? [regimeBonus('ZONE_DEFENSE', regime)!] : []),
      ];
      const stop = z.top + atr * 0.12;
      const sig = buildSignal(
        'ZONE_DEFENSE',
        'SHORT',
        ctx,
        mandatory,
        bonus,
        entry,
        stop,
        'ABSORB_RECLAIM',
        regime,
        zones.find((x) => x.bandRole === 'floor' && x.mid < entry)?.mid ?? null
      );
      if (sig) return sig;
    }
  }
  return null;
}

/** D — Breakout + Acceptance + Retest · 돌파봉 추격 금지 */
export function detectBreakoutRetest(ctx: FourDetectContext): FourStrategySignal | null {
  const c = ctx.closedCandles;
  const n = c.length;
  if (n < 20) return null;
  const atr = atr14(c);
  const regime = inferMarketRegime(c);
  const last = c[n - 1]!;
  const entry = Number(last.close);
  const look = c.slice(0, n - 4);
  if (look.length < 10) return null;
  const res = Math.max(...look.map((x) => x.high));
  const sup = Math.min(...look.map((x) => x.low));
  const brk = c[n - 3]!;
  const mid = c[n - 2]!;

  /** LONG */
  {
    const breakout = Number(brk.close) > res && Number(brk.close) > Number(brk.open);
    const acceptance = Number(mid.close) > res;
    const retest =
      Number(mid.low) <= res + atr * 0.2 &&
      Number(mid.low) >= res - atr * 0.4 &&
      entry > res &&
      Number(last.close) > Number(last.open);
    /** 돌파봉 자체가 마지막이면 추격 */
    const chase = displacementAt(c, atr, 'LONG', n - 1) && Number(last.low) > res + atr * 0.3;
    const mandatory: MandatoryCheck[] = [
      { key: 'breakout', labelKo: 'Breakout', ok: !!breakout },
      { key: 'accept', labelKo: 'Acceptance', ok: !!acceptance },
      { key: 'retest', labelKo: 'Retest', ok: !!retest && !chase },
    ];
    if (mandatory.every((m) => m.ok)) {
      const stop = Math.min(Number(mid.low), res) - atr * 0.1;
      const bonus: BonusItem[] = [
        ...commonFlowBonus(ctx, 'LONG', c),
        ...(volExpand(c, n - 3) ? [{ key: 'brkvol', labelKo: '돌파거래량', points: 5 }] : []),
        ...(volShrink(c, n - 2) ? [{ key: 'rtvol', labelKo: '리테스트거래량↓', points: 4 }] : []),
        ...(displacementAt(c, atr, 'LONG', n - 3)
          ? [{ key: 'disp', labelKo: '강한Displacement', points: 5 }]
          : []),
        ...(regimeBonus('BREAKOUT_RETEST', regime)
          ? [regimeBonus('BREAKOUT_RETEST', regime)!]
          : []),
      ];
      const sh = swingHigh(c, 40);
      return buildSignal(
        'BREAKOUT_RETEST',
        'LONG',
        ctx,
        mandatory,
        bonus,
        entry,
        stop,
        'BREAK_ACCEPT_RETEST',
        regime,
        sh?.price && sh.price > entry ? sh.price : null
      );
    }
  }

  /** SHORT */
  {
    const breakout = Number(brk.close) < sup && Number(brk.close) < Number(brk.open);
    const acceptance = Number(mid.close) < sup;
    const retest =
      Number(mid.high) >= sup - atr * 0.2 &&
      Number(mid.high) <= sup + atr * 0.4 &&
      entry < sup &&
      Number(last.close) < Number(last.open);
    const chase = displacementAt(c, atr, 'SHORT', n - 1) && Number(last.high) < sup - atr * 0.3;
    const mandatory: MandatoryCheck[] = [
      { key: 'breakout', labelKo: 'Breakout', ok: !!breakout },
      { key: 'accept', labelKo: 'Acceptance', ok: !!acceptance },
      { key: 'retest', labelKo: 'Retest', ok: !!retest && !chase },
    ];
    if (mandatory.every((m) => m.ok)) {
      const stop = Math.max(Number(mid.high), sup) + atr * 0.1;
      const bonus: BonusItem[] = [
        ...commonFlowBonus(ctx, 'SHORT', c),
        ...(volExpand(c, n - 3) ? [{ key: 'brkvol', labelKo: '돌파거래량', points: 5 }] : []),
        ...(volShrink(c, n - 2) ? [{ key: 'rtvol', labelKo: '리테스트거래량↓', points: 4 }] : []),
        ...(regimeBonus('BREAKOUT_RETEST', regime)
          ? [regimeBonus('BREAKOUT_RETEST', regime)!]
          : []),
      ];
      const sl = swingLow(c, 40);
      return buildSignal(
        'BREAKOUT_RETEST',
        'SHORT',
        ctx,
        mandatory,
        bonus,
        entry,
        stop,
        'BREAK_ACCEPT_RETEST',
        regime,
        sl?.price && sl.price < entry ? sl.price : null
      );
    }
  }
  return null;
}

export function detectAllFourStrategies(ctx: FourDetectContext): FourStrategySignal[] {
  const out: FourStrategySignal[] = [];
  const a = detectSweepReversal(ctx);
  const b = detectTrendContinuation(ctx);
  const c = detectZoneDefense(ctx);
  const d = detectBreakoutRetest(ctx);
  if (a) out.push(a);
  if (b) out.push(b);
  if (c) out.push(c);
  if (d) out.push(d);
  return out.sort((x, y) => y.score - x.score);
}
