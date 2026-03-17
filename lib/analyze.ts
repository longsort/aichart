import { AnalyzeResponse, Candle, OverlayItem, Verdict } from '@/types';
import { visibleLimit } from './constants';
import { matchTopReferences } from './referenceMatcherAdvanced';
import { normalizeCurrentPattern } from './recall/patternNormalizer';
import { recallTopPatterns, buildRecallSummary } from './recall/patternRecallEngine';
import { detectPatterns } from './patterns';
import { computeFuturePaths } from './prediction/futurePathEngine';
import { computeMTF } from './multiTimeframe';
import { computeTradeProbability } from './probabilityEngine';
import { analyzeSmartMoney } from './smartMoney';
import { rsiStochSignals } from './indicators';
import { fibLevels } from './fibonacci';
import { detectButterfly, detectAllHarmonics } from './harmonic';
import { detectBPR } from './bpr';
import { detectFalseBreakout, detectPO3Phase, isKillZone } from './smc';
import { rsi, ema, stochRsi, macd, bollingerBands, atrSeries } from './indicators';
import { runPatternVision, getDominantPattern, getPatternVisionSummary } from './patternVision/patternVisionEngine';
import { visionResultsToOverlays } from './patternVision/patternLabeler';
import { computeRegime } from './regimeEngine';
import { computeSignalScore } from './signalScoreEngine';
import { computeTradePlan } from './tradePlanner';
import { computeConfidence } from './confidenceEngine';
import { computeLevels } from './levelEngine';
import { computeScenarios } from './scenarioEngine';
import { computeTailong } from './tailongEngine';

function pivotHigh(candles: Candle[], index: number, left = 2, right = 2) {
  if (index - left < 0 || index + right >= candles.length) return false;
  const v = candles[index].high;
  for (let i = index - left; i <= index + right; i++) {
    if (i !== index && candles[i].high >= v) return false;
  }
  return true;
}

function pivotLow(candles: Candle[], index: number, left = 2, right = 2) {
  if (index - left < 0 || index + right >= candles.length) return false;
  const v = candles[index].low;
  for (let i = index - left; i <= index + right; i++) {
    if (i !== index && candles[i].low <= v) return false;
  }
  return true;
}

function atr(candles: Candle[], period = 50) {
  if (candles.length < period + 1) return (Math.max(...candles.map(c => c.high)) - Math.min(...candles.map(c => c.low))) / period;
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    sum += tr;
  }
  return sum / period;
}


function toRatio(price: number, min: number, max: number) {
  const range = Math.max(1e-9, max - min);
  return (max - price) / range;
}

export function analyzeCandles(symbol: string, timeframe: string, candles: Candle[], options?: { htfTrend?: 'bullish' | 'bearish' | 'range' }): AnalyzeResponse {
  const visible = candles.slice(-visibleLimit(timeframe));
  const min = Math.min(...visible.map(c => c.low));
  const max = Math.max(...visible.map(c => c.high));
  const range = Math.max(1e-9, max - min);
  const swings: Array<{ type: 'high' | 'low'; index: number; price: number }> = [];

  for (let i = 2; i < visible.length - 2; i++) {
    if (pivotHigh(visible, i)) swings.push({ type: 'high', index: i, price: visible[i].high });
    if (pivotLow(visible, i)) swings.push({ type: 'low', index: i, price: visible[i].low });
  }
  swings.sort((a, b) => a.index - b.index);

  const bos: Array<{ bias: 'bullish' | 'bearish'; index: number; price: number }> = [];
  const choch: Array<{ bias: 'bullish' | 'bearish'; index: number; price: number }> = [];
  let trend: 'bullish' | 'bearish' | 'range' = 'range';

  for (let i = 2; i < swings.length; i++) {
    const a = swings[i - 2];
    const c = swings[i];
    if (c.type === 'high' && a.type === 'high' && c.price > a.price) {
      bos.push({ bias: 'bullish', index: c.index, price: c.price });
      if (trend === 'bearish') choch.push({ bias: 'bullish', index: c.index, price: c.price });
      trend = 'bullish';
    }
    if (c.type === 'low' && a.type === 'low' && c.price < a.price) {
      bos.push({ bias: 'bearish', index: c.index, price: c.price });
      if (trend === 'bullish') choch.push({ bias: 'bearish', index: c.index, price: c.price });
      trend = 'bearish';
    }
  }

  const eqh: Array<{ a: number; b: number; price: number }> = [];
  const eql: Array<{ a: number; b: number; price: number }> = [];
  const sweeps: Array<{ side: 'buy' | 'sell'; index: number; price: number }> = [];
  const highs = swings.filter(s => s.type === 'high');
  const lows = swings.filter(s => s.type === 'low');
  const tol = 0.0025;

  for (let i = 1; i < highs.length; i++) {
    const prev = highs[i - 1], cur = highs[i];
    if (Math.abs(cur.price - prev.price) / prev.price <= tol) {
      eqh.push({ a: prev.index, b: cur.index, price: (prev.price + cur.price) / 2 });
      for (let j = cur.index + 1; j <= Math.min(cur.index + 8, visible.length - 1); j++) {
        if (visible[j].high > cur.price && visible[j].close < cur.price) {
          sweeps.push({ side: 'buy', index: j, price: visible[j].high });
          break;
        }
      }
    }
  }

  for (let i = 1; i < lows.length; i++) {
    const prev = lows[i - 1], cur = lows[i];
    if (Math.abs(cur.price - prev.price) / prev.price <= tol) {
      eql.push({ a: prev.index, b: cur.index, price: (prev.price + cur.price) / 2 });
      for (let j = cur.index + 1; j <= Math.min(cur.index + 8, visible.length - 1); j++) {
        if (visible[j].low < cur.price && visible[j].close > cur.price) {
          sweeps.push({ side: 'sell', index: j, price: visible[j].low });
          break;
        }
      }
    }
  }

  const fvg: Array<{ bias: 'bullish' | 'bearish'; index: number; low: number; high: number; valid: boolean }> = [];
  for (let i = 2; i < visible.length; i++) {
    const c1 = visible[i - 2], c3 = visible[i];
    if (c1.high < c3.low) {
      let valid = true;
      for (let j = i + 1; j < Math.min(i + 80, visible.length); j++) {
        if (visible[j].low <= c1.high) { valid = false; break; }
      }
      fvg.push({ bias: 'bullish', index: i, low: c1.high, high: c3.low, valid });
    }
    if (c1.low > c3.high) {
      let valid = true;
      for (let j = i + 1; j < Math.min(i + 80, visible.length); j++) {
        if (visible[j].high >= c1.low) { valid = false; break; }
      }
      fvg.push({ bias: 'bearish', index: i, low: c3.high, high: c1.low, valid });
    }
  }

  const obs: Array<{ bias: 'bullish' | 'bearish'; index: number; low: number; high: number }> = [];
  for (const x of bos.slice(-10)) {
    const start = Math.max(1, x.index - 6);
    const end = x.index - 1;
    if (end <= start) continue;
    if (x.bias === 'bullish') {
      for (let i = end; i >= start; i--) {
        if (visible[i].close < visible[i].open) {
          obs.push({ bias: 'bullish', index: i, low: Math.min(visible[i].open, visible[i].close), high: visible[i].high });
          break;
        }
      }
    } else {
      for (let i = end; i >= start; i--) {
        if (visible[i].close > visible[i].open) {
          obs.push({ bias: 'bearish', index: i, low: visible[i].low, high: Math.max(visible[i].open, visible[i].close) });
          break;
        }
      }
    }
  }

  const rangeLow = Math.min(...visible.map(c => c.low));
  const rangeHigh = Math.max(...visible.map(c => c.high));
  const eq = (rangeLow + rangeHigh) / 2;
  const atrVal = atr(visible, 50);
  const atr200 = atr(visible, Math.min(200, visible.length - 1));
  const patterns = detectPatterns(visible, swings);

  // FluidTrades: Swing 10 for Supply/Demand
  const swingLen = 10;
  const fluidSwings: Array<{ type: 'high' | 'low'; index: number; price: number }> = [];
  for (let i = swingLen; i < visible.length - swingLen; i++) {
    if (pivotHigh(visible, i, swingLen, swingLen)) fluidSwings.push({ type: 'high', index: i, price: visible[i].high });
    if (pivotLow(visible, i, swingLen, swingLen)) fluidSwings.push({ type: 'low', index: i, price: visible[i].low });
  }
  fluidSwings.sort((a, b) => a.index - b.index);

  const supplyZones: Array<{ left: number; right: number; top: number; bottom: number; poi: number }> = [];
  const demandZones: Array<{ left: number; right: number; top: number; bottom: number; poi: number }> = [];
  const boxWidth = 2.5;
  const atrBuffer = atrVal * (boxWidth / 10);
  const overlapThreshold = atrVal * 2;

  function checkOverlap(poi: number, zones: Array<{ poi: number }>) {
    for (const z of zones) {
      if (poi >= z.poi - overlapThreshold && poi <= z.poi + overlapThreshold) return false;
    }
    return true;
  }

  for (const s of fluidSwings.slice(-15)) {
    if (s.type === 'high' && checkOverlap(s.price - atrBuffer / 2, supplyZones)) {
      supplyZones.push({
        left: s.index,
        right: visible.length - 1,
        top: s.price,
        bottom: s.price - atrBuffer,
        poi: (s.price + s.price - atrBuffer) / 2
      });
      if (supplyZones.length > 20) supplyZones.shift();
    } else if (s.type === 'low' && checkOverlap(s.price + atrBuffer / 2, demandZones)) {
      demandZones.push({
        left: s.index,
        right: visible.length - 1,
        top: s.price + atrBuffer,
        bottom: s.price,
        poi: (s.price + s.price + atrBuffer) / 2
      });
      if (demandZones.length > 20) demandZones.shift();
    }
  }

  // LuxAlgo: Trailing extremes (Strong/Weak High/Low)
  let trailTop = rangeHigh;
  let trailBottom = rangeLow;
  let trailTopIdx = 0;
  let trailBottomIdx = 0;
  for (let i = Math.max(0, visible.length - 150); i < visible.length; i++) {
    if (visible[i].high >= trailTop) {
      trailTop = visible[i].high;
      trailTopIdx = i;
    }
    if (visible[i].low <= trailBottom) {
      trailBottom = visible[i].low;
      trailBottomIdx = i;
    }
  }

  // LuxAlgo: EQH/EQL with 0.1*ATR threshold
  const eqhLux: Array<{ a: number; b: number; price: number }> = [];
  const eqlLux: Array<{ a: number; b: number; price: number }> = [];
  const tolLux = 0.1 * atr200;
  for (let i = 1; i < highs.length; i++) {
    const prev = highs[i - 1], cur = highs[i];
    if (Math.abs(cur.price - prev.price) <= tolLux) {
      eqhLux.push({ a: prev.index, b: cur.index, price: (prev.price + cur.price) / 2 });
    }
  }
  for (let i = 1; i < lows.length; i++) {
    const prev = lows[i - 1], cur = lows[i];
    if (Math.abs(cur.price - prev.price) <= tolLux) {
      eqlLux.push({ a: prev.index, b: cur.index, price: (prev.price + cur.price) / 2 });
    }
  }

  // HH/LH/HL/LL from last swing points
  const lastHighs = swings.filter(s => s.type === 'high').slice(-5);
  const lastLows = swings.filter(s => s.type === 'low').slice(-5);

  const overlays: OverlayItem[] = [];

  overlays.push({ id: 'eq-line', kind: 'supportLine', label: '균형', x1: 0.04, y1: toRatio(eq, min, max), x2: 0.96, y2: toRatio(eq, min, max), confidence: 65, color: '#ffd666' });

  for (const x of bos.slice(-3)) overlays.push({ id: `bos-${x.index}`, kind: 'bos', label: x.bias === 'bullish' ? 'BOS↑' : 'BOS↓', x1: x.index / (visible.length - 1), y1: toRatio(x.price, min, max), x2: Math.min(0.98, (x.index + 6) / (visible.length - 1)), y2: toRatio(x.price, min, max), confidence: 80, color: x.bias === 'bullish' ? '#71f7bd' : '#ff9b9b', category: 'structure' });
  for (const x of choch.slice(-2)) overlays.push({ id: `choch-${x.index}`, kind: 'choch', label: x.bias === 'bullish' ? 'CHOCH↑' : 'CHOCH↓', x1: x.index / (visible.length - 1), y1: toRatio(x.price, min, max), x2: Math.min(0.98, (x.index + 6) / (visible.length - 1)), y2: toRatio(x.price, min, max), confidence: 78, color: '#ffd666', category: 'structure' });
  for (const x of eqh.slice(-2)) overlays.push({ id: `eqh-${x.a}`, kind: 'eqh', label: 'EQH', x1: x.a / (visible.length - 1), y1: toRatio(x.price, min, max), x2: x.b / (visible.length - 1), y2: toRatio(x.price, min, max), confidence: 74, color: '#7fb8ff' });
  for (const x of eql.slice(-2)) overlays.push({ id: `eql-${x.a}`, kind: 'eql', label: 'EQL', x1: x.a / (visible.length - 1), y1: toRatio(x.price, min, max), x2: x.b / (visible.length - 1), y2: toRatio(x.price, min, max), confidence: 74, color: '#7fb8ff' });
  for (const x of sweeps.slice(-2)) overlays.push({ id: `sweep-${x.index}`, kind: 'liquiditySweep', label: x.side === 'buy' ? '유동성↑' : '유동성↓', x1: x.index / (visible.length - 1), y1: toRatio(x.price, min, max), x2: Math.min(0.98, (x.index + 3) / (visible.length - 1)), y2: toRatio(x.price, min, max), confidence: 76, color: '#ffb86b' });

  const validFvg = fvg.filter(x => x.valid);
  for (const x of validFvg.slice(-5)) overlays.push({ id: `fvg-${x.index}`, kind: 'fvg', label: x.bias === 'bullish' ? '상승 FVG' : '하락 FVG', x1: x.index / (visible.length - 1), y1: toRatio(x.high, min, max), x2: Math.min(0.98, (x.index + 8) / (visible.length - 1)), y2: toRatio(x.low, min, max), confidence: 72, color: x.bias === 'bullish' ? 'rgba(113,247,189,0.18)' : 'rgba(255,214,102,0.18)' });

  const hasStructureBreak = (idx: number, bias: 'bullish' | 'bearish') =>
    bos.some(b => b.bias === bias && Math.abs(b.index - idx) <= 8) || choch.some(c => c.bias === bias && Math.abs(c.index - idx) <= 8);
  const hasFvgSameDirection = (idx: number, bias: 'bullish' | 'bearish') =>
    validFvg.some(f => f.bias === bias && f.index >= idx - 2 && f.index <= idx + 15);
  const validObs = obs.filter(o => hasStructureBreak(o.index, o.bias) && hasFvgSameDirection(o.index, o.bias));
  for (const x of validObs.slice(-4)) overlays.push({ id: `ob-${x.index}`, kind: 'ob', label: x.bias === 'bullish' ? '상승 OB' : '하락 OB', x1: x.index / (visible.length - 1), y1: toRatio(x.high, min, max), x2: Math.min(0.98, (x.index + 10) / (visible.length - 1)), y2: toRatio(x.low, min, max), confidence: 78, color: x.bias === 'bullish' ? 'rgba(127,184,255,0.22)' : 'rgba(255,123,123,0.22)' });

  // 선포착 OB: BOS/FVG 확인 전, 반대 봉이 나온 직후부터 후보로 표시 (OB 만든 봉을 먼저 포착)
  const confirmedIdxSet = new Set(validObs.map(o => o.index));
  const earlyObs: Array<{ bias: 'bullish' | 'bearish'; index: number; low: number; high: number }> = [];
  const lookBack = Math.min(20, visible.length - 2);
  for (let i = visible.length - 1; i >= Math.max(0, visible.length - lookBack); i--) {
    if (confirmedIdxSet.has(i)) continue;
    const c = visible[i];
    const next = visible[i + 1];
    if (!next) continue;
    const bodyPct = Math.abs(c.close - c.open) / (c.high - c.low || 1e-9);
    if (bodyPct < 0.3) continue; // 몸통이 너무 작으면 스킵
    if (c.close < c.open && next.close > next.open) {
      earlyObs.push({ bias: 'bullish', index: i, low: Math.min(c.open, c.close), high: c.high });
    } else if (c.close > c.open && next.close < next.open) {
      earlyObs.push({ bias: 'bearish', index: i, low: c.low, high: Math.max(c.open, c.close) });
    }
  }
  const earlyObsDedup = earlyObs.slice(0, 4);
  for (const x of earlyObsDedup) {
    overlays.push({ id: `ob-early-${x.index}`, kind: 'ob', label: x.bias === 'bullish' ? 'OB 선포착 ↑' : 'OB 선포착 ↓', x1: x.index / (visible.length - 1), y1: toRatio(x.high, min, max), x2: Math.min(0.98, (x.index + 10) / (visible.length - 1)), y2: toRatio(x.low, min, max), confidence: 65, color: x.bias === 'bullish' ? 'rgba(127,184,255,0.14)' : 'rgba(255,123,123,0.14)', category: 'zones' });
  }

  // BPR (Balance Price Range)
  const bprZones = detectBPR(fvg, atrVal);
  for (const z of bprZones.slice(0, 2)) overlays.push({ id: `bpr-${z.index}`, kind: 'bprZone', label: 'BPR', x1: z.index / (visible.length - 1), y1: toRatio(z.top, min, max), x2: Math.min(0.98, (z.index + 12) / (visible.length - 1)), y2: toRatio(z.bottom, min, max), confidence: 70, color: 'rgba(184,134,11,0.2)', category: 'bpr' });

  // Fibonacci: EQ, Golden Pocket (0.382–0.618) on last swing
  const lastSwingHigh = lastHighs[lastHighs.length - 1]?.price ?? rangeHigh;
  const lastSwingLow = lastLows[lastLows.length - 1]?.price ?? rangeLow;
  const fibs = fibLevels(lastSwingHigh, lastSwingLow);
  for (const r of [0.5, 0.382, 0.618]) {
    const p = fibs[r];
    if (p != null) overlays.push({ id: `fib-${r}`, kind: 'fibLine', label: r === 0.5 ? 'EQ 0.5' : r === 0.382 ? 'GP 0.382' : 'GP 0.618', x1: 0.02, y1: toRatio(p, min, max), x2: 0.98, y2: toRatio(p, min, max), confidence: 68, color: r === 0.5 ? '#ffd666' : '#b8860b', category: 'fib' });
  }

  // RSI/StochRSI signals
  const rsiVals = rsi(visible, 14);
  const rsiMaVals = ema(rsiVals, 12);
  const { k: stochK, d: stochD } = stochRsi(visible, 14, 14, 3, 3);
  const rsiSignals = rsiStochSignals(visible);
  for (let i = Math.max(0, visible.length - 30); i < visible.length; i++) {
    const sig = rsiSignals[i];
    if (sig) overlays.push({ id: `rsi-${i}`, kind: 'rsiSignal', label: sig === 'bullish' ? 'RSI↑' : 'RSI↓', x1: i / (visible.length - 1), y1: toRatio(visible[i].close, min, max), confidence: 70, color: sig === 'bullish' ? '#4df2a3' : '#ff7b7b', category: 'rsi' });
  }

  // Harmonic (Butterfly, Bat, Gartley, Crab, etc.)
  const allHarmonics = detectAllHarmonics(visible, swings);
  const harmonics = allHarmonics.length ? allHarmonics : detectButterfly(visible, swings);
  const harmNames: Record<string, string> = { butterfly: '나비', bat: '박쥐', gartley: 'Gartley', crab: '크랩', altBat: 'Alt Bat', deepCrab: 'DCrab' };
  for (const b of harmonics.slice(0, 2)) {
    const name = harmNames[b.pattern] || b.pattern;
    overlays.push({ id: `harm-${b.pattern}-${b.d}`, kind: 'harmonic', label: `${name} D ${b.bias === 'bullish' ? '↑' : '↓'}`, x1: b.d / (visible.length - 1), y1: toRatio(b.dPrice, min, max), x2: Math.min(0.98, (b.d + 8) / (visible.length - 1)), y2: toRatio(b.dPrice, min, max), confidence: 72, color: b.bias === 'bullish' ? '#71f7bd' : '#ff9b9b', category: 'harmonic' });
  }

  // Symmetrical triangle target
  const symTri = patterns.find(p => p.type === 'symTriangle' && p.targetPrice != null);
  if (symTri?.targetPrice != null) overlays.push({ id: 'symtarget', kind: 'symTriangleTarget', label: '목표가 L', x1: 0.7, y1: toRatio(symTri.targetPrice, min, max), x2: 0.98, y2: toRatio(symTri.targetPrice, min, max), confidence: 70, color: '#ffb86b', category: 'structure' });

  // PO3 phase
  const po3 = detectPO3Phase(visible);
  if (po3) overlays.push({ id: 'po3', kind: 'po3Phase', label: `PO3 ${po3 === 'accumulation' ? '축적' : po3 === 'manipulation' ? '조작' : '분배'}`, x1: 0.5, y1: 0.5, confidence: 65, color: '#b8860b', category: 'po3' });

  // False Breakout
  const fb = detectFalseBreakout(visible, rangeHigh, rangeLow);
  for (const x of fb) overlays.push({ id: `fb-${x.index}`, kind: 'falseBreakout', label: '가짜돌파', x1: x.index / (visible.length - 1), y1: toRatio(x.price, min, max), confidence: 70, color: '#ff9b9b', category: 'structure' });

  // Kill Zone (last candle)
  if (visible.length && isKillZone(visible[visible.length - 1].time)) overlays.push({ id: 'killzone', kind: 'label', label: 'Kill Zone', x1: 0.92, y1: 0.1, confidence: 60, color: '#ffd666', category: 'labels' });

  // FluidTrades: Supply/Demand zones, POI (반전형/연속형)
  for (const z of supplyZones.slice(-5)) {
    const beforeTrend = z.left >= 5 ? (visible[z.left - 1]?.close ?? 0) - (visible[z.left - 5]?.close ?? 0) : 0;
    const baseType = beforeTrend > 0 ? '반전' : '연속';
    overlays.push({ id: `supply-${z.left}`, kind: 'supplyZone', label: `공급 ${baseType}`, x1: z.left / (visible.length - 1), y1: toRatio(z.top, min, max), x2: Math.min(0.98, (z.right + 10) / (visible.length - 1)), y2: toRatio(z.bottom, min, max), confidence: 75, color: 'rgba(237,237,237,0.25)' });
    overlays.push({ id: `poi-supply-${z.left}`, kind: 'poi', label: 'POI', x1: z.left / (visible.length - 1), y1: toRatio(z.poi, min, max), confidence: 76, color: '#fff' });
  }
  for (const z of demandZones.slice(-5)) {
    const beforeTrend = z.left >= 5 ? (visible[z.left - 1]?.close ?? 0) - (visible[z.left - 5]?.close ?? 0) : 0;
    const baseType = beforeTrend < 0 ? '반전' : '연속';
    overlays.push({ id: `demand-${z.left}`, kind: 'demandZone', label: `수요 ${baseType}`, x1: z.left / (visible.length - 1), y1: toRatio(z.top, min, max), x2: Math.min(0.98, (z.right + 10) / (visible.length - 1)), y2: toRatio(z.bottom, min, max), confidence: 75, color: 'rgba(0,255,255,0.25)' });
    overlays.push({ id: `poi-demand-${z.left}`, kind: 'poi', label: 'POI', x1: z.left / (visible.length - 1), y1: toRatio(z.poi, min, max), confidence: 76, color: '#fff' });
  }

  // HH/LH/HL/LL swing labels
  for (let i = 1; i < lastHighs.length; i++) {
    const prev = lastHighs[i - 1], cur = lastHighs[i];
    const tag = cur.price >= prev.price ? 'HH' : 'LH';
    overlays.push({ id: `sw-h-${cur.index}`, kind: 'swingLabel', label: tag, x1: cur.index / (visible.length - 1), y1: toRatio(cur.price, min, max), confidence: 70, color: '#878b94' });
  }
  for (let i = 1; i < lastLows.length; i++) {
    const prev = lastLows[i - 1], cur = lastLows[i];
    const tag = cur.price <= prev.price ? 'LL' : 'HL';
    overlays.push({ id: `sw-l-${cur.index}`, kind: 'swingLabel', label: tag, x1: cur.index / (visible.length - 1), y1: toRatio(cur.price, min, max), confidence: 70, color: '#878b94' });
  }

  // LuxAlgo: Strong/Weak High/Low
  overlays.push({ id: 'strong-high', kind: 'strongHigh', label: trend === 'bearish' ? '약한 고점' : '강한 고점', x1: trailTopIdx / (visible.length - 1), y1: toRatio(trailTop, min, max), x2: 0.98, y2: toRatio(trailTop, min, max), confidence: 74, color: '#F23645' });
  overlays.push({ id: 'strong-low', kind: 'strongLow', label: trend === 'bullish' ? '강한 저점' : '약한 저점', x1: trailBottomIdx / (visible.length - 1), y1: toRatio(trailBottom, min, max), x2: 0.98, y2: toRatio(trailBottom, min, max), confidence: 74, color: '#089981' });

  // LuxAlgo: Equilibrium line
  overlays.push({ id: 'equilibrium', kind: 'equilibrium', label: '균형선', x1: 0.04, y1: toRatio(eq, min, max), x2: 0.96, y2: toRatio(eq, min, max), confidence: 68, color: '#878b94' });

  // LuxAlgo EQH/EQL (additional, threshold-based)
  for (const x of eqhLux.slice(-1)) overlays.push({ id: `eqhl-${x.a}`, kind: 'eqh', label: 'EQH', x1: x.a / (visible.length - 1), y1: toRatio(x.price, min, max), x2: x.b / (visible.length - 1), y2: toRatio(x.price, min, max), confidence: 72, color: '#F23645' });
  for (const x of eqlLux.slice(-1)) overlays.push({ id: `eqll-${x.a}`, kind: 'eql', label: 'EQL', x1: x.a / (visible.length - 1), y1: toRatio(x.price, min, max), x2: x.b / (visible.length - 1), y2: toRatio(x.price, min, max), confidence: 72, color: '#089981' });

  patterns.slice(-2).forEach((p, i) => {
    const color = p.bias === 'bullish' ? '#7fb8ff' : p.bias === 'bearish' ? '#ff9b9b' : '#ffd666';
    overlays.push({ id: `pt-u-${i}`, kind: 'resistanceLine', label: p.label, x1: p.start / (visible.length - 1), y1: toRatio(p.upperStart, min, max), x2: p.end / (visible.length - 1), y2: toRatio(p.upperEnd, min, max), confidence: 72, color });
    overlays.push({ id: `pt-l-${i}`, kind: 'supportLine', label: '', x1: p.start / (visible.length - 1), y1: toRatio(p.lowerStart, min, max), x2: p.end / (visible.length - 1), y2: toRatio(p.lowerEnd, min, max), confidence: 72, color });
  });

  let score = 0;
  if (trend === 'bullish') score += 20;
  if (trend === 'bearish') score -= 20;
  score += validFvg.filter(x => x.bias === 'bullish').length * 4;
  score -= validFvg.filter(x => x.bias === 'bearish').length * 4;
  score -= sweeps.filter(x => x.side === 'buy').length * 5;
  score += sweeps.filter(x => x.side === 'sell').length * 5;
  score += validObs.filter(x => x.bias === 'bullish').length * 3;
  score -= validObs.filter(x => x.bias === 'bearish').length * 3;
  patterns.forEach(p => {
    if (p.bias === 'bullish') score += 12;
    if (p.bias === 'bearish') score -= 12;
  });

  let draftVerdict: Verdict = 'WATCH';
  let draftConfidence = 55;
  if (score >= 18) {
    draftVerdict = 'LONG';
    draftConfidence = Math.min(93, Math.round(55 + score * 0.9));
  } else if (score <= -18) {
    draftVerdict = 'SHORT';
    draftConfidence = Math.min(93, Math.round(55 + Math.abs(score) * 0.9));
  }
  const htfTrend = options?.htfTrend;
  if (htfTrend && (draftVerdict === 'LONG' && htfTrend === 'bullish' || draftVerdict === 'SHORT' && htfTrend === 'bearish')) {
    draftConfidence = Math.min(95, draftConfidence + 5);
  } else if (htfTrend && (draftVerdict === 'LONG' && htfTrend === 'bearish' || draftVerdict === 'SHORT' && htfTrend === 'bullish')) {
    draftConfidence = Math.max(50, draftConfidence - 3);
  }

  const last = visible[visible.length - 1];
  const regimeResult = computeRegime(candles, { trend, swingHighs: highs.length, swingLows: lows.length });
  const mtf = computeMTF(htfTrend ?? null, trend, draftVerdict);
  const signalResult = computeSignalScore({
    structure: { trend, bos, choch, fvg, sweeps, patterns, score },
    volumeDelta: (options as any)?.volumeDelta,
    orderbookImbalance: (options as any)?.orderbookImbalance,
    oiState: (options as any)?.oiState,
    fundingState: (options as any)?.fundingState,
    longShortRatio: (options as any)?.longShortRatio,
    regime: regimeResult,
    mtfAlignmentScore: mtf.alignmentScore,
    patternRecallScore: undefined,
  });
  const tradePlan = computeTradePlan({
    signal: signalResult.signal,
    currentPrice: last.close,
    equilibrium: eq,
    rangeHigh,
    rangeLow,
    atr: atrVal,
    regime: regimeResult.regime,
  });
  const confResult = computeConfidence({
    mtfAlignmentScore: mtf.alignmentScore,
    regimeConsistency: true,
    signalConflict: false,
    dataQuality: 'full',
    patternStrength: patterns.length ? 0.6 : 0,
    liquidityAlignment: sweeps.length > 0,
    volumeConfirmation: (options as any)?.volumeDelta != null,
    longScore: signalResult.longScore,
    shortScore: signalResult.shortScore,
  });

  const verdict = signalResult.signal;
  const confidence = confResult.confidence;
  const entry = tradePlan.entry;
  const stop = tradePlan.stopLoss;
  const targets = tradePlan.targets;

  overlays.push({ id: 'entry', kind: 'entry', label: '진입', x1: Math.max(0.72, (visible.length - 18) / (visible.length - 1)), y1: toRatio(entry, min, max), confidence: 82, color: '#62efe0' });
  overlays.push({ id: 'stop', kind: 'stop', label: '손절', x1: Math.max(0.76, (visible.length - 14) / (visible.length - 1)), y1: toRatio(stop, min, max), confidence: 82, color: '#ff7b7b' });
  targets.forEach((p, idx) => overlays.push({ id: `tp-${idx}`, kind: 'target', label: `목표${idx + 1}`, x1: Math.max(0.80 + idx * 0.03, (visible.length - 12 + idx * 2) / (visible.length - 1)), y1: toRatio(p, min, max), confidence: 80, color: '#4df2a3' }));

  const anchorStart = Math.max(0.78, Math.min(0.82, (visible.length - 24) / (visible.length - 1)));
  const anchorMid = Math.max(0.86, Math.min(0.90, (visible.length - 14) / (visible.length - 1)));
  const anchorEnd = Math.max(0.92, Math.min(0.98, (visible.length - 4) / (visible.length - 1)));

  const lastPrice = last.close;
  const pathA = verdict === 'SHORT' ? [lastPrice, lastPrice * 0.99, lastPrice * 0.975] : [lastPrice, lastPrice * 1.01, lastPrice * 1.025];
  const pathB = verdict === 'SHORT' ? [lastPrice, eq, eq * 1.005] : [lastPrice, eq, eq * 0.995];

  overlays.push({ id: 'sca-1', kind: 'scenario', label: '경로 A', x1: anchorStart, y1: toRatio(pathA[0], min, max), x2: anchorMid, y2: toRatio(pathA[1], min, max), confidence: 66, color: '#7fb8ff' });
  overlays.push({ id: 'sca-2', kind: 'scenario', label: '', x1: anchorMid, y1: toRatio(pathA[1], min, max), x2: anchorEnd, y2: toRatio(pathA[2], min, max), confidence: 66, color: '#7fb8ff' });
  overlays.push({ id: 'scb-1', kind: 'scenario', label: '경로 B', x1: anchorStart, y1: toRatio(pathB[0], min, max), x2: anchorMid, y2: toRatio(pathB[1], min, max), confidence: 64, color: '#ffb86b' });
  overlays.push({ id: 'scb-2', kind: 'scenario', label: '', x1: anchorMid, y1: toRatio(pathB[1], min, max), x2: anchorEnd, y2: toRatio(pathB[2], min, max), confidence: 64, color: '#ffb86b' });
  const pathC = verdict === 'SHORT' ? [lastPrice, lastPrice * 1.005, lastPrice * 1.02] : [lastPrice, lastPrice * 0.995, lastPrice * 0.97];
  const anchorEndC = Math.min(0.98, anchorEnd + 0.02);
  overlays.push({ id: 'scc-1', kind: 'scenario', label: '경로 C', x1: anchorStart, y1: toRatio(pathC[0], min, max), x2: anchorMid, y2: toRatio(pathC[1], min, max), confidence: 50, color: '#ff7b7b' });
  overlays.push({ id: 'scc-2', kind: 'scenario', label: '', x1: anchorMid, y1: toRatio(pathC[1], min, max), x2: anchorEndC, y2: toRatio(pathC[2], min, max), confidence: 50, color: '#ff7b7b' });

  const baseIdx = candles.length - visible.length;
  const visionResults = runPatternVision(candles);
  const visionOverlays = visionResultsToOverlays(visionResults, visible.length, baseIdx, min, max);
  overlays.push(...visionOverlays);

  const smartMoney = analyzeSmartMoney({ trend, bos, choch, eqh, eql, sweeps, fvg, obs: obs, patterns });
  const tailongResult = computeTailong(visible, timeframe, verdict, trend);
  const engine = { trend, bos, choch, eqh, eql, sweeps, fvg, obs, patterns, premium: rangeHigh, discount: rangeLow, equilibrium: eq, score, smartMoney, tailong: tailongResult };
  const trendKo = trend === 'bullish' ? '상승' : trend === 'bearish' ? '하락' : '횡보';

  const levelInput = {
    currentPrice: last.close,
    rangeHigh,
    rangeLow,
    equilibrium: eq,
    swingHighs: lastHighs.map(h => h.price),
    swingLows: lastLows.map(l => l.price),
    eqhPrices: eqh.map(x => x.price),
    eqlPrices: eql.map(x => x.price),
    fvgBoundaries: validFvg.map(x => ({ low: x.low, high: x.high, bias: x.bias })),
    obRanges: validObs.map(x => ({ low: x.low, high: x.high })),
    liquidityPoolPrices: sweeps.map(s => s.price),
    trend,
  };
  const levelResult = computeLevels(levelInput);
  const scenarioResult = computeScenarios({
    levels: levelResult,
    verdict,
    currentPrice: last.close,
    entry: typeof entry === 'number' ? entry : parseFloat(String(entry)) || 0,
    stopLoss: typeof stop === 'number' ? stop : parseFloat(String(stop)) || 0,
    targets: targets.map(t => typeof t === 'number' ? t : parseFloat(String(t)) || 0).filter(Boolean),
  });

  const keyLevelItems: Array<{ type: string; price: number; label: string }> = [];
  if (levelResult.breakoutLevel) keyLevelItems.push({ type: 'mustBreak', price: levelResult.breakoutLevel.price, label: '돌파 상승 확률' });
  if (levelResult.supportLevel) keyLevelItems.push({ type: 'mustHold', price: levelResult.supportLevel.price, label: '유지 시 ↑ 지지' });
  if (levelResult.invalidationLevel) keyLevelItems.push({ type: 'invalidation', price: levelResult.invalidationLevel.price, label: '이탈 하락 확률' });
  scenarioResult.nextTargets.slice(0, 2).forEach((txt, i) => {
    const parts = txt.split(/\s+/);
    const priceStr = parts.find(p => /^\d+(\.\d+)?$/.test(p));
    if (priceStr) keyLevelItems.push({ type: 'nextTarget', price: parseFloat(priceStr), label: `NEXT TARGET ${i + 1}` });
  });
  const keyLevelsToShow = keyLevelItems.slice(0, 6);
  for (const kl of keyLevelsToShow) {
    overlays.push({ id: `key-${kl.type}-${kl.price}`, kind: 'keyLevel', label: kl.label, x1: 0.02, y1: toRatio(kl.price, min, max), x2: 0.98, y2: toRatio(kl.price, min, max), confidence: 88, color: kl.type === 'mustBreak' ? '#4df2a3' : kl.type === 'mustHold' ? '#62efe0' : kl.type === 'invalidation' ? '#ff7b7b' : '#ffb86b', category: 'keyLevel' });
  }

  // 타이롱: 지지/저항/돌파가 수평선
  if (tailongResult.tailongSupport > 0 && tailongResult.tailongSupport >= min && tailongResult.tailongSupport <= max) {
    overlays.push({ id: 'tailong-support', kind: 'keyLevel', label: '타이롱 지지', x1: 0.02, y1: toRatio(tailongResult.tailongSupport, min, max), x2: 0.98, y2: toRatio(tailongResult.tailongSupport, min, max), confidence: 70, color: '#62efe0', category: 'keyLevel' });
  }
  if (tailongResult.tailongResistance > 0 && tailongResult.tailongResistance >= min && tailongResult.tailongResistance <= max) {
    overlays.push({ id: 'tailong-resistance', kind: 'keyLevel', label: '타이롱 저항', x1: 0.02, y1: toRatio(tailongResult.tailongResistance, min, max), x2: 0.98, y2: toRatio(tailongResult.tailongResistance, min, max), confidence: 70, color: '#ffb86b', category: 'keyLevel' });
  }
  if (tailongResult.tailongBreakPrice > 0 && tailongResult.tailongBreakPrice >= min && tailongResult.tailongBreakPrice <= max) {
    overlays.push({ id: 'tailong-break', kind: 'keyLevel', label: '타이롱 돌파', x1: 0.02, y1: toRatio(tailongResult.tailongBreakPrice, min, max), x2: 0.98, y2: toRatio(tailongResult.tailongBreakPrice, min, max), confidence: 72, color: tailongResult.tailongBreakDirection === 'bullish' ? '#4df2a3' : '#ff7b7b', category: 'keyLevel' });
  }

  // 반응구간: 캔들 위 네모 구간 (진입 구역 + 지지/저항 밴드)
  const entryNum = typeof entry === 'number' ? entry : parseFloat(String(entry)) || last.close;
  const atrValForZone = atr(visible, 14);
  const bandPct = Math.max(range * 0.002, atrValForZone * 0.08, range * 0.0008);
  const xStart = Math.max(0.65, (visible.length - 28) / (visible.length - 1));
  const xEnd = 0.98;
  const entryTop = entryNum + bandPct;
  const entryBottom = entryNum - bandPct;
  overlays.push({ id: 'reaction-zone-entry', kind: 'reactionZone', label: '반응구간', x1: xStart, y1: toRatio(entryTop, min, max), x2: xEnd, y2: toRatio(entryBottom, min, max), confidence: 75, color: 'rgba(98,239,224,0.22)', category: 'reactionZone' });
  if (levelResult.supportLevel && levelResult.supportLevel.price >= min && levelResult.supportLevel.price <= max) {
    const sup = levelResult.supportLevel.price;
    const supTop = sup + bandPct;
    const supBottom = Math.max(min, sup - bandPct);
    overlays.push({ id: 'reaction-zone-support', kind: 'reactionZone', label: '반응구간', x1: 0.02, y1: toRatio(supTop, min, max), x2: xEnd, y2: toRatio(supBottom, min, max), confidence: 74, color: 'rgba(113,247,189,0.2)', category: 'reactionZone' });
  }
  if (levelResult.resistanceLevel && levelResult.resistanceLevel.price >= min && levelResult.resistanceLevel.price <= max) {
    const res = levelResult.resistanceLevel.price;
    const resTop = Math.min(max, res + bandPct);
    const resBottom = res - bandPct;
    overlays.push({ id: 'reaction-zone-resistance', kind: 'reactionZone', label: '반응구간', x1: 0.02, y1: toRatio(resTop, min, max), x2: xEnd, y2: toRatio(resBottom, min, max), confidence: 74, color: 'rgba(255,184,107,0.2)', category: 'reactionZone' });
  }

  const limitedOverlays = overlays.length > 80 ? overlays.slice(0, 80) : overlays;

  const earlyObAnalysis = (() => {
    if (earlyObsDedup.length === 0) return null;
    const parts: string[] = [];
    const sup = earlyObsDedup.filter(o => o.bias === 'bullish');
    const res = earlyObsDedup.filter(o => o.bias === 'bearish');
    if (sup.length) parts.push(`선포착 지지 OB ${sup.length}곳(가격 터치 시 반등 관찰 구간). ${sup.map(o => `${o.low.toLocaleString()}~${o.high.toLocaleString()}`).join(', ')}`);
    if (res.length) parts.push(`선포착 저항 OB ${res.length}곳(가격 터치 시 하락 관찰 구간). ${res.map(o => `${o.low.toLocaleString()}~${o.high.toLocaleString()}`).join(', ')}`);
    return parts.join(' ');
  })();

  const bullishObs = validObs.filter(o => o.bias === 'bullish');
  const bearishObs = validObs.filter(o => o.bias === 'bearish');

  // 상승 OB / 하락 OB 구간을 과거 캔들과 비교 → 지금 구간 분석
  const obZonePastStats = (ob: { index: number; low: number; high: number; bias: 'bullish' | 'bearish' }) => {
    let touchCount = 0;
    let bounceCount = 0;
    const lookAhead = 5;
    for (let j = ob.index + 1; j < visible.length - lookAhead; j++) {
      const c = visible[j];
      const touches = c.low <= ob.high && c.high >= ob.low;
      if (!touches) continue;
      touchCount++;
      const nextCloses = visible.slice(j + 1, j + 1 + lookAhead).map(x => x.close);
      if (ob.bias === 'bullish') {
        if (nextCloses.some(cl => cl > ob.high)) bounceCount++;
      } else {
        if (nextCloses.some(cl => cl < ob.low)) bounceCount++;
      }
    }
    return { touchCount, bounceCount };
  };
  const nearestBullishObWithStats = (() => {
    const below = bullishObs.filter(o => o.high <= last.close).sort((a, b) => b.high - a.high)[0];
    const at = bullishObs.find(o => o.low <= last.close && o.high >= last.close);
    const ob = at ?? below ?? null;
    if (!ob) return null;
    const { touchCount, bounceCount } = obZonePastStats(ob);
    return { ...ob, touchCount, bounceCount };
  })();
  const nearestBearishObWithStats = (() => {
    const above = bearishObs.filter(o => o.low >= last.close).sort((a, b) => a.low - b.low)[0];
    const at = bearishObs.find(o => o.low <= last.close && o.high >= last.close);
    const ob = at ?? above ?? null;
    if (!ob) return null;
    const { touchCount, bounceCount } = obZonePastStats(ob);
    return { ...ob, touchCount, bounceCount };
  })();
  const currentZoneSummary = (() => {
    const inBullish = nearestBullishObWithStats && last.close >= nearestBullishObWithStats.low && last.close <= nearestBullishObWithStats.high;
    const inBearish = nearestBearishObWithStats && last.close >= nearestBearishObWithStats.low && last.close <= nearestBearishObWithStats.high;
    if (inBullish && nearestBullishObWithStats) {
      const { touchCount, bounceCount } = nearestBullishObWithStats;
      const pct = touchCount > 0 ? Math.round((bounceCount / touchCount) * 100) : 0;
      return `지금 구간: 상승 OB 구간 내부. 과거 터치 ${touchCount}회 중 ${bounceCount}회 반등 (${pct}%)`;
    }
    if (inBearish && nearestBearishObWithStats) {
      const { touchCount, bounceCount } = nearestBearishObWithStats;
      const pct = touchCount > 0 ? Math.round((bounceCount / touchCount) * 100) : 0;
      return `지금 구간: 하락 OB 구간 내부. 과거 터치 ${touchCount}회 중 ${bounceCount}회 하락 이어짐 (${pct}%)`;
    }
    if (nearestBullishObWithStats && last.close >= nearestBullishObWithStats.low - range * 0.005 && last.close <= nearestBullishObWithStats.high + range * 0.005) {
      const { touchCount, bounceCount } = nearestBullishObWithStats;
      const pct = touchCount > 0 ? Math.round((bounceCount / touchCount) * 100) : 0;
      return `지금 구간: 상승 OB 근처. 과거 터치 ${touchCount}회 중 ${bounceCount}회 반등 (${pct}%)`;
    }
    if (nearestBearishObWithStats && last.close >= nearestBearishObWithStats.low - range * 0.005 && last.close <= nearestBearishObWithStats.high + range * 0.005) {
      const { touchCount, bounceCount } = nearestBearishObWithStats;
      const pct = touchCount > 0 ? Math.round((bounceCount / touchCount) * 100) : 0;
      return `지금 구간: 하락 OB 근처. 과거 터치 ${touchCount}회 중 ${bounceCount}회 하락 이어짐 (${pct}%)`;
    }
    return null;
  })();

  const nearestSupportOb = (() => {
    const below = bullishObs.filter(o => o.high <= last.close).sort((a, b) => b.high - a.high)[0];
    if (below) return { low: below.low, high: below.high, probability: 78 };
    const at = bullishObs.find(o => o.low <= last.close && o.high >= last.close);
    return at ? { low: at.low, high: at.high, probability: 78 } : null;
  })();
  const nearestResistanceOb = (() => {
    const above = bearishObs.filter(o => o.low >= last.close).sort((a, b) => a.low - b.low)[0];
    if (above) return { low: above.low, high: above.high, probability: 78 };
    const at = bearishObs.find(o => o.low <= last.close && o.high >= last.close);
    return at ? { low: at.low, high: at.high, probability: 78 } : null;
  })();

  const topRefs = matchTopReferences(engine);
  const topRefScore = topRefs[0]?.score ?? 0;
  const mtfResult = computeMTF(htfTrend ?? null, trend, verdict);
  const probability = computeTradeProbability(verdict, confidence, engine, topRefScore, mtfResult.alignmentScore);
  const futurePaths = computeFuturePaths(verdict, last.close, eq, trend);

  const summaryText = `${symbol} ${timeframe} ${trendKo} 구조 · BOS ${bos.length} · CHOCH ${choch.length} · FVG ${fvg.length} · 스윕 ${sweeps.length} · 패턴 ${patterns.length}`;
  const normalized = normalizeCurrentPattern({ symbol, timeframe, verdict, confidence, summary: summaryText, entry: entry.toFixed(2), stopLoss: stop.toFixed(2), targets: targets.map(x => x.toFixed(2)), overlays: limitedOverlays, engine, topReferences: topRefs });
  const learnedPatternsTop5 = recallTopPatterns(normalized, undefined, 5);
  const recallSummary = buildRecallSummary(learnedPatternsTop5);

  return {
    symbol,
    timeframe,
    verdict,
    confidence,
    summary: summaryText,
    entry: typeof entry === 'number' ? entry.toFixed(2) : String(entry),
    stopLoss: typeof stop === 'number' ? stop.toFixed(2) : String(stop),
    targets: targets.map(x => (typeof x === 'number' ? x.toFixed(2) : String(x))),
    overlays: limitedOverlays,
    breakoutLevel: levelResult.breakoutLevel,
    supportLevel: levelResult.supportLevel,
    resistanceLevel: levelResult.resistanceLevel,
    invalidationLevel: levelResult.invalidationLevel,
    mustHold: scenarioResult.mustHold,
    mustBreak: scenarioResult.mustBreak,
    invalidation: scenarioResult.invalidation,
    bullishScenario: scenarioResult.bullishScenario,
    bearishScenario: scenarioResult.bearishScenario,
    nextTargets: scenarioResult.nextTargets,
    nearestSupportOb,
    nearestResistanceOb,
    earlyObAnalysis,
    currentZoneSummary,
    tailong: tailongResult,
    regime: regimeResult.regime,
    longScore: signalResult.longScore,
    shortScore: signalResult.shortScore,
    confidenceGrade: confResult.confidenceGrade,
    riskFlags: confResult.riskFlags,
    rr: tradePlan.rr,
    mtf: { ...mtfResult, summary: mtfResult.summary },
    indicators: (() => {
      const mc = macd(visible);
      const bb = bollingerBands(visible);
      const atrArr = atrSeries(visible, 14);
      return {
        rsi: rsiVals, rsiMa: rsiMaVals, stochK, stochD,
        macdLine: mc.macd, macdSignal: mc.signal, macdHist: mc.hist,
        bbMid: bb.mid, bbUpper: bb.upper, bbLower: bb.lower,
        atr: atrArr
      };
    })(),
    engine,
    topReferences: topRefs.map(r => ({ id: r.id, title: r.title, score: r.score, tags: r.tags, reason: r.reason, outcome: r.outcome })),
    futurePaths,
    probability,
    learnedPatternsTop5: learnedPatternsTop5.map(p => ({ id: p.id, title: p.title, score: p.score, patternType: p.patternType, bias: p.bias, reason: p.reason, outcome: p.outcome, briefing: p.briefing, description: p.description })),
    recallSummary,
    detectedVisionPatterns: visionResults,
    dominantPattern: (() => { const d = getDominantPattern(visionResults); return d ? { type: d.type, confidence: d.confidence, bias: d.bias, label: d.label, reason: d.reason } : null; })(),
    patternVisionSummary: getPatternVisionSummary(visionResults),
  };
}
