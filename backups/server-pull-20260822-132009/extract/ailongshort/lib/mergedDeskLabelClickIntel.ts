/**
 * 차트 라벨 클릭 — 지지 가능·거래량 양호 참고 데이터.
 * 확정 수익·승률 아님. 카드/HUD 아님(클릭 팝업용).
 */
import type { Candle, OverlayItem } from '@/types';
import { estimateBarBuySell } from '@/lib/volumeDirectionStats';
import { smaTotalVolumeAt } from '@/lib/volumeHistogramIntelligence';

export type MergedDeskLabelClickIntel = {
  titleKo: string;
  holdKo: string;
  volKo: string;
  lineKo: string;
  holdScore: number;
  volScore: number;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function fmtPx(n: number): string {
  if (!(n > 0) || !Number.isFinite(n)) return '—';
  if (n >= 1000) return n.toFixed(0);
  if (n >= 1) return n.toFixed(1);
  return n.toFixed(4);
}

function bandOf(o: OverlayItem): { lo: number; hi: number; mid: number } | null {
  const p1 = Number(o.price1);
  const p2 = Number(o.price2);
  if (Number.isFinite(p1) && p1 > 0 && Number.isFinite(p2) && p2 > 0 && p1 !== p2) {
    const lo = Math.min(p1, p2);
    const hi = Math.max(p1, p2);
    return { lo, hi, mid: (lo + hi) / 2 };
  }
  if (Number.isFinite(p1) && p1 > 0) {
    const pad = p1 * 0.0012;
    return { lo: p1 - pad, hi: p1 + pad, mid: p1 };
  }
  return null;
}

function inferSide(o: OverlayItem): 'demand' | 'supply' | 'mid' {
  const kind = String(o.kind || '');
  const lab = `${o.label || ''} ${o.zoneFaceBase || ''} ${o.id || ''}`.toLowerCase();
  if (
    kind === 'demandZone' ||
    /지지|demand|롱|매수|buy|bounce|반등|1차↓|2차반등/.test(lab)
  ) {
    return 'demand';
  }
  if (
    kind === 'supplyZone' ||
    /저항|supply|숏|매도|sell|dump|하락|1차↑|2차하락/.test(lab)
  ) {
    return 'supply';
  }
  return 'mid';
}

function rvolAt(rows: Candle[], i: number, period = 20): number | null {
  if (i < period - 1) return null;
  const sma = smaTotalVolumeAt(rows, i, period);
  const v = Math.max(0, Number(rows[i]?.volume) || 0);
  if (!(sma > 0)) return null;
  return v / sma;
}

export function buildMergedDeskLabelClickIntel(params: {
  overlay: OverlayItem;
  candles: Candle[];
  lastPrice?: number | null;
}): MergedDeskLabelClickIntel {
  const o = params.overlay;
  const rows = params.candles;
  const n = rows.length;
  const last = n ? rows[n - 1]! : null;
  const px =
    Number(params.lastPrice) > 0
      ? Number(params.lastPrice)
      : last
        ? Number(last.close)
        : 0;
  const titleKo = String(o.label || o.zoneFaceBase || o.id || '라벨').trim().slice(0, 28) || '라벨';
  const band = bandOf(o);
  const side = inferSide(o);

  if (!band || n < 8 || !(px > 0)) {
    return {
      titleKo,
      holdKo: '판단불가',
      volKo: '데이터부족',
      lineKo: `${titleKo}\n지지·거래량: 캔들/가격 부족 · 참고 불가`,
      holdScore: 0,
      volScore: 0,
    };
  }

  const width = Math.max(band.hi - band.lo, band.mid * 0.0008);
  const dist = px < band.lo ? band.lo - px : px > band.hi ? px - band.hi : 0;
  const distPct = (dist / px) * 100;
  const inside = dist <= 0;

  let touches = 0;
  let holdBounces = 0;
  let failBreaks = 0;
  let nearVol = 0;
  let nearBuy = 0;
  let nearBars = 0;
  let nearRvolSum = 0;
  let nearRvolN = 0;
  const look = Math.min(n, 48);
  for (let i = n - look; i < n; i++) {
    const c = rows[i]!;
    const lo = Number(c.low);
    const hi = Number(c.high);
    const cl = Number(c.close);
    if (![lo, hi, cl].every((x) => Number.isFinite(x) && x > 0)) continue;
    const hit = hi >= band.lo && lo <= band.hi;
    if (!hit) continue;
    touches += 1;
    const sp = estimateBarBuySell(c);
    nearVol += Math.max(0, Number(c.volume) || 0);
    nearBuy += sp.buyVol;
    nearBars += 1;
    const rv = rvolAt(rows, i);
    if (rv != null) {
      nearRvolSum += rv;
      nearRvolN += 1;
    }
    if (side === 'demand') {
      if (cl > band.mid) holdBounces += 1;
      if (cl < band.lo - width * 0.15) failBreaks += 1;
    } else if (side === 'supply') {
      if (cl < band.mid) holdBounces += 1;
      if (cl > band.hi + width * 0.15) failBreaks += 1;
    }
  }

  const lastRv = n ? rvolAt(rows, n - 1) : null;
  const lastSp = last ? estimateBarBuySell(last) : null;
  const avgRv = nearRvolN > 0 ? nearRvolSum / nearRvolN : lastRv;
  const buyPct = nearVol > 0 ? nearBuy / nearVol : lastSp?.buyPct ?? 0.5;

  let volScore = 40;
  if (avgRv != null) {
    if (avgRv >= 1.55) volScore += 28;
    else if (avgRv >= 1.2) volScore += 18;
    else if (avgRv >= 0.9) volScore += 8;
    else volScore -= 12;
  }
  if (side === 'demand' && buyPct >= 0.56) volScore += 14;
  else if (side === 'supply' && buyPct <= 0.44) volScore += 14;
  else if (Math.abs(buyPct - 0.5) < 0.06) volScore -= 4;
  volScore = clamp(Math.round(volScore), 0, 100);

  let holdScore = 36;
  if (inside) holdScore += 16;
  else if (distPct <= 0.35) holdScore += 10;
  else if (distPct <= 0.9) holdScore += 4;
  else holdScore -= 18;
  if (touches >= 2) holdScore += 12;
  else if (touches === 1) holdScore += 5;
  holdScore += Math.min(18, holdBounces * 6);
  holdScore -= Math.min(24, failBreaks * 10);
  if (volScore >= 70) holdScore += 8;
  if (volScore < 40) holdScore -= 8;
  holdScore = clamp(Math.round(holdScore), 0, 100);

  const holdKo =
    failBreaks >= 2
      ? '지지약함·이탈흔적'
      : holdScore >= 72
        ? side === 'supply'
          ? '저항유효참고'
          : '지지가능참고'
        : holdScore >= 52
          ? side === 'supply'
            ? '저항보통'
            : '지지보통'
          : distPct > 1.2
            ? '거리멀음·관망'
            : '지지불확실';

  const volKo =
    volScore >= 72 ? '거래량좋음' : volScore >= 50 ? '거래량보통' : '거래량약함';

  const roleKo = side === 'demand' ? '수요/지지' : side === 'supply' ? '공급/저항' : '중간대';
  const invKo =
    side === 'demand'
      ? `무효참고: 종가 ${fmtPx(band.lo)} 아래`
      : side === 'supply'
        ? `무효참고: 종가 ${fmtPx(band.hi)} 위`
        : `구간 ${fmtPx(band.lo)}~${fmtPx(band.hi)}`;

  const lineKo = [
    `${titleKo} · ${roleKo}`,
    `지지: ${holdKo} (${holdScore}) · 지금가 ${fmtPx(px)} · 구간 ${fmtPx(band.lo)}~${fmtPx(band.hi)}`,
    inside ? '가격 구간 안' : `거리 ${distPct.toFixed(2)}%`,
    `터치 ${touches} · 반응 ${holdBounces} · 이탈 ${failBreaks}`,
    `거래량: ${volKo} (${volScore}) · RVOL ${avgRv != null ? avgRv.toFixed(2) : '—'} · 매수 ${(buyPct * 100).toFixed(0)}%`,
    lastRv != null ? `마지막봉 RVOL ${lastRv.toFixed(2)} · 매수 ${((lastSp?.buyPct ?? 0) * 100).toFixed(0)}%` : null,
    invKo,
    '참고용 · 확정 아님 · 상위TF 함께 볼 것',
  ]
    .filter(Boolean)
    .join('\n');

  return { titleKo, holdKo, volKo, lineKo, holdScore, volScore };
}
