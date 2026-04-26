import type { AnalyzeResponse, Candle } from '@/types';

/** 마지막 봉 시각(초) 기준 UTC 세션 라벨 — 크립토 유동성 시간대 단순화 */
export function candleSessionChipFromUnix(timeSec: number): string {
  const h = new Date(timeSec * 1000).getUTCHours();
  if (h >= 13 && h < 21) return '세션 NY';
  if (h >= 7 && h < 13) return '세션 런던';
  return '세션 아시아';
}

function trueRange(c: Candle, prevClose: number): number {
  return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
}

/** Wilder ATR, 마지막 값 */
function atrLast(candles: Candle[], period: number): number | null {
  if (candles.length < period + 1) return null;
  let prevClose = candles[candles.length - period - 1].close;
  const trs: number[] = [];
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i];
    trs.push(trueRange(c, prevClose));
    prevClose = c.close;
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

/** 단기/장기 ATR 비율로 압축·확대 힌트 */
export function volatilityInsightChips(candles: Candle[]): string[] {
  if (candles.length < 22) return [];
  const a5 = atrLast(candles, 5);
  const a20 = atrLast(candles, 20);
  if (a5 == null || a20 == null || a20 <= 0) return [];
  const r = a5 / a20;
  if (r >= 1.38) return ['변동 확대'];
  if (r <= 0.72) return ['변동 압축'];
  return [];
}

function trendArrow(s: string): string {
  if (s === '상승') return '↑';
  if (s === '하락') return '↓';
  return '↔';
}

/** multiTF 칩 문자열 배열 (1M / HTF / LTF) */
export function multiTimeframeChips(analysis: AnalyzeResponse): string[] {
  const m = (analysis as { multiTF?: Record<string, string> | null }).multiTF;
  if (!m || typeof m !== 'object') return [];
  const out: string[] = [];
  const t1m = m.trend1M;
  if (t1m) out.push(`1M${trendArrow(t1m)}`);
  const htf = m.htf;
  const htfL = m.htfLabel;
  if (htf && htfL) out.push(`${String(htfL)}${trendArrow(htf)}`);
  const ltf = m.ltf;
  const ltfL = m.ltfLabel;
  if (ltf && ltfL) out.push(`${String(ltfL)}${trendArrow(ltf)}`);
  return out;
}

export function multiTimeframeStrip(analysis: AnalyzeResponse): string {
  return multiTimeframeChips(analysis).join(' · ');
}
