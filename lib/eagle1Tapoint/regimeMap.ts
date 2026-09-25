/**
 * §6 MARKET REGIME — eagle1 structure + ATR slope 보조.
 */
import { computeRegime, type RegimeResult } from '@/lib/regimeEngine';
import type { Eagle1Regime } from '@/lib/eagle1/structureEngine';
import type { Candle } from '@/types';

export type TapRegimePack = {
  primary: Eagle1Regime | string;
  primaryKo: string;
  secondary: RegimeResult['regime'] | null;
  secondaryKo: string | null;
  unifiedKo: string;
  chaos: boolean;
  highVol: boolean;
  noteKo: string;
};

const EAGLE_KO: Record<string, string> = {
  STRONG_BULL: '강한상승추세',
  BULL: '상승추세',
  RANGE: '횡보',
  BEAR: '하락추세',
  STRONG_BEAR: '강한하락추세',
  ACCUMULATION: '압축·매집',
  DISTRIBUTION: '분산',
  VOLATILITY_EXPANSION: '고변동',
  UNKNOWN: '불명',
};

const SEC_KO: Record<string, string> = {
  trend_up: '상승추세',
  trend_down: '하락추세',
  range: '횡보',
  squeeze: '압축',
  high_volatility: '고변동',
  low_volatility: '저변동',
};

export function mapEagleRegimeKo(r: string | undefined): string {
  return EAGLE_KO[String(r || 'UNKNOWN')] || String(r || '불명');
}

export function buildTapRegimePack(params: {
  eagleRegime?: string | null;
  candles?: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }> | null;
}): TapRegimePack {
  const primary = String(params.eagleRegime || 'UNKNOWN');
  const primaryKo = mapEagleRegimeKo(primary);
  let secondary: RegimeResult['regime'] | null = null;
  let secondaryKo: string | null = null;
  let highVol = primary === 'VOLATILITY_EXPANSION';
  let chaos = false;

  if (params.candles && params.candles.length >= 40) {
    try {
      const asCandle = params.candles.map((c) => ({
        time: Number(c.time),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume) || 0,
      })) as Candle[];
      const sec = computeRegime(asCandle);
      secondary = sec.regime;
      secondaryKo = SEC_KO[sec.regime] || sec.regime;
      if (sec.volatilityState === 'high' || sec.regime === 'high_volatility') highVol = true;
      if (
        (primary.includes('BULL') && sec.regime === 'trend_down') ||
        (primary.includes('BEAR') && sec.regime === 'trend_up')
      ) {
        chaos = true;
      }
    } catch {
      /* ignore */
    }
  }

  const unifiedKo = chaos
    ? `혼조·CHAOS · ${primaryKo}`
    : highVol
      ? `고변동 · ${primaryKo}`
      : secondaryKo && secondaryKo !== primaryKo
        ? `${primaryKo} / ${secondaryKo}`
        : primaryKo;

  return {
    primary,
    primaryKo,
    secondary,
    secondaryKo,
    unifiedKo,
    chaos,
    highVol,
    noteKo: chaos
      ? '상충 레짐 · WAIT 우선'
      : highVol
        ? '고변동 · 시장가 추격 제한'
        : `${primaryKo} 기준`,
  };
}
