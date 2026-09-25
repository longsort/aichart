/**
 * Doksuri-1 — Big Money Flow (고래빔 + 가격/거래량 실측만).
 */
import type { BigMoneyState } from '@/lib/doksuri1/types';
import { BIG_MONEY_KO } from '@/lib/doksuri1/types';
import type { WhaleBeamIntelPack } from '@/lib/whaleVolumeBeamIntel';

export function classifyBigMoneyFlow(params: {
  whale: WhaleBeamIntelPack | null | undefined;
  priceDeltaPct: number | null;
  rvol: number | null;
}): { state: BigMoneyState; confidence: number | null; ko: string; dnaKo: string | null; forceKo: string | null } {
  const w = params.whale;
  const live = w?.live ?? null;
  const oracle = w?.oracle ?? null;

  if (!live && !oracle) {
    return {
      state: 'NEUTRAL',
      confidence: null,
      ko: BIG_MONEY_KO.NEUTRAL,
      dnaKo: null,
      forceKo: null,
    };
  }

  let state: BigMoneyState = 'NEUTRAL';
  let confidence: number | null = null;

  if (live) {
    confidence = Math.min(95, 40 + Math.round(live.strength * 0.5) + Math.min(20, live.sampleCount));
    if (live.phase === 'accumulation' && live.beamKo === '롱빔') state = 'BUY_ABSORPTION';
    else if (live.phase === 'distribution' && live.beamKo === '숏빔') state = 'SELL_ABSORPTION';
    else if (live.beamKo === '롱빔' && live.verdictKo === '상승') {
      state = live.strength >= 70 ? 'STRONG_BUY' : 'STEADY_BUY';
    } else if (live.beamKo === '숏빔' && live.verdictKo === '하락') {
      state = live.strength >= 70 ? 'STRONG_SELL' : 'STEADY_SELL';
    } else if (live.beamKo === '롱빔') state = 'STEADY_BUY';
    else if (live.beamKo === '숏빔') state = 'STEADY_SELL';

    const d = params.priceDeltaPct;
    const rv = params.rvol;
    if (d != null && rv != null && rv >= 1.6) {
      if (d > 0.15 && live.beamKo === '롱빔') state = 'BREAKOUT_BUY';
      if (d < -0.15 && live.beamKo === '숏빔') state = 'BREAKDOWN_SELL';
      if (d > 0.35 && live.beamKo === '숏빔') state = 'CHASE_BUY';
      if (d < -0.35 && live.beamKo === '롱빔') state = 'CHASE_SELL';
    }
  }

  return {
    state,
    confidence,
    ko: BIG_MONEY_KO[state],
    dnaKo:
      oracle?.whaleDnaKo ??
      (live ? `${live.tierBtc}BTC · ${live.beamKo}${live.phase ? ` · ${live.phase}` : ''}` : null),
    forceKo:
      oracle?.forceFlowKo ??
      (live
        ? `${live.beamKo} · ${live.verdictKo}${live.strength != null ? ` · 강도 ${Math.round(live.strength)}` : ''}${
            live.sampleCount > 0 ? ` · 표본 n=${live.sampleCount}` : ''
          }`
        : null),
  };
}
