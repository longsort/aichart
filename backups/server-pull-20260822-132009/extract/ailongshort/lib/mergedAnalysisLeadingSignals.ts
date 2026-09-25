/**
 * 통합·분석 — 선반영(developing) 롱/숏 캔들 신호 단일 엔진.
 * zone·ST·종가·RSI·Vol 5게이트 — 조건부 참고, 확정 수익·투자 권유 아님.
 */
import type { AnalyzeResponse, Candle } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import type { AtlasPulseMarker } from '@/lib/monthDeskAtlasPulseDesk';
import type { MonthDeskStrikeDeskBundle } from '@/lib/monthDeskStrikeDesk';
import type { MergedCriticalZone } from '@/lib/mergedAnalysisCriticalZones';
import {
  detectMergedDirectionConfirms,
  type MergedDirectionConfirmGates,
} from '@/lib/mergedAnalysisDirectionConfirm';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';

export type MergedLeadingCandleTier = 'leading' | 'strong' | 'confirmed';

export type MergedLeadingCandleSignal = {
  time: number;
  direction: 'LONG' | 'SHORT';
  tier: MergedLeadingCandleTier;
  gatesPass: number;
  gates: MergedDirectionConfirmGates;
  isLastBar: boolean;
  leading: boolean;
};

function confirmToTier(tier: 'confirmed' | 'strong' | 'building'): MergedLeadingCandleTier | null {
  if (tier === 'confirmed') return 'confirmed';
  if (tier === 'strong') return 'strong';
  if (tier === 'building') return 'leading';
  return null;
}

/** 5게이트 confirm + 마지막 봉 building(선행) — 통합·분석 L/S 단일 소스 */
export function scanMergedLeadingCandleSignals(params: {
  candles: Candle[];
  timeframe: string;
  keyZones: MergedKeyZone[];
  criticalZones: MergedCriticalZone[];
  bundle?: MonthDeskStrikeDeskBundle | null;
  analysis?: AnalyzeResponse | null;
  /** detectMergedDirectionConfirms 결과 재사용 */
  confirms?: ReturnType<typeof detectMergedDirectionConfirms>;
}): MergedLeadingCandleSignal[] {
  const confirms =
    params.confirms ??
    detectMergedDirectionConfirms({
      candles: params.candles,
      timeframe: params.timeframe,
      keyZones: params.keyZones,
      bundle: params.bundle,
      analysis: params.analysis,
      maxEvents: 48,
    });

  const lastT = Number(params.candles[params.candles.length - 1]?.time);
  const out: MergedLeadingCandleSignal[] = [];

  for (const c of confirms) {
    const mapped = confirmToTier(c.tier);
    if (!mapped) continue;
    if (mapped === 'leading' && c.time !== lastT) continue;
    out.push({
      time: c.time,
      direction: c.direction,
      tier: mapped,
      gatesPass: c.gatesPassCount,
      gates: c.gates,
      isLastBar: c.time === lastT,
      leading: mapped === 'leading' || c.tier === 'building',
    });
  }

  const deduped = new Map<number, MergedLeadingCandleSignal>();
  for (const s of out) {
    const prev = deduped.get(s.time);
    const rank = (t: MergedLeadingCandleTier) => (t === 'confirmed' ? 3 : t === 'strong' ? 2 : 1);
    if (!prev || rank(s.tier) > rank(prev.tier) || s.gatesPass > prev.gatesPass) {
      deduped.set(s.time, s);
    }
  }
  return [...deduped.values()].sort((a, b) => a.time - b.time);
}

export function buildMergedLeadingCandleMarkers(
  signals: MergedLeadingCandleSignal[]
): AtlasPulseMarker[] {
  const out: AtlasPulseMarker[] = [];
  for (const s of signals) {
    const t = s.time as UTCTimestamp;
    const long = s.direction === 'LONG';
    let text: string;
    let color: string;
    let size: 1 | 2 | 3 = 1;
    let shape: 'square' | 'circle' = long ? 'square' : 'circle';

    if (s.tier === 'confirmed') {
      text = long ? '🛒' : '⚡';
      color = long ? '#22c55e' : '#ef4444';
      size = 2;
    } else if (s.tier === 'strong') {
      text = s.gates.stHold
        ? long
          ? '롱시나리오'
          : '숏시나리오'
        : long
          ? 'L★'
          : 'S★';
      color = long ? '#3b82f6' : '#eab308';
      size = 2;
    } else {
      text = long ? '▲' : '▼';
      color = long ? '#22d3ee' : '#fb7185';
      size = s.isLastBar ? 2 : 1;
      shape = long ? 'square' : 'circle';
    }

    out.push({
      time: t,
      position: long ? 'belowBar' : 'aboveBar',
      shape,
      color,
      text,
      size,
      id: `merged-leading-candle-${s.direction.toLowerCase()}-${t}-${s.tier}`,
    });
  }
  return out;
}

/** 선반영 통합 — 중복 B/S·롱+/숏+ 제거 */
export function prioritizeMergedLeadingMarkers(markers: AtlasPulseMarker[]): AtlasPulseMarker[] {
  const leadingTimes = new Set(
    markers
      .filter((m) => String(m.id || '').startsWith('merged-leading-candle-'))
      .map((m) => Number(m.time))
  );
  if (!leadingTimes.size) return markers;

  return markers.filter((m) => {
    const t = Number(m.time);
    if (!leadingTimes.has(t)) return true;
    const id = String(m.id || '');
    const tx = String(m.text || '');
    if (id.startsWith('merged-zte-') || id.startsWith('merged-ares-long-') || id.startsWith('merged-ares-short-')) {
      return !(tx === 'B' || tx === 'S' || tx === '🛒' || tx === '⚡');
    }
    if (id.includes('confirm') && (tx === '롱+' || tx === '숏+' || tx === '롱확' || tx === '숏확')) return false;
    return true;
  });
}
