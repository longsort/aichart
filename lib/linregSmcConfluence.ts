/**
 * LinReg 밴드 근접 구간을 **차트 존(면)** 으로 표시 — 텍스트 카드 대신 시각적 참고.
 * 고정 승률·매매 확정 아님.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { ParkfLinRegBandSnapshot } from '@/lib/parkfLinregTrendlineEngine';
import { candleBarDurationSec } from '@/lib/candleTfDuration';

export function pickUpperProximity(lastHigh: number, snap: ParkfLinRegBandSnapshot): { key: 'L' | 'M' | 'S' | null; near: boolean } {
  const { resL, resM, resS, eps, stdDev } = snap;
  const thr = Math.max(eps, stdDev * 0.12);
  if (lastHigh >= resL - thr) return { key: 'L', near: lastHigh < resL + thr };
  if (lastHigh >= resM - thr) return { key: 'M', near: lastHigh < resM + thr };
  if (lastHigh >= resS - thr) return { key: 'S', near: lastHigh < resS + thr };
  return { key: null, near: false };
}

export function pickLowerProximity(lastLow: number, snap: ParkfLinRegBandSnapshot): { key: 'L' | 'M' | 'S' | null; near: boolean } {
  const { supL, supM, supS, eps, stdDev } = snap;
  const thr = Math.max(eps, stdDev * 0.12);
  if (lastLow <= supL + thr) return { key: 'L', near: lastLow > supL - thr };
  if (lastLow <= supM + thr) return { key: 'M', near: lastLow > supM - thr };
  if (lastLow <= supS + thr) return { key: 'S', near: lastLow > supS - thr };
  return { key: null, near: false };
}

function recentStructureHints(overlays: OverlayItem[], lastTime: number, timeframe: string, lookbackBars: number): string[] {
  const barSec = candleBarDurationSec(timeframe, lastTime);
  const winMs = lookbackBars * barSec * 1000;
  const tMin = lastTime - winMs;
  const candidates = overlays.filter((o) => {
    const k = String(o.kind || '');
    if (k !== 'bos' && k !== 'choch') return false;
    const t1 = o.time1;
    return typeof t1 === 'number' && t1 >= tMin && t1 <= lastTime;
  });
  candidates.sort((a, b) => (b.time1 ?? 0) - (a.time1 ?? 0));
  const hints: string[] = [];
  const seen = new Set<string>();
  for (const o of candidates) {
    const k = String(o.kind || '');
    const tag = k === 'bos' ? 'BOS' : 'CHOCH';
    const lab = String(o.label || '').slice(0, 28);
    const line = lab ? `${tag}: ${lab}` : tag;
    if (!seen.has(line)) {
      seen.add(line);
      hints.push(line);
    }
    if (hints.length >= 3) break;
  }
  return hints;
}

function obOverlapTooltip(cp: number, analysis: AnalyzeResponse | null | undefined): string | undefined {
  if (!analysis || !Number.isFinite(cp)) return undefined;
  const eps = Math.max(cp * 0.0004, 1e-8);
  const nr = analysis.nearestResistanceOb;
  const ns = analysis.nearestSupportOb;
  if (nr && cp >= nr.low - eps && cp <= nr.high + eps) {
    return `엔진 저항 OB 가격대 ${nr.low.toFixed(2)}~${nr.high.toFixed(2)}와 겹침`;
  }
  if (ns && cp >= ns.low - eps && cp <= ns.high + eps) {
    return `엔진 지지 OB 가격대 ${ns.low.toFixed(2)}~${ns.high.toFixed(2)}와 겹침`;
  }
  return undefined;
}

/**
 * LinReg 상·하 밴드 **근접 시** 가로 존만 그림 (time1~time2 = 최근 가시 구간).
 * 툴팁에 근거(밴드·σ·선택적 BOS/CHOCH/OB)를 붙임.
 */
export function buildLinRegSmcConfluenceZones(params: {
  snap: ParkfLinRegBandSnapshot;
  lastHigh: number;
  lastLow: number;
  lastClose: number;
  lastTime: number;
  timeframe: string;
  candles: Candle[];
  analysis: AnalyzeResponse | null | undefined;
  overlays: OverlayItem[];
}): OverlayItem[] {
  const { snap, lastHigh, lastLow, lastClose, lastTime, timeframe, candles, analysis, overlays } = params;
  const n = candles.length;
  if (n < 8) return [];

  const up = pickUpperProximity(lastHigh, snap);
  const lo = pickLowerProximity(lastLow, snap);
  if (!up.key && !lo.key) return [];

  const lookback = Math.min(100, n - 1);
  const tStart = candles[Math.max(0, n - lookback)].time as number;
  const tEnd = candles[n - 1].time as number;
  const half = Math.max(snap.stdDev * 0.1, snap.eps * 1.5);
  const cat: OverlayItem['category'] = 'smcDesk';

  const st = recentStructureHints(overlays, lastTime, timeframe, 18);
  const structLine = st.length ? ` · 최근 구조: ${st.slice(0, 2).join(', ')}` : '';
  const obLine = obOverlapTooltip(lastClose, analysis);
  const techTail = `회귀 ${snap.length}봉 · σ=${snap.stdDev.toFixed(6)}${structLine}${obLine ? ` · ${obLine}` : ''}`;

  /** 왜 그려졌는지 + 여기서 무엇을 보려는지(시나리오 관찰, 확정 아님) */
  const tipUpper = (key: string) =>
    [
      `〔왜〕 최근 봉 고가가 LinReg 상단 저항 밴드(${key}) 근접 구간에 들어와 표시됨.`,
      `〔볼 것〕 통계 채널 상단 — 되돌림·매도 반응(저항) 또는 돌파·지속 중 어느 쪽인지 함께 봄. 확정 아님.`,
      techTail,
    ].join(' ');

  const tipLower = (key: string) =>
    [
      `〔왜〕 최근 봉 저가가 LinReg 하단 지지 밴드(${key}) 근접 구간에 들어와 표시됨.`,
      `〔볼 것〕 통계 채널 하단 — 반응·지지(수요) 또는 이탈·하방 지속 중 어느 쪽인지 함께 봄. 확정 아님.`,
      techTail,
    ].join(' ');

  const out: OverlayItem[] = [];

  if (up.key) {
    const resP = up.key === 'L' ? snap.resL : up.key === 'M' ? snap.resM : snap.resS;
    const top = resP + half;
    const bot = resP - half;
    out.push({
      id: `smc-linreg-zone-res-${up.key}`,
      kind: 'supplyZone',
      label: `LinReg상·저항/되돌림`,
      x1: 0,
      y1: 0,
      time1: tStart,
      time2: tEnd,
      price1: top,
      price2: bot,
      confidence: 52,
      color: 'rgba(239,68,68,0.16)',
      lineLabelColor: 'rgba(248,113,113,0.75)',
      category: cat,
      zoneSpanOnly: true,
      labelTooltip: tipUpper(up.key),
    });
  }
  if (lo.key) {
    const supP = lo.key === 'L' ? snap.supL : lo.key === 'M' ? snap.supM : snap.supS;
    const top = supP + half;
    const bot = supP - half;
    out.push({
      id: `smc-linreg-zone-sup-${lo.key}`,
      kind: 'demandZone',
      label: `LinReg하·지지/반응`,
      x1: 0,
      y1: 0,
      time1: tStart,
      time2: tEnd,
      price1: top,
      price2: bot,
      confidence: 52,
      color: 'rgba(34,197,94,0.14)',
      lineLabelColor: 'rgba(74,222,128,0.8)',
      category: cat,
      zoneSpanOnly: true,
      labelTooltip: tipLower(lo.key),
    });
  }

  return out;
}
