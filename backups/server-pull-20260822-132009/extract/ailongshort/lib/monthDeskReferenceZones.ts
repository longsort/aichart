import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';

export type MonthDeskReferenceZoneKey = 'shortCover' | 'shortReaction' | 'fvgSupply';

export type MonthDeskReferenceZoneItem = {
  key: MonthDeskReferenceZoneKey;
  titleKo: string;
  subtitleKo: string;
  priceLow: number | null;
  priceHigh: number | null;
  noteKo: string;
  active: boolean;
  color: string;
  overlayId?: string;
};

function n(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

function candlePriceRange(candles: Candle[] | undefined): { minP: number; maxP: number } | null {
  if (!candles?.length) return null;
  let minP = Infinity;
  let maxP = -Infinity;
  for (const c of candles) {
    if (!Number.isFinite(c.low) || !Number.isFinite(c.high)) continue;
    minP = Math.min(minP, c.low);
    maxP = Math.max(maxP, c.high);
  }
  if (!Number.isFinite(minP) || !Number.isFinite(maxP) || maxP <= minP) return null;
  return { minP, maxP };
}

function pricesFromYPair(y1: number, y2: number, minP: number, maxP: number): { low: number; high: number } | null {
  const range = maxP - minP;
  if (range <= 0) return null;
  const pAt = (y: number) => maxP - y * range;
  const p1 = pAt(y1);
  const p2 = pAt(y2);
  return { low: Math.min(p1, p2), high: Math.max(p1, p2) };
}

function pricesFromOverlay(o: OverlayItem, minP: number, maxP: number): { low: number; high: number } | null {
  const p1 = n(o.price1);
  const p2 = n(o.price2);
  if (p1 != null && p2 != null) {
    return { low: Math.min(p1, p2), high: Math.max(p1, p2) };
  }
  const y1 = n(o.y1);
  const y2 = n(o.y2);
  if (y1 != null && y2 != null) return pricesFromYPair(y1, y2, minP, maxP);
  return null;
}

function fmtPx(v: number): string {
  return v >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : v.toFixed(2);
}

function fmtBand(low: number | null, high: number | null): string {
  if (low == null || high == null) return '—';
  if (Math.abs(low - high) < 1e-9) return fmtPx(low);
  return `${fmtPx(low)} ~ ${fmtPx(high)}`;
}

function findOverlayBand(
  overlays: OverlayItem[],
  candles: Candle[] | null,
  match: (o: OverlayItem) => boolean,
): { low: number; high: number; overlayId: string; label: string } | null {
  const range = candlePriceRange(candles ?? undefined);
  if (!range) return null;
  const { minP, maxP } = range;
  for (const o of overlays) {
    if (!match(o)) continue;
    const pr = pricesFromOverlay(o, minP, maxP);
    if (!pr) continue;
    return {
      low: pr.low,
      high: pr.high,
      overlayId: String(o.id || ''),
      label: String(o.label || ''),
    };
  }
  return null;
}

function buildShortCoverItem(rsiLast: number | null): MonthDeskReferenceZoneItem {
  const active = rsiLast != null && rsiLast <= 30;
  const note =
    rsiLast == null
      ? 'RSI 데이터 없음 — 차트 TF 재로드 후 확인.'
      : rsiLast <= 30
        ? `RSI(14)≈${rsiLast.toFixed(1)} — 하단권(반등·숏 커버 참고). 즉시 숏 추격은 리스크.`
        : rsiLast >= 70
          ? `RSI(14)≈${rsiLast.toFixed(1)} — 상단권(추격·신규 롱 리스크 참고).`
          : `RSI(14)≈${rsiLast.toFixed(1)} — 중립~완만. 과매도(≤30) 구간에서 숏 커버·반등 참고가 강해집니다.`;

  return {
    key: 'shortCover',
    titleKo: '숏 커버 참고',
    subtitleKo: 'RSI 하단권 · 반등 감시',
    priceLow: null,
    priceHigh: null,
    noteKo: note,
    active,
    color: active ? '#67e8f9' : '#64748b',
  };
}

/**
 * 마감·안착 핵심 보드용 — 차트 토글과 무관하게 분석 스냅샷에서 참고 구간을 뽑습니다.
 * (숏 커버 RSI · 노랑 반응저항 · 타입옴 FVG 공급)
 */
export function buildMonthDeskReferenceZones(
  analysis: AnalyzeResponse | null,
  candles: Candle[] | null,
): MonthDeskReferenceZoneItem[] {
  const rsiArr = analysis?.indicators?.rsi;
  const rsiLast = rsiArr?.length ? rsiArr[rsiArr.length - 1] : null;
  const overlays = (analysis?.overlays ?? []) as OverlayItem[];

  const reaction = findOverlayBand(overlays, candles, (o) => {
    const id = String(o.id || '');
    return id === 'reaction-zone-resistance' || (o.kind === 'reactionZone' && id.includes('resistance'));
  });

  const fvgSupply = findOverlayBand(overlays, candles, (o) => {
    const id = String(o.id || '');
    const label = String(o.label || '');
    if (id === 'month-desk-typeom-fvg-zone' && label.includes('공급')) return true;
    if (label.includes('FVG·공급')) return true;
    if (id.includes('fvg') && o.kind === 'supplyZone') return true;
    return false;
  });

  const close = n(analysis?.currentPrice) ?? (candles?.length ? candles[candles.length - 1].close : null);

  const shortReactionNote = reaction
    ? close != null && close >= reaction.low && close <= reaction.high
      ? '현재가가 반응 저항대 안 — 숏 우선·되돌림 관찰 구간(참고).'
      : close != null && close < reaction.high
        ? '상방 반응 저항대 — 되돌림·리테스트 시 숏 우선 참고.'
        : '반응 저항대 — 차트 노랑 ZONE과 동일 id.'
    : '분석에 반응 저항 오버레이 없음 — 차트 탭 · ⚙ 반응구간 ON 확인.';

  const fvgNote = fvgSupply
    ? '3캔들 FVG가 타점 존과 겹침 — 유동성·재진입 참고(확정 아님).'
    : '타입옴 FVG 공급 박스 없음 — 차트 탭 · ⚙ 타입옴 ON · 마감존 겹침 필요.';

  return [
    buildShortCoverItem(rsiLast),
    {
      key: 'shortReaction',
      titleKo: '숏 우선 반응대',
      subtitleKo: reaction?.label || '노랑 ZONE · 반응구간(저항)',
      priceLow: reaction?.low ?? null,
      priceHigh: reaction?.high ?? null,
      noteKo: shortReactionNote,
      active: Boolean(reaction),
      color: '#facc15',
      overlayId: reaction?.overlayId,
    },
    {
      key: 'fvgSupply',
      titleKo: 'FVG · 공급(참고)',
      subtitleKo: fvgSupply?.label || '타입옴 · 3캔들 갭',
      priceLow: fvgSupply?.low ?? null,
      priceHigh: fvgSupply?.high ?? null,
      noteKo: fvgNote,
      active: Boolean(fvgSupply),
      color: '#f472b6',
      overlayId: fvgSupply?.overlayId,
    },
  ];
}

export function formatReferenceZoneBand(item: MonthDeskReferenceZoneItem): string {
  return fmtBand(item.priceLow, item.priceHigh);
}
