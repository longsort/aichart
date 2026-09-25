/**
 * 폭락존 — 반등(LONG) / 나락(SHORT) 합류 → CONFIRM/WAIT + E/SL/TP 가격선.
 * 기존 MTF dump zone·path 유지. 카드/HUD 없음 — createPriceLine만.
 * 확정 승률·수익 보장 아님.
 */
import type { Candle } from '@/types';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import type { DumpSupportResistPath } from '@/lib/mergedDeskDumpSupportResistPath';
import type { DumpBounceCap, DumpCeilingReachStat } from '@/lib/mergedDeskDumpCeilingReachStats';
import {
  buildDumpConfluenceSnap,
  dumpBearConfluenceOk,
  dumpBullConfluenceOk,
  type DumpConfluenceSnap,
} from '@/lib/mergedDeskDumpConfluence';
import type { DumpLifeState } from '@/lib/mergedDeskDumpLifeCycle';
import { calcTradeRewardRisk } from '@/lib/mergedDeskUnifiedTradeRails';
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';
import type { WhaleBeamIntelPack } from '@/lib/whaleVolumeBeamIntel';
import { orderbookStrength } from '@/lib/signal-engine/orderbookStrength';
import { normalizeChartTimeframe } from '@/lib/constants';

export type DumpReboundVerdict = 'WAIT' | 'CONFIRM' | 'INVALID';

export type DumpReboundEvidenceRow = {
  key: string;
  labelKo: string;
  weight: number;
  ok: boolean;
};

export type DumpReboundConfluencePack = {
  verdict: DumpReboundVerdict;
  verdictKo: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  entry: number | null;
  stopLoss: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  invalidationPrice: number | null;
  rr: number | null;
  evidence: DumpReboundEvidenceRow[];
  summaryKo: string;
  tipKo: string;
  priceLines: AtlasPulsePriceLine[];
  /** zone 라벨 보강 */
  zoneSignalKo: string;
  confluence: DumpConfluenceSnap;
};

/** 폭락 MTF 표시 TF — 칩 ON/OFF */
export const MTF_DUMP_CHIP_TFS = ['15m', '1h', '4h', '1d', '1w', '1M'] as const;
export type MtfDumpChipTf = (typeof MTF_DUMP_CHIP_TFS)[number];

export type MtfDumpTfVisibility = Record<MtfDumpChipTf, boolean>;

/** 기본: 15m OFF(노이즈) · 1h~1M ON */
export const DEFAULT_MTF_DUMP_TF_VISIBILITY: MtfDumpTfVisibility = {
  '15m': false,
  '1h': true,
  '4h': true,
  '1d': true,
  '1w': true,
  '1M': true,
};

export function normalizeMtfDumpTfVisibility(
  raw: Partial<Record<string, boolean>> | null | undefined
): MtfDumpTfVisibility {
  const out = { ...DEFAULT_MTF_DUMP_TF_VISIBILITY };
  if (!raw || typeof raw !== 'object') return out;
  for (const tf of MTF_DUMP_CHIP_TFS) {
    if (typeof raw[tf] === 'boolean') out[tf] = raw[tf]!;
  }
  return out;
}

function atrPad(candles: Candle[]): number {
  const n = candles.length;
  const mid = Number(candles[n - 1]?.close) || 1;
  if (n < 8) return mid * 0.002;
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
  return Math.max(c > 0 ? s / c : mid * 0.006, mid * 0.0006);
}

function pickPrimaryFloor(zones: MtfDumpZoneSpec[], price: number): MtfDumpZoneSpec | null {
  let best: MtfDumpZoneSpec | null = null;
  let bestScore = -1;
  for (const z of zones) {
    if ((z.bandRole ?? 'floor') === 'ceiling') continue;
    const mid = Number(z.mid);
    if (!(mid > 0)) continue;
    let s = Number(z.evidenceScore) || 0;
    const life = z.lifeState;
    if (life === 'CONFIRM_UP') s += 80;
    else if (life === 'BOUNCE_WATCH') s += 40;
    else if (life === 'WATCH') s += 10;
    else if (life === 'CONFIRM_DOWN') s -= 30;
    if (mid <= price * 1.004) s += 20;
    if (s > bestScore) {
      bestScore = s;
      best = z;
    }
  }
  return best;
}

function pickPrimaryCeiling(zones: MtfDumpZoneSpec[], price: number): MtfDumpZoneSpec | null {
  let best: MtfDumpZoneSpec | null = null;
  let bestScore = -1;
  for (const z of zones) {
    if ((z.bandRole ?? 'floor') !== 'ceiling') continue;
    const mid = Number(z.mid);
    if (!(mid > 0)) continue;
    let s = Number(z.evidenceScore) || 0;
    const life = z.lifeState;
    if (life === 'CONFIRM_RESIST' || life === 'CONFIRM_DOWN') s += 80;
    else if (life === 'RESIST_WATCH') s += 40;
    else if (life === 'WATCH') s += 10;
    if (mid >= price * 0.996) s += 20;
    if (s > bestScore) {
      bestScore = s;
      best = z;
    }
  }
  return best;
}

function lifeBullish(life?: DumpLifeState): boolean {
  return life === 'CONFIRM_UP' || life === 'BOUNCE_WATCH';
}

function lifeBearish(life?: DumpLifeState): boolean {
  return (
    life === 'CONFIRM_DOWN' ||
    life === 'CONFIRM_RESIST' ||
    life === 'RESIST_WATCH'
  );
}

function pushEvidence(
  rows: DumpReboundEvidenceRow[],
  key: string,
  labelKo: string,
  weight: number,
  ok: boolean
) {
  rows.push({ key, labelKo, weight, ok });
}

function scoreEvidence(rows: DumpReboundEvidenceRow[]): number {
  let s = 0;
  for (const r of rows) {
    if (r.ok) s += r.weight;
  }
  return s;
}

function buildLongEvidence(params: {
  srPath: DumpSupportResistPath;
  confluence: DumpConfluenceSnap;
  floor: MtfDumpZoneSpec | null;
  orderbookImbalance: number | null;
  reachPrimary: DumpCeilingReachStat | null;
  trainerHitRate: number | null;
  trainerSample: number;
  analyzeLongScore: number | null;
  analyzeShortScore: number | null;
  analyzeVerdict: string | null;
}): DumpReboundEvidenceRow[] {
  const rows: DumpReboundEvidenceRow[] = [];
  pushEvidence(rows, 'path', `경로·${params.srPath.scenarioKo}`, 2, params.srPath.scenario === 'BOUNCE');
  pushEvidence(
    rows,
    'support',
    params.srPath.supportFirm ? '확실지지' : '지지감시',
    3,
    params.srPath.supportFirm || lifeBullish(params.floor?.lifeState)
  );
  pushEvidence(rows, 'volBull', '매수거래량합류', 2, dumpBullConfluenceOk(params.confluence));
  pushEvidence(rows, 'volBearBlock', '매도압력약', 2, !dumpBearConfluenceOk(params.confluence));
  pushEvidence(rows, 'beam', `빔·${params.confluence.beamKo ?? '—'}`, 2, params.confluence.beamKo === '롱빔');
  pushEvidence(
    rows,
    'shock',
    '쇼크매수',
    2,
    params.confluence.shock && params.confluence.shockSide === 'long'
  );
  pushEvidence(rows, 'obBull', '수요OB', 2, params.confluence.bullObConfirm);
  pushEvidence(rows, 'hot', 'Hot지지겹침', 1, params.confluence.hotLongOverlap);

  const ob = params.orderbookImbalance;
  if (ob != null && Number.isFinite(ob)) {
    const { supportStrong } = orderbookStrength({ orderbookImbalance: ob });
    pushEvidence(rows, 'orderbook', supportStrong ? '호가매수우세' : '호가비매수', 2, supportStrong);
  }

  const reach = params.reachPrimary;
  if (reach && reach.reachPct != null && reach.sampleCount >= 8) {
    pushEvidence(
      rows,
      'reach',
      `반등통계·${Math.round(reach.reachPct)}%`,
      1,
      reach.reachPct >= 52 && !reach.sampleLowTrust
    );
  }

  if (params.trainerSample >= 6 && params.trainerHitRate != null) {
    pushEvidence(
      rows,
      'trainer',
      `학습적중·${Math.round(params.trainerHitRate * 100)}%`,
      1,
      params.trainerHitRate >= 0.5
    );
  }

  const ls = params.analyzeLongScore;
  const ss = params.analyzeShortScore;
  if (ls != null && ss != null) {
    pushEvidence(rows, 'analyze', `분석·L${Math.round(ls)}/S${Math.round(ss)}`, 1, ls >= ss + 4);
  } else if (params.analyzeVerdict === 'LONG') {
    pushEvidence(rows, 'analyze', '분석·LONG', 1, true);
  }

  return rows;
}

function buildShortEvidence(params: {
  srPath: DumpSupportResistPath;
  confluence: DumpConfluenceSnap;
  floor: MtfDumpZoneSpec | null;
  ceiling: MtfDumpZoneSpec | null;
  orderbookImbalance: number | null;
  analyzeLongScore: number | null;
  analyzeShortScore: number | null;
  analyzeVerdict: string | null;
}): DumpReboundEvidenceRow[] {
  const rows: DumpReboundEvidenceRow[] = [];
  pushEvidence(
    rows,
    'path',
    `경로·${params.srPath.scenarioKo}`,
    2,
    params.srPath.scenario === 'FAIL' || params.srPath.scenario === 'RESIST'
  );
  pushEvidence(
    rows,
    'dump',
    params.floor?.lifeState === 'CONFIRM_DOWN' ? '하락확정' : '나락감시',
    3,
    params.floor?.lifeState === 'CONFIRM_DOWN' || lifeBearish(params.ceiling?.lifeState)
  );
  pushEvidence(rows, 'resist', params.srPath.resistFirm ? '확실저항' : '저항감시', 2, params.srPath.resistFirm);
  pushEvidence(rows, 'volBear', '매도거래량합류', 2, dumpBearConfluenceOk(params.confluence));
  pushEvidence(rows, 'volBullBlock', '매수압력약', 2, !dumpBullConfluenceOk(params.confluence));
  pushEvidence(rows, 'beam', `빔·${params.confluence.beamKo ?? '—'}`, 2, params.confluence.beamKo === '숏빔');
  pushEvidence(
    rows,
    'shock',
    '쇼크매도',
    2,
    params.confluence.shock && params.confluence.shockSide === 'short'
  );
  pushEvidence(rows, 'obBear', '공급OB', 2, params.confluence.bearObConfirm);
  pushEvidence(rows, 'hot', 'Hot저항겹침', 1, params.confluence.hotShortOverlap);
  pushEvidence(rows, 'structure', '구조이탈↓', 2, params.confluence.structureBreakDown);

  const ob = params.orderbookImbalance;
  if (ob != null && Number.isFinite(ob)) {
    const { resistanceStrong } = orderbookStrength({ orderbookImbalance: ob });
    pushEvidence(rows, 'orderbook', resistanceStrong ? '호가매도우세' : '호가비매도', 2, resistanceStrong);
  }

  const ls = params.analyzeLongScore;
  const ss = params.analyzeShortScore;
  if (ls != null && ss != null) {
    pushEvidence(rows, 'analyze', `분석·L${Math.round(ls)}/S${Math.round(ss)}`, 1, ss >= ls + 4);
  } else if (params.analyzeVerdict === 'SHORT') {
    pushEvidence(rows, 'analyze', '분석·SHORT', 1, true);
  }

  return rows;
}

function buildLongPriceLines(params: {
  verdict: DumpReboundVerdict;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  titlePrefix?: string;
}): AtlasPulsePriceLine[] {
  const lines: AtlasPulsePriceLine[] = [];
  const confirm = params.verdict === 'CONFIRM';
  const pfx = params.titlePrefix ? `${params.titlePrefix}·` : '';
  lines.push({
    price: params.entry,
    color: confirm ? '#22d3ee' : '#67e8f9',
    title: confirm ? `${pfx}E반등 ${Math.round(params.entry)}` : `${pfx}감시E ${Math.round(params.entry)}`,
    lineWidth: confirm ? 2 : 1,
    lineStyle: confirm ? 'solid' : 'dashed',
    axisLabel: true,
  });
  lines.push({
    price: params.stopLoss,
    color: '#f87171',
    title: `${pfx}SL ${Math.round(params.stopLoss)}`,
    lineWidth: 2,
    lineStyle: 'dashed',
    axisLabel: true,
  });
  if (params.tp1 > params.entry) {
    lines.push({
      price: params.tp1,
      color: '#4ade80',
      title: `${pfx}TP1 ${Math.round(params.tp1)}`,
      lineWidth: 2,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  if (params.tp2 > params.tp1 + 1) {
    lines.push({
      price: params.tp2,
      color: '#86efac',
      title: `${pfx}TP2 ${Math.round(params.tp2)}`,
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: true,
    });
  }
  if (params.tp3 > params.tp2 + 1) {
    lines.push({
      price: params.tp3,
      color: '#bbf7d0',
      title: `${pfx}TP3 ${Math.round(params.tp3)}`,
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: true,
    });
  }
  return lines;
}

function buildShortPriceLines(params: {
  verdict: DumpReboundVerdict;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  titlePrefix?: string;
}): AtlasPulsePriceLine[] {
  const lines: AtlasPulsePriceLine[] = [];
  const confirm = params.verdict === 'CONFIRM';
  const pfx = params.titlePrefix ? `${params.titlePrefix}·` : '';
  lines.push({
    price: params.entry,
    color: confirm ? '#fb7185' : '#fda4af',
    title: confirm ? `${pfx}E나락 ${Math.round(params.entry)}` : `${pfx}감시숏 ${Math.round(params.entry)}`,
    lineWidth: confirm ? 2 : 1,
    lineStyle: confirm ? 'solid' : 'dashed',
    axisLabel: true,
  });
  lines.push({
    price: params.stopLoss,
    color: '#fbbf24',
    title: `${pfx}SL ${Math.round(params.stopLoss)}`,
    lineWidth: 2,
    lineStyle: 'dashed',
    axisLabel: true,
  });
  if (params.tp1 < params.entry) {
    lines.push({
      price: params.tp1,
      color: '#f87171',
      title: `${pfx}TP1 ${Math.round(params.tp1)}`,
      lineWidth: 2,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  if (params.tp2 < params.tp1 - 1) {
    lines.push({
      price: params.tp2,
      color: '#fca5a5',
      title: `${pfx}TP2 ${Math.round(params.tp2)}`,
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: true,
    });
  }
  if (params.tp3 < params.tp2 - 1) {
    lines.push({
      price: params.tp3,
      color: '#fecaca',
      title: `${pfx}TP3 ${Math.round(params.tp3)}`,
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: true,
    });
  }
  return lines;
}

/**
 * 폭락 floor/ceiling — LONG 반등확정 또는 SHORT 나락확정 + E/SL/TP.
 */
export function buildDumpReboundConfluencePack(params: {
  chartCandles: Candle[];
  chartTf: string;
  zones: MtfDumpZoneSpec[];
  srPath: DumpSupportResistPath;
  confluence?: DumpConfluenceSnap | null;
  bounceCap?: DumpBounceCap | null;
  reachPrimary?: DumpCeilingReachStat | null;
  hotZones?: import('@/lib/mergedDeskHotZoneEntry').MergedDeskHotZoneEntry[] | null;
  whaleBeamIntel?: WhaleBeamIntelPack | null;
  orderbookImbalance?: number | null;
  analyzeLongScore?: number | null;
  analyzeShortScore?: number | null;
  analyzeVerdict?: string | null;
  trainerBounceHitRate?: number | null;
  trainerSample?: number | null;
}): DumpReboundConfluencePack | null {
  const candles = params.chartCandles ?? [];
  if (candles.length < 12) return null;

  const price = Number(candles[candles.length - 1]?.close);
  if (!(price > 0)) return null;

  const floor = pickPrimaryFloor(params.zones, price);
  const ceiling = pickPrimaryCeiling(params.zones, price);
  if (!floor && !ceiling && !params.srPath.support && !params.srPath.resist) return null;

  const pad = atrPad(candles);
  const zoneTop = ceiling?.top ?? floor?.top ?? params.srPath.resist?.top ?? params.srPath.support?.top;
  const zoneBot = floor?.bot ?? ceiling?.bot ?? params.srPath.support?.bot ?? params.srPath.resist?.bot;
  const confluence =
    params.confluence ??
    buildDumpConfluenceSnap({
      chartCandles: candles,
      zoneTop,
      zoneBot,
      hotZones: params.hotZones,
      whaleBeamIntel: params.whaleBeamIntel,
    });

  const trainerSample = Math.max(0, Number(params.trainerSample) || 0);
  const trainerHitRate =
    params.trainerBounceHitRate != null && Number.isFinite(params.trainerBounceHitRate)
      ? params.trainerBounceHitRate
      : null;

  const longEvidence = buildLongEvidence({
    srPath: params.srPath,
    confluence,
    floor,
    orderbookImbalance: params.orderbookImbalance ?? null,
    reachPrimary: params.reachPrimary ?? null,
    trainerHitRate,
    trainerSample,
    analyzeLongScore: params.analyzeLongScore ?? null,
    analyzeShortScore: params.analyzeShortScore ?? null,
    analyzeVerdict: params.analyzeVerdict ?? null,
  });

  const shortEvidence = buildShortEvidence({
    srPath: params.srPath,
    confluence,
    floor,
    ceiling,
    orderbookImbalance: params.orderbookImbalance ?? null,
    analyzeLongScore: params.analyzeLongScore ?? null,
    analyzeShortScore: params.analyzeShortScore ?? null,
    analyzeVerdict: params.analyzeVerdict ?? null,
  });

  let longScore = scoreEvidence(longEvidence);
  let shortScore = scoreEvidence(shortEvidence);
  if (params.srPath.scenario === 'BOUNCE') longScore += 2;
  if (params.srPath.supportFirm) longScore += 2;
  if (lifeBullish(floor?.lifeState)) longScore += 2;
  if (params.srPath.scenario === 'FAIL' || floor?.lifeState === 'CONFIRM_DOWN') shortScore += 3;
  if (params.srPath.scenario === 'RESIST') shortScore += 2;
  if (params.srPath.resistFirm) shortScore += 2;
  if (lifeBearish(ceiling?.lifeState) || floor?.lifeState === 'CONFIRM_DOWN') shortScore += 2;
  if (dumpBearConfluenceOk(confluence) && confluence.bearScore >= confluence.bullScore + 2) {
    shortScore += 2;
    longScore -= 2;
  }
  if (dumpBullConfluenceOk(confluence) && confluence.bullScore >= confluence.bearScore + 2) {
    longScore += 2;
    shortScore -= 2;
  }
  const ob = params.orderbookImbalance;
  if (ob != null && ob < -0.12) {
    shortScore += 1;
    longScore -= 2;
  }
  if (ob != null && ob > 0.12) {
    longScore += 1;
    shortScore -= 2;
  }

  const preferShort =
    shortScore > longScore + 1 &&
    (floor?.lifeState === 'CONFIRM_DOWN' ||
      params.srPath.scenario === 'FAIL' ||
      params.srPath.scenario === 'RESIST' ||
      dumpBearConfluenceOk(confluence));

  /** —— SHORT 나락확정 —— */
  if (preferShort) {
    const resistMid =
      params.srPath.resistPrice ??
      Number(ceiling?.mid) ??
      (ceiling ? (Number(ceiling.top) + Number(ceiling.bot)) / 2 : null);
    const resistTop = ceiling
      ? Math.max(Number(ceiling.top), Number(ceiling.bot))
      : resistMid != null
        ? resistMid + pad
        : null;
    const supportBot =
      params.srPath.invalidationPrice ??
      params.srPath.supportPrice ??
      (floor ? Math.min(Number(floor.top), Number(floor.bot)) : null);

    if (resistMid == null || !(resistMid > 0) || resistTop == null || !(resistTop > 0)) {
      /* fall through to long path if levels missing */
    } else {
      let verdict: DumpReboundVerdict = 'WAIT';
      if (shortScore >= 8 && (floor?.lifeState === 'CONFIRM_DOWN' || params.srPath.resistFirm || params.srPath.scenario === 'FAIL')) {
        verdict = 'CONFIRM';
      } else if (shortScore >= 5) {
        verdict = 'WAIT';
      }

      const entry =
        verdict === 'CONFIRM'
          ? Math.min(resistMid, price + pad * 0.15)
          : Math.max(price, resistMid - pad * 0.25);
      const stopLoss = Math.max(resistTop, entry + pad * 0.35);
      const tp1 =
        supportBot != null && supportBot < entry
          ? supportBot
          : entry - pad * 2.2;
      const tp2 = tp1 - pad * 1.6;
      const tp3 = tp2 - pad * 1.4;

      const rr = calcTradeRewardRisk(entry, stopLoss, tp1);
      if (verdict === 'CONFIRM' && rr != null && rr < 1.8) {
        verdict = 'WAIT';
      }

      const evidence = shortEvidence;
      const okReasons = evidence.filter((e) => e.ok).map((e) => e.labelKo);
      const verdictKo =
        verdict === 'CONFIRM' ? '나락확정' : verdict === 'INVALID' ? '무효' : '숏대기';
      const zoneSignalKo = [verdictKo, okReasons.slice(0, 3).join('+')].filter(Boolean).join(' · ');
      const summaryKo = [
        `폭락숏·${verdictKo}`,
        params.srPath.pathKo,
        rr != null ? `RR1 ${rr.toFixed(1)}` : null,
        confluence.reasonsKo.slice(0, 2).join('+') || null,
      ]
        .filter(Boolean)
        .join(' · ');
      const tipKo = [
        verdict === 'CONFIRM'
          ? '거래량·호가·경로 합류 — 조건부 나락(숏) 시나리오'
          : '저항·매도압력·구조 확인 전 — 숏 대기',
        '확정 승률·수익 보장 아님',
      ]
        .filter(Boolean)
        .join('\n');

      return {
        verdict,
        verdictKo,
        direction: 'SHORT',
        entry,
        stopLoss,
        tp1,
        tp2,
        tp3,
        invalidationPrice: resistTop,
        rr,
        evidence,
        summaryKo,
        tipKo,
        priceLines: buildShortPriceLines({ verdict, entry, stopLoss, tp1, tp2, tp3 }),
        zoneSignalKo,
        confluence,
      };
    }
  }

  /** —— LONG 반등확정 —— */
  const evidence = longEvidence;
  let verdict: DumpReboundVerdict = 'WAIT';
  if (params.srPath.scenario === 'FAIL' && floor?.lifeState === 'CONFIRM_DOWN') {
    verdict = 'INVALID';
  } else if (longScore >= 8 && (params.srPath.scenario === 'BOUNCE' || params.srPath.supportFirm)) {
    verdict = 'CONFIRM';
  } else {
    verdict = 'WAIT';
  }

  const supportMid =
    params.srPath.supportPrice ??
    Number(floor?.mid) ??
    (floor ? (Number(floor.top) + Number(floor.bot)) / 2 : null);
  const supportBot =
    params.srPath.invalidationPrice ??
    (floor ? Math.min(Number(floor.top), Number(floor.bot)) : null);
  const bounceLimit = params.srPath.bounceLimitPrice ?? params.bounceCap?.price ?? null;
  const resist =
    params.srPath.resistPrice ??
    (params.bounceCap?.price && params.bounceCap.price > price ? params.bounceCap.price : null);

  if (supportMid == null || !(supportMid > 0) || supportBot == null || !(supportBot > 0)) {
    return null;
  }

  const entry =
    verdict === 'CONFIRM'
      ? Math.max(supportMid, price - pad * 0.15)
      : Math.min(price, supportMid + pad * 0.25);
  const stopLoss = Math.min(supportBot, entry - pad * 0.35);
  const tp1 = bounceLimit && bounceLimit > entry ? bounceLimit : entry + pad * 2.2;
  const tp2 = resist && resist > tp1 ? resist : tp1 + pad * 1.6;
  const tp3 = tp2 + pad * 1.4;

  const rr = calcTradeRewardRisk(entry, stopLoss, tp1);
  if (verdict === 'CONFIRM' && rr != null && rr < 1.8) {
    verdict = 'WAIT';
  }

  const okReasons = evidence.filter((e) => e.ok).map((e) => e.labelKo);
  const verdictKo =
    verdict === 'CONFIRM' ? '반등확정' : verdict === 'INVALID' ? '무효' : '대기';
  const zoneSignalKo = [verdictKo, okReasons.slice(0, 3).join('+')].filter(Boolean).join(' · ');
  const summaryKo = [
    `폭락반등·${verdictKo}`,
    params.srPath.pathKo,
    rr != null ? `RR1 ${rr.toFixed(1)}` : null,
    confluence.reasonsKo.slice(0, 2).join('+') || null,
  ]
    .filter(Boolean)
    .join(' · ');

  const tipKo = [
    verdict === 'CONFIRM'
      ? '거래량·호가·경로 합류 — 조건부 반등 시나리오'
      : verdict === 'INVALID'
        ? '지지 무효 — 경로 재설정 대기'
        : '지지·거래량·호가 확인 전 — 대기',
    params.reachPrimary?.tipKo,
    trainerSample >= 6 && trainerHitRate != null
      ? `학습표본 ${trainerSample} · 적중 ${Math.round(trainerHitRate * 100)}% — 검증 필요`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const priceLines =
    verdict === 'INVALID'
      ? []
      : buildLongPriceLines({ verdict, entry, stopLoss, tp1, tp2, tp3 });

  return {
    verdict,
    verdictKo,
    direction: verdict === 'INVALID' ? 'NEUTRAL' : 'LONG',
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    invalidationPrice: supportBot,
    rr,
    evidence,
    summaryKo,
    tipKo,
    priceLines,
    zoneSignalKo,
    confluence,
  };
}

const TF_AXIS_TAG: Record<string, string> = {
  '15m': '15m',
  '1h': '1H',
  '4h': '4H',
  '1d': '1D',
  '1w': '1W',
  '1M': '1M',
};

export type PerTfDumpTradePlan = {
  sourceTf: string;
  sourceTfKo: string;
  bandRole: 'floor' | 'ceiling';
  lifeState: DumpLifeState;
  direction: 'LONG' | 'SHORT';
  verdict: 'CONFIRM';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rr: number | null;
  planKo: string;
  priceLines: AtlasPulsePriceLine[];
};

export function perTfDumpTradePlanKey(
  z: Pick<MtfDumpZoneSpec, 'sourceTf' | 'bandRole'>
): string {
  const tf = normalizeChartTimeframe(z.sourceTf);
  const role = z.bandRole === 'ceiling' ? 'ceiling' : 'floor';
  return `${tf}:${role}`;
}

/**
 * TF zone마다 lifeState CONFIRM_* 일 때 개별 E/SL/TP 가격선.
 * 전역 reboundConfluence 1세트와 별도 — 축 dedupe는 DeskView에서 처리.
 */
export function buildPerTfDumpZoneTradePlans(params: {
  chartCandles: Candle[];
  zones: MtfDumpZoneSpec[];
}): PerTfDumpTradePlan[] {
  const candles = params.chartCandles ?? [];
  if (candles.length < 12) return [];
  const price = Number(candles[candles.length - 1]?.close);
  if (!(price > 0)) return [];

  const pad = atrPad(candles);
  const zones = params.zones ?? [];
  const bySlot = new Map<string, MtfDumpZoneSpec>();
  for (const z of zones) {
    bySlot.set(perTfDumpTradePlanKey(z), z);
  }

  const plans: PerTfDumpTradePlan[] = [];

  for (const spec of zones) {
    const life = spec.lifeState;
    if (
      life !== 'CONFIRM_UP' &&
      life !== 'CONFIRM_DOWN' &&
      life !== 'CONFIRM_RESIST'
    ) {
      continue;
    }

    const tf = normalizeChartTimeframe(spec.sourceTf);
    const tfTag = TF_AXIS_TAG[tf] ?? tf;
    const isCeiling = (spec.bandRole ?? 'floor') === 'ceiling';
    const top = Math.max(Number(spec.top), Number(spec.bot));
    const bot = Math.min(Number(spec.top), Number(spec.bot));
    const mid = Number(spec.mid) || (top + bot) / 2;
    if (!(mid > 0) || !(top > 0) || !(bot > 0)) continue;

    const ceil = bySlot.get(`${tf}:ceiling`);
    const floor = bySlot.get(`${tf}:floor`);

    if (life === 'CONFIRM_UP' && !isCeiling) {
      const bouncePx =
        spec.bounceCapPrice && spec.bounceCapPrice > mid
          ? spec.bounceCapPrice
          : ceil && Number(ceil.bot) > mid
            ? Number(ceil.bot)
            : null;
      const entry = Math.max(mid, price - pad * 0.12);
      const stopLoss = Math.min(bot, entry - pad * 0.35);
      const tp1 = bouncePx && bouncePx > entry ? bouncePx : entry + pad * 2.2;
      const ceilMid = ceil ? Number(ceil.mid) : 0;
      const tp2 = ceilMid > tp1 + pad * 0.4 ? ceilMid : tp1 + pad * 1.5;
      const tp3 = tp2 + pad * 1.3;
      if (!(stopLoss < entry) || !(tp1 > entry)) continue;
      const rr = calcTradeRewardRisk(entry, stopLoss, tp1);
      const planKo = `${spec.sourceTfKo} 반등 E${Math.round(entry)} SL${Math.round(stopLoss)} TP${Math.round(tp1)}`;
      plans.push({
        sourceTf: tf,
        sourceTfKo: spec.sourceTfKo,
        bandRole: 'floor',
        lifeState: life,
        direction: 'LONG',
        verdict: 'CONFIRM',
        entry,
        stopLoss,
        tp1,
        tp2,
        tp3,
        rr,
        planKo,
        priceLines: buildLongPriceLines({
          verdict: 'CONFIRM',
          entry,
          stopLoss,
          tp1,
          tp2,
          tp3,
          titlePrefix: tfTag,
        }),
      });
      continue;
    }

    if (life === 'CONFIRM_DOWN' && !isCeiling) {
      const entry = Math.min(mid, price + pad * 0.1);
      const stopLoss = Math.max(top, entry + pad * 0.35);
      const lowerFloors = zones
        .filter(
          (z) =>
            (z.bandRole ?? 'floor') === 'floor' &&
            normalizeChartTimeframe(z.sourceTf) !== tf &&
            Number(z.mid) < bot - pad * 0.2
        )
        .sort((a, b) => Number(b.mid) - Number(a.mid));
      const nextFloor = lowerFloors[0];
      const tp1 =
        nextFloor && Number(nextFloor.mid) < entry
          ? Number(nextFloor.mid)
          : bot - pad * 1.8;
      const tp2 = tp1 - pad * 1.5;
      const tp3 = tp2 - pad * 1.3;
      if (!(stopLoss > entry) || !(tp1 < entry)) continue;
      const rr = calcTradeRewardRisk(entry, stopLoss, tp1);
      const planKo = `${spec.sourceTfKo} 나락 E${Math.round(entry)} SL${Math.round(stopLoss)} TP${Math.round(tp1)}`;
      plans.push({
        sourceTf: tf,
        sourceTfKo: spec.sourceTfKo,
        bandRole: 'floor',
        lifeState: life,
        direction: 'SHORT',
        verdict: 'CONFIRM',
        entry,
        stopLoss,
        tp1,
        tp2,
        tp3,
        rr,
        planKo,
        priceLines: buildShortPriceLines({
          verdict: 'CONFIRM',
          entry,
          stopLoss,
          tp1,
          tp2,
          tp3,
          titlePrefix: tfTag,
        }),
      });
      continue;
    }

    if (life === 'CONFIRM_RESIST' && isCeiling) {
      const entry = Math.min(mid, price + pad * 0.12);
      const stopLoss = Math.max(top, entry + pad * 0.35);
      const floorMid = floor ? Number(floor.mid) : 0;
      const tp1 =
        floorMid > 0 && floorMid < entry ? floorMid : mid - pad * 2.2;
      const tp2 = tp1 - pad * 1.5;
      const tp3 = tp2 - pad * 1.3;
      if (!(stopLoss > entry) || !(tp1 < entry)) continue;
      const rr = calcTradeRewardRisk(entry, stopLoss, tp1);
      const planKo = `${spec.sourceTfKo} 저항숏 E${Math.round(entry)} SL${Math.round(stopLoss)} TP${Math.round(tp1)}`;
      plans.push({
        sourceTf: tf,
        sourceTfKo: spec.sourceTfKo,
        bandRole: 'ceiling',
        lifeState: life,
        direction: 'SHORT',
        verdict: 'CONFIRM',
        entry,
        stopLoss,
        tp1,
        tp2,
        tp3,
        rr,
        planKo,
        priceLines: buildShortPriceLines({
          verdict: 'CONFIRM',
          entry,
          stopLoss,
          tp1,
          tp2,
          tp3,
          titlePrefix: tfTag,
        }),
      });
    }
  }

  return plans;
}
