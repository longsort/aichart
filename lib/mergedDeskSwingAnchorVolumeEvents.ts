/**
 * 통합·분석 — 스윙앵커 거래량 이벤트 (빅롱/빅숏 V±%).
 * 확정 피벗 스윙고/저 봉 거래량 대비 + RVOL + 수급 + 가격 재탈환 게이트.
 * 레더: WATCH(예고) → SETUP(준비) → TRIGGER(예비) → CONFIRMED(확정).
 * 기존 거래량 캔들·스토리 라벨은 유지, 선반영은 추가.
 */
import type { UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '@/types';
import type { BeamKindKo } from '@/lib/whaleVolumeBeamIntel';
import { normalizeChartTimeframe } from '@/lib/constants';
import { estimateBarBuySell } from '@/lib/volumeDirectionStats';
import { smaTotalVolumeAt, type VolumePanelMarker } from '@/lib/volumeHistogramIntelligence';
import {
  volumeAccumulationOk,
  uptrendAfterBuildOk,
  volumeExhaustionOk,
  downtrendOrRejectOk,
  candleConfluenceBoost,
  volumeQuietBuildProbe,
  volumeQuietExhaustProbe,
  volumeSetupLongOk,
  volumeSetupShortOk,
  localStructureBias,
  recentTapeBias,
  ladderLongBlockedByDump,
  volAccumulateWindowBars,
} from '@/lib/mergedDeskVolAccumulateExhaust';

export type SwingAnchorVolTier = 'big-long' | 'big-short';

/** 선반영 레더 — 미래 예지 아님. 조건부 시나리오만. */
export type SwingAnchorVolPhase = 'watch' | 'setup' | 'trigger' | 'confirmed';

export type SwingAnchorVolumeEvent = {
  barIdx: number;
  time: number;
  side: 'long' | 'short';
  tier: SwingAnchorVolTier;
  volDeltaPct: number;
  anchorIdx: number;
  anchorPrice: number;
  rvol: number;
  buyPct: number;
  sellPct: number;
  score: number;
  markerKo: string;
  tooltipKo: string;
  /** 선반영(예비) — 확정 전 빠른 표시. 봉 마감 후 사라지거나 확정으로 승격 */
  early?: boolean;
  /** WATCH→SETUP→TRIGGER→CONFIRMED */
  phase?: SwingAnchorVolPhase;
  /** 깨지면 시나리오 소멸 */
  invalidationPrice?: number;
  scenarioKo?: string;
  /** Bitget 고래 DNA 합류 (선택) */
  whaleBeamKo?: BeamKindKo;
  whaleTierBtc?: number;
  whaleStrength?: number;
  whaleAligned?: boolean;
  whaleConflict?: boolean;
  whaleBoost?: boolean;
};

export type SwingAnchorVolumeDetectOpts = {
  timeframe?: string;
  rvolPeriod?: number;
  /** 스캔 구간 (최근 N봉) */
  scanBars?: number;
  /** 이벤트 간 최소 봉 간격 */
  minBarGap?: number;
  /** 구간 내 최대 이벤트 수 */
  maxEvents?: number;
  lookbackBars?: number;
  /** 선반영(예비빅롱/숏·예고·준비) ON — 기본 true */
  earlyPreviewOn?: boolean;
  /** WATCH/SETUP 레더 ON — 기본 true */
  ladderPreviewOn?: boolean;
};

function swingWing(timeframe?: string): number {
  const tf = normalizeChartTimeframe(timeframe ?? '4h');
  const map: Record<string, number> = {
    '1m': 4,
    '3m': 4,
    '5m': 4,
    '15m': 4,
    '1h': 3,
    '4h': 3,
    '1d': 3,
    '1w': 2,
    '1M': 2,
    '1Y': 2,
  };
  return map[tf] ?? 3;
}

function pivotHigh(rows: Candle[], i: number, L: number, R: number): boolean {
  const hi = rows[i]!.high;
  for (let j = i - L; j < i; j++) if (j < 0 || rows[j]!.high >= hi) return false;
  for (let j = i + 1; j <= i + R; j++) if (j >= rows.length || rows[j]!.high > hi) return false;
  return true;
}

function pivotLow(rows: Candle[], i: number, L: number, R: number): boolean {
  const lo = rows[i]!.low;
  for (let j = i - L; j < i; j++) if (j < 0 || rows[j]!.low <= lo) return false;
  for (let j = i + 1; j <= i + R; j++) if (j >= rows.length || rows[j]!.low < lo) return false;
  return true;
}

type ConfirmedPivot = { idx: number; side: 'high' | 'low'; price: number; vol: number };

function findConfirmedPivots(rows: Candle[], wing: number, fromIdx: number): ConfirmedPivot[] {
  const n = rows.length;
  const out: ConfirmedPivot[] = [];
  for (let i = fromIdx; i <= n - 1 - wing; i++) {
    const vol = Math.max(0, Number(rows[i]!.volume) || 0);
    if (pivotLow(rows, i, wing, wing)) {
      out.push({ idx: i, side: 'low', price: rows[i]!.low, vol });
    }
    if (pivotHigh(rows, i, wing, wing)) {
      out.push({ idx: i, side: 'high', price: rows[i]!.high, vol });
    }
  }
  return out.sort((a, b) => a.idx - b.idx);
}

function rvolAt(rows: Candle[], i: number, period: number): number | null {
  if (i < period - 1) return null;
  const sma = smaTotalVolumeAt(rows, i, period);
  const v = Math.max(0, Number(rows[i]?.volume) || 0);
  if (!(sma > 0)) return null;
  return v / sma;
}

function atrLike(rows: Candle[], i: number, len = 14): number {
  let s = 0;
  let c = 0;
  const from = Math.max(1, i - len + 1);
  for (let k = from; k <= i; k++) {
    const a = rows[k]!;
    const b = rows[k - 1]!;
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
  const px = Number(rows[i]?.close) || 0;
  return c > 0 ? s / c : px * 0.004;
}

function closePosInRange(c: Candle): number | null {
  const hi = Number(c.high);
  const lo = Number(c.low);
  const cl = Number(c.close);
  if (![hi, lo, cl].every(Number.isFinite) || hi <= lo) return null;
  return (cl - lo) / (hi - lo);
}

function bodyRatio(c: Candle): number | null {
  const hi = Number(c.high);
  const lo = Number(c.low);
  const o = Number(c.open);
  const cl = Number(c.close);
  if (![hi, lo, o, cl].every(Number.isFinite) || hi <= lo) return null;
  return Math.abs(cl - o) / (hi - lo);
}

function isChop(rows: Candle[], i: number, atr: number): boolean {
  const from = Math.max(0, i - 5);
  let hi = -Infinity;
  let lo = Infinity;
  for (let j = from; j <= i; j++) {
    hi = Math.max(hi, Number(rows[j]!.high));
    lo = Math.min(lo, Number(rows[j]!.low));
  }
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return true;
  return hi - lo < atr * 0.45;
}

function latestPivotBefore(
  pivots: ConfirmedPivot[],
  barIdx: number,
  side: 'high' | 'low',
  minIdx: number
): ConfirmedPivot | null {
  let best: ConfirmedPivot | null = null;
  for (const p of pivots) {
    if (p.side !== side) continue;
    if (p.idx >= barIdx) continue;
    if (p.idx < minIdx) continue;
    if (!best || p.idx > best.idx) best = p;
  }
  return best;
}

function fmtVolPct(p: number): string {
  const sign = p >= 0 ? '+' : '';
  return `${sign}${Math.round(p)}`;
}

function scoreEvent(params: {
  volDeltaPct: number;
  rvol: number;
  flowPct: number;
  reclaimPct: number;
  anchorRvol: number;
}): number {
  return (
    params.volDeltaPct * 0.35 +
    params.rvol * 18 +
    params.flowPct * 42 +
    params.reclaimPct * 0.8 +
    Math.min(12, params.anchorRvol * 4)
  );
}

function phaseRank(p?: SwingAnchorVolPhase): number {
  if (p === 'confirmed') return 4;
  if (p === 'trigger') return 3;
  if (p === 'setup') return 2;
  if (p === 'watch') return 1;
  return 0;
}

/** 빅롱/빅숏 — 확정 + 예비(TRIGGER) + 예고/준비(WATCH/SETUP) */
export function detectSwingAnchorVolumeEvents(
  candles: Candle[],
  opts?: SwingAnchorVolumeDetectOpts
): SwingAnchorVolumeEvent[] {
  const rows = candles;
  const n = rows.length;
  const tf = opts?.timeframe;
  const wing = swingWing(tf);
  const period = Math.max(8, Math.min(60, Math.floor(opts?.rvolPeriod ?? 20)));
  const scanBars = Math.max(40, Math.min(240, Math.floor(opts?.scanBars ?? 120)));
  const minGap = Math.max(3, Math.min(12, Math.floor(opts?.minBarGap ?? 5)));
  const maxEvents = Math.max(3, Math.min(16, Math.floor(opts?.maxEvents ?? 12)));
  const lookback = Math.max(24, Math.min(160, Math.floor(opts?.lookbackBars ?? 96)));
  const earlyOn = opts?.earlyPreviewOn !== false;
  const ladderOn = opts?.ladderPreviewOn !== false && earlyOn;
  const buildWin = volAccumulateWindowBars(tf, false);

  if (n < period + wing * 2 + 8) return [];

  const scanFrom = Math.max(period, n - 1 - scanBars);
  const pivotFrom = Math.max(wing, scanFrom - lookback);
  const pivots = findConfirmedPivots(rows, wing, pivotFrom);

  type Gate = {
    volDeltaMin: number;
    rvolMin: number;
    flowMin: number;
    reclaimMin: number;
    bodyMin: number;
    posLong: number;
    posShort: number;
    early: boolean;
    phase: SwingAnchorVolPhase;
  };

  const confirmedGate: Gate = {
    volDeltaMin: 28,
    rvolMin: 1.45,
    flowMin: 0.56,
    reclaimMin: 0.12,
    bodyMin: 0.32,
    posLong: 0.5,
    posShort: 0.5,
    early: false,
    phase: 'confirmed',
  };
  /** TRIGGER — 모집/소진 게이트 유지, 수치만 완화 */
  const earlyGate: Gate = {
    volDeltaMin: 14,
    rvolMin: 1.18,
    flowMin: 0.52,
    reclaimMin: 0.04,
    bodyMin: 0.2,
    posLong: 0.42,
    posShort: 0.58,
    early: true,
    phase: 'trigger',
  };

  const tryBar = (
    i: number,
    gate: Gate,
    into: SwingAnchorVolumeEvent[]
  ): void => {
    const c = rows[i]!;
    const curVol = Math.max(0, Number(c.volume) || 0);
    if (curVol <= 0) return;

    const rv = rvolAt(rows, i, period);
    if (rv == null || rv < gate.rvolMin * 0.85) return;

    const sp = estimateBarBuySell(c);
    const buyPct = sp.buyPct;
    const sellPct = sp.sellPct;
    const body = bodyRatio(c);
    const pos = closePosInRange(c);
    const atr = atrLike(rows, i);
    if (!gate.early && isChop(rows, i, atr)) return;

    const minAnchorIdx = Math.max(pivotFrom, i - lookback);
    const accum = volumeAccumulationOk(rows, i, period, gate.early, tf);
    const exhaust = volumeExhaustionOk(rows, i, period, gate.early, tf);
    const upTrend = uptrendAfterBuildOk(rows, i, gate.early, tf);
    const downReject = downtrendOrRejectOk(rows, i, gate.early, tf);

    let swLow = latestPivotBefore(pivots, i, 'low', minAnchorIdx);
    if (!swLow && accum.ok) {
      const a0 = Math.max(minAnchorIdx, accum.from, i - buildWin);
      let loIdx = a0;
      let loPx = Number(rows[a0]!.low);
      for (let k = a0; k < i; k++) {
        const lv = Number(rows[k]!.low);
        if (lv < loPx) {
          loPx = lv;
          loIdx = k;
        }
      }
      swLow = {
        idx: loIdx,
        side: 'low',
        price: loPx,
        vol: Math.max(0, Number(rows[loIdx]!.volume) || 0),
      };
    }
    if (swLow && swLow.vol > 0 && i - swLow.idx >= (gate.early ? 2 : 3)) {
      const volDeltaPct = ((curVol - swLow.vol) / swLow.vol) * 100;
      const reclaimPct =
        swLow.price > 0 ? ((Number(c.close) - swLow.price) / swLow.price) * 100 : 0;
      const anchorRvol = rvolAt(rows, swLow.idx, period) ?? 1;
      const candle = candleConfluenceBoost(c, 'long');
      const inv = swLow.price * 0.998;

      const bigLong =
        accum.ok &&
        upTrend &&
        volDeltaPct >= gate.volDeltaMin &&
        rv >= gate.rvolMin &&
        buyPct >= gate.flowMin &&
        reclaimPct >= gate.reclaimMin &&
        Number(c.close) > swLow.price &&
        Number(c.close) >= inv &&
        (pos == null || pos >= gate.posLong) &&
        (body == null || body >= gate.bodyMin) &&
        Number(c.close) >= Number(c.open) * 0.998 &&
        anchorRvol >= (gate.early ? 0.7 : 0.85);

      if (bigLong) {
        const sc =
          scoreEvent({
            volDeltaPct,
            rvol: rv,
            flowPct: buyPct,
            reclaimPct,
            anchorRvol,
          }) +
          Math.min(10, accum.expandRatio * 2) +
          candle.boost +
          (gate.phase === 'trigger' ? -8 : 0);
        const phaseKo = `모집→상승 · 확장×${accum.expandRatio.toFixed(1)}`;
        const scenarioKo = `모집 유지·저점 ${Math.round(inv)} 이탈 안 하면 확장 후보`;
        into.push({
          barIdx: i,
          time: Number(c.time),
          side: 'long',
          tier: 'big-long',
          volDeltaPct,
          anchorIdx: swLow.idx,
          anchorPrice: swLow.price,
          rvol: rv,
          buyPct,
          sellPct,
          score: sc,
          early: gate.early,
          phase: gate.phase,
          invalidationPrice: inv,
          scenarioKo,
          markerKo: gate.early
            ? `예비빅롱 V${fmtVolPct(volDeltaPct)}`
            : `빅롱 V${fmtVolPct(volDeltaPct)}`,
          tooltipKo: gate.early
            ? `선반영 TRIGGER · ${phaseKo}${candle.noteKo ? ` · ${candle.noteKo}` : ''} · 무효 ${Math.round(inv)} · 마감 전·후 바뀔 수 있음 · 참고`
            : `거래량모집 후 상승 · ${phaseKo}${candle.noteKo ? ` · ${candle.noteKo}` : ''} · 스윙저 대비 ${fmtVolPct(volDeltaPct)}% · RVOL ${rv.toFixed(1)} · 참고·확정 아님`,
        });
      }
    }

    let swHigh = latestPivotBefore(pivots, i, 'high', minAnchorIdx);
    if (!swHigh && exhaust.ok) {
      const a0 = Math.max(minAnchorIdx, exhaust.from, i - buildWin);
      let hiIdx = a0;
      let hiPx = Number(rows[a0]!.high);
      for (let k = a0; k < i; k++) {
        const hv = Number(rows[k]!.high);
        if (hv > hiPx) {
          hiPx = hv;
          hiIdx = k;
        }
      }
      swHigh = {
        idx: hiIdx,
        side: 'high',
        price: hiPx,
        vol: Math.max(0, Number(rows[hiIdx]!.volume) || 0),
      };
    }
    if (swHigh && swHigh.vol > 0 && i - swHigh.idx >= (gate.early ? 2 : 3)) {
      const volDeltaPct = ((curVol - swHigh.vol) / swHigh.vol) * 100;
      const rejectPct =
        swHigh.price > 0 ? ((swHigh.price - Number(c.close)) / swHigh.price) * 100 : 0;
      const anchorRvol = rvolAt(rows, swHigh.idx, period) ?? 1;
      const candle = candleConfluenceBoost(c, 'short');
      const inv = swHigh.price * 1.002;

      const exhaustionShort =
        exhaust.ok &&
        downReject &&
        sellPct >= gate.flowMin * 0.92 &&
        Number(c.close) < swHigh.price &&
        Number(c.close) <= inv &&
        (pos == null || pos <= gate.posShort);

      const classicShort =
        volDeltaPct >= gate.volDeltaMin &&
        rv >= gate.rvolMin &&
        sellPct >= gate.flowMin &&
        rejectPct >= gate.reclaimMin &&
        Number(c.close) < swHigh.price &&
        (pos == null || pos <= gate.posShort) &&
        (body == null || body >= gate.bodyMin) &&
        Number(c.close) <= Number(c.open) * 1.002 &&
        anchorRvol >= (gate.early ? 0.7 : 0.85) &&
        exhaust.ok;

      if (exhaustionShort || classicShort) {
        const sc =
          scoreEvent({
            volDeltaPct: Math.max(volDeltaPct, (1 - exhaust.dryRatio) * 80),
            rvol: rv,
            flowPct: sellPct,
            reclaimPct: rejectPct,
            anchorRvol,
          }) +
          Math.min(12, (1 - exhaust.dryRatio) * 14) +
          candle.boost +
          (gate.phase === 'trigger' ? -8 : 0);
        const phaseKo = `소진 · 피크대비 ${(exhaust.dryRatio * 100).toFixed(0)}%`;
        const scenarioKo = `소진 유지·고점 ${Math.round(inv)} 재탈환 안 하면 거부 후보`;
        into.push({
          barIdx: i,
          time: Number(c.time),
          side: 'short',
          tier: 'big-short',
          volDeltaPct,
          anchorIdx: swHigh.idx,
          anchorPrice: swHigh.price,
          rvol: rv,
          buyPct,
          sellPct,
          score: sc,
          early: gate.early,
          phase: gate.phase,
          invalidationPrice: inv,
          scenarioKo,
          markerKo: gate.early
            ? `예비빅숏 V${fmtVolPct(volDeltaPct)}`
            : `빅숏 V${fmtVolPct(volDeltaPct)}`,
          tooltipKo: gate.early
            ? `선반영 TRIGGER · ${phaseKo}${candle.noteKo ? ` · ${candle.noteKo}` : ''} · 무효 ${Math.round(inv)} · 마감 전·후 바뀔 수 있음 · 참고`
            : `거래량소진 후 하락 · ${phaseKo}${candle.noteKo ? ` · ${candle.noteKo}` : ''} · 스윙고 대비 ${fmtVolPct(volDeltaPct)}% · RVOL ${rv.toFixed(1)} · 참고·확정 아님`,
        });
      }
    }
  };

  /** WATCH / SETUP — 우측 끝만 (과거 확정 리페인트 방지) */
  const tryLadderBar = (i: number, into: SwingAnchorVolumeEvent[]): void => {
    const c = rows[i]!;
    const curVol = Math.max(0, Number(c.volume) || 0);
    if (curVol <= 0) return;
    const rv = rvolAt(rows, i, period) ?? 1;
    const sp = estimateBarBuySell(c);
    const bias = localStructureBias(rows, i, tf);
    const tape = recentTapeBias(rows, i, 6);
    const close = Number(c.close);
    const longBlocked = ladderLongBlockedByDump(rows, i, period) || tape === 'bear' || bias === 'bear';
    const shortBlocked = tape === 'bull' && bias === 'bull';

    const setupL = longBlocked ? { ok: false as const, buildLow: 0, buildLowIdx: i, from: i } : volumeSetupLongOk(rows, i, period, tf);
    const setupS = shortBlocked ? { ok: false as const, buildHigh: 0, buildHighIdx: i, from: i } : volumeSetupShortOk(rows, i, period, tf);
    const watchL = longBlocked ? { ok: false as const, buildLow: 0, buildLowIdx: i, from: i, buildAvg: 0, stacking: false } : volumeQuietBuildProbe(rows, i, period, tf);
    const watchS = shortBlocked
      ? { ok: false as const, peakVol: 0, peakIdx: i, dryRatio: 1, from: i, buildHigh: 0, buildHighIdx: i }
      : volumeQuietExhaustProbe(rows, i, period, tf);

    /** 폭락·스윕 구간이면 숏 예고 우선 (롱 준비와 동시 표기 금지) */
    if (longBlocked && (setupS.ok || watchS.ok)) {
      if (setupS.ok && close < setupS.buildHigh * 1.002) {
        const inv = setupS.buildHigh * 1.002;
        into.push({
          barIdx: i,
          time: Number(c.time),
          side: 'short',
          tier: 'big-short',
          volDeltaPct: 0,
          anchorIdx: setupS.buildHighIdx,
          anchorPrice: setupS.buildHigh,
          rvol: rv,
          buyPct: sp.buyPct,
          sellPct: sp.sellPct,
          score: 30 + rv * 4 - 12,
          early: true,
          phase: 'setup',
          invalidationPrice: inv,
          scenarioKo: `준비 · 폭락/소진 정렬 · 무효 ${Math.round(inv)}`,
          markerKo: '준비숏',
          tooltipKo: `선반영 SETUP 숏 · 스윕·고점소진 구간 · 롱예고와 동시 표기 안 함 · 무효 ${Math.round(inv)} · 확정 아님`,
        });
        return;
      }
      if (watchS.ok && close < watchS.buildHigh * 1.003) {
        const inv = watchS.buildHigh * 1.003;
        into.push({
          barIdx: i,
          time: Number(c.time),
          side: 'short',
          tier: 'big-short',
          volDeltaPct: 0,
          anchorIdx: watchS.buildHighIdx,
          anchorPrice: watchS.buildHigh,
          rvol: rv,
          buyPct: sp.buyPct,
          sellPct: sp.sellPct,
          score: 18 + rv * 3 - 18,
          early: true,
          phase: 'watch',
          invalidationPrice: inv,
          scenarioKo: `예고 · 폭락 후 마름 · 무효 ${Math.round(inv)}`,
          markerKo: '예고숏',
          tooltipKo: `선반영 WATCH 숏 · 스윕·하락 구간 · 롱예고 금지 · 무효 ${Math.round(inv)} · 확정 아님`,
        });
        return;
      }
    }

    if (setupL.ok && !longBlocked && close > setupL.buildLow * 0.998) {
      const inv = setupL.buildLow * 0.998;
      into.push({
        barIdx: i,
        time: Number(c.time),
        side: 'long',
        tier: 'big-long',
        volDeltaPct: 0,
        anchorIdx: setupL.buildLowIdx,
        anchorPrice: setupL.buildLow,
        rvol: rv,
        buyPct: sp.buyPct,
        sellPct: sp.sellPct,
        score: 28 + rv * 4 - 14,
        early: true,
        phase: 'setup',
        invalidationPrice: inv,
        scenarioKo: `준비 · 모집+저점유지 → 확장 대기 · 무효 ${Math.round(inv)}`,
        markerKo: '준비롱',
        tooltipKo: `선반영 SETUP 롱 · 모집 정렬·확장 직전 · 무효화 ${Math.round(inv)} 이탈 시 소멸 · 확정·예지 아님`,
      });
      return;
    }
    if (setupS.ok && !shortBlocked && close < setupS.buildHigh * 1.002) {
      const inv = setupS.buildHigh * 1.002;
      into.push({
        barIdx: i,
        time: Number(c.time),
        side: 'short',
        tier: 'big-short',
        volDeltaPct: 0,
        anchorIdx: setupS.buildHighIdx,
        anchorPrice: setupS.buildHigh,
        rvol: rv,
        buyPct: sp.buyPct,
        sellPct: sp.sellPct,
        score: 28 + rv * 4 - 14,
        early: true,
        phase: 'setup',
        invalidationPrice: inv,
        scenarioKo: `준비 · 소진+고점거부 → 하락 대기 · 무효 ${Math.round(inv)}`,
        markerKo: '준비숏',
        tooltipKo: `선반영 SETUP 숏 · 소진 정렬·거부 직전 · 무효화 ${Math.round(inv)} 재탈환 시 소멸 · 확정·예지 아님`,
      });
      return;
    }

    if (watchL.ok && !longBlocked && close > watchL.buildLow * 0.997) {
      const inv = watchL.buildLow * 0.997;
      into.push({
        barIdx: i,
        time: Number(c.time),
        side: 'long',
        tier: 'big-long',
        volDeltaPct: 0,
        anchorIdx: watchL.buildLowIdx,
        anchorPrice: watchL.buildLow,
        rvol: rv,
        buyPct: sp.buyPct,
        sellPct: sp.sellPct,
        score: 16 + rv * 3 - 20,
        early: true,
        phase: 'watch',
        invalidationPrice: inv,
        scenarioKo: `예고 · 조용한 모집 진행 · 저점 ${Math.round(inv)} 유지 시 상방 후보`,
        markerKo: '예고롱',
        tooltipKo: `선반영 WATCH 롱 · 거래량 모집 진행 중 · 무효화 ${Math.round(inv)} · 미래 확정 아님·참고`,
      });
      return;
    }
    if (watchS.ok && !shortBlocked && close < watchS.buildHigh * 1.003) {
      const inv = watchS.buildHigh * 1.003;
      into.push({
        barIdx: i,
        time: Number(c.time),
        side: 'short',
        tier: 'big-short',
        volDeltaPct: 0,
        anchorIdx: watchS.buildHighIdx,
        anchorPrice: watchS.buildHigh,
        rvol: rv,
        buyPct: sp.buyPct,
        sellPct: sp.sellPct,
        score: 16 + rv * 3 - 20,
        early: true,
        phase: 'watch',
        invalidationPrice: inv,
        scenarioKo: `예고 · 클라이맥스 후 마름 · 고점 ${Math.round(inv)} 미돌파 시 하방 후보`,
        markerKo: '예고숏',
        tooltipKo: `선반영 WATCH 숏 · 거래량 소진 진행 중 · 무효화 ${Math.round(inv)} · 미래 확정 아님·참고`,
      });
    }
  };

  const confirmed: SwingAnchorVolumeEvent[] = [];
  const lastClosed = n - 2;
  for (let i = scanFrom; i <= lastClosed; i++) {
    tryBar(i, confirmedGate, confirmed);
  }

  const early: SwingAnchorVolumeEvent[] = [];
  if (earlyOn) {
    const earlyBars = new Set<number>();
    for (let k = Math.max(scanFrom, n - 3); k <= n - 1; k++) earlyBars.add(k);
    for (const i of earlyBars) {
      tryBar(i, earlyGate, early);
    }
  }

  const ladder: SwingAnchorVolumeEvent[] = [];
  if (ladderOn) {
    for (let k = Math.max(scanFrom, n - 4); k <= n - 1; k++) {
      tryLadderBar(k, ladder);
    }
  }

  const confirmedBars = new Set(confirmed.map((e) => e.barIdx));
  const earlyOnly = early.filter((e) => !confirmedBars.has(e.barIdx));
  const higherBars = new Set([...confirmedBars, ...earlyOnly.map((e) => e.barIdx)]);
  const ladderOnly = ladder.filter((e) => !higherBars.has(e.barIdx));

  const byBar = new Map<number, SwingAnchorVolumeEvent>();
  for (const ev of [...confirmed, ...earlyOnly, ...ladderOnly]) {
    const cur = byBar.get(ev.barIdx);
    if (!cur) {
      byBar.set(ev.barIdx, ev);
      continue;
    }
    const betterPhase = phaseRank(ev.phase) > phaseRank(cur.phase);
    const betterScore = phaseRank(ev.phase) === phaseRank(cur.phase) && ev.score > cur.score;
    if (betterPhase || betterScore) byBar.set(ev.barIdx, ev);
  }
  const ranked = [...byBar.values()].sort((a, b) => b.score - a.score);

  const picked: SwingAnchorVolumeEvent[] = [];
  for (const ev of ranked) {
    if (picked.length >= maxEvents) break;
    const gap =
      ev.phase === 'watch' || ev.phase === 'setup'
        ? Math.max(2, minGap - 2)
        : ev.early
          ? Math.max(2, minGap - 1)
          : minGap;
    const tooClose = picked.some((p) => Math.abs(p.barIdx - ev.barIdx) < gap);
    if (tooClose) continue;
    picked.push(ev);
  }

  return picked.sort((a, b) => a.barIdx - b.barIdx);
}

export function swingAnchorVolumeMarkers(
  events: SwingAnchorVolumeEvent[]
): VolumePanelMarker[] {
  return events.map((ev) => {
    const watchish = ev.phase === 'watch' || ev.phase === 'setup';
    return {
      time: ev.time as UTCTimestamp,
      position: 'belowBar' as const,
      shape: 'square' as const,
      color:
        ev.tier === 'big-long'
          ? watchish
            ? 'rgba(52,211,153,0.72)'
            : 'rgba(52,211,153,0.98)'
          : watchish
            ? 'rgba(248,113,113,0.72)'
            : 'rgba(248,113,113,0.98)',
      text: ev.markerKo,
      size: ev.whaleBoost ? 3 : watchish ? 1 : 2,
    };
  });
}

/** 거래량 막대 위 마커 — 빅롱/빅숏·예비·예고·준비 */
export function isSwingAnchorVolumeMarkerText(text: string): boolean {
  const tx = String(text || '');
  return (
    tx.includes('빅롱') ||
    tx.includes('빅숏') ||
    tx.includes('예고롱') ||
    tx.includes('예고숏') ||
    tx.includes('준비롱') ||
    tx.includes('준비숏')
  );
}

function isVolumeSectionStoryText(tx: string): boolean {
  return (
    tx.includes('하락 중 증가') ||
    tx.includes('스윕') ||
    tx.includes('반등 시 증가') ||
    tx === '상승 지속' ||
    tx === '상승지속' ||
    tx === '매도우위' ||
    tx === '매수유입' ||
    tx === '스윕폭락' ||
    tx.includes('흡수') ||
    tx.includes('다이버전스') ||
    tx.includes('괴리') ||
    tx.includes('고점') ||
    tx.includes('상승 끝') ||
    tx === '고점소진' ||
    tx.includes('거래량모집') ||
    tx.includes('거래량소진') ||
    tx.includes('파동상승') ||
    tx.includes('핀바') ||
    tx.includes('슈팅')
  );
}

/** Bitget 거래량 팩 ON 시에도 스윙앵커·구간스토리·1·2차·마지막봉 마커는 항상 노출 */
export function mergeAdvVolumeMarkersForDisplay(
  advMarkers: VolumePanelMarker[],
  opts?: { bitgetVolumePackOn?: boolean; lastBarTime?: number }
): VolumePanelMarker[] {
  if (!opts?.bitgetVolumePackOn) return advMarkers;
  const lastT = opts.lastBarTime;
  const seen = new Set<string>();
  const out: VolumePanelMarker[] = [];
  const push = (m: VolumePanelMarker) => {
    const key = `${m.time}|${m.text}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(m);
  };
  for (const m of advMarkers) {
    const tx = String(m.text || '');
    if (isVolumeSectionStoryText(tx)) {
      push(m);
      continue;
    }
    if (isSwingAnchorVolumeMarkerText(tx)) {
      push(m);
      continue;
    }
    if (tx.includes('1차') || tx.includes('2차')) {
      push(m);
      continue;
    }
    if (lastT != null && Number(m.time) === lastT) push(m);
  }
  return out.sort((a, b) => Number(a.time) - Number(b.time));
}
