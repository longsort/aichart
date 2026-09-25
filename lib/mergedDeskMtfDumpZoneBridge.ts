/**
 * 폭락구간 MTF — 각 TF에서 형성된 dump zone을 현재 차트 TF에 투영.
 * TF당 하방(floor) + 상방(ceiling). 반등 시 상단=폭등감시·하단=반등지지.
 * 확정 승률·수익 보장 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import { normalizeChartTimeframe, timeframeRank } from '@/lib/constants';
import { buildMergedDeskWyckoffPack } from '@/lib/mergedDeskWyckoffCycle';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import { findLastPriceTouchBar, touchHugTimes } from '@/lib/mergedDeskStructureReactionBundle';
import {
  DUMP_LIFE_KO,
  dumpBandBounceContext,
  dumpBandFaceLabelKo,
  dumpBandFaceRoleKo,
  dumpTfSetRoleVisual,
  evaluateDumpLifeCycle,
  evaluateDumpMtfAlign,
  formatZoneFacePrice,
  type DumpLifeState,
} from '@/lib/mergedDeskDumpLifeCycle';
import { loadSettings } from '@/lib/settings';
import { buildDumpCeilingReachPack } from '@/lib/mergedDeskDumpCeilingReachStats';
import {
  buildDumpSupportResistPath,
  dumpFirmRoleKo,
} from '@/lib/mergedDeskDumpSupportResistPath';
import {
  buildMtfDumpBounceTargetByTf,
  buildMtfDumpBounce1ZoneOverlays,
  buildMtfDumpBounce1PriceLines,
  type MtfDumpBounceTargetPack,
} from '@/lib/mergedDeskMtfBounceTargetByTf';
import { computeDumpZoneTouchStats } from '@/lib/mergedDeskDumpZoneTouchStats';
import {
  computeSupportResistScore,
  dumpSrDisclaimerKo,
  formatReachConditionalKo,
  pickDumpEvidenceChips,
  type DumpZoneViewModel,
  type SrBandKo,
} from '@/lib/mergedDeskSupportResistScore';
import {
  CHART_SHOW_SR_PROB_PCT,
  stripChartSrProbPct,
} from '@/lib/zoneSupportResistProb';

export const MTF_DUMP_SCAN_TFS = ['5m', '15m', '1h', '4h', '1d', '1w', '1M'] as const;

/** 차트 TF에서만 형성·표시 — MTF 공용 레지스트리 공유 금지 */
export const MTF_DUMP_CHART_LOCAL_ONLY_TFS = ['1m'] as const;

/** 4h·1d·1w·1M — LTF 차트에서도 항상 스캔·fetch */
export const MTF_DUMP_HTF_ALWAYS = ['4h', '1d', '1w', '1M'] as const;

/** TF당 floor+ceiling 가능 — 표시 상한 */
export const MTF_DUMP_MAX_ZONES = 16;

export function isMtfDumpChartLocalOnlyTf(tf: string): boolean {
  const n = normalizeChartTimeframe(tf);
  return (MTF_DUMP_CHART_LOCAL_ONLY_TFS as readonly string[]).includes(n);
}

/** floor=하방 · ceiling=상방(폭락감시/폭등감시는 맥락 라벨) */
export type MtfDumpBandRole = 'floor' | 'ceiling';

export type MtfDumpAnalysisSource = 'wyckoff' | 'schematic';

export type MtfDumpZoneSpec = {
  sourceTf: string;
  sourceTfKo: string;
  top: number;
  bot: number;
  mid: number;
  formedTime: number;
  labelKo: string;
  detailKo: string;
  analysisSource: MtfDumpAnalysisSource;
  touchTime1?: number;
  touchTime2?: number;
  zoneSpanOnly?: boolean;
  lifeState?: DumpLifeState;
  evidenceScore?: number;
  evidenceKo?: string[];
  bandRole?: MtfDumpBandRole;
  /** 현재가→이 상단 도달 조건부 통계 라벨 */
  reachKo?: string;
  reachTipKo?: string;
  reachPct?: number | null;
  reachSample?: number;
  /** 반등 1차 한도 (최근접 상단 폭락감시) */
  bounceCapKo?: string;
  bounceCapPrice?: number;
  /** 차트 캔들 기준 zone 터치 횟수 */
  touchCount?: number;
  /** 터치 후 반등(floor)/거부(ceiling) 조건부 % */
  touchReactionPct?: number | null;
  touchLabelKo?: string;
  touchTipKo?: string;
  /** 합류 점수 (SR 가중) */
  confluenceBull?: number;
  confluenceBear?: number;
  /** 지지/저항 조건부 점수 */
  srScore?: number;
  srBand?: SrBandKo;
  srLabelKo?: string;
  srTipKo?: string;
  srSampleN?: number;
  evidenceChips?: string[];
  viewActive?: boolean;
  viewModel?: DumpZoneViewModel;
};

/** 공유 레지스트리·타 TF 차트에 넣지 않을 zone (1m 전용) */
export function filterSharedMtfDumpZones(zones: MtfDumpZoneSpec[]): MtfDumpZoneSpec[] {
  return zones.filter((z) => !isMtfDumpChartLocalOnlyTf(z.sourceTf));
}

export function mtfDumpSlotKey(z: Pick<MtfDumpZoneSpec, 'sourceTf' | 'bandRole'>): string {
  const tf = normalizeChartTimeframe(z.sourceTf);
  const role = z.bandRole === 'ceiling' ? 'ceiling' : 'floor';
  return `${tf}:${role}`;
}

export function resolveMtfDumpScanTfs(chartTf: string): string[] {
  const chart = normalizeChartTimeframe(chartTf);
  /** 1m — 차트 전용만 스캔 (분·시·일·주·달 공용 목록에 넣지 않음) */
  if (isMtfDumpChartLocalOnlyTf(chart)) {
    return [chart];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tf of [...MTF_DUMP_SCAN_TFS, ...MTF_DUMP_HTF_ALWAYS, chart]) {
    const n = normalizeChartTimeframe(tf);
    if (isMtfDumpChartLocalOnlyTf(n)) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out.sort((a, b) => timeframeRank(a) - timeframeRank(b));
}

export type MtfSchematicDumpHint = {
  sourceTf: string;
  dumpPx: number;
  detailKo?: string;
};

const TF_KO: Record<string, string> = {
  '1m': '1분',
  '3m': '3분',
  '5m': '5분',
  '15m': '15분',
  '1h': '1시간',
  '4h': '4시간',
  '1d': '1일',
  '1w': '1주',
  '1M': '1월',
};

export function mergedDeskTfLabelKo(tf: string): string {
  const n = normalizeChartTimeframe(tf);
  return TF_KO[n] ?? n;
}

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  if (n < 8) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.006;
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
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.006;
}

function swingRange(candles: Candle[], look: number): { hi: number; lo: number } {
  const n = candles.length;
  let hi = 0;
  let lo = Number.POSITIVE_INFINITY;
  const from = Math.max(0, n - look);
  for (let i = from; i < n - 1; i++) {
    hi = Math.max(hi, Number(candles[i]!.high));
    const v = Number(candles[i]!.low);
    if (v > 0) lo = Math.min(lo, v);
  }
  return { hi, lo };
}

function floorLookback(tf: string, n: number): number {
  if (tf === '1w' || tf === '1M') return Math.min(n - 2, 24);
  if (tf === '1d') return Math.min(n - 2, 32);
  if (tf === '4h') return Math.min(n - 2, 40);
  if (tf === '1h') return Math.min(n - 2, 48);
  return Math.min(n - 2, 36);
}

function collectSwingLows(candles: Candle[], look: number): number[] {
  const n = candles.length;
  const from = Math.max(1, n - look);
  const lows: number[] = [];
  for (let i = from; i < n - 1; i++) {
    const a = Number(candles[i - 1]!.low);
    const b = Number(candles[i]!.low);
    const c = Number(candles[i + 1]!.low);
    if (b > 0 && b <= a && b <= c) lows.push(b);
  }
  const { lo } = swingRange(candles, look);
  if (lo > 0 && Number.isFinite(lo)) lows.push(lo);
  const uniq = new Map<number, number>();
  for (const v of lows) {
    const k = Math.round(v * 50) / 50;
    if (!uniq.has(k)) uniq.set(k, v);
  }
  return [...uniq.values()].sort((a, b) => a - b);
}

function pickFloorTarget(params: {
  candles: Candle[];
  sourceTf: string;
  last: number;
  atr: number;
  wkSupport?: number;
}): number {
  const tf = normalizeChartTimeframe(params.sourceTf);
  const last = params.last;
  const atr = params.atr;
  const look = floorLookback(tf, params.candles.length);
  const lows = collectSwingLows(params.candles, look);
  const deepest = lows[0] ?? 0;
  const wk = Number(params.wkSupport) || 0;

  let prefer = 0;
  if (tf === '1w' || tf === '1M') {
    prefer = deepest > 0 && deepest < last * 0.9995 ? deepest : 0;
    if (wk > 0 && wk < last * 0.9995) prefer = wk;
  } else if (tf === '1d') {
    prefer =
      lows.find((v, i) => i >= 1 && v < last * 0.997 && v > deepest * 1.01) ??
      lows.find((v) => v < last * 0.995 && v > last - atr * 6 && v > deepest * 1.012) ??
      0;
    if (!(prefer > 0) && deepest > 0 && deepest < last - atr * 1.5) {
      prefer = Math.min(last - atr * 1.15, deepest + Math.max(atr * 1.6, last * 0.014));
    }
    if (wk > 0 && wk < last * 0.997 && !(deepest > 0 && Math.abs(wk - deepest) / deepest < 0.01)) {
      prefer = wk;
    }
  } else if (tf === '4h') {
    prefer =
      lows.find((v, i) => i >= 1 && v < last * 0.998) ??
      (wk > 0 && wk < last * 0.998 ? wk : 0);
  } else {
    const shallow = lows.filter((v) => v < last * 0.998);
    prefer = shallow[shallow.length - 1] ?? (wk > 0 && wk < last ? wk : 0);
  }

  if (!(prefer > 0 && prefer < last * 0.9995)) {
    const k = tf === '1d' ? 1.35 : tf === '4h' ? 1.0 : tf === '1w' || tf === '1M' ? 0.7 : 0.55;
    prefer = last - Math.max(atr * k, last * 0.008);
  }
  if (prefer > last - Math.max(atr * 0.25, last * 0.0025)) {
    prefer = last - Math.max(atr * 0.55, last * 0.006);
  }
  return prefer;
}

function separateOverlappingFloorZones(zones: MtfDumpZoneSpec[]): MtfDumpZoneSpec[] {
  const floors = zones
    .filter((z) => (z.bandRole ?? 'floor') === 'floor')
    .sort((a, b) => timeframeRank(b.sourceTf) - timeframeRank(a.sourceTf));
  const ceilings = zones.filter((z) => z.bandRole === 'ceiling');
  const outFloors: MtfDumpZoneSpec[] = [];
  for (const z of floors) {
    let mid = Number(z.mid);
    const half = Math.max(Math.abs(Number(z.top) - Number(z.bot)) / 2, mid * 0.0012, 40);
    for (const higher of outFloors) {
      if (timeframeRank(z.sourceTf) >= timeframeRank(higher.sourceTf)) continue;
      const hMid = Number(higher.mid);
      if (!(hMid > 0) || !(mid > 0)) continue;
      if (Math.abs(mid - hMid) / Math.max(mid, hMid) < 0.012) {
        mid = Math.max(mid, hMid * 1.016, hMid + half * 1.8);
      }
    }
    if (Math.abs(mid - Number(z.mid)) / Math.max(Number(z.mid), 1) > 0.002) {
      outFloors.push({
        ...z,
        mid,
        top: mid + half,
        bot: mid - half,
        detailKo: `${z.detailKo} · TF하방분리`,
      });
    } else {
      outFloors.push(z);
    }
  }
  return [...ceilings, ...outFloors];
}

function forceSwingDumpZone(candles: Candle[], sourceTf: string): MtfDumpZoneSpec | null {
  const n = candles.length;
  const tf = normalizeChartTimeframe(sourceTf);
  if (n < 8) return null;
  const last = Number(candles[n - 1]!.close);
  if (!(last > 0)) return null;
  const atr = atrApprox(candles);
  const dumpTarget = pickFloorTarget({ candles, sourceTf: tf, last, atr });
  if (!(dumpTarget > 0)) return null;
  const band = dumpTargetBand(dumpTarget, atr, sourceTf);
  const tfKo = mergedDeskTfLabelKo(sourceTf);
  return {
    sourceTf: tf,
    sourceTfKo: tfKo,
    top: band.hi,
    bot: band.lo,
    mid: dumpTarget,
    formedTime: Number(candles[n - 2]!.time),
    labelKo: `${tfKo} 폭락`,
    detailKo: `${tfKo} 스윙저 하방 목표 · 확정 경로·승률 아님`,
    analysisSource: 'wyckoff',
    bandRole: 'floor',
  };
}

function forceSwingCeilingZone(candles: Candle[], sourceTf: string): MtfDumpZoneSpec | null {
  const n = candles.length;
  const tf = normalizeChartTimeframe(sourceTf);
  if (n < 8) return null;
  const last = Number(candles[n - 1]!.close);
  if (!(last > 0)) return null;
  const atr = atrApprox(candles);
  const look = tf === '1w' || tf === '1M' ? Math.min(n - 2, 24) : Math.min(n - 2, 60);
  const { hi } = swingRange(candles, look);
  const ceilTarget =
    Number.isFinite(hi) && hi > last * 1.0005 ? hi : last + Math.max(atr * 0.55, last * 0.008);
  if (!(ceilTarget > last)) return null;
  const band = dumpTargetBand(ceilTarget, atr, sourceTf);
  const tfKo = mergedDeskTfLabelKo(sourceTf);
  return {
    sourceTf: tf,
    sourceTfKo: tfKo,
    top: band.hi,
    bot: band.lo,
    mid: ceilTarget,
    formedTime: Number(candles[n - 2]!.time),
    labelKo: `${tfKo} 폭락감시`,
    detailKo: `${tfKo} 스윙고 상방 폭락감시 · 확정 경로·승률 아님`,
    analysisSource: 'wyckoff',
    bandRole: 'ceiling',
  };
}

function dumpTargetBand(mid: number, atr: number, sourceTf: string): { lo: number; hi: number } {
  const tf = normalizeChartTimeframe(sourceTf);
  /** 폭락존 면은 얇은 띠 — HTF일수록 ATR 비율·가격% 캡을 더 낮춤 */
  let mult = 0.12;
  let capPct = 0.0055;
  if (tf === '1w' || tf === '1M') {
    mult = 0.06;
    capPct = 0.0032;
  } else if (tf === '1d') {
    mult = 0.07;
    capPct = 0.003;
  } else if (tf === '4h') {
    mult = 0.09;
    capPct = 0.0036;
  } else if (tf === '1h') {
    mult = 0.1;
    capPct = 0.004;
  } else if (tf === '15m') {
    mult = 0.11;
    capPct = 0.0045;
  } else if (tf === '1m' || tf === '3m') {
    mult = 0.14;
    capPct = 0.006;
  }
  const raw = Math.max(atr * mult, Math.abs(mid) * 0.0005, 18);
  const h = Math.min(raw, Math.abs(mid) * capPct);
  return { lo: mid - h / 2, hi: mid + h / 2 };
}

function zonesNear(aMid: number, bMid: number, ratio = 0.0035): boolean {
  if (!(aMid > 0) || !(bMid > 0)) return false;
  return Math.abs(aMid - bMid) / Math.max(aMid, bMid) < ratio;
}

export function buildChartTfSchematicDumpSpec(params: {
  candles: Candle[];
  hint: MtfSchematicDumpHint;
}): MtfDumpZoneSpec | null {
  const { candles, hint } = params;
  const n = candles.length;
  const dumpPx = Number(hint.dumpPx);
  if (n < 12 || !(dumpPx > 0)) return null;
  const sourceTf = normalizeChartTimeframe(hint.sourceTf);
  const tfKo = mergedDeskTfLabelKo(sourceTf);
  const atr = atrApprox(candles);
  const band = dumpTargetBand(dumpPx, atr, sourceTf);
  const touch = findLastPriceTouchBar(candles, dumpPx);
  const hug = touch ? touchHugTimes(candles, touch.index, 1) : null;
  const last = Number(candles[n - 1]!.close);
  return {
    sourceTf,
    sourceTfKo: tfKo,
    top: band.hi,
    bot: band.lo,
    mid: dumpPx,
    formedTime: touch?.time ?? Number(candles[n - 2]!.time),
    labelKo: `${tfKo} 폭락구간`,
    detailKo:
      hint.detailKo ??
      '도식 폭락·마크다운 참고 · 현재 TF 분석 · 터치봉 부착 · 확정 경로·승률 아님',
    analysisSource: 'schematic',
    touchTime1: hug?.time1,
    touchTime2: hug?.time2,
    zoneSpanOnly: true,
    bandRole: dumpPx >= last ? 'ceiling' : 'floor',
  };
}

export function detectMtfDumpZone(candles: Candle[], sourceTf: string): MtfDumpZoneSpec | null {
  const n = candles.length;
  const tf = normalizeChartTimeframe(sourceTf);
  const minBars =
    tf === '1w' || tf === '1M' ? 8 : tf === '1d' ? 8 : tf === '4h' || tf === '1h' ? 12 : 16;
  if (n < minBars) return null;

  let wkPack: ReturnType<typeof buildMergedDeskWyckoffPack> | null = null;
  try {
    wkPack = buildMergedDeskWyckoffPack({ candles, timeframe: sourceTf, enabled: true });
  } catch {
    wkPack = null;
  }
  const wk = wkPack?.read;
  const atr = atrApprox(candles);
  const last = Number(candles[n - 1]!.close);
  if (!(last > 0) || !(atr > 0)) return null;

  const look = floorLookback(tf, n);
  const { hi: swingHi, lo: swingLo } = swingRange(candles, look);
  const allowForceSwing =
    tf === '1d' ||
    tf === '4h' ||
    tf === '1w' ||
    tf === '1M' ||
    isMtfDumpChartLocalOnlyTf(tf);

  if (!(swingHi > 0) || !Number.isFinite(swingLo)) {
    if (allowForceSwing) {
      return forceSwingDumpZone(candles, sourceTf);
    }
    return null;
  }

  let dumpTarget = pickFloorTarget({
    candles,
    sourceTf: tf,
    last,
    atr,
    wkSupport: wk?.support && wk.support > 0 ? wk.support : undefined,
  });
  if (!(dumpTarget > 0)) {
    if (allowForceSwing) {
      return forceSwingDumpZone(candles, sourceTf);
    }
    return null;
  }

  const distantTarget = dumpTarget < last - Math.max(atr * 0.35, last * 0.004);
  if (!distantTarget) {
    const drop = (swingHi - last) / swingHi;
    const dropMin =
      tf === '1w' || tf === '1M' ? 0.01 : tf === '1d' || tf === '4h' ? 0.01 : tf === '1h' ? 0.015 : 0.02;
    if (drop < dropMin) {
      if (allowForceSwing) {
        return forceSwingDumpZone(candles, sourceTf);
      }
      return null;
    }
  }

  if (!distantTarget) {
    const resist = wk?.resist && wk.resist > dumpTarget ? wk.resist : dumpTarget + atr * 0.65;
    if (last > resist + atr * 0.2) {
      if (allowForceSwing) {
        return forceSwingDumpZone(candles, sourceTf);
      }
      return null;
    }
  }

  const band = dumpTargetBand(dumpTarget, atr, sourceTf);
  const tfKo = mergedDeskTfLabelKo(sourceTf);
  const formedTime = wk?.eventTime && wk.eventTime > 0 ? wk.eventTime : Number(candles[n - 2]!.time);

  return {
    sourceTf: tf,
    sourceTfKo: tfKo,
    top: band.hi,
    bot: band.lo,
    mid: dumpTarget,
    formedTime,
    labelKo: `${tfKo} 폭락`,
    detailKo: wk?.headlineKo
      ? `${wk.headlineKo} · ${tfKo} · 조건부 참고`
      : `${tfKo} 하방 목표 · 확정 경로·승률 아님`,
    analysisSource: 'wyckoff',
    bandRole: 'floor',
  };
}

export function detectMtfDumpCeilingZone(candles: Candle[], sourceTf: string): MtfDumpZoneSpec | null {
  const n = candles.length;
  const tf = normalizeChartTimeframe(sourceTf);
  const minBars =
    tf === '1w' || tf === '1M' ? 8 : tf === '1d' ? 8 : tf === '4h' || tf === '1h' ? 12 : 16;
  if (n < minBars) return null;

  let wkPack: ReturnType<typeof buildMergedDeskWyckoffPack> | null = null;
  try {
    wkPack = buildMergedDeskWyckoffPack({ candles, timeframe: sourceTf, enabled: true });
  } catch {
    wkPack = null;
  }
  const wk = wkPack?.read;
  const atr = atrApprox(candles);
  const last = Number(candles[n - 1]!.close);
  if (!(last > 0) || !(atr > 0)) return null;

  const look =
    tf === '1w' || tf === '1M' ? Math.min(n - 2, 24) : tf === '1d' ? Math.min(n - 2, 90) : Math.min(n - 2, 48);
  const { hi: swingHi } = swingRange(candles, look);

  let ceilTarget = wk?.resist && wk.resist > last ? wk.resist : 0;
  if (!(ceilTarget > last)) {
    if (swingHi > last * 1.001) ceilTarget = swingHi;
    else ceilTarget = last + atr * 0.55;
  }
  if (!(ceilTarget > last)) {
    if (tf === '1d' || tf === '4h' || tf === '1w' || tf === '1M') {
      return forceSwingCeilingZone(candles, sourceTf);
    }
    return null;
  }

  const maxDist = Math.max(atr * (tf === '1w' || tf === '1M' ? 8 : tf === '1d' ? 6 : 4.5), last * 0.08);
  if (ceilTarget > last + maxDist) ceilTarget = last + maxDist * 0.85;
  if (!(ceilTarget > last * 1.0003)) {
    if (tf === '1d' || tf === '4h' || tf === '1w' || tf === '1M') {
      return forceSwingCeilingZone(candles, sourceTf);
    }
    return null;
  }

  const band = dumpTargetBand(ceilTarget, atr, sourceTf);
  const tfKo = mergedDeskTfLabelKo(sourceTf);
  const formedTime = wk?.eventTime && wk.eventTime > 0 ? wk.eventTime : Number(candles[n - 2]!.time);

  return {
    sourceTf: tf,
    sourceTfKo: tfKo,
    top: band.hi,
    bot: band.lo,
    mid: ceilTarget,
    formedTime,
    labelKo: `${tfKo} 폭락감시`,
    detailKo: wk?.headlineKo
      ? `${wk.headlineKo} · ${tfKo} 상방 폭락감시 · 조건부`
      : `${tfKo} 상방 폭락감시(고점·저항) · 확정 경로·승률 아님`,
    analysisSource: 'wyckoff',
    bandRole: 'ceiling',
  };
}

export type MtfDumpZonePack = {
  zones: MtfDumpZoneSpec[];
  overlays: OverlayItem[];
  priceLines: AtlasPulsePriceLine[];
  summaryKo: string;
  /** 현재→상단 폭락감시 도달 조건부 요약 */
  reachSummaryKo?: string;
  bounceCapKo?: string;
  bounceCapPrice?: number;
  /** 확실지지 → 반등1차 → 확실저항 */
  supportResistPathKo?: string;
  /** path=주경로 1세트 · mtf=전체 */
  displayMode?: 'path' | 'mtf';
  /** 반등 시나리오 1상태 */
  pathScenarioKo?: string;
  invalidationPrice?: number | null;
  /** TF별 반등 1차 구간 (1h·1d·1w·1M…) */
  bounceTargetByTf?: MtfDumpBounceTargetPack;
};

export function buildMergedDeskMtfDumpZonePack(params: {
  chartCandles: Candle[];
  chartTf: string;
  candlesByTf: Record<string, Candle[] | null | undefined>;
  approachSourceTf?: string | null;
  schematicDumpHint?: MtfSchematicDumpHint | null;
  registryZones?: MtfDumpZoneSpec[];
  hotZones?: import('@/lib/mergedDeskHotZoneEntry').MergedDeskHotZoneEntry[] | null;
  whaleBeamIntel?: import('@/lib/whaleVolumeBeamIntel').WhaleBeamIntelPack | null;
  /** 기본 path — 차트에는 지지→반등→저항만 */
  displayMode?: 'path' | 'mtf';
}): MtfDumpZonePack {
  const chartCandles = params.chartCandles ?? [];
  const empty: MtfDumpZonePack = {
    zones: [],
    overlays: [],
    priceLines: [],
    summaryKo: '',
    reachSummaryKo: '',
    bounceCapKo: '',
    bounceCapPrice: undefined,
  };
  if (chartCandles.length < 12) return empty;

  const chartTf = normalizeChartTimeframe(params.chartTf);
  const t0 = Number(chartCandles[0]!.time);
  const tLast = Number(chartCandles[chartCandles.length - 1]!.time);
  /**
   * zone 우측 = 마지막 생신 캔들 (스킬: 빈 축·미래봉 과연장 금지).
   * 예전 future pad(20)는 라벨이 캔들·거래량에서 멀어짐.
   */
  const t2 = tLast;
  if (!(t0 > 0) || !(t2 > 0)) return empty;

  const freshSpecs: MtfDumpZoneSpec[] = [];

  const collectSpec = (spec: MtfDumpZoneSpec) => {
    const role = spec.bandRole === 'ceiling' ? 'ceiling' : 'floor';
    const dup = freshSpecs.some((z) => {
      const zRole = z.bandRole === 'ceiling' ? 'ceiling' : 'floor';
      if (normalizeChartTimeframe(z.sourceTf) !== normalizeChartTimeframe(spec.sourceTf)) return false;
      if (zRole !== role) return false;
      return (
        zonesNear(z.mid, spec.mid) ||
        (z.analysisSource === 'schematic' && spec.analysisSource === 'wyckoff')
      );
    });
    if (dup) return;
    freshSpecs.push(spec);
  };

  if (params.schematicDumpHint) {
    try {
      const chartCandlesForHint =
        params.candlesByTf[chartTf]?.length >= 12 ? params.candlesByTf[chartTf]! : chartCandles;
      const schematicSpec = buildChartTfSchematicDumpSpec({
        candles: chartCandlesForHint,
        hint: params.schematicDumpHint,
      });
      if (schematicSpec) collectSpec(schematicSpec);
    } catch {
      /* keep */
    }
  }

  for (const tf of resolveMtfDumpScanTfs(chartTf)) {
    const candles = params.candlesByTf[tf];
    const minNeed =
      tf === '1w' || tf === '1M' || tf === '1d' ? 8 : tf === '4h' || tf === '1h' ? 12 : 16;
    if (!candles || candles.length < minNeed) continue;
    try {
      let floor = detectMtfDumpZone(candles, tf);
      if (
        !floor &&
        (tf === '1d' ||
          tf === '4h' ||
          tf === '1w' ||
          tf === '1M' ||
          isMtfDumpChartLocalOnlyTf(tf))
      ) {
        floor = forceSwingDumpZone(candles, tf);
      }
      if (floor) {
        if (
          !(
            tf === chartTf &&
            freshSpecs.some(
              (z) =>
                z.sourceTf === chartTf &&
                z.analysisSource === 'schematic' &&
                (z.bandRole ?? 'floor') === 'floor' &&
                zonesNear(z.mid, floor!.mid)
            )
          )
        ) {
          collectSpec(floor);
        }
      }

      let ceiling = detectMtfDumpCeilingZone(candles, tf);
      if (
        !ceiling &&
        (tf === '1d' ||
          tf === '4h' ||
          tf === '1w' ||
          tf === '1M' ||
          tf === '1h' ||
          tf === '15m' ||
          isMtfDumpChartLocalOnlyTf(tf))
      ) {
        ceiling = forceSwingCeilingZone(candles, tf);
      }
      if (ceiling) collectSpec(ceiling);
    } catch {
      /* TF skip */
    }
  }

  /**
   * 실시간 스캔이 있는 TF 슬롯은 기기 local 레지스트리를 덮어쓴다.
   * (폰·PC가 각자 오래된 localStorage를 들고 폭락구간이 갈라지던 원인)
   * 1m 전용 zone은 레지스트리에서 제외 — 차트 TF에서만 표시.
   */
  const liveSlots = new Set(freshSpecs.map((z) => mtfDumpSlotKey(z)));
  const chartIsLocalOnly = isMtfDumpChartLocalOnlyTf(chartTf);
  const registry = (params.registryZones ?? []).filter((z) => {
    if (isMtfDumpChartLocalOnlyTf(z.sourceTf)) return false;
    return true;
  });
  const bySlot = new Map<string, MtfDumpZoneSpec>();
  for (const spec of registry) {
    const slot = mtfDumpSlotKey(spec);
    if (liveSlots.has(slot)) continue;
    bySlot.set(slot, spec);
  }
  for (const spec of freshSpecs) {
    bySlot.set(mtfDumpSlotKey(spec), spec);
  }

  let zonesRaw = [...bySlot.values()].sort(
    (a, b) =>
      timeframeRank(b.sourceTf) - timeframeRank(a.sourceTf) ||
      (a.bandRole === 'ceiling' ? 0 : 1) - (b.bandRole === 'ceiling' ? 0 : 1)
  );

  /** 1m 차트 — 1m 전용만 표시 (공용 HTF 레지스트리 투영 안 함) */
  if (chartIsLocalOnly) {
    zonesRaw = zonesRaw.filter((z) => isMtfDumpChartLocalOnlyTf(z.sourceTf));
  } else {
    zonesRaw = zonesRaw.filter((z) => !isMtfDumpChartLocalOnlyTf(z.sourceTf));
  }

  /** 4h·1d·1w·1M floor/ceiling — 한 TF만 보이는 문제 방지 (1m 차트는 스킵) */
  if (!chartIsLocalOnly) {
    for (const htf of MTF_DUMP_HTF_ALWAYS) {
      for (const role of ['floor', 'ceiling'] as const) {
        const has = zonesRaw.some(
          (z) =>
            normalizeChartTimeframe(z.sourceTf) === htf &&
            (z.bandRole === 'ceiling' ? 'ceiling' : 'floor') === role
        );
        if (has) continue;
        const c = params.candlesByTf[htf];
        if (!c || c.length < 8) continue;
        const forced =
          role === 'floor'
            ? detectMtfDumpZone(c, htf) ?? forceSwingDumpZone(c, htf)
            : detectMtfDumpCeilingZone(c, htf) ?? forceSwingCeilingZone(c, htf);
        if (forced) zonesRaw.push(forced);
      }
    }
  }

  const zonesLived = separateOverlappingFloorZones(zonesRaw)
    .slice(0, MTF_DUMP_MAX_ZONES)
    .map((spec) => {
      const life = evaluateDumpLifeCycle({
        chartCandles,
        top: spec.top,
        bot: spec.bot,
        mid: spec.mid,
        bandRole: spec.bandRole === 'ceiling' ? 'ceiling' : 'floor',
        hotZones: params.hotZones,
        whaleBeamIntel: params.whaleBeamIntel,
      });
      const touch = computeDumpZoneTouchStats({
        candles: chartCandles,
        top: spec.top,
        bot: spec.bot,
        mid: spec.mid,
        bandRole: spec.bandRole === 'ceiling' ? 'ceiling' : 'floor',
      });
      return {
        ...spec,
        lifeState: life.state,
        evidenceScore: life.score,
        evidenceKo: life.reasonsKo,
        confluenceBull: life.confluence?.bullScore,
        confluenceBear: life.confluence?.bearScore,
        touchCount: touch.touchCount,
        touchReactionPct: touch.reactionPct,
        touchLabelKo: touch.labelKo,
        touchTipKo: touch.tipKo,
        detailKo: [
          spec.detailKo,
          `${DUMP_LIFE_KO[life.state]}·증거${life.score}`,
          touch.labelKo,
          life.reasonsKo.length ? life.reasonsKo.join('+') : null,
        ]
          .filter(Boolean)
          .join(' · '),
      };
    });

  const reachPack = buildDumpCeilingReachPack({
    chartCandles,
    chartTf,
    zones: zonesLived,
    priceNow: Number(chartCandles[chartCandles.length - 1]?.close),
  });
  const reachByTf = new Map(reachPack.byTf.map((r) => [normalizeChartTimeframe(r.sourceTf), r]));
  const bounceCap = reachPack.bounceCap;

  const zones = zonesLived.map((spec) => {
    const isCeiling = (spec.bandRole ?? 'floor') === 'ceiling';
    let next = { ...spec };
    if (isCeiling) {
      const r = reachByTf.get(normalizeChartTimeframe(spec.sourceTf));
      if (r) {
        next = {
          ...next,
          reachKo: r.labelKo,
          reachTipKo: r.tipKo,
          reachPct: r.reachPct,
          reachSample: r.sampleCount,
          detailKo: [next.detailKo, r.labelKo].filter(Boolean).join(' · '),
          evidenceKo: [...(next.evidenceKo ?? []), r.labelKo].slice(0, 6),
        };
      }
      if (
        bounceCap &&
        normalizeChartTimeframe(spec.sourceTf) === bounceCap.sourceTf
      ) {
        next = {
          ...next,
          bounceCapKo: bounceCap.labelKo,
          bounceCapPrice: bounceCap.price,
          detailKo: [next.detailKo, bounceCap.labelKo].filter(Boolean).join(' · '),
          evidenceKo: [...(next.evidenceKo ?? []), '반등1차한도'].slice(0, 6),
        };
      }
    } else {
      /** 하단 반등감시/확정 → 어디까지 반등 가능(1차 한도) */
      const life = spec.lifeState;
      const rCeil = reachByTf.get(normalizeChartTimeframe(spec.sourceTf));
      if (rCeil && next.reachPct == null) {
        next = {
          ...next,
          reachPct: rCeil.reachPct,
          reachSample: rCeil.sampleCount,
          reachKo: rCeil.labelKo,
          reachTipKo: rCeil.tipKo,
        };
      }
      if (
        bounceCap &&
        (life === 'BOUNCE_WATCH' || life === 'CONFIRM_UP' || life === 'WATCH')
      ) {
        next = {
          ...next,
          bounceCapKo: bounceCap.labelKo,
          bounceCapPrice: bounceCap.price,
          detailKo: [next.detailKo, bounceCap.labelKo].filter(Boolean).join(' · '),
          evidenceKo: [...(next.evidenceKo ?? []), bounceCap.labelKo].slice(0, 6),
        };
      }
    }
    return next;
  });

  const overlays: OverlayItem[] = [];
  const priceLines: AtlasPulsePriceLine[] = [];
  const priceOnly = loadSettings().chartMergedDeskZonePriceOnlyLabels === true;
  const priceNow = Number(chartCandles[chartCandles.length - 1]?.close);
  const srPath = buildDumpSupportResistPath({
    zones,
    bounceCap,
    priceNow,
    chartCandles,
  });

  const bounceTargetByTf = buildMtfDumpBounceTargetByTf({
    zones,
    priceNow,
    chartTf,
    chartCandles,
    reachByTf: reachPack.byTf,
    pathScenarioKo: srPath.scenarioKo,
  });
  const bounceRowByTf = new Map(
    bounceTargetByTf.rows.map((r) => [normalizeChartTimeframe(r.sourceTf), r])
  );
  const activeBounceTf = bounceTargetByTf.activeRow
    ? normalizeChartTimeframe(bounceTargetByTf.activeRow.sourceTf)
    : '';
  const floorLifeByTf = new Map<string, DumpLifeState>();
  const ceilingMidByTf = new Map<string, number>();
  for (const z of zones) {
    const tf = normalizeChartTimeframe(z.sourceTf);
    if ((z.bandRole ?? 'floor') === 'floor' && z.lifeState) {
      floorLifeByTf.set(tf, z.lifeState);
    }
    if (z.bandRole === 'ceiling') {
      const mid = Number(z.mid);
      const bot = Math.min(Number(z.bot) || Infinity, Number(z.top) || Infinity);
      const px = bot > 0 && Number.isFinite(bot) ? bot : mid;
      if (px > 0) ceilingMidByTf.set(tf, px);
    }
  }
  /** 맥락 라벨: 분·시·일·주·월 — 같은 TF 상·하단은 항상 같은 방향 라벨 */
  const bounceCtxByTf = new Map<string, boolean>();
  for (const tf of new Set([
    ...floorLifeByTf.keys(),
    ...ceilingMidByTf.keys(),
    ...bounceRowByTf.keys(),
  ])) {
    const bounceRow = bounceRowByTf.get(tf);
    const ceilPx = ceilingMidByTf.get(tf);
    const floorLife = floorLifeByTf.get(tf);
    const priceBelowCeiling =
      ceilPx != null && priceNow > 0 ? priceNow < ceilPx * 1.001 : false;
    const ctx =
      dumpBandBounceContext({
        scenarioKo: srPath.scenarioKo,
        life: floorLife,
        role: 'floor',
        sameTfFloorLife: floorLife,
        inBounceZone: bounceRow?.inBounceZone,
        touchedSupport: bounceRow?.touchedSupport,
        priceBelowCeiling,
      }) ||
      dumpBandBounceContext({
        scenarioKo: srPath.scenarioKo,
        life: undefined,
        role: 'ceiling',
        isBounceCap:
          Boolean(bounceCap) && tf === normalizeChartTimeframe(bounceCap!.sourceTf),
        sameTfFloorLife: floorLife,
        inBounceZone: bounceRow?.inBounceZone,
        touchedSupport: bounceRow?.touchedSupport,
        priceBelowCeiling,
      });
    bounceCtxByTf.set(tf, ctx);
  }
  const invalidDistPct =
    srPath.invalidationPrice != null &&
    srPath.invalidationPrice > 0 &&
    priceNow > 0
      ? (Math.abs(priceNow - srPath.invalidationPrice) / priceNow) * 100
      : null;

  for (const z of zones) {
    const role = z.bandRole === 'ceiling' ? 'ceiling' : 'floor';
    const tf = normalizeChartTimeframe(z.sourceTf);
    const bounceCtx = bounceCtxByTf.get(tf) === true;
    const ceilPx = ceilingMidByTf.get(tf);
    const priceAboveCeiling =
      role === 'ceiling' &&
      ceilPx != null &&
      priceNow > 0 &&
      priceNow > ceilPx * 1.0005;
    z.labelKo = dumpBandFaceLabelKo({
      tfKo: z.sourceTfKo,
      role,
      bounceContext: bounceCtx,
      life: z.lifeState,
      priceAboveCeiling,
    });

    const isPrimarySupport =
      Boolean(srPath.support) &&
      role === 'floor' &&
      tf === normalizeChartTimeframe(srPath.support!.sourceTf);
    const isBounceCapCeiling =
      Boolean(bounceCap) &&
      role === 'ceiling' &&
      tf === normalizeChartTimeframe(bounceCap!.sourceTf);
    const dimSet =
      Boolean(activeBounceTf) &&
      srPath.scenarioKo === '반등진행' &&
      tf !== activeBounceTf;
    const viewActive = isPrimarySupport || isBounceCapCeiling || !dimSet;

    const sr = computeSupportResistScore({
      role,
      life: z.lifeState,
      touchReactionPct: z.touchReactionPct,
      touchCount: z.touchCount,
      reachPct: z.reachPct,
      reachSample: z.reachSample,
      bullScore: z.confluenceBull,
      bearScore: z.confluenceBear,
      evidenceKo: z.evidenceKo,
      invalidationDistPct: invalidDistPct,
    });
    const chips = pickDumpEvidenceChips({
      evidenceKo: z.evidenceKo,
      touchLabelKo: z.touchLabelKo,
      srLabelKo: viewActive && CHART_SHOW_SR_PROB_PCT ? sr.labelKo : null,
      active: viewActive,
      max: 2,
    });
    const lifeKo = DUMP_LIFE_KO[z.lifeState ?? 'WATCH'];
    const firmKo = dumpFirmRoleKo(role, z.lifeState) || undefined;
    const faceRoleKo = dumpBandFaceRoleKo({
      role,
      bounceContext: bounceCtx,
      life: z.lifeState,
      priceAboveCeiling,
    });

    z.srScore = sr.score0to100;
    z.srBand = sr.band;
    z.srLabelKo = CHART_SHOW_SR_PROB_PCT ? sr.labelKo : null;
    z.srTipKo = sr.tipKo;
    z.srSampleN = sr.sampleN;
    z.evidenceChips = chips;
    z.viewActive = viewActive;
    z.viewModel = {
      tf,
      bandRole: role,
      faceRoleKo,
      lifeKo,
      firmKo,
      active: viewActive,
      dim: dimSet,
      sr,
      evidenceChips: chips,
      disclaimerKo: dumpSrDisclaimerKo(),
    };
    z.detailKo = [z.detailKo, sr.labelKo, viewActive ? chips.join('+') : null]
      .filter(Boolean)
      .join(' · ');
  }

  /** 반등가능 1차 한도 — ceiling 하단(폭등감시), 지표형 가격선 */
  if (bounceCap && bounceCap.price > 0) {
    const capTf = normalizeChartTimeframe(bounceCap.sourceTf || '');
    const capRow = bounceRowByTf.get(capTf);
    const capZone = zones.find(
      (z) =>
        z.bandRole === 'ceiling' && normalizeChartTimeframe(z.sourceTf) === capTf
    );
    const capVis = dumpTfSetRoleVisual({ tf: capTf || chartTf, role: 'bounce1', active: true });
    const pctBit =
      capZone?.srScore != null
        ? `·${capZone.srScore}%`
        : capRow?.reachPct != null
          ? `·${Math.round(capRow.reachPct)}%`
          : '';
    priceLines.push({
      price: bounceCap.price,
      color: capVis.line,
      title: `반등컷 ${Math.round(bounceCap.price)}${pctBit}`.slice(0, 28),
      lineWidth: 2,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  /** 확실지지/확실저항 — CONFIRM 시에만 굵은 실선 */
  if (srPath.supportFirm && srPath.supportPrice != null && srPath.supportPrice > 0) {
    const sTf = srPath.support ? normalizeChartTimeframe(srPath.support.sourceTf) : chartTf;
    const sZone = zones.find(
      (z) =>
        (z.bandRole ?? 'floor') !== 'ceiling' &&
        normalizeChartTimeframe(z.sourceTf) === sTf
    );
    const sVis = dumpTfSetRoleVisual({ tf: sTf, role: 'floor', active: true, life: 'CONFIRM_UP' });
    const srBit = sZone?.srScore != null ? `·${sZone.srScore}%` : '';
    priceLines.push({
      price: srPath.supportPrice,
      color: sVis.line,
      title: `확실지지 ${Math.round(srPath.supportPrice)}${srBit}`.slice(0, 26),
      lineWidth: 2,
      lineStyle: 'solid',
      axisLabel: true,
    });
  }
  if (
    srPath.resistFirm &&
    srPath.resistPrice != null &&
    srPath.resistPrice > 0 &&
    srPath.resistPrice !== bounceCap?.price
  ) {
    const rTf = srPath.resist ? normalizeChartTimeframe(srPath.resist.sourceTf) : chartTf;
    const rZone = zones.find(
      (z) =>
        z.bandRole === 'ceiling' && normalizeChartTimeframe(z.sourceTf) === rTf
    );
    const rVis = dumpTfSetRoleVisual({
      tf: rTf,
      role: 'ceiling',
      active: true,
      life: 'CONFIRM_RESIST',
    });
    const srBit = rZone?.srScore != null ? `·${rZone.srScore}%` : '';
    priceLines.push({
      price: srPath.resistPrice,
      color: rVis.line,
      title: `확실저항 ${Math.round(srPath.resistPrice)}${srBit}`.slice(0, 26),
      lineWidth: 2,
      lineStyle: 'solid',
      axisLabel: true,
    });
  }
  /** 경로 무효화 — 지지 하단 종가 이탈 */
  if (srPath.invalidationPrice != null && srPath.invalidationPrice > 0) {
    const fail = srPath.scenario === 'FAIL';
    priceLines.push({
      price: srPath.invalidationPrice,
      color: fail ? '#f87171' : '#94a3b8',
      title: `무효 ${Math.round(srPath.invalidationPrice)}`.slice(0, 22),
      lineWidth: fail ? 2 : 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }

  const dumpAlign = evaluateDumpMtfAlign({ zones, bounceCtxByTf });

  for (const spec of zones) {
    const approach = params.approachSourceTf === spec.sourceTf;
    const isSchematic = spec.analysisSource === 'schematic';
    const onSourceTf = normalizeChartTimeframe(spec.sourceTf) === chartTf;
    const isCeiling = spec.bandRole === 'ceiling';
    const specTf = normalizeChartTimeframe(spec.sourceTf);
    const bounceRow = bounceRowByTf.get(specTf);
    const dimSet =
      Boolean(activeBounceTf) &&
      srPath.scenarioKo === '반등진행' &&
      specTf !== activeBounceTf;
    const lifeState = spec.lifeState ?? 'WATCH';
    const lifeKo = DUMP_LIFE_KO[lifeState];
    const firmKo = dumpFirmRoleKo(isCeiling ? 'ceiling' : 'floor', lifeState);
    const isBounceCapCeiling =
      Boolean(bounceCap) &&
      isCeiling &&
      normalizeChartTimeframe(spec.sourceTf) === bounceCap!.sourceTf;
    const isPrimarySupport =
      Boolean(srPath.support) &&
      !isCeiling &&
      normalizeChartTimeframe(spec.sourceTf) ===
        normalizeChartTimeframe(srPath.support!.sourceTf);
    const bounceCtx = bounceCtxByTf.get(specTf) === true;
    const viewActive = spec.viewActive !== false && !dimSet;
    const ceilMid = ceilingMidByTf.get(specTf);
    const priceAboveCeiling =
      isCeiling &&
      ceilMid != null &&
      priceNow > 0 &&
      priceNow > ceilMid * 1.0005;
    const baseName = dumpBandFaceLabelKo({
      tfKo: spec.sourceTfKo,
      role: isCeiling ? 'ceiling' : 'floor',
      bounceContext: bounceCtx,
      schematic: isSchematic && onSourceTf,
      schematicShort: isSchematic && onSourceTf,
      life: lifeState,
      priceAboveCeiling,
    });
    const isApproach =
      Boolean(params.approachSourceTf) &&
      normalizeChartTimeframe(spec.sourceTf) ===
        normalizeChartTimeframe(params.approachSourceTf!);
    /** 활성 세트: 역할·라이프·SR% · 비활성: 역할·라이프만 */
    const nameKo = firmKo
      ? `${baseName} ${firmKo}`
      : isBounceCapCeiling
        ? `${baseName} · 반등한도`
        : isPrimarySupport && bounceCap
          ? `${baseName} · ${srPath.scenarioKo}`
          : `${baseName} · ${lifeKo}`;
    const nameWithSr =
      viewActive && CHART_SHOW_SR_PROB_PCT && spec.srLabelKo
        ? `${nameKo} · ${spec.srLabelKo}`
        : nameKo;
    const nameKoFinal = isApproach
      ? `${stripChartSrProbPct(nameWithSr)} · 접근중`
      : stripChartSrProbPct(nameWithSr);
    const vis = dumpTfSetRoleVisual({
      tf: specTf,
      life: lifeState,
      role: isCeiling ? 'ceiling' : 'floor',
      active: isPrimarySupport || isBounceCapCeiling || !dimSet,
      dim: dimSet,
    });
    const analysisMid = Number(spec.mid);
    let analysisTop = Number(spec.top);
    let analysisBot = Number(spec.bot);
    /** 저장된 폭락존이 두꺼우면 작도 시 TF별 얇은 띠로 재클램프 (전 TF) */
    if (
      analysisMid > 0 &&
      Number.isFinite(analysisTop) &&
      Number.isFinite(analysisBot)
    ) {
      const atrProxy =
        specTf === '1w' || specTf === '1M'
          ? analysisMid * 0.016
          : specTf === '1d'
            ? analysisMid * 0.011
            : specTf === '4h'
              ? analysisMid * 0.009
              : specTf === '1h'
                ? analysisMid * 0.0075
                : analysisMid * 0.006;
      const slim = dumpTargetBand(analysisMid, atrProxy, specTf);
      const spanNow = Math.abs(analysisTop - analysisBot);
      const spanSlim = Math.abs(slim.hi - slim.lo);
      if (spanNow > spanSlim * 1.05) {
        analysisTop = slim.hi;
        analysisBot = slim.lo;
      }
    }
    const reachSig =
      viewActive && isCeiling && spec.reachPct != null
        ? formatReachConditionalKo(spec.reachPct, spec.reachSample)
        : viewActive && isCeiling && bounceRow?.reachPct != null
          ? formatReachConditionalKo(bounceRow.reachPct, bounceRow.reachSample)
          : '';
    const bounceTargetPx =
      !isCeiling && bounceRow?.bounce1Px != null
        ? bounceRow.bounce1Px
        : !isCeiling && spec.bounceCapPrice
          ? spec.bounceCapPrice
          : isBounceCapCeiling && bounceCap
            ? bounceCap.price
            : null;
    const bounceSig =
      viewActive && bounceTargetPx != null && bounceTargetPx > 0
        ? isCeiling
          ? `한도${Math.round(bounceTargetPx)}`
          : `반등→${Math.round(bounceTargetPx)}`
        : '';
    const bounceProbSig =
      viewActive && CHART_SHOW_SR_PROB_PCT && !isCeiling && spec.srLabelKo
        ? spec.srLabelKo
        : viewActive && !isCeiling && bounceRow?.reachPct != null
          ? formatReachConditionalKo(bounceRow.reachPct, bounceRow.reachSample)
          : viewActive && !isCeiling && spec.reachPct != null
            ? formatReachConditionalKo(spec.reachPct, spec.reachSample)
            : '';
    const touchSig = viewActive
      ? spec.touchLabelKo || (spec.touchCount != null ? `터치${spec.touchCount}` : '')
      : '';
    const chipSig = viewActive ? (spec.evidenceChips || []).slice(0, 2).join(' · ') : '';
    const facePack = formatZoneFacePrice({
      nameKo: nameKoFinal,
      mid: analysisMid,
      priceOnly: false,
      signalKo:
        viewActive
          ? [
              isApproach ? '접근중' : '',
              chipSig,
              bounceSig,
              touchSig,
              bounceProbSig || reachSig,
            ]
              .filter(Boolean)
              .join(' · ') || undefined
          : undefined,
    });
    const alignSig =
      dumpAlign.linked && dumpAlign.tagKo
        ? /하락확정|상승확정/.test(baseName)
          ? '연동'
          : dumpAlign.tagKo
        : '';
    const faceBase = priceOnly ? '' : baseName;
    const faceSignal = priceOnly
      ? ''
      : [alignSig, isApproach ? '접근중' : ''].filter(Boolean).join(' · ');
    const useTouchSpan =
      isSchematic &&
      onSourceTf &&
      spec.zoneSpanOnly &&
      spec.touchTime1 != null &&
      spec.touchTime2 != null;
    const zoneT1 = useTouchSpan ? spec.touchTime1! : t0;
    const zoneT2 = useTouchSpan ? spec.touchTime2! : t2;
    const halfFallback = Math.max(
      Math.abs(analysisTop - analysisBot) / 2,
      Math.abs(analysisMid) * 0.00055,
      24
    );
    const vTop =
      Number.isFinite(analysisTop) && analysisTop > 0 ? analysisTop : analysisMid + halfFallback;
    const vBot =
      Number.isFinite(analysisBot) && analysisBot > 0 ? analysisBot : analysisMid - halfFallback;

    overlays.push({
      id: `merged-desk-mtf-dump-${spec.sourceTf}${isCeiling ? '-ceil' : '-floor'}${isSchematic ? '-schematic' : ''}`,
      kind: 'zone',
      label: faceBase,
      zoneFaceBase: faceBase,
      zoneFaceSignal: priceOnly ? '' : faceSignal || undefined,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: zoneT1,
      time2: zoneT2,
      price1: vTop,
      price2: vBot,
      confidence: 72 + Math.min(12, timeframeRank(spec.sourceTf)) + (spec.evidenceScore ?? 0),
      color: vis.fill,
      zoneFillPreserve: true,
      zoneSpanOnly: useTouchSpan,
      structureBias:
        dumpAlign.side === 'SHORT'
          ? 'bearish'
          : dumpAlign.side === 'LONG'
            ? 'bullish'
            : lifeState === 'CONFIRM_UP' || lifeState === 'BOUNCE_WATCH'
              ? 'bullish'
              : 'bearish',
      overlayZoneExtraClass: [
        'merged-desk-mtf-dump-zone',
        `merged-desk-mtf-dump-tf-${specTf}`,
        vis.lifeClass,
        vis.setClass,
        'merged-desk-pill-zone',
        'merged-desk-crash',
        'merged-desk-zone-label-on',
        isSchematic ? 'merged-desk-mtf-dump-schematic merged-desk-structure-reaction' : '',
        approach ? 'merged-desk-mtf-dump-approach' : '',
        isApproach ? 'merged-desk-mtf-dump-approach' : '',
        isCeiling ? 'merged-desk-mtf-dump-ceiling' : 'merged-desk-mtf-dump-floor',
        isBounceCapCeiling ? 'merged-desk-mtf-dump-bounce-cap' : '',
        firmKo === '확실지지' ? 'merged-desk-mtf-dump-firm-support' : '',
        firmKo === '확실저항' ? 'merged-desk-mtf-dump-firm-resist' : '',
        dimSet ? 'merged-desk-mtf-dump-set-dim' : '',
        dumpAlign.extraClass,
      ]
        .filter(Boolean)
        .join(' '),
      labelTooltip: `${facePack.tip}\n${spec.detailKo}${
        bounceTargetPx != null ? `\n반등컷 ${Math.round(bounceTargetPx)}` : ''
      }${spec.srTipKo ? `\n${spec.srTipKo}` : ''}${
        bounceProbSig || reachSig ? `\n${bounceProbSig || reachSig}` : ''
      }${spec.touchTipKo ? `\n${spec.touchTipKo}` : ''}${
        bounceCap && (spec.bounceCapKo || isBounceCapCeiling) ? `\n${bounceCap.tipKo}` : ''
      }${spec.reachTipKo ? `\n${spec.reachTipKo}` : ''}${
        srPath.pathKo ? `\n경로 ${srPath.pathKo}` : ''
      }${srPath.invalidationPrice != null ? `\n무효 ${Math.round(srPath.invalidationPrice)} 종가↓` : ''}\n${dumpSrDisclaimerKo()}`,
      labelBackgroundColor: vis.labelBg,
      labelTextColor: vis.labelFg,
      noProject: true,
    });

    /** CONFIRM 확실지지/저항은 위에서 전용 선 — mid 중복 실선 생략, 감시는 mid dashed 유지 */
    const skipMidLine =
      (firmKo === '확실지지' &&
        srPath.supportPrice != null &&
        Math.abs(analysisMid - srPath.supportPrice) / Math.max(analysisMid, 1) < 0.0008) ||
      (firmKo === '확실저항' &&
        srPath.resistPrice != null &&
        Math.abs(analysisMid - srPath.resistPrice) / Math.max(analysisMid, 1) < 0.0008);
    if (!skipMidLine) {
      priceLines.push({
        price: analysisMid,
        color: vis.line,
        title: `${nameKoFinal} ${Math.round(analysisMid)}`.slice(0, 24),
        lineWidth: approach || String(lifeState).startsWith('CONFIRM') ? 2 : 1,
        lineStyle: String(lifeState).startsWith('CONFIRM') ? 'solid' : 'dashed',
        axisLabel: true,
      });
    }
  }

  const lifeSummary =
    zones.length > 0
      ? zones
          .map((z) => {
            const firm = dumpFirmRoleKo(z.bandRole, z.lifeState);
            const touch = z.touchLabelKo || '';
            return `${z.labelKo}${firm ? `·${firm}` : z.lifeState ? `·${DUMP_LIFE_KO[z.lifeState]}` : ''}${
              touch ? `·${touch}` : ''
            }`;
          })
          .slice(0, 3)
          .join(' · ')
      : 'MTF 폭락구간 · 대기';
  const activeTouch =
    bounceTargetByTf.activeRow &&
    zones.find(
      (z) =>
        normalizeChartTimeframe(z.sourceTf) ===
          normalizeChartTimeframe(bounceTargetByTf.activeRow!.sourceTf) &&
        (z.bandRole ?? 'floor') !== 'ceiling'
    );
  const touchProbSummary = [
    activeTouch?.touchLabelKo,
    activeTouch?.srLabelKo
      ? activeTouch.srLabelKo
      : bounceTargetByTf.activeRow?.reachPct != null
        ? formatReachConditionalKo(
            bounceTargetByTf.activeRow.reachPct,
            bounceTargetByTf.activeRow.reachSample
          )
        : activeTouch?.reachPct != null
          ? formatReachConditionalKo(activeTouch.reachPct, activeTouch.reachSample)
          : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const summaryKo = [
    dumpAlign.tagKo,
    srPath.pathKo,
    bounceTargetByTf.summaryKo || bounceCap?.labelKo,
    touchProbSummary,
    lifeSummary,
    reachPack.summaryKo,
  ]
    .filter(Boolean)
    .filter((s, i, arr) => arr.indexOf(s) === i)
    .join(' · ');

  const bounce1ZoneOverlays = buildMtfDumpBounce1ZoneOverlays({
    pack: bounceTargetByTf,
    zones,
    chartTf,
    time1: t0,
    time2: t2,
    pathScenarioKo: srPath.scenarioKo,
  });
  overlays.push(...bounce1ZoneOverlays);
  priceLines.push(
    ...buildMtfDumpBounce1PriceLines({
      pack: bounceTargetByTf,
      pathScenarioKo: srPath.scenarioKo,
    })
  );

  const displayMode = params.displayMode === 'mtf' ? 'mtf' : 'path';

  /** path — HUD 요약만 · zone·가격선은 MTF 전체 */
  const outOverlays = overlays;
  const outLines = priceLines;

  return {
    zones,
    overlays: outOverlays,
    priceLines: outLines,
    summaryKo:
      displayMode === 'path' && srPath.pathKo
        ? srPath.pathKo
        : summaryKo,
    reachSummaryKo: reachPack.summaryKo,
    bounceCapKo: bounceCap?.labelKo,
    bounceCapPrice: bounceCap?.price,
    supportResistPathKo: srPath.pathKo || undefined,
    displayMode,
    pathScenarioKo: srPath.scenarioKo,
    invalidationPrice: srPath.invalidationPrice,
    bounceTargetByTf,
  };
}
