/**
 * 프로 트레이더 5색 체계
 * 🟢 수요/지지 (Long) → #22C55E
 * 🔴 공급/저항 (Short) → #EF4444
 * 🔵 중립/균형 (EQ, VWAP) → #3B82F6
 * 🟡 경고/전환 → #EAB308
 * ⚪ 보조 (텍스트/보조선) → #9CA3AF
 * 
 * Zone = 채우기 + opacity 0.15 (85% 투명)
 * 라벨 = 진한 색 100% + 작은 폰트
 */

const DEMAND = '#22C55E';      // 수요/지지 (Long)
const SUPPLY = '#EF4444';      // 공급/저항 (Short)
const NEUTRAL = '#3B82F6';     // 중립/균형
const WARNING = '#EAB308';     // 경고/전환
const AUX = '#9CA3AF';         // 보조

// Zone 채우기 (opacity 0.15)
const DEMAND_ZONE = 'rgba(34,197,94,0.15)';
const SUPPLY_ZONE = 'rgba(239,68,68,0.15)';
const NEUTRAL_ZONE = 'rgba(59,130,246,0.15)';
const WARNING_ZONE = 'rgba(234,179,8,0.15)';

export const OVERLAY_COLORS = {
  // 구조선 (중립 파랑)
  eqLine: NEUTRAL,
  equilibrium: NEUTRAL,
  eqh: NEUTRAL,
  eql: NEUTRAL,
  eqhLux: NEUTRAL,
  eqlLux: NEUTRAL,

  // BOS/CHOCH — 상승(bullish) 초록, 하락(bearish) 빨강
  bosBullish: DEMAND,
  bosBearish: SUPPLY,
  chochBullish: DEMAND,
  chochBearish: SUPPLY,

  // 스윕 (경고 노랑)
  sweep: WARNING,

  // 강한 고/저점 (공급/수요)
  strongHigh: SUPPLY,
  strongLow: DEMAND,

  // FVG (수요/공급 Zone)
  fvgBullish: DEMAND_ZONE,
  fvgBearish: SUPPLY_ZONE,

  // OB (수요/공급 Zone)
  obBullish: DEMAND_ZONE,
  obBearish: SUPPLY_ZONE,
  obEarlyBullish: 'rgba(34,197,94,0.10)',
  obEarlyBearish: 'rgba(239,68,68,0.10)',

  // Supply/Demand (공급/수요 Zone)
  supplyZone: SUPPLY_ZONE,
  demandZone: DEMAND_ZONE,
  poi: AUX,

  // BPR (중립 Zone)
  bpr: NEUTRAL_ZONE,

  // 피보나치 (경고 노랑)
  fibEq: WARNING,
  fibGp: WARNING,

  // RSI (수요/공급)
  rsiBullish: DEMAND,
  rsiBearish: SUPPLY,

  // Harmonic (수요/공급)
  harmonicBullish: DEMAND,
  harmonicBearish: SUPPLY,

  // 기타 패턴
  symTarget: WARNING,
  po3: AUX,
  falseBreakout: SUPPLY,
  killZone: WARNING,
  swingLabel: AUX,
  patternBullish: DEMAND,
  patternBearish: SUPPLY,
  patternNeutral: WARNING,

  // 타점 (수요/공급/경고)
  tapBreakout: DEMAND,
  tapTrendline: WARNING,
  tapSupportZone: DEMAND_ZONE,
  tapSupportLine: DEMAND,
  tapResistanceZone: SUPPLY_ZONE,
  tapResistanceLine: SUPPLY,
  tapEntryZone: NEUTRAL_ZONE,
  tapEntryLine: NEUTRAL,
  tapStopZone: SUPPLY_ZONE,
  tapStopLine: SUPPLY,
  tapTargetZone: WARNING_ZONE,
  tapTargetLine: WARNING,
  tapHarmonicBullish: DEMAND,
  tapHarmonicBearish: SUPPLY,
  tapHarmonicZoneBullish: DEMAND_ZONE,
  tapHarmonicZoneBearish: SUPPLY_ZONE,
  swingTapZoneLong: DEMAND_ZONE,
  swingTapZoneShort: SUPPLY_ZONE,

  // 엔진 진입/손절/목표
  entry: NEUTRAL,
  stop: SUPPLY,
  target: WARNING,
  scenarioPathA: NEUTRAL,
  scenarioPathB: WARNING,
  scenarioPathC: SUPPLY,
  keyMustBreak: DEMAND,
  keyMustHold: NEUTRAL,
  keyInvalidation: SUPPLY,
  keyDefault: WARNING,
  tailongSupport: NEUTRAL,
  tailongResistance: WARNING,
  tailongBreakBullish: DEMAND,
  tailongBreakBearish: SUPPLY,
  reactionZoneEntry: NEUTRAL_ZONE,
  reactionZoneSupport: DEMAND_ZONE,
  reactionZoneResistance: WARNING_ZONE,
  strongZoneBuy: DEMAND_ZONE,
  strongZoneSell: SUPPLY_ZONE,
  patternVisionZoneBullish: DEMAND_ZONE,
  patternVisionZoneBearish: SUPPLY_ZONE,
  patternVisionZoneNeutral: WARNING_ZONE,
  patternVisionLineBullish: DEMAND,
  patternVisionLineBearish: SUPPLY,
  patternVisionLineNeutral: WARNING,
  // Triple Top/Bottom (Underneath/Overhead Support)
  tripleUnderneath: WARNING,
  tripleOverhead: WARNING,
  tripleResistance: SUPPLY,
  tripleSupport: DEMAND,
  // Zone Trendline Engine (Support/Resistance/Retest/Breakout)
  zoneSupport: DEMAND,
  zoneResistance: SUPPLY,
  zoneUnderneath: NEUTRAL,
  zoneOverhead: WARNING,
  zoneRetest: WARNING,
  zoneBreakout: SUPPLY,
} as const;

/** 종가 마감선: TF마다 다른 색 — 라인·라벨·축 가격 동일 (`item.color`) */
export const CLOSE_TF_COLORS: Record<string, string> = {
  'close-1m': 'rgba(34,211,238,0.92)', // cyan
  'close-5m': 'rgba(52,211,153,0.92)', // emerald
  'close-15m': 'rgba(163,230,53,0.92)', // lime
  'close-1h': 'rgba(251,191,36,0.92)', // amber
  'close-4h': 'rgba(251,146,60,0.92)', // orange
  'close-daily': 'rgba(96,165,250,0.92)', // blue
  'close-weekly': 'rgba(192,132,252,0.92)', // violet
  'close-monthly': 'rgba(244,114,182,0.92)', // pink
};

/** 종가 보드 row.tf → CLOSE_TF_COLORS 키 (패널·스트립과 차트 색 맞출 때) */
export const CLOSE_SETTLEMENT_TF_TO_LINE_ID: Record<string, keyof typeof CLOSE_TF_COLORS> = {
  '1m': 'close-1m',
  '5m': 'close-5m',
  '15m': 'close-15m',
  '1h': 'close-1h',
  '4h': 'close-4h',
  '1d': 'close-daily',
  '1w': 'close-weekly',
  '1M': 'close-monthly',
};

export function getCloseTfLineColor(tf: string): string {
  const id = CLOSE_SETTLEMENT_TF_TO_LINE_ID[tf];
  return id ? CLOSE_TF_COLORS[id] : CLOSE_TF_COLORS['close-1m'];
}

/** 패널 라벨용: 종가선 rgba → 불투명 rgb */
export function closeTfLabelSolid(tf: string): string {
  const c = getCloseTfLineColor(tf);
  const m = c.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\)/i);
  if (m) return `rgb(${m[1]},${m[2]},${m[3]})`;
  return c;
}

/** 캔들·볼륨 시리즈 — 수요/공급 색 */
export const CHART_CANDLE = {
  up: DEMAND,
  down: SUPPLY,
  volumeUp: 'rgba(34,197,94,0.32)',
  volumeDown: 'rgba(239,68,68,0.28)',
} as const;
