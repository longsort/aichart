/**
 * 수익패턴엔진 — 차트 모니터 판정 (전 코인 · 주문 아님).
 * WICK_REJECT · 롱만 · SL0.4% · H1 · 50x · 메이커 NET+5%.
 */
import type { Candle } from '@/types';
import {
  computeRequiredMoveForNet,
  defaultPpCostConfig,
  slPriceFromEntry,
  tpPriceFromEntry,
} from '@/lib/profitPattern15m/costMath';
import {
  buildPpFeatures,
  candlesToPpBars,
  patternMatch,
} from '@/lib/profitPattern15m/features';
import {
  PP_LEVERAGE,
  PP_PAPER_DIRECTION_MODE,
  PP_PAPER_FEE_MODE,
  PP_PAPER_SL_FRAC,
  ppDirectionAllowed,
  ppDirectionWhyKo,
  ppSizeScaleFromSl,
} from '@/lib/profitPattern15m/paperPolicy';
import {
  PROFIT_PATTERN_CALLSIGN,
  PROFIT_PATTERN_HOCHUNG,
  PROFIT_PATTERN_SKILL_ID,
  PROFIT_PATTERN_TF,
  ppNormalizeSymbol,
  ppSymbolAllowed,
} from '@/lib/profitPattern15m/skill';

export const PP_MONITOR_SL_FRAC = PP_PAPER_SL_FRAC;
export const PP_MONITOR_PATTERN = 'WICK_REJECT' as const;
export const PP_MONITOR_FEE_MODE = PP_PAPER_FEE_MODE;
export const PP_MONITOR_LEVERAGE = PP_LEVERAGE;

export type ProfitPatternMonitorSignal = {
  ok: boolean;
  skillId: typeof PROFIT_PATTERN_SKILL_ID;
  hochung: typeof PROFIT_PATTERN_HOCHUNG;
  callsign: typeof PROFIT_PATTERN_CALLSIGN;
  symbol: string;
  timeframe: string;
  status: 'SIGNAL' | 'WAIT' | 'OFF_TF' | 'OFF_SYMBOL' | 'NO_DATA';
  direction: 'LONG' | 'SHORT' | null;
  entry: number | null;
  sl: number | null;
  tp: number | null;
  leverage: number;
  slPct: number;
  tpMovePct: number;
  pattern: string;
  feeMode: 'maker' | 'taker';
  barTime: number | null;
  reasonKo: string;
  monitorKo: string;
  lineEntryKo: string;
  lineSlKo: string;
  lineTpKo: string;
  sizeScale: number;
};

function lineLabels(dir: 'LONG' | 'SHORT' | null) {
  if (dir === 'LONG') {
    return { lineEntryKo: '50x롱', lineSlKo: '50x롱스탑', lineTpKo: '50x롱목표' };
  }
  if (dir === 'SHORT') {
    return { lineEntryKo: '50x숏', lineSlKo: '50x숏스탑', lineTpKo: '50x숏목표' };
  }
  return { lineEntryKo: '50x', lineSlKo: '50x스탑', lineTpKo: '50x목표' };
}

export function resolveProfitPatternMonitor(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[] | null | undefined;
}): ProfitPatternMonitorSignal {
  const labels = lineLabels(null);
  const base: ProfitPatternMonitorSignal = {
    ok: false,
    skillId: PROFIT_PATTERN_SKILL_ID,
    hochung: PROFIT_PATTERN_HOCHUNG,
    callsign: PROFIT_PATTERN_CALLSIGN,
    symbol: ppNormalizeSymbol(params.symbol),
    timeframe: String(params.timeframe || ''),
    status: 'WAIT',
    direction: null,
    entry: null,
    sl: null,
    tp: null,
    leverage: PP_MONITOR_LEVERAGE,
    slPct: PP_MONITOR_SL_FRAC * 100,
    tpMovePct: 0,
    pattern: PP_MONITOR_PATTERN,
    feeMode: PP_MONITOR_FEE_MODE,
    barTime: null,
    reasonKo: '',
    monitorKo: '',
    sizeScale: 0,
    ...labels,
  };

  if (!ppSymbolAllowed(base.symbol)) {
    return {
      ...base,
      status: 'OFF_SYMBOL',
      reasonKo: `${PROFIT_PATTERN_HOCHUNG} · USDT 선물만`,
      monitorKo: '모니터 OFF · 심볼',
    };
  }
  const tf = String(params.timeframe || '').toLowerCase();
  if (tf !== PROFIT_PATTERN_TF && tf !== '15') {
    return {
      ...base,
      status: 'OFF_TF',
      reasonKo: `${PROFIT_PATTERN_HOCHUNG} · 15m 차트에서 모니터`,
      monitorKo: '모니터 OFF · TF',
    };
  }

  const bars = candlesToPpBars(params.candles || []);
  if (bars.length < 80) {
    return {
      ...base,
      status: 'NO_DATA',
      reasonKo: `${PROFIT_PATTERN_HOCHUNG} · 캔들 부족`,
      monitorKo: '데이터 대기',
    };
  }

  const i = bars.length - 1;
  const feat = buildPpFeatures(bars, i);
  const cfg = defaultPpCostConfig();
  const cost = computeRequiredMoveForNet(cfg);
  base.tpMovePct = Number(cost.requiredMovePct.toFixed(3));
  base.barTime = bars[i]!.time;
  base.entry = bars[i]!.close;

  if (!feat) {
    return {
      ...base,
      status: 'WAIT',
      reasonKo: `${PROFIT_PATTERN_HOCHUNG} · 피처 불가`,
      monitorKo: 'WAIT',
    };
  }

  const longOk = patternMatch(PP_MONITOR_PATTERN, 'LONG', feat);
  const shortOk = patternMatch(PP_MONITOR_PATTERN, 'SHORT', feat);
  let direction: 'LONG' | 'SHORT' | null = null;
  if (longOk && !shortOk) direction = 'LONG';
  else if (shortOk && !longOk) direction = 'SHORT';
  else if (longOk && shortOk) {
    direction = feat.rangePos20 <= 0.5 ? 'LONG' : 'SHORT';
  }

  if (!direction) {
    return {
      ...base,
      status: 'WAIT',
      reasonKo: `${PROFIT_PATTERN_HOCHUNG} · ${PP_MONITOR_PATTERN} 미충족 · WAIT`,
      monitorKo: 'WAIT · 패턴없음',
    };
  }

  if (!ppDirectionAllowed(direction)) {
    return {
      ...base,
      status: 'WAIT',
      direction,
      reasonKo: `${PROFIT_PATTERN_HOCHUNG} · ${ppDirectionWhyKo(direction)} · WAIT`,
      monitorKo: `WAIT · ${PP_PAPER_DIRECTION_MODE}만`,
    };
  }

  const sizeScale = ppSizeScaleFromSl(PP_MONITOR_SL_FRAC, PP_MONITOR_LEVERAGE);
  if (!(sizeScale > 0)) {
    return {
      ...base,
      status: 'WAIT',
      direction,
      reasonKo: `${PROFIT_PATTERN_HOCHUNG} · 손절ROE캡 초과 · 미진입`,
      monitorKo: 'WAIT · 비중캡',
    };
  }

  const entry = bars[i]!.close;
  const sl = slPriceFromEntry(direction, entry, PP_MONITOR_SL_FRAC);
  const tp = tpPriceFromEntry(direction, entry, cost.requiredMoveFrac);
  const L = lineLabels(direction);

  return {
    ...base,
    ok: true,
    status: 'SIGNAL',
    direction,
    entry,
    sl,
    tp,
    sizeScale,
    ...L,
    reasonKo: `${PROFIT_PATTERN_HOCHUNG} · ${L.lineEntryKo} · SL${base.slPct.toFixed(2)}% · TP≈${base.tpMovePct}% · 비중×${sizeScale} · ${base.symbol} · 모니터`,
    monitorKo: `SIGNAL ${L.lineEntryKo} · 검증용`,
  };
}
