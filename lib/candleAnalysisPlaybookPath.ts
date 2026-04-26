import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import { candleBarDurationSec } from '@/lib/candleTfDuration';

function num(x: unknown): number | null {
  const n = typeof x === 'number' ? x : parseFloat(String(x ?? ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function longBias(a: AnalyzeResponse, px: number): boolean {
  if (a.verdict === 'SHORT') return false;
  if (a.verdict === 'LONG') return true;
  const ls = a.longScore ?? 0;
  const ss = a.shortScore ?? 0;
  if (ls !== ss) return ls > ss;
  const e = num(a.entry);
  if (e != null && px > 0) return px >= e * 0.998;
  return true;
}

function parseTp1(analysis: AnalyzeResponse, isLong: boolean): number | null {
  const targets: number[] = [];
  for (const t of analysis.targets ?? []) {
    const n = num(t);
    if (n != null) targets.push(n);
  }
  for (const t of analysis.nextTargets ?? []) {
    const n = num(t);
    if (n != null) targets.push(n);
  }
  const u = [...new Set(targets.map((x) => Math.round(x * 1e8) / 1e8))].sort((a, b) => a - b);
  if (!u.length) return null;
  return isLong ? u[u.length - 1] : u[0];
}

/**
 * 캔들분석: 사용자 자료(타점·지지·저항·이후 경로)에 맞춘 **시나리오 점선 경로** (휴리스틱).
 * — 지지(롱) / 저항(숏) 맥락 가격 → 돌파선(있으면) → 진입 → 목표1
 */
export function buildCandleAnalysisPlaybookPathOverlays(
  analysis: AnalyzeResponse | null | undefined,
  candles: Candle[],
  timeframe?: string
): OverlayItem[] {
  if (!analysis || candles.length < 8) return [];

  const last = candles[candles.length - 1];
  const px = analysis.currentPrice ?? last.close;
  const isLong = longBias(analysis, px);
  const tNow = Number(last.time);
  const tf = timeframe ?? analysis.timeframe ?? '1h';
  const barSec = candleBarDurationSec(tf, tNow);

  const entry = num(analysis.entry);
  const br = analysis.breakoutLevel?.price != null ? num(analysis.breakoutLevel.price) : null;
  const tp1 = parseTp1(analysis, isLong);
  const buyZ = analysis.nearestBuyZone;
  const sellZ = analysis.nearestSellZone;

  let anchorP: number | null = null;
  if (isLong && buyZ && buyZ.high > buyZ.low) {
    anchorP = (buyZ.low + buyZ.high) / 2;
  } else if (!isLong && sellZ && sellZ.high > sellZ.low) {
    anchorP = (sellZ.low + sellZ.high) / 2;
  }

  const step = Math.max(3, Math.min(12, Math.round(5 * Math.sqrt(3600 / Math.max(60, barSec)))));

  const pathColor = 'rgba(147,197,253,0.62)';
  const dash = '6 5';
  const out: OverlayItem[] = [];

  const pushSeg = (i: number, t1: number, p1: number, t2: number, p2: number, label: string) => {
    if (!Number.isFinite(t1) || !Number.isFinite(t2) || !Number.isFinite(p1) || !Number.isFinite(p2)) return;
    if (Math.abs(t2 - t1) < 1e-6 && Math.abs(p2 - p1) < 1e-12 * Math.max(1, px)) return;
    out.push({
      id: `candle-analysis-playbook-${i}`,
      kind: 'trendLine',
      label,
      x1: 0,
      y1: 0,
      time1: t1,
      price1: p1,
      time2: t2,
      price2: p2,
      confidence: 44,
      color: pathColor,
      lineDash: dash,
      lineStrokeWidth: 1.35,
      category: 'labels',
      noProject: true,
    });
  };

  let segIdx = 0;
  const tBack = tNow - step * barSec;

  /** 1) 맥락(지지·저항 중심) → 현재가 근처 */
  if (anchorP != null && Math.abs(anchorP - last.close) > px * 3e-5) {
    const tMid = tNow - Math.max(1, Math.floor(step / 2)) * barSec;
    pushSeg(segIdx++, tBack, anchorP, tMid, last.close, isLong ? '지지 후' : '저항 후');
  }

  const tBr = tNow + Math.max(1, Math.floor(step / 2)) * barSec;
  const tEn = tNow + step * barSec;
  const tTp = tNow + Math.floor(step * 1.8) * barSec;

  /** 2) 현재 종가 → 돌파 또는 진입 */
  if (br != null && entry != null && Math.abs(br - entry) > px * 2e-5) {
    pushSeg(segIdx++, tNow, last.close, tBr, br, '돌파 구간');
    pushSeg(segIdx++, tBr, br, tEn, entry, '→ 진입');
  } else if (br != null) {
    pushSeg(segIdx++, tNow, last.close, tBr, br, '돌파 확인');
  } else if (entry != null) {
    pushSeg(segIdx++, tNow, last.close, tEn, entry, '→ 진입');
  }

  /** 3) 진입 → 목표1 */
  if (entry != null && tp1 != null && Math.abs(tp1 - entry) > px * 2e-5) {
    pushSeg(segIdx++, tEn, entry, tTp, tp1, '→ 목표');
  } else if (entry == null && tp1 != null && Math.abs(tp1 - last.close) > px * 2e-5) {
    pushSeg(segIdx++, tNow, last.close, tTp, tp1, '→ 목표');
  }

  return out.slice(0, 5);
}
