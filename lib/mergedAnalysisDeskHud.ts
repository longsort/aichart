/**
 * 통합·분석 데스크 HUD — 5게이트 · MTF zone 정렬 · VRVP 합류.
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import type { AnalyzeResponse, Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { MonthDeskBandFusionHighlight } from '@/lib/institutionalSuperBand';
import type { MergedDirectionConfirm, MergedDirectionConfirmGates } from '@/lib/mergedAnalysisDirectionConfirm';
import type { MergedCriticalZone } from '@/lib/mergedAnalysisCriticalZones';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import type { MergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';
import type { MergedVrvpProfile } from '@/lib/mergedAnalysisTradeLayer';
import { mergedWorkCandles } from '@/lib/mergedAnalysisOverlayTimes';
import { MERGED_DESK_SHARED_ANALYZE_TF } from '@/lib/mergedDesk4hReferenceAnalysis';

export type MergedDeskGateHud = {
  gatesPassCount: number;
  gates: MergedDirectionConfirmGates;
  gateLabels: Array<{ key: keyof MergedDirectionConfirmGates; labelKo: string; pass: boolean }>;
  summaryKo: string;
};

const GATE_LABELS: Record<keyof MergedDirectionConfirmGates, string> = {
  structure: 'ST',
  stHold: '홀드',
  zone: 'Zone',
  close: '종가',
  momentum: 'RSI',
  volume: 'Vol',
};

function emptyGates(): MergedDirectionConfirmGates {
  return {
    structure: false,
    zone: false,
    close: false,
    momentum: false,
    volume: false,
    stHold: false,
  };
}

/** 마지막 봉 기준 게이트 HUD (ST홀드 포함) */
export function buildMergedDeskGateHud(
  confirms: MergedDirectionConfirm[],
  analysis?: AnalyzeResponse | null
): MergedDeskGateHud {
  const lastT = confirms[0]?.time;
  const lastConfirm =
    confirms.find((c) => c.tier === 'confirmed') ??
    confirms.find((c) => c.tier === 'strong') ??
    confirms[0];

  const cs = analysis?.confirmedSignal;
  let gates = lastConfirm?.gates ?? emptyGates();
  let gatesPassCount = lastConfirm?.gatesPassCount ?? 0;

  if (cs && (cs.direction === 'LONG' || cs.direction === 'SHORT')) {
    gates = {
      structure: Boolean(cs.structure),
      zone: Boolean(cs.fvgZone ?? cs.supportResistance),
      close: Boolean(cs.close),
      momentum: Boolean(cs.rsi),
      volume: true,
      stHold: Boolean(lastConfirm?.gates.stHold),
    };
    gatesPassCount = cs.gatesPassCount ?? Object.values(gates).filter(Boolean).length;
  }

  const gateLabels = (Object.keys(GATE_LABELS) as Array<keyof MergedDirectionConfirmGates>).map((key) => ({
    key,
    labelKo: GATE_LABELS[key],
    pass: Boolean(gates[key]),
  }));

  const summaryKo = `${gatesPassCount}/6 · ${gateLabels
    .filter((g) => g.pass)
    .map((g) => g.labelKo)
    .join('·') || '대기'}`;

  void lastT;
  return { gatesPassCount, gates, gateLabels, summaryKo };
}

/** 차트 TF 핵심 zone vs HTF critical(S) 겹침 */
export function buildMergedMtfZoneAlignBadge(
  timeframe: string,
  keyZones: MergedKeyZone[],
  criticalZones: MergedCriticalZone[],
  price: number | null
): { labelKo: string; aligned: boolean } {
  const tf = normalizeChartTimeframe(timeframe);
  if (price == null || !keyZones.length) {
    return { labelKo: `MTF ${tf} zone 대기`, aligned: false };
  }

  const nearestKey = keyZones.reduce((best, z) =>
    Math.abs(z.price - price) < Math.abs(best.price - price) ? z : best
  );
  const inKey = price >= nearestKey.bot && price <= nearestKey.top;

  const htfS = criticalZones.filter((z) => z.tier === 'S' && z.htfLabel);
  let overlap: MergedCriticalZone | null = null;
  for (const h of htfS) {
    const overlapPx =
      Math.min(nearestKey.top, h.top) - Math.max(nearestKey.bot, h.bot);
    if (overlapPx > 0) {
      overlap = h;
      break;
    }
  }

  if (overlap && inKey) {
    return {
      labelKo: `MTF ✓ ${tf}↔${overlap.htfLabel ?? 'HTF'} S-tier`,
      aligned: true,
    };
  }
  if (inKey && nearestKey.kind === 'demand') {
    return { labelKo: `MTF · ${tf} 지지 zone`, aligned: false };
  }
  if (inKey && nearestKey.kind === 'supply') {
    return { labelKo: `MTF · ${tf} 저항 zone`, aligned: false };
  }
  return { labelKo: `MTF · ${tf} zone 근접`, aligned: false };
}

/** VRVP POC/VA 와 핵심 zone 겹침 */
export function buildMergedVrvpZoneConfluenceKo(
  vrvp: MergedVrvpProfile | null,
  keyZones: MergedKeyZone[],
  criticalZones: MergedCriticalZone[],
  price: number | null
): string {
  if (!vrvp?.poc) return 'VRVP — 프로파일 대기';
  const zones = [...keyZones.slice(0, 5), ...criticalZones.filter((z) => z.isPrimary).slice(0, 2)];
  const poc = vrvp.poc;
  const vaLo = vrvp.vaLow ?? poc;
  const vaHi = vrvp.vaHigh ?? poc;
  const band = Math.abs(vaHi - vaLo) * 0.05 + Math.abs(poc) * 0.002;

  let pocHit: MergedKeyZone | MergedCriticalZone | null = null;
  for (const z of zones) {
    const mid = 'price' in z ? z.price : poc;
    const top = z.top;
    const bot = z.bot;
    if (Math.abs(poc - mid) <= band || (poc >= bot && poc <= top)) {
      pocHit = z;
      break;
    }
  }

  const priceInVa = price != null && price >= vaLo && price <= vaHi;
  const pocPart = pocHit
    ? `POC↔${'labelKo' in pocHit ? pocHit.labelKo : 'zone'}`
    : `POC ${poc.toFixed(0)}`;
  const vaPart = priceInVa ? ' · VA내' : '';
  const state = vrvp.pocStateKo ? ` · ${vrvp.pocStateKo}` : '';
  const scen = vrvp.scenarioKo ? ` · ${vrvp.scenarioKo}` : vrvp.pocBiasKo ? ` · ${vrvp.pocBiasKo}` : '';
  return `VRVP ${pocPart}${vaPart}${state}${scen}`;
}

function smcPhaseToFusionPhase(phase: string | undefined): string {
  if (phase === 'confirmed') return 'confirmed';
  if (phase === 'settling') return 'settling';
  if (phase === 'failed') return 'failed';
  if (phase === 'breakout' || phase === 'pending') return 'breakout';
  return 'pending';
}

/** SMC·구조 마크 → fusion structureByTime (타임라인·밴드 융합) */
export function buildMergedFusionStructureByTime(
  candles: Candle[] | undefined,
  smcLeading: MergedSmcLeadingContext | null | undefined,
  analysis?: AnalyzeResponse | null
): Map<number, MonthDeskBandFusionHighlight> {
  const map = new Map<number, MonthDeskBandFusionHighlight>();
  if (!candles?.length) return map;

  const work = mergedWorkCandles(candles, analysis?.timeframe ?? MERGED_DESK_SHARED_ANALYZE_TF);
  for (const mark of smcLeading?.marks ?? []) {
    if (mark.tag !== 'BOS' && mark.tag !== 'CHOCH') continue;
    const t = Number(work[mark.index]?.time ?? mark.time);
    if (!Number.isFinite(t)) continue;
    map.set(t, {
      bias: mark.bias,
      phase: smcPhaseToFusionPhase(mark.phase),
      tag: mark.tag,
    });
  }

  const st = analysis?.structureState;
  const lastT = Number(work[work.length - 1]?.time);
  if (Number.isFinite(lastT) && st) {
    const bias =
      st.state === 'trend_up' ? 'bullish' : st.state === 'trend_down' ? 'bearish' : undefined;
    if (bias) {
      const phase =
        (st.bosUp ?? 0) > (st.bosDown ?? 0) || (st.chochUp ?? 0) > 0
          ? 'breakout'
          : 'confirmed';
      map.set(lastT, { bias, phase, tag: 'STRUCT' });
    }
  }

  return map;
}
