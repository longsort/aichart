/**
 * 급등전 2차 검증 — 15m·1h 짧은 봉. 승률·급등 확정 아님.
 */
import type { Candle } from '@/types';
import type { SurgeCoinRow } from '@/lib/surgeCoinScan';

export type PreSurgeGrade = 'A' | 'B' | 'C';

export type PreSurgeCandleRead = {
  volExpand: number;
  atrCompress: number;
  higherLows: boolean;
  closeUpper: boolean;
  alreadyRan: boolean;
  buyTape: number;
  htfUp: boolean | null;
  invalidationPrice: number;
  tags: string[];
  candleScore: number;
};

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function atrLike(rows: Candle[], n: number): number {
  if (rows.length < 3) return 0;
  const slice = rows.slice(-Math.min(n, rows.length));
  const trs: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const c = slice[i]!;
    const p = slice[i - 1]!;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  return mean(trs);
}

export function readPreSurgeCandles(c15: Candle[], c1h?: Candle[] | null): PreSurgeCandleRead | null {
  if (!c15 || c15.length < 24) return null;
  const n = c15.length;
  const last = c15[n - 1]!;
  const lastClose = last.close;
  if (!(lastClose > 0)) return null;

  const volTail = c15.slice(-3).map((c) => c.volume || 0);
  const volBase = c15.slice(-23, -3).map((c) => c.volume || 0);
  const volExpand = mean(volBase) > 0 ? mean(volTail) / mean(volBase) : 1;

  const atrFast = atrLike(c15, 14);
  const atrSlow = atrLike(c15, 48);
  const atrCompress = atrSlow > 0 ? atrFast / atrSlow : 1;

  const loA = Math.min(...c15.slice(-16, -8).map((c) => c.low));
  const loB = Math.min(...c15.slice(-8).map((c) => c.low));
  const higherLows = loB > loA * 1.001;

  const win = c15.slice(-8);
  const wHi = Math.max(...win.map((c) => c.high));
  const wLo = Math.min(...win.map((c) => c.low));
  const wSpan = wHi - wLo;
  const closeUpper = wSpan > 0 && (lastClose - wLo) / wSpan >= 0.55;

  let runPct = 0;
  for (const c of c15.slice(-3)) {
    if (c.open > 0) runPct += ((c.close - c.open) / c.open) * 100;
  }
  const avgRange = mean(c15.slice(-20).map((c) => (c.close > 0 ? ((c.high - c.low) / c.close) * 100 : 0)));
  const lastRange = last.close > 0 ? ((last.high - last.low) / last.close) * 100 : 0;
  const alreadyRan = runPct >= 6.2 || lastRange > Math.max(2.4, avgRange * 2.15);

  let buyTape = 0.5;
  const tape = c15.slice(-6).filter((c) => (c.takerBuyBaseVolume ?? 0) > 0 && c.volume > 0);
  if (tape.length >= 3) {
    buyTape = mean(tape.map((c) => (c.takerBuyBaseVolume || 0) / c.volume));
  }

  let htfUp: boolean | null = null;
  if (c1h && c1h.length >= 20) {
    const h = c1h[c1h.length - 1]!;
    const sma = mean(c1h.slice(-20).map((c) => c.close));
    const net = c1h.slice(-6).reduce((a, c) => a + (c.close - c.open), 0);
    htfUp = h.close >= sma * 0.998 && net >= 0;
  }

  const inv = Math.min(...c15.slice(-12).map((c) => c.low));

  const tags: string[] = [];
  if (atrCompress <= 0.78) tags.push('15m압축');
  if (volExpand >= 1.45) tags.push('거래량점화');
  else if (volExpand >= 1.15) tags.push('거래량증가');
  if (higherLows) tags.push('저점상승');
  if (closeUpper) tags.push('고가권');
  if (buyTape >= 0.55) tags.push('매수우세');
  if (htfUp === true) tags.push('1h정배열');
  if (htfUp === false) tags.push('1h약함');
  if (alreadyRan) tags.push('이미가속');

  let candleScore = 0;
  candleScore += clamp01((1.15 - atrCompress) / 0.7) * 22;
  candleScore += clamp01((volExpand - 0.85) / 1.4) * 24;
  if (higherLows) candleScore += 12;
  if (closeUpper) candleScore += 10;
  candleScore += clamp01((buyTape - 0.45) / 0.25) * 10;
  if (htfUp === true) candleScore += 10;
  if (htfUp === false) candleScore -= 8;
  if (alreadyRan) candleScore -= 28;

  return {
    volExpand,
    atrCompress,
    higherLows,
    closeUpper,
    alreadyRan,
    buyTape,
    htfUp,
    invalidationPrice: inv,
    tags,
    candleScore,
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function gradePreSurge(tickerScore: number, read: PreSurgeCandleRead | null): PreSurgeGrade {
  const s = tickerScore + (read?.candleScore ?? 0);
  const ran = read?.alreadyRan === true;
  if (ran) return 'C';
  const strong =
    !!read &&
    read.atrCompress <= 0.85 &&
    read.volExpand >= 1.25 &&
    (read.higherLows || read.closeUpper) &&
    read.htfUp !== false;
  if (strong && s >= 70) return 'A';
  if (s >= 52 && read && !ran) return 'B';
  return 'C';
}

export function mergePreSurgeCandleIntoRow(
  row: SurgeCoinRow,
  read: PreSurgeCandleRead | null
): SurgeCoinRow {
  const grade = gradePreSurge(row.score, read);
  const tags = [...(row.tags || [])];
  if (read) {
    for (const t of read.tags) {
      if (!tags.includes(t)) tags.push(t);
    }
  }
  const inv =
    read && read.invalidationPrice > 0
      ? `무효≈${read.invalidationPrice >= 1 ? read.invalidationPrice.toFixed(4) : read.invalidationPrice.toPrecision(4)} 종가이탈`
      : row.invalidationKo;
  const extra = read
    ? ` · 15m거래량×${read.volExpand.toFixed(1)}${read.htfUp === true ? ' · 1h위' : read.htfUp === false ? ' · 1h아래' : ''}`
    : '';
  const noteKo = `${row.noteKo}${extra} · ${grade}등급`.replace(/\s+/g, ' ').trim();
  return {
    ...row,
    score: row.score + (read?.candleScore ?? 0),
    grade,
    tags,
    volExpand: read?.volExpand,
    invalidationKo: inv,
    tfHintKo: read?.htfUp === true ? '1h 정배열 쪽' : read?.htfUp === false ? '1h 약함·대기' : row.tfHintKo,
    noteKo,
  };
}
