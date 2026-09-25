import type { AnalyzeResponse } from '@/types';
import type { MonthDeskUnifiedCoreMoney } from '@/lib/monthDeskUnifiedCoreMoney';

export type MonthDeskCoreLevels = {
  close: number | null;
  support: number | null;
  resistance: number | null;
  invalidation: number | null;
  entryLow: number | null;
  entryHigh: number | null;
  entryMid: number | null;
  targets: number[];
};

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 한눈 가격 맵 — 지지·저항·타점·무효·TP */
export function buildMonthDeskCoreLevels(
  analysis: AnalyzeResponse | null,
  ucm: MonthDeskUnifiedCoreMoney | null,
  close: number | null
): MonthDeskCoreLevels {
  const zc = analysis?.zoneBiasCard;
  const support = num(analysis?.supportLevel?.price ?? analysis?.supportLevel);
  const resistance = num(analysis?.resistanceLevel?.price ?? analysis?.resistanceLevel);
  let invalidation = num(analysis?.invalidationLevel?.price ?? analysis?.invalidationLevel);
  const aiInv = analysis?.aiUnifiedLongShort?.invalidation?.price;
  if (aiInv != null && Number.isFinite(aiInv)) {
    if (invalidation == null) invalidation = aiInv;
    else if (analysis?.verdict === 'LONG') invalidation = Math.min(invalidation, aiInv);
    else if (analysis?.verdict === 'SHORT') invalidation = Math.max(invalidation, aiInv);
    else invalidation = aiInv;
  }

  let entryLow = ucm ? Math.min(ucm.priceBot, ucm.priceTop) : num(zc?.low);
  let entryHigh = ucm ? Math.max(ucm.priceBot, ucm.priceTop) : num(zc?.high);
  let entryMid = ucm?.priceMid ?? (entryLow != null && entryHigh != null ? (entryLow + entryHigh) / 2 : null);

  const aiWatch = analysis?.aiUnifiedLongShort?.watch;
  if (aiWatch?.low != null && aiWatch?.high != null) {
    const wLo = Math.min(aiWatch.low, aiWatch.high);
    const wHi = Math.max(aiWatch.low, aiWatch.high);
    entryLow = entryLow != null ? Math.min(entryLow, wLo) : wLo;
    entryHigh = entryHigh != null ? Math.max(entryHigh, wHi) : wHi;
    entryMid = (entryLow + entryHigh) / 2;
  }

  const targets: number[] = [];
  if (Array.isArray(analysis?.targets)) {
    for (const t of analysis.targets) {
      const p = num(parseFloat(String(t).replace(/[^\d.-]/g, '')));
      if (p != null) targets.push(p);
    }
  }

  return {
    close: close ?? num(analysis?.currentPrice),
    support,
    resistance,
    invalidation,
    entryLow,
    entryHigh,
    entryMid,
    targets: targets.slice(0, 3),
  };
}

export function coreLevelsPriceSpan(lv: MonthDeskCoreLevels): { min: number; max: number } | null {
  const pts = [
    lv.close,
    lv.support,
    lv.resistance,
    lv.invalidation,
    lv.entryLow,
    lv.entryHigh,
    lv.entryMid,
    ...lv.targets,
  ].filter((p): p is number => p != null && Number.isFinite(p));
  if (!pts.length) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const pad = Math.max((max - min) * 0.12, max * 0.004);
  return { min: min - pad, max: max + pad };
}
