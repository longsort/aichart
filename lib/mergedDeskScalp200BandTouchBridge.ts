/**
 * AI200 — 폭락·기관밴드 wick 터치 + 기록부(DUMP/INST) + 바닥 V반등 롱 경로.
 * 조건부 참고 — 승률·수익 보장 아님.
 */
import type { Candle } from '@/types';
import type { MergedDeskActiveTradePlan } from '@/lib/mergedDeskActiveTradePlan';
import type { MergedDeskHotZoneEntryPack } from '@/lib/mergedDeskHotZoneEntry';
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';
import { detectMtfDumpZone } from '@/lib/mergedDeskMtfDumpZoneBridge';
import { candleTouchesZone } from '@/lib/mergedDeskSignalOutcomeEngine';
import {
  filterRecentJournalEvents,
  hasRecentJournalTouchEntry,
} from '@/lib/mergedDeskTradeEventJournal';
import {
  getLastInstitutionalBandEdges,
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
} from '@/lib/institutionalSuperBand';
import { normalizeChartTimeframe } from '@/lib/constants';

export type Scalp200BandTouchEvidence = {
  wickTouch: boolean;
  journalBandTouch: boolean;
  dumpFloorBounce: boolean;
  touchPrice: number | null;
  evidenceKo: string[];
};

export type Scalp200DumpBounceOverride = {
  direction: 'LONG';
  entry: number;
  structuralSl: number;
  invalidationPrice: number;
  touchPrice: number;
  evidenceKo: string[];
};

function dumpExpectsLong(z: MtfDumpZoneSpec): boolean {
  const ls = z.lifeState;
  if (ls === 'CONFIRM_UP') return true;
  if (ls === 'CONFIRM_DOWN' || ls === 'CONFIRM_RESIST') return false;
  return z.bandRole === 'floor';
}

function dumpExpectsShort(z: MtfDumpZoneSpec): boolean {
  const ls = z.lifeState;
  if (ls === 'CONFIRM_DOWN' || ls === 'CONFIRM_RESIST') return true;
  if (ls === 'CONFIRM_UP') return false;
  return z.bandRole === 'ceiling';
}

/** 꼬리·몸통 overlap (저널 dump와 동일) */
export function candleWickOverlapsZone(
  last: Candle | null | undefined,
  bot: number,
  top: number
): boolean {
  return candleTouchesZone(last, bot, top);
}

export function hotZoneWickTouchOk(
  hotZone: MergedDeskHotZoneEntryPack | null | undefined,
  direction: 'LONG' | 'SHORT',
  last: Candle | null | undefined
): boolean {
  if (!hotZone || !last) return false;
  const side = direction === 'LONG' ? hotZone.below : hotZone.above;
  if (!side) return false;
  return candleWickOverlapsZone(last, side.bot, side.top);
}

function instBandWickTouch(
  candles: Candle[],
  direction: 'LONG' | 'SHORT'
): { ok: boolean; level: number } {
  const edges = getLastInstitutionalBandEdges(
    candles,
    INSTITUTIONAL_BAND_DEFAULT_PERIOD,
    INSTITUTIONAL_BAND_DEFAULT_MULT
  );
  if (!edges || candles.length < 8) return { ok: false, level: 0 };
  const last = candles[candles.length - 1]!;
  const ref = direction === 'LONG' ? edges.lower : edges.upper;
  const span = Math.max(Math.abs(ref) * 0.00035, 8);
  const bot = direction === 'LONG' ? ref - span : ref - span * 0.6;
  const top = direction === 'LONG' ? ref + span * 0.6 : ref + span;
  return {
    ok: candleWickOverlapsZone(last, bot, top),
    level: ref,
  };
}

function dumpZoneWickTouch(
  zones: MtfDumpZoneSpec[],
  direction: 'LONG' | 'SHORT',
  last: Candle | null | undefined
): { ok: boolean; zone: MtfDumpZoneSpec | null; touchPrice: number | null } {
  if (!last || !zones.length) return { ok: false, zone: null, touchPrice: null };
  for (const z of zones) {
    const expectLong = dumpExpectsLong(z);
    const expectShort = dumpExpectsShort(z);
    if (direction === 'LONG' && !expectLong) continue;
    if (direction === 'SHORT' && !expectShort) continue;
    if (!candleWickOverlapsZone(last, z.bot, z.top)) continue;
    const touchPrice = direction === 'LONG' ? Number(last.low) : Number(last.high);
    return { ok: true, zone: z, touchPrice: Number.isFinite(touchPrice) ? touchPrice : z.mid };
  }
  return { ok: false, zone: null, touchPrice: null };
}

function longLowerWickRejection(last: Candle | null | undefined): boolean {
  if (!last) return false;
  const o = Number(last.open);
  const h = Number(last.high);
  const l = Number(last.low);
  const c = Number(last.close);
  if (![o, h, l, c].every(Number.isFinite)) return false;
  const body = Math.abs(c - o);
  const lowerWick = Math.min(o, c) - l;
  const upperWick = h - Math.max(o, c);
  if (lowerWick <= 0) return false;
  if (body < 1e-9) return lowerWick >= upperWick * 0.85;
  return lowerWick >= body * 0.55 && lowerWick >= upperWick * 0.7;
}

function shortUpperWickRejection(last: Candle | null | undefined): boolean {
  if (!last) return false;
  const o = Number(last.open);
  const h = Number(last.high);
  const l = Number(last.low);
  const c = Number(last.close);
  if (![o, h, l, c].every(Number.isFinite)) return false;
  const body = Math.abs(c - o);
  const upperWick = h - Math.max(o, c);
  const lowerWick = Math.min(o, c) - l;
  if (upperWick <= 0) return false;
  if (body < 1e-9) return upperWick >= lowerWick * 0.85;
  return upperWick >= body * 0.55 && upperWick >= lowerWick * 0.7;
}

/** 기록부 — E 터치 + DUMP_ZONE_TOUCH + INST_BAND_TOUCH (방향·가격 근접) */
export function hasRecentJournalBandTouchForScalp200(params: {
  symbol: string;
  chartTf: string;
  direction: 'LONG' | 'SHORT';
  entry?: number;
  sinceMs?: number;
  tolRatio?: number;
}): { ok: boolean; touchPrice?: number; at?: number; sourceKo?: string } {
  const entryTouch = hasRecentJournalTouchEntry({
    symbol: params.symbol,
    chartTf: params.chartTf,
    entry: params.entry ?? 0,
    direction: params.direction,
    sinceMs: params.sinceMs,
    tolRatio: params.tolRatio,
  });
  if (entryTouch.ok) {
    return { ...entryTouch, sourceKo: '기록부E' };
  }

  const since = params.sinceMs ?? 6 * 60 * 1000;
  const tol = params.tolRatio ?? 0.004;
  const events = filterRecentJournalEvents({
    symbol: params.symbol,
    chartTf: params.chartTf,
    sinceMs: since,
    kinds: ['DUMP_ZONE_TOUCH', 'INST_BAND_TOUCH'],
  });

  const match = events.find((e) => {
    if (e.direction !== params.direction) return false;
    if (!(params.entry != null && params.entry > 0)) return true;
    const lv = e.levelPrice > 0 ? e.levelPrice : e.price;
    return Math.abs(lv - params.entry) / Math.max(params.entry, 1) <= tol;
  });

  if (!match) return { ok: false };
  return {
    ok: true,
    touchPrice: match.price > 0 ? match.price : match.levelPrice,
    at: match.at,
    sourceKo: match.kind === 'DUMP_ZONE_TOUCH' ? '기록부폭락' : '기록부밴드',
  };
}

function collectDumpZones(
  candles: Candle[],
  chartTf: string,
  registry?: MtfDumpZoneSpec[] | null
): MtfDumpZoneSpec[] {
  const tf = normalizeChartTimeframe(chartTf);
  const live = detectMtfDumpZone(candles, tf);
  const out: MtfDumpZoneSpec[] = [];
  const seen = new Set<string>();
  const push = (z: MtfDumpZoneSpec | null) => {
    if (!z) return;
    const key = `${z.sourceTf}|${z.bandRole ?? 'floor'}|${Math.round(z.mid)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(z);
  };
  push(live);
  for (const z of registry ?? []) push(z);
  return out;
}

function closeInvalidated(
  candles: Candle[],
  direction: 'LONG' | 'SHORT',
  inv: number
): boolean {
  if (!(inv > 0) || candles.length < 2) return false;
  const cl = Number(candles[candles.length - 1]!.close);
  if (!Number.isFinite(cl)) return false;
  return direction === 'LONG' ? cl < inv : cl > inv;
}

/** 숏 무효·폭락 바닥 꼬리 → 롱 V반등 AI200 경로 */
export function evalDumpBottomLongBounceOverride(params: {
  candles: Candle[];
  chartTf: string;
  activeTrade: MergedDeskActiveTradePlan;
  hotZone?: MergedDeskHotZoneEntryPack | null;
  dumpZones?: MtfDumpZoneSpec[] | null;
}): Scalp200DumpBounceOverride | null {
  const last = params.candles[params.candles.length - 1];
  if (!last) return null;

  const shortDead =
    params.activeTrade.direction === 'SHORT' &&
    (params.activeTrade.status === 'INVALID' ||
      closeInvalidated(params.candles, 'SHORT', params.activeTrade.invalidationPrice));
  const neutral = params.activeTrade.direction === 'NEUTRAL';
  if (!shortDead && !neutral) return null;
  if (!longLowerWickRejection(last)) return null;

  const zones = collectDumpZones(params.candles, params.chartTf, params.dumpZones);
  const dumpHit = dumpZoneWickTouch(zones, 'LONG', last);
  const hotHit = hotZoneWickTouchOk(params.hotZone, 'LONG', last);
  const instHit = instBandWickTouch(params.candles, 'LONG');

  if (!dumpHit.ok && !hotHit && !instHit.ok) return null;

  let entry = 0;
  let structuralSl = 0;
  let inv = 0;
  const evidence: string[] = ['V꼬리'];

  if (dumpHit.zone) {
    entry = dumpHit.zone.mid;
    structuralSl = Math.min(dumpHit.zone.bot, Number(last.low)) * 0.9992;
    inv = dumpHit.zone.bot * 0.9988;
    evidence.push(`폭락바닥·${dumpHit.zone.labelKo || dumpHit.zone.sourceTf}`);
  } else if (params.hotZone?.below) {
    const hz = params.hotZone.below;
    entry = hz.mid;
    structuralSl = hz.bot * 0.9992;
    inv = hz.bot * 0.9988;
    evidence.push('Hot존꼬리');
  } else if (instHit.ok) {
    entry = instHit.level;
    structuralSl = instHit.level * 0.9985;
    inv = instHit.level * 0.9978;
    evidence.push('기관밴드LH');
  }

  if (!(entry > 0)) return null;

  const touchPrice = dumpHit.touchPrice ?? Number(last.low);
  if (params.hotZone?.precision?.side === 'LONG' && params.hotZone.precision.entry > 0) {
    entry = params.hotZone.precision.entry;
    if (params.hotZone.precision.stopLoss > 0) structuralSl = params.hotZone.precision.stopLoss;
    if (params.hotZone.precision.invalidationPrice > 0) inv = params.hotZone.precision.invalidationPrice;
  }

  return {
    direction: 'LONG',
    entry,
    structuralSl,
    invalidationPrice: inv,
    touchPrice: Number.isFinite(touchPrice) ? touchPrice : entry,
    evidenceKo: evidence,
  };
}

export function evalScalp200BandTouchBundle(params: {
  symbol: string;
  chartTf: string;
  candles: Candle[];
  direction: 'LONG' | 'SHORT';
  entry: number;
  hotZone?: MergedDeskHotZoneEntryPack | null;
  dumpZones?: MtfDumpZoneSpec[] | null;
}): Scalp200BandTouchEvidence {
  const last = params.candles[params.candles.length - 1];
  const evidence: string[] = [];

  const zones = collectDumpZones(params.candles, params.chartTf, params.dumpZones);
  const dumpWick = dumpZoneWickTouch(zones, params.direction, last);
  const hotWick = hotZoneWickTouchOk(params.hotZone, params.direction, last);
  const inst = instBandWickTouch(params.candles, params.direction);

  const wickTouch = dumpWick.ok || hotWick || inst.ok;
  if (dumpWick.ok) evidence.push('폭락wick');
  if (hotWick) evidence.push('Hotwick');
  if (inst.ok) evidence.push(params.direction === 'LONG' ? 'ST하단wick' : 'ST상단wick');

  const journal = hasRecentJournalBandTouchForScalp200({
    symbol: params.symbol,
    chartTf: params.chartTf,
    direction: params.direction,
    entry: params.entry,
  });

  if (journal.ok && journal.sourceKo) evidence.push(journal.sourceKo);

  const dumpFloorBounce =
    params.direction === 'LONG' &&
    dumpWick.ok &&
    longLowerWickRejection(last) &&
    (dumpWick.zone ? dumpExpectsLong(dumpWick.zone) : true);

  if (dumpFloorBounce) evidence.push('바닥V반등');

  const touchPrice =
    dumpWick.touchPrice ??
    (journal.touchPrice != null && journal.touchPrice > 0 ? journal.touchPrice : null) ??
    (last ? (params.direction === 'LONG' ? Number(last.low) : Number(last.high)) : null);

  return {
    wickTouch,
    journalBandTouch: journal.ok,
    dumpFloorBounce,
    touchPrice: touchPrice != null && Number.isFinite(touchPrice) ? touchPrice : null,
    evidenceKo: evidence,
  };
}

/** 바닥 V반등·천장 거부 시 모멘텀 게이트 완화 */
export function scalp200BandTouchMomentumOk(params: {
  rsiVal: number | null;
  direction: 'LONG' | 'SHORT';
  bandTouch: Scalp200BandTouchEvidence;
  baseOk: boolean;
  last?: Candle | null;
}): boolean {
  if (params.baseOk) return true;
  if (params.rsiVal == null || !Number.isFinite(params.rsiVal)) return false;
  if (params.direction === 'LONG' && params.bandTouch.dumpFloorBounce) {
    return params.rsiVal <= 46;
  }
  if (
    params.direction === 'SHORT' &&
    params.bandTouch.wickTouch &&
    shortUpperWickRejection(params.last)
  ) {
    return params.rsiVal >= 54;
  }
  if (params.bandTouch.wickTouch && params.bandTouch.journalBandTouch) {
    return params.direction === 'LONG' ? params.rsiVal <= 50 : params.rsiVal >= 50;
  }
  return false;
}
