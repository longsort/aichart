/**
 * 파랑빨강띠 ↔ 상단 학파·판정 칩 전부 합류.
 * 일치 상위만 작도·색에 반영. 확정 경로·승률 아님.
 */
import type { Candle } from '@/types';
import type { MergedDeskChannelGeom } from '@/lib/mergedDeskBlueRedChannels';
import type { MergedDeskCycleProgressPack } from '@/lib/mergedDeskCycleProgress';
import type { MergedDeskSchoolSeat, SchoolSeatKind } from '@/lib/mergedDeskSchoolSeat';
import type { ClickableSchool, SchoolSchematicPin } from '@/lib/mergedDeskSchoolSchematicCatalog';
import { asClickableSchool } from '@/lib/mergedDeskSchoolSchematicResolve';
import type { MergedDeskVerdictStrip } from '@/lib/mergedDeskVerdictStrip';

export type RbChipRank = 1 | 2 | 3;

export type MergedDeskRbChipHit = {
  kind: SchoolSeatKind;
  school: ClickableSchool | null;
  tagKo: string;
  score: number;
  rank?: RbChipRank;
  tone: MergedDeskSchoolSeat['tone'];
  aligned: boolean;
  waiting: boolean;
};

export type MergedDeskRbChipConfluence = {
  hits: MergedDeskRbChipHit[];
  top: MergedDeskRbChipHit[];
  longN: number;
  shortN: number;
  waitN: number;
  consensus: 'long' | 'short' | 'wait' | 'mixed';
  bouncePx: number | null;
  resistPx: number | null;
  topSchool: ClickableSchool | null;
  topPin: SchoolSchematicPin | null;
  summaryKo: string;
  rankBySchool: Partial<Record<ClickableSchool, RbChipRank>>;
};

function near(a: number | undefined, b: number, atr: number): boolean {
  if (!(Number(a) > 0) || !(b > 0)) return false;
  return Math.abs(Number(a) - b) <= Math.max(atr * 0.45, Math.abs(b) * 0.0012);
}

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  const last = Number(candles[n - 1]?.close) || 0;
  if (n < 5) return last > 0 ? last * 0.006 : 1;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const h = Number(candles[i]!.high);
    const l = Number(candles[i]!.low);
    const pc = Number(candles[i - 1]!.close);
    if (![h, l, pc].every((x) => Number.isFinite(x) && x > 0)) continue;
    s += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    c += 1;
  }
  return c > 0 ? s / c : last * 0.006;
}

export function computeMergedDeskRbChipConfluence(params: {
  candles: Candle[];
  geoms?: MergedDeskChannelGeom[] | null;
  cycle?: MergedDeskCycleProgressPack | null;
  verdict?: MergedDeskVerdictStrip | null;
}): MergedDeskRbChipConfluence {
  const empty: MergedDeskRbChipConfluence = {
    hits: [],
    top: [],
    longN: 0,
    shortN: 0,
    waitN: 0,
    consensus: 'mixed',
    bouncePx: null,
    resistPx: null,
    topSchool: null,
    topPin: null,
    summaryKo: '',
    rankBySchool: {},
  };
  const candles = params.candles;
  const n = candles.length;
  if (n < 12 || !params.cycle) return empty;

  const g =
    params.geoms?.find((x) => x.primary) ??
    params.geoms?.find((x) => x.horizon === 'short') ??
    params.geoms?.[0] ??
    null;
  const last = candles[n - 1]!;
  const close = Number(last.close) || 0;
  if (!(close > 0)) return empty;
  const atr = atrApprox(candles);
  const hi = g && g.tipUpper > g.tipLower ? g.tipUpper : 0;
  const lo = g && g.tipUpper > g.tipLower ? g.tipLower : 0;
  const span = hi > lo ? hi - lo : Math.max(atr * 4, close * 0.008);
  const pos = hi > lo ? (close - lo) / span : 0.5;
  const atSup = pos <= 0.28 || (hi > lo && Number(last.low) <= lo + span * 0.1);
  const atRes = pos >= 0.72 || (hi > lo && Number(last.high) >= hi - span * 0.1);
  const railLongBias = Boolean(g && !g.descending);
  const railShortBias = Boolean(g && g.descending);

  const seats: MergedDeskSchoolSeat[] = [
    ...(params.cycle.primary ? [params.cycle.primary] : []),
    ...(params.cycle.others ?? []),
  ];
  const seen = new Set<string>();
  const hits: MergedDeskRbChipHit[] = [];
  let longN = 0;
  let shortN = 0;
  let waitN = 0;

  for (const seat of seats) {
    const key = `${seat.kind}:${seat.tagKo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const waiting = /도식 대기/.test(seat.headlineKo);
    const school = asClickableSchool(seat.kind);
    const pin = school ? params.cycle.schematics[school] ?? null : null;
    let score = waiting ? Math.min(seat.confidence, 36) : seat.confidence;

    if (seat.tone === 'bull') {
      if (atSup) score += 18;
      if (railLongBias) score += 12;
      if (atRes) score -= 10;
      if (!waiting) longN += Math.max(2, Math.round(score / 12));
    } else if (seat.tone === 'bear') {
      if (atRes) score += 18;
      if (railShortBias) score += 12;
      if (atSup) score -= 10;
      if (!waiting) shortN += Math.max(2, Math.round(score / 12));
    } else {
      waitN += waiting ? 2 : 3;
      if (pos > 0.38 && pos < 0.62) score += 6;
    }

    if (pin) {
      if (near(pin.dumpTo, lo, atr) || near(pin.zoneLow, lo, atr)) score += 14;
      if (near(pin.bounceTo, hi, atr) || near(pin.zoneHigh, hi, atr)) score += 14;
      if (pin.seatSide === 'long' && seat.tone === 'bull') score += 8;
      if (pin.seatSide === 'short' && seat.tone === 'bear') score += 8;
      if (pin.seatRole === 'wait') score -= 6;
    }

    if (seat.kind === 'ichimoku' && /구름안/.test(`${seat.tagKo}${seat.headlineKo}`)) {
      waitN += 4;
      score += pos > 0.35 && pos < 0.65 ? 8 : -4;
    }
    if (seat.kind === 'smc' && /CHoCH|BOS/i.test(`${seat.tagKo}${seat.headlineKo}`)) {
      score += 8;
    }

    const aligned =
      !waiting &&
      ((seat.tone === 'bull' && (atSup || railLongBias)) ||
        (seat.tone === 'bear' && (atRes || railShortBias)));

    hits.push({
      kind: seat.kind,
      school,
      tagKo: seat.tagKo,
      score,
      tone: seat.tone,
      aligned,
      waiting,
    });
  }

  const v = params.verdict;
  if (v) {
    if (v.tone === 'wait') waitN += 10;
    else if (v.tone === 'long') longN += 8;
    else if (v.tone === 'short') shortN += 8;
    if (/무효/.test(v.lineKo)) waitN += 3;
    if (/↔/.test(v.lineKo)) waitN += 4;
  }

  const ranked = [...hits]
    .filter((h) => h.kind !== 'seat' && !h.waiting)
    .sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, 3).map((h, i) => ({ ...h, rank: (i + 1) as RbChipRank }));
  const rankBySchool: Partial<Record<ClickableSchool, RbChipRank>> = {};
  for (const h of top) {
    if (h.school) rankBySchool[h.school] = h.rank!;
  }

  let consensus: MergedDeskRbChipConfluence['consensus'] = 'mixed';
  if (waitN >= longN + 6 && waitN >= shortN + 6) consensus = 'wait';
  else if (longN >= shortN + 8) consensus = 'long';
  else if (shortN >= longN + 8) consensus = 'short';

  const topSchool = top[0]?.school ?? null;
  const topPin = topSchool ? params.cycle.schematics[topSchool] ?? null : null;

  const bounceCands = [topPin?.dumpTo, topPin?.zoneLow, lo > 0 ? lo : undefined].filter(
    (x): x is number => Number(x) > 0
  );
  const resistCands = [topPin?.bounceTo, topPin?.zoneHigh, hi > 0 ? hi : undefined].filter(
    (x): x is number => Number(x) > 0
  );
  for (const h of top.slice(1)) {
    const p = h.school ? params.cycle.schematics[h.school] : null;
    if (p?.dumpTo) bounceCands.push(p.dumpTo);
    if (p?.bounceTo) resistCands.push(p.bounceTo);
  }
  const mid = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  const names = top.map((h) => h.tagKo).join('·');
  const consKo =
    consensus === 'long' ? '롱합류' : consensus === 'short' ? '숏합류' : consensus === 'wait' ? '관망합류' : '혼조';

  return {
    hits,
    top,
    longN,
    shortN,
    waitN,
    consensus,
    bouncePx: bounceCands.length ? mid(bounceCands) : lo > 0 ? lo : null,
    resistPx: resistCands.length ? mid(resistCands) : hi > 0 ? hi : null,
    topSchool,
    topPin,
    summaryKo: top.length ? `칩일치 ${names} · ${consKo}` : '',
    rankBySchool,
  };
}
