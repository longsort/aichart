import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import { buildMonthDeskCoreLevels } from '@/lib/monthDeskCoreLevels';
import { computeTradePlan } from '@/lib/tradePlanner';
import { buildSwingShortZonePlan } from '@/lib/swingShortZonePlan';
import { atrSeries } from '@/lib/indicators';

export type AtlasStatus = 'at_entry' | 'near_entry' | 'wait_pullback' | 'wait_breakout' | 'invalid_hit' | 'ready' | 'neutral';

export type AtlasVerdict = 'LONG' | 'SHORT' | 'WATCH';

export type AtlasTakeProfit = {
  label: string;
  price: number;
  rr: number;
};

export type AtlasZoneBand = {
  low: number;
  high: number;
  labelKo: string;
  overlayId?: string;
};

export type CandleTradeAtlas = {
  timeframe: string;
  currentPrice: number;
  verdict: AtlasVerdict;
  verdictLabel: string;
  confidence: number;
  longPct: number;
  shortPct: number;
  /** 롱 관심 구간 (지지·수요) */
  longZone: AtlasZoneBand | null;
  /** 숏 관심 구간 (저항·공급) */
  shortZone: AtlasZoneBand | null;
  entry: number;
  entryBand: { low: number; high: number } | null;
  stopLoss: number;
  takeProfits: AtlasTakeProfit[];
  rrTp1: number;
  status: AtlasStatus;
  statusKo: string;
  actionKo: string;
  gateLine: string | null;
  notes: string[];
};

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fmtPx(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toFixed(2);
}

function fmtRange(lo: number, hi: number): string {
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  return a === b ? fmtPx(a) : `${fmtPx(a)} ~ ${fmtPx(b)}`;
}

function parseTargets(analysis: AnalyzeResponse, isLong: boolean): number[] {
  const raw: number[] = [];
  for (const t of analysis.targets ?? []) {
    const p = num(typeof t === 'string' ? parseFloat(String(t).replace(/[^\d.-]/g, '')) : t);
    if (p != null) raw.push(p);
  }
  for (const t of analysis.nextTargets ?? []) {
    const p = num(t);
    if (p != null) raw.push(p);
  }
  const u = [...new Set(raw.map((x) => Math.round(x * 1e8) / 1e8))].sort((a, b) => a - b);
  if (!u.length) return [];
  if (isLong) return u.slice(-3).reverse();
  return u.slice(0, 3);
}

function resolveVerdict(analysis: AnalyzeResponse): {
  verdict: AtlasVerdict;
  longPct: number;
  shortPct: number;
  confidence: number;
} {
  const raw = analysis.verdict;
  const verdict: AtlasVerdict = raw === 'LONG' ? 'LONG' : raw === 'SHORT' ? 'SHORT' : 'WATCH';
  const ls = Number(analysis.longScore ?? 0);
  const ss = Number(analysis.shortScore ?? 0);
  const sum = Math.max(0.01, ls + ss);
  const longPct = Math.round((ls / sum) * 100);
  const shortPct = 100 - longPct;
  const confidence = Math.round(Number(analysis.confidence ?? Math.max(longPct, shortPct)));
  return { verdict, longPct, shortPct, confidence };
}

function pricesFromOverlay(o: OverlayItem, minP: number, maxP: number): { low: number; high: number } | null {
  const p1 = num(o.price1);
  const p2 = num(o.price2);
  if (p1 != null && p2 != null) return { low: Math.min(p1, p2), high: Math.max(p1, p2) };
  const y1 = num(o.y1);
  const y2 = num(o.y2);
  if (y1 != null && y2 != null) {
    const range = maxP - minP;
    if (range <= 0) return null;
    const pAt = (y: number) => maxP - y * range;
    const a = pAt(y1);
    const b = pAt(y2);
    return { low: Math.min(a, b), high: Math.max(a, b) };
  }
  return null;
}

function candleRange(candles: Candle[]): { minP: number; maxP: number } | null {
  if (!candles.length) return null;
  let minP = Infinity;
  let maxP = -Infinity;
  for (const c of candles) {
    minP = Math.min(minP, c.low);
    maxP = Math.max(maxP, c.high);
  }
  if (!Number.isFinite(minP) || !Number.isFinite(maxP)) return null;
  return { minP, maxP };
}

function findOverlayBand(
  overlays: OverlayItem[],
  range: { minP: number; maxP: number } | null,
  pred: (o: OverlayItem) => boolean,
): AtlasZoneBand | null {
  if (!range) return null;
  for (const o of overlays) {
    if (!pred(o)) continue;
    const pr = pricesFromOverlay(o, range.minP, range.maxP);
    if (!pr) continue;
    return {
      low: pr.low,
      high: pr.high,
      labelKo: String(o.label || o.id || '구간'),
      overlayId: String(o.id || ''),
    };
  }
  return null;
}

function bandFromPrice(center: number, pad: number): AtlasZoneBand {
  return {
    low: center - pad,
    high: center + pad,
    labelKo: '핵심 레벨',
  };
}

function buildStatus(
  verdict: AtlasVerdict,
  close: number,
  entryLo: number | null,
  entryHi: number | null,
  inv: number | null
): Pick<CandleTradeAtlas, 'status' | 'statusKo' | 'actionKo'> {
  if (verdict === 'WATCH') {
    return {
      status: 'neutral',
      statusKo: '관망',
      actionKo: '롱·숏 방향이 엇갈립니다. 핵심 타점·무효 구간만 참고하고 신규 진입은 보류하세요.',
    };
  }
  if (entryLo == null && entryHi == null) {
    return {
      status: 'neutral',
      statusKo: '레벨 산출 중',
      actionKo: '타점 구간이 아직 없습니다. 분석·캔들 로드 후 다시 확인하세요.',
    };
  }
  const lo = entryLo ?? entryHi!;
  const hi = entryHi ?? entryLo!;
  const inBand = close >= Math.min(lo, hi) && close <= Math.max(lo, hi);
  const nearBand =
    !inBand &&
    (Math.abs(close - lo) / close < 0.006 || Math.abs(close - hi) / close < 0.006 || Math.abs(close - (lo + hi) / 2) / close < 0.008);

  if (inv != null) {
    if (verdict === 'LONG' && close <= inv) {
      return {
        status: 'invalid_hit',
        statusKo: '무효·손절 구간',
        actionKo: `종가가 손절 ${fmtPx(inv)} 아래 — 롱 시나리오 재검토.`,
      };
    }
    if (verdict === 'SHORT' && close >= inv) {
      return {
        status: 'invalid_hit',
        statusKo: '무효·손절 구간',
        actionKo: `종가가 손절 ${fmtPx(inv)} 위 — 숏 시나리오 재검토.`,
      };
    }
  }

  if (inBand) {
    return {
      status: 'at_entry',
      statusKo: verdict === 'LONG' ? '롱 타점 구간' : '숏 타점 구간',
      actionKo:
        verdict === 'LONG'
          ? `현재가가 롱 타점 ${fmtRange(lo, hi)} 안 — 분할·확인 후 진입 참고.`
          : `현재가가 숏 타점 ${fmtRange(lo, hi)} 안 — 되돌림·리테스트 숏 참고.`,
    };
  }
  if (nearBand) {
    return {
      status: 'near_entry',
      statusKo: '타점 근접',
      actionKo: `타점 ${fmtRange(lo, hi)} 근처 — ${verdict === 'LONG' ? '눌림' : '되돌림'} 확인 대기.`,
    };
  }
  if (verdict === 'LONG' && close > hi) {
    return {
      status: 'wait_pullback',
      statusKo: '눌림 대기',
      actionKo: `상단 이탈 — ${fmtRange(lo, hi)} 재테스트·지지 확인 후 롱.`,
    };
  }
  if (verdict === 'SHORT' && close < lo) {
    return {
      status: 'wait_pullback',
      statusKo: '반등 대기',
      actionKo: `하단 이탈 — ${fmtRange(lo, hi)} 되돌림·저항 확인 후 숏.`,
    };
  }
  return {
    status: 'ready',
    statusKo: verdict === 'LONG' ? '롱 준비' : '숏 준비',
    actionKo: `핵심 타점 ${fmtRange(lo, hi)} · 손절 ${inv != null ? fmtPx(inv) : '—'} 기준으로 추적.`,
  };
}

/**
 * 모든 TF(분·시·일·주·월) 공통 — 롱/숏 구간, 핵심 타점, 손절, TP1~3를 한 세트로 합성.
 * analyze·구조·존·ATR·스윙 ZONE·tradePlanner를 교차 검증(참고용, 확정 아님).
 */
export function buildCandleTradeAtlas(
  analysis: AnalyzeResponse | null,
  candles: Candle[] | null,
  timeframe: string
): CandleTradeAtlas | null {
  if (!analysis || !candles?.length) return null;
  const last = candles[candles.length - 1];
  const close = num(analysis.currentPrice) ?? last.close;
  if (close == null || close <= 0) return null;

  const { verdict, longPct, shortPct, confidence } = resolveVerdict(analysis);
  const verdictLabel = verdict === 'LONG' ? '롱 LONG' : verdict === 'SHORT' ? '숏 SHORT' : '관망 WATCH';

  const levels = buildMonthDeskCoreLevels(analysis, null, close);
  const overlays = (analysis.overlays ?? []) as OverlayItem[];
  const range = candleRange(candles);

  const atrArr = analysis.indicators?.atr;
  let atrVal = atrArr?.length ? num(atrArr[atrArr.length - 1]) : null;
  if (atrVal == null && candles.length >= 15) {
    const raw = atrSeries(candles, 14);
    atrVal = num(raw[raw.length - 1]);
  }
  atrVal = atrVal ?? close * 0.008;

  const buyZ = analysis.nearestBuyZone;
  const sellZ = analysis.nearestSellZone;
  const sup = num(analysis.supportLevel?.price ?? analysis.supportLevel);
  const res = num(analysis.resistanceLevel?.price ?? analysis.resistanceLevel);

  const reactionSupport = findOverlayBand(
    overlays,
    range,
    (o) => String(o.id) === 'reaction-zone-support' || String(o.id) === 'reaction-zone-entry'
  );
  const reactionResist = findOverlayBand(
    overlays,
    range,
    (o) => String(o.id) === 'reaction-zone-resistance'
  );
  const fvgSupply = findOverlayBand(
    overlays,
    range,
    (o) => String(o.label || '').includes('FVG·공급') || String(o.id).includes('typeom-fvg')
  );
  const fvgDemand = findOverlayBand(
    overlays,
    range,
    (o) => String(o.label || '').includes('FVG·수요')
  );

  const swingPlan = buildSwingShortZonePlan(
    analysis,
    { direction: verdict === 'SHORT' ? 'SHORT' : verdict === 'LONG' ? 'LONG' : 'NEUTRAL', grade: 'LEAN' },
    {
      verdict: verdict as 'LONG' | 'SHORT' | 'WATCH',
      gatePassed: !!analysis.confirmedSignal?.readinessTier,
      longOverall: longPct,
      shortOverall: shortPct,
      edge: longPct - shortPct,
      reason: analysis.summary ?? '',
    }
  );

  let longZone: AtlasZoneBand | null = null;
  if (buyZ && buyZ.high > buyZ.low) {
    longZone = { low: buyZ.low, high: buyZ.high, labelKo: '매수·지지 존' };
  } else if (reactionSupport) {
    longZone = { ...reactionSupport, labelKo: '반응·지지 (파랑)' };
  } else if (swingPlan?.tiers.blue) {
    const z = swingPlan.tiers.blue;
    longZone = { low: z.low, high: z.high, labelKo: z.labelKo, overlayId: z.overlayId };
  } else if (sup != null) {
    longZone = bandFromPrice(sup, Math.max(atrVal * 0.35, close * 0.0012));
    longZone.labelKo = '구조 지지';
  } else if (fvgDemand) {
    longZone = { ...fvgDemand, labelKo: 'FVG·수요(참고)' };
  }

  let shortZone: AtlasZoneBand | null = null;
  if (sellZ && sellZ.high > sellZ.low) {
    shortZone = { low: sellZ.low, high: sellZ.high, labelKo: '매도·저항 존' };
  } else if (reactionResist) {
    shortZone = { ...reactionResist, labelKo: '숏 우선 반응대 (노랑)' };
  } else if (swingPlan?.tiers.yellow) {
    const z = swingPlan.tiers.yellow;
    shortZone = { low: z.low, high: z.high, labelKo: z.labelKo, overlayId: z.overlayId };
  } else if (swingPlan?.tiers.red) {
    const z = swingPlan.tiers.red;
    shortZone = { low: z.low, high: z.high, labelKo: z.labelKo, overlayId: z.overlayId };
  } else if (res != null) {
    shortZone = bandFromPrice(res, Math.max(atrVal * 0.35, close * 0.0012));
    shortZone.labelKo = '구조 저항';
  } else if (fvgSupply) {
    shortZone = { ...fvgSupply, labelKo: 'FVG·공급(참고)' };
  }

  let entry = num(analysis.entry) ?? levels.entryMid ?? close;
  let entryLo = levels.entryLow;
  let entryHi = levels.entryHigh;

  if (entryLo == null && entryHi == null) {
    if (verdict === 'LONG' && longZone) {
      entryLo = longZone.low;
      entryHi = longZone.high;
      entry = (entryLo + entryHi) / 2;
    } else if (verdict === 'SHORT' && shortZone) {
      entryLo = shortZone.low;
      entryHi = shortZone.high;
      entry = (entryLo + entryHi) / 2;
    }
  }

  let stopLoss = levels.invalidation ?? num(analysis.invalidationLevel?.price ?? analysis.stopLoss);
  const eq =
    num((analysis as AnalyzeResponse & { equilibrium?: number }).equilibrium) ??
    num(analysis.breakoutLevel?.price) ??
    close;
  const rangeHigh = res ?? shortZone?.high ?? close * 1.02;
  const rangeLow = sup ?? longZone?.low ?? close * 0.98;

  const plan = computeTradePlan({
    signal: verdict === 'WATCH' ? 'WATCH' : verdict,
    currentPrice: close,
    equilibrium: eq,
    rangeHigh,
    rangeLow,
    atr: atrVal,
    timeframe,
  });

  if (stopLoss == null) stopLoss = plan.stopLoss;

  let targets = parseTargets(analysis, verdict === 'LONG' || (verdict === 'WATCH' && longPct >= shortPct));
  if (targets.length < 3 && plan.targets.length >= 3) {
    targets = plan.targets;
  } else if (!targets.length) {
    targets = plan.targets;
  }

  const risk =
    verdict === 'SHORT'
      ? Math.abs(stopLoss - entry)
      : verdict === 'LONG'
        ? Math.abs(entry - stopLoss)
        : Math.abs(entry - stopLoss);

  const takeProfits: AtlasTakeProfit[] = targets.slice(0, 3).map((price, i) => ({
    label: `TP${i + 1}`,
    price,
    rr: risk > 0 ? Math.round((Math.abs(price - entry) / risk) * 100) / 100 : 0,
  }));

  const rrTp1 = takeProfits[0]?.rr ?? plan.rr;

  const cs = analysis.confirmedSignal;
  const gatesPass = cs
    ? [cs.structure, cs.rsi, cs.supportResistance, cs.close, cs.fvgZone].filter(Boolean).length
    : 0;
  const gateLine = cs ? `확정 ${gatesPass}/5 · ${cs.readinessTier ?? 'building'}` : null;

  const { status, statusKo, actionKo } = buildStatus(verdict, close, entryLo, entryHi, stopLoss);

  const notes: string[] = [];
  const rsiArr = analysis.indicators?.rsi;
  const rsiLast = rsiArr?.length ? rsiArr[rsiArr.length - 1] : null;
  if (rsiLast != null && rsiLast <= 30) {
    notes.push(`RSI≈${rsiLast.toFixed(1)} — 하단권(반등·숏 커버 참고).`);
  } else if (rsiLast != null && rsiLast >= 70) {
    notes.push(`RSI≈${rsiLast.toFixed(1)} — 상단권(추격·신규 롱 리스크).`);
  }
  const mtf = (analysis as AnalyzeResponse & { multiTF?: { htf?: string; ltf?: string; htfLabel?: string; ltfLabel?: string } }).multiTF;
  if (mtf?.htf) {
    notes.push(`MTF: ${mtf.htfLabel ?? 'HTF'} ${mtf.htf} · ${mtf.ltfLabel ?? 'LTF'} ${mtf.ltf ?? '—'}`);
  }
  notes.push('교육·참고용 — 확정 매매 아님. 무효 이탈 시 시나리오 재검토.');

  return {
    timeframe,
    currentPrice: close,
    verdict,
    verdictLabel,
    confidence,
    longPct,
    shortPct,
    longZone,
    shortZone,
    entry,
    entryBand:
      entryLo != null && entryHi != null
        ? { low: Math.min(entryLo, entryHi), high: Math.max(entryLo, entryHi) }
        : null,
    stopLoss,
    takeProfits,
    rrTp1,
    status,
    statusKo,
    actionKo,
    gateLine,
    notes,
  };
}
