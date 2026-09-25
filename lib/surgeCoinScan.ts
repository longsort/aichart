/**
 * 현물 USDT 급등 스캔 — 24h 변동·거래량. 승률·수익 보장 아님.
 * 분석은 기존 `/api/analyze` · 통합·분석 데스크에 심볼만 넘긴다.
 */

export const OPEN_SURGE_DESK_EVENT = 'ailongshort-open-surge-desk';

export type SurgeCoinRow = {
  symbol: string;
  base: string;
  last: number;
  changePct24h: number;
  /** 알트% − BTC% (상대강도) */
  vsBtcPct: number;
  quoteVolUsdt: number;
  high24h: number;
  low24h: number;
  score: number;
  noteKo: string;
  grade?: 'A' | 'B' | 'C';
  tags?: string[];
  rangePct?: number;
  volExpand?: number;
  invalidationKo?: string;
  tfHintKo?: string;
};

export type SurgeCoinScanPack = {
  rows: SurgeCoinRow[];
  btcChangePct: number;
  source: 'binance' | 'bybit';
  scanned: number;
  summaryKo: string;
  at: number;
  mode?: 'surge' | 'pre';
};

export type SurgeRawTicker = {
  symbol: string;
  last: number;
  changePct: number;
  quoteVol: number;
  high: number;
  low: number;
  tradeCount?: number;
  openPrice?: number;
  weightedAvg?: number;
};

const PRE_SKIP = new Set(['BTCUSDT', 'ETHUSDT']);

const STABLE = new Set([
  'USDCUSDT',
  'FDUSDUSDT',
  'TUSDUSDT',
  'DAIUSDT',
  'EURUSDT',
  'USDPUSDT',
  'AEURUSDT',
  'BFUSDUSDT',
  'EURIUSDT',
]);

const LEVER_RE = /(UP|DOWN|BULL|BEAR)$/;

export function isSurgeScanSpotUsdt(symbol: string): boolean {
  const s = String(symbol || '').toUpperCase();
  if (!s.endsWith('USDT') || s.length < 6) return false;
  if (STABLE.has(s)) return false;
  if (LEVER_RE.test(s.replace(/USDT$/, ''))) return false;
  return true;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function volScore(quoteVol: number): number {
  if (!(quoteVol > 0)) return 0;
  return clamp01(Math.log10(quoteVol / 1e6) / 3.2);
}

export function scoreSurgeRow(changePct: number, vsBtc: number, quoteVol: number): number {
  return changePct * 0.55 + vsBtc * 0.22 + volScore(quoteVol) * 18;
}

export function surgeNoteKo(changePct: number, vsBtc: number, quoteVol: number): string {
  const bits: string[] = [];
  if (changePct >= 20) bits.push('급등 큼·추격 주의');
  else if (changePct >= 8) bits.push('당일 강세');
  else bits.push('소폭 상승');
  if (vsBtc >= 5) bits.push('BTC대비 강함');
  else if (vsBtc <= -2) bits.push('BTC만 못함');
  if (quoteVol < 8e6) bits.push('유동성 얇음');
  bits.push('상위TF·무효화 확인');
  return bits.join(' · ');
}

export function rankSurgeTickers(
  raw: SurgeRawTicker[],
  opts?: { limit?: number; minQuoteVol?: number }
): SurgeCoinScanPack {
  const limit = Math.min(40, Math.max(5, opts?.limit ?? 20));
  const minQ = Math.max(0, opts?.minQuoteVol ?? 3_000_000);
  const btc = raw.find((r) => r.symbol === 'BTCUSDT');
  const btcPct = Number.isFinite(btc?.changePct) ? Number(btc!.changePct) : 0;

  const scored: SurgeCoinRow[] = [];
  for (const r of raw) {
    if (!isSurgeScanSpotUsdt(r.symbol)) continue;
    if (!(r.quoteVol >= minQ)) continue;
    if (!(r.changePct > 0)) continue;
    const vs = r.changePct - btcPct;
    const score = scoreSurgeRow(r.changePct, vs, r.quoteVol);
    const base = r.symbol.replace(/USDT$/, '');
    scored.push({
      symbol: r.symbol,
      base,
      last: r.last,
      changePct24h: r.changePct,
      vsBtcPct: vs,
      quoteVolUsdt: r.quoteVol,
      high24h: r.high,
      low24h: r.low,
      score,
      noteKo: surgeNoteKo(r.changePct, vs, r.quoteVol),
    });
  }
  scored.sort((a, b) => b.score - a.score || b.changePct24h - a.changePct24h);
  const rows = scored.slice(0, limit);
  return {
    rows,
    btcChangePct: btcPct,
    source: 'binance',
    scanned: scored.length,
    summaryKo: `급등 ${rows.length}종 · 스캔 ${scored.length} · BTC 24h ${btcPct >= 0 ? '+' : ''}${btcPct.toFixed(1)}% · 참고(추격·무효화)`,
    at: Date.now(),
  };
}

export function preSurgeNoteKo(
  changePct: number,
  rangePct: number,
  vsBtc: number,
  posInRange: number,
  tags: string[]
): string {
  const bits: string[] = ['급등전 후보(확정 아님)'];
  if (tags.length) bits.push(tags.slice(0, 4).join('·'));
  else {
    if (rangePct <= 4) bits.push('변동 압축');
    else if (rangePct <= 8) bits.push('박스 좁음');
    if (posInRange >= 0.7) bits.push('고가권 대기');
    if (changePct >= 0 && changePct < 6) bits.push('아직 안 뜀');
    if (vsBtc >= 1) bits.push('BTC대비 강함');
  }
  bits.push('상위TF·무효화 확인');
  return bits.join(' · ');
}

/** 티커 1차 — 넓게 뽑고 봉 2차에서 걸러냄 */
export function rankPreSurgeTickers(
  raw: SurgeRawTicker[],
  opts?: { limit?: number; minQuoteVol?: number }
): SurgeCoinScanPack {
  const limit = Math.min(40, Math.max(4, opts?.limit ?? 24));
  const minQ = Math.max(0, opts?.minQuoteVol ?? 4_000_000);
  const btc = raw.find((r) => r.symbol === 'BTCUSDT');
  const btcPct = Number.isFinite(btc?.changePct) ? Number(btc!.changePct) : 0;

  const scored: SurgeCoinRow[] = [];
  for (const r of raw) {
    if (!isSurgeScanSpotUsdt(r.symbol)) continue;
    if (PRE_SKIP.has(r.symbol)) continue;
    if (!(r.quoteVol >= minQ)) continue;
    if (!(r.last > 0) || !(r.high > 0) || !(r.low > 0)) continue;
    if (r.changePct > 12 || r.changePct < -4) continue;
    const range = r.high - r.low;
    if (!(range > 0)) continue;
    const rangePct = (range / r.last) * 100;
    if (rangePct > 18) continue;
    const posInRange = (r.last - r.low) / range;
    if (posInRange < 0.28 || posInRange > 0.995) continue;
    const vs = r.changePct - btcPct;
    const compress = 1 / (1 + rangePct / 3.2);
    const volS = volScore(r.quoteVol);
    const nearBreak = posInRange >= 0.55 ? posInRange : posInRange * 0.45;
    const mild =
      r.changePct >= 0.3 && r.changePct <= 8 ? 1 : r.changePct >= -1.5 && r.changePct < 0.3 ? 0.55 : 0.22;
    const trades = Number(r.tradeCount);
    const tradeS = Number.isFinite(trades) && trades > 0 ? clamp01(Math.log10(trades / 800) / 2.4) : 0.35;
    const vwap = Number(r.weightedAvg);
    const vwapS = vwap > 0 && r.last >= vwap ? 1 : vwap > 0 ? 0.35 : 0.55;
    const openP = Number(r.openPrice);
    const dayGreen = openP > 0 && r.last >= openP ? 1 : 0.4;
    const tags: string[] = [];
    if (rangePct <= 5) tags.push('24h압축');
    if (posInRange >= 0.68) tags.push('고가권');
    if (vs >= 1) tags.push('BTC대비강');
    if (vwap > 0 && r.last >= vwap) tags.push('VWAP위');
    const score =
      compress * 36 +
      volS * 22 +
      nearBreak * 14 +
      mild * 9 +
      Math.max(0, vs) * 0.4 +
      tradeS * 8 +
      vwapS * 7 +
      dayGreen * 5;
    scored.push({
      symbol: r.symbol,
      base: r.symbol.replace(/USDT$/, ''),
      last: r.last,
      changePct24h: r.changePct,
      vsBtcPct: vs,
      quoteVolUsdt: r.quoteVol,
      high24h: r.high,
      low24h: r.low,
      score,
      rangePct,
      tags,
      invalidationKo: `무효≈당일저 ${r.low >= 1 ? r.low.toFixed(4) : r.low.toPrecision(4)} 종가이탈`,
      noteKo: preSurgeNoteKo(r.changePct, rangePct, vs, posInRange, tags),
    });
  }
  scored.sort((a, b) => b.score - a.score);
  const rows = scored.slice(0, limit);
  return {
    rows,
    btcChangePct: btcPct,
    source: 'binance',
    scanned: scored.length,
    summaryKo: `급등전 1차 ${rows.length}/${scored.length} · BTC ${btcPct >= 0 ? '+' : ''}${btcPct.toFixed(1)}% · 봉검증 전`,
    at: Date.now(),
    mode: 'pre',
  };
}

export function parseBinance24hTickers(j: unknown): SurgeRawTicker[] {
  const arr = Array.isArray(j) ? j : [];
  const out: SurgeRawTicker[] = [];
  for (const row of arr) {
    const rec = row as Record<string, unknown>;
    const symbol = String(rec.symbol || '').toUpperCase();
    const last = Number(rec.lastPrice);
    const changePct = Number(rec.priceChangePercent);
    const quoteVol = Number(rec.quoteVolume);
    const high = Number(rec.highPrice);
    const low = Number(rec.lowPrice);
    const tradeCount = Number(rec.count);
    const openPrice = Number(rec.openPrice);
    const weightedAvg = Number(rec.weightedAvgPrice);
    if (!symbol || !Number.isFinite(last) || last <= 0) continue;
    if (!Number.isFinite(changePct) || !Number.isFinite(quoteVol)) continue;
    out.push({
      symbol,
      last,
      changePct,
      quoteVol,
      high: Number.isFinite(high) ? high : last,
      low: Number.isFinite(low) ? low : last,
      tradeCount: Number.isFinite(tradeCount) ? tradeCount : undefined,
      openPrice: Number.isFinite(openPrice) && openPrice > 0 ? openPrice : undefined,
      weightedAvg: Number.isFinite(weightedAvg) && weightedAvg > 0 ? weightedAvg : undefined,
    });
  }
  return out;
}

export function parseBybitSpotTickers(j: unknown): SurgeRawTicker[] {
  const list = (j as { result?: { list?: unknown[] } })?.result?.list;
  if (!Array.isArray(list)) return [];
  const out: SurgeRawTicker[] = [];
  for (const row of list) {
    const rec = row as Record<string, unknown>;
    const symbol = String(rec.symbol || '').toUpperCase();
    const last = Number(rec.lastPrice);
    const pc = Number(rec.price24hPcnt);
    const changePct = Number.isFinite(pc) ? pc * 100 : Number.NaN;
    const quoteVol = Number(rec.turnover24h);
    const high = Number(rec.highPrice24h);
    const low = Number(rec.lowPrice24h);
    if (!symbol || !Number.isFinite(last) || last <= 0) continue;
    if (!Number.isFinite(changePct) || !Number.isFinite(quoteVol)) continue;
    out.push({
      symbol,
      last,
      changePct,
      quoteVol,
      high: Number.isFinite(high) ? high : last,
      low: Number.isFinite(low) ? low : last,
    });
  }
  return out;
}
