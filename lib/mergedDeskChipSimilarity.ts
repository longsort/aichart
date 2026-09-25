/**
 * 통합·분석 차트 칩(알약) — 현재 봉·가격과 제일 비슷한 상위 3개.
 * 승률·수익 보장 아님. 도식 줄이 아니라 칩 자체에 표시.
 */
import type { Candle, OverlayItem } from '@/types';

export type ChipSimRank = 1 | 2 | 3;

const CHIP_LABEL_RE =
  /돌파확정|확실한안착|실패|핵심돌파|핵심안착|AI채널|채널면|채널하단|채널 하단|매수면|매도면|Hot지지|Hot저항|Hot존|선포착지지|\$\$\$\$|단기상승|게이트|저가갱신|고가갱신|중심박스|중요박스|카탈로그/;

export function isMergedDeskSimilarityChip(o: OverlayItem): boolean {
  const extra = String(o.overlayZoneExtraClass || '');
  const lab = `${String((o as OverlayItem).zoneFaceBase || '')} ${String(o.label || '')}`;
  if (
    extra.includes('merged-desk-pill-zone') ||
    extra.includes('merged-desk-hotzone-entry') ||
    extra.includes('merged-desk-hotzone-zone') ||
    extra.includes('merged-desk-precapture-zone') ||
    extra.includes('merged-hq-entry-zone') ||
    extra.includes('merged-desk-money-zone-keep') ||
    extra.includes('merged-desk-rb-ai-face') ||
    extra.includes('merged-desk-rb-ai-edge') ||
    extra.includes('merged-desk-rb-core-break') ||
    extra.includes('merged-desk-rb-core--hot') ||
    extra.includes('merged-desk-asset-catalog') ||
    extra.includes('merged-desk-asset-auto-zone')
  ) {
    return true;
  }
  return CHIP_LABEL_RE.test(lab);
}

export function chipSimBadgeText(rank: ChipSimRank): string {
  return `유${rank}`;
}

function atr14(candles: Candle[]): number {
  const n = candles.length;
  const lastClose = Number(candles[n - 1]?.close);
  const floor = Number.isFinite(lastClose) && lastClose > 0 ? lastClose * 0.002 : 1e-8;
  if (n < 3) return Math.max(floor, 1e-8);
  let sum = 0;
  let cnt = 0;
  const start = Math.max(1, n - 14);
  for (let i = start; i < n; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    cnt += 1;
  }
  return Math.max(sum / Math.max(cnt, 1), floor, 1e-8);
}

function chipBand(o: OverlayItem): { lo: number; hi: number; mid: number } | null {
  const a = Number(o.price1);
  const b = Number(o.price2);
  if (Number.isFinite(a) && a > 0 && Number.isFinite(b) && b > 0) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return { lo, hi, mid: (lo + hi) / 2 };
  }
  if (Number.isFinite(a) && a > 0) return { lo: a, hi: a, mid: a };
  if (Number.isFinite(b) && b > 0) return { lo: b, hi: b, mid: b };
  return null;
}

function chipSide(lab: string, extra: string): 'LONG' | 'SHORT' | 'FLAT' {
  if (
    extra.includes('hotzone-signal--short') ||
    extra.includes('overlay-zone--asset-auto-short') ||
    /숏|저항|매도|short|supply|sell/i.test(lab)
  ) {
    return 'SHORT';
  }
  if (
    extra.includes('hotzone-signal--long') ||
    extra.includes('overlay-zone--asset-auto-long') ||
    /롱|지지|매수|long|demand|buy/i.test(lab)
  ) {
    return 'LONG';
  }
  return 'FLAT';
}

function captionFamily(lab: string): string {
  return lab
    .replace(/[★☆◆▲▼·･$]/g, '')
    .replace(/[\d.,\s\-_/]+/g, '')
    .slice(0, 18);
}

function scoreChip(o: OverlayItem, last: Candle, atr: number): number {
  const band = chipBand(o);
  if (!band) return -1;
  const lastClose = Number(last.close);
  if (!(lastClose > 0)) return -1;

  const extra = String(o.overlayZoneExtraClass || '');
  const lab = `${String(o.zoneFaceBase || '')} ${String(o.label || '')}`;
  const inside = lastClose >= band.lo && lastClose <= band.hi;
  const dist = inside ? 0 : Math.min(Math.abs(lastClose - band.lo), Math.abs(lastClose - band.hi));
  const prox = 1 / (1 + dist / atr);

  const confRaw = Number(o.confidence);
  const conf = Number.isFinite(confRaw) ? Math.max(0, Math.min(1, confRaw / 100)) : 0.45;

  const bullish = last.close >= last.open;
  const side = chipSide(lab, extra);
  let bias = 0.5;
  if (side === 'LONG') bias = bullish ? 1 : 0.25;
  else if (side === 'SHORT') bias = bullish ? 0.25 : 1;

  let sit = 0;
  const barRange = Math.max(last.high - last.low, atr * 0.2);
  if (/저가갱신/.test(lab) && lastClose <= last.low + barRange * 0.28) sit += 0.12;
  if (/고가갱신/.test(lab) && lastClose >= last.high - barRange * 0.28) sit += 0.12;
  if (/돌파전대기|돌파대기|안착/.test(lab)) sit += 0.08;
  if (/중심박스|중요박스/.test(lab)) sit += 0.06;
  const money = lab.match(/\$\$\$\$(?:롱|숏)?[·･\s-]*(\d{1,2})/);
  if (money) sit += Math.min(0.14, Number(money[1]) / 220);
  const tip = String(o.labelTooltip || '');
  const tipPct = tip.match(/점수\s+(\d{1,3})%/);
  if (tipPct) sit += Math.min(0.12, Number(tipPct[1]) / 500);

  return prox * 0.52 + conf * 0.24 + bias * 0.14 + sit;
}

/** 보이는 칩 중 현재 자리와 제일 비슷한 1~3위 id → 순위 */
export function rankMergedDeskSimilarChips(
  overlays: OverlayItem[],
  candles: Candle[],
  topN = 3
): Map<string, ChipSimRank> {
  const out = new Map<string, ChipSimRank>();
  if (!Array.isArray(overlays) || overlays.length === 0 || candles.length < 1) return out;
  const last = candles[candles.length - 1]!;
  const atr = atr14(candles);

  const scored: { id: string; score: number; family: string }[] = [];
  for (const o of overlays) {
    if (!o?.id || !isMergedDeskSimilarityChip(o)) continue;
    const score = scoreChip(o, last, atr);
    if (!(score > 0)) continue;
    const lab = `${String(o.zoneFaceBase || '')} ${String(o.label || '')}`;
    scored.push({ id: String(o.id), score, family: captionFamily(lab) });
  }
  scored.sort((a, b) => b.score - a.score);

  const usedFamily = new Set<string>();
  let rank = 1 as number;
  for (const row of scored) {
    if (rank > topN) break;
    if (row.family && usedFamily.has(row.family)) continue;
    if (row.family) usedFamily.add(row.family);
    out.set(row.id, rank as ChipSimRank);
    rank += 1;
  }
  return out;
}
