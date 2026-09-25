/**
 * 차트 스윙 ↔ 교재 도식: 자리 유사 + 국소 ZONE.
 * X=도식 핫스팟, Y=실제 가격을 도식 고저에 비율 투영. 확정 아님.
 */
import type { Candle } from '@/types';
import type { MergedDeskElliottRead } from '@/lib/mergedDeskElliottWave';
import type { MergedDeskWyckoffRead } from '@/lib/mergedDeskWyckoffCycle';
import {
  listSchoolHotspots,
  type ClickableSchool,
  type SchoolSchematicPin,
} from '@/lib/mergedDeskSchoolSchematicCatalog';
import { formatSchematicPrice, type SchematicSeatRole } from '@/lib/mergedDeskSchematicSeatPrice';
import {
  matchSchematicShape,
  schematicHotspotLabelKo,
  schematicSeatPhrase,
  type SchematicShapeHit,
} from '@/lib/mergedDeskSchematicShapeMatch';
import { tightenZoneBand, type PriceBand } from '@/lib/mergedDeskSchematicTightZone';
import { textbookNativeFaces } from '@/lib/mergedDeskSchematicNativeFaces';
import { buildSchematicSpotRoom, type SchematicSpotRoom } from '@/lib/mergedDeskSchematicSpotRoom';

export type SchematicVerdict = '빅롱' | '롱' | '숏' | '폭락' | '대기';

export type SchematicRatioPt = {
  x: number;
  y: number;
  /** 원본 도식 인쇄 라벨 중심. 없으면 x/y. */
  lx: number;
  ly: number;
  label: string;
  price: number;
  key?: string;
};

export type SchematicZoneBox = {
  left: number;
  top: number;
  width: number;
  height: number;
  lo: number;
  hi: number;
};

export type SchematicRatioOverlay = {
  plot: { left: number; top: number; width: number; height: number };
  /** 교재 핫스팟을 이은 전체 뼈대 (도식 선과 동일 좌표) */
  trail: SchematicRatioPt[];
  /** 시작→지금 자리까지 (도식 선 위) */
  path: SchematicRatioPt[];
  now: SchematicRatioPt;
  match: SchematicShapeHit | null;
  buyZone?: SchematicZoneBox;
  sellZone?: SchematicZoneBox;
  bounceY?: number;
  dumpY?: number;
  bounceTo?: number;
  dumpTo?: number;
  room?: SchematicSpotRoom & {
    upYNative?: number;
    downYNative?: number;
    upYMap?: number;
    downYMap?: number;
  };
  verdict: SchematicVerdict;
  verdictKo: string;
};

const PLOT = { left: 8, top: 12, width: 86, height: 76 };

function yOf(price: number, lo: number, hi: number): number {
  const span = hi - lo || 1;
  const t = Math.max(0, Math.min(1, (price - lo) / span));
  return PLOT.top + (1 - t) * PLOT.height;
}

export function resolveSchematicVerdict(
  pin: SchoolSchematicPin | null | undefined,
  elliott?: MergedDeskElliottRead | null,
  wyckoff?: MergedDeskWyckoffRead | null,
  lastPrice?: number
): SchematicVerdict {
  if (wyckoff?.macro === 'markup' || wyckoff?.event === 'SOS' || (wyckoff?.macro === 'accumulation' && wyckoff.phase === 'E')) {
    return '빅롱';
  }
  if (elliott?.bias === 'bullish' && elliott.extension === 'w3' && (elliott.wave === '3' || elliott.wave === '5')) {
    const L = elliott.levels;
    if (L?.p0 != null && L.p5 != null && lastPrice != null) {
      const pos = (lastPrice - L.p0) / Math.max(1e-9, L.p5 - L.p0);
      if (pos >= 0.72) return '빅롱';
    } else return '빅롱';
  }
  if (wyckoff?.macro === 'markdown' || elliott?.wave === 'C' || elliott?.wave === 'A') {
    if (elliott?.bias === 'bullish' && (elliott.wave === 'A' || elliott.wave === 'C')) return '폭락';
    if (elliott?.bias === 'bearish' && (elliott.wave === 'A' || elliott.wave === 'C')) return '롱';
    if (wyckoff?.macro === 'markdown') return '폭락';
  }
  const role = pin?.seatRole as SchematicSeatRole | undefined;
  if (role === 'pullback-long' || role === 'run-up') return '롱';
  if (role === 'rally-short') return '숏';
  if (role === 'run-down') return '폭락';
  if (pin?.seatSide === 'long') return '롱';
  if (pin?.seatSide === 'short') return '숏';
  return '대기';
}

function mapPriceToTop(price: number, loP: number, hiP: number, loTop: number, hiTop: number): number {
  const t = Math.max(0, Math.min(1, (price - loP) / (hiP - loP || 1)));
  return loTop + t * (hiTop - loTop);
}


export function buildSchematicRatioOverlay(params: {
  school?: ClickableSchool | null;
  figureId?: string;
  pin?: SchoolSchematicPin | null;
  elliott?: MergedDeskElliottRead | null;
  wyckoff?: MergedDeskWyckoffRead | null;
  candles?: Candle[];
  lastPrice?: number | null;
  buyBand?: PriceBand | null;
  sellBand?: PriceBand | null;
}): SchematicRatioOverlay | null {
  const last =
    Number.isFinite(params.lastPrice as number)
      ? Number(params.lastPrice)
      : params.candles?.length
        ? params.candles[params.candles.length - 1]!.close
        : params.pin?.eventPrice;
  if (!Number.isFinite(last)) return null;

  const school = params.school ?? params.pin?.school ?? null;
  const figureId = params.figureId ?? params.pin?.figureId ?? '';
  const match =
    school && figureId
      ? matchSchematicShape({
          school,
          figureId,
          candles: params.candles,
          pin: params.pin,
          elliott: params.elliott,
          wyckoff: params.wyckoff,
        })
      : null;

  const spots = school && figureId ? listSchoolHotspots(school, figureId) : [];
  const matchIdx = match
    ? spots.findIndex((s) => s.key === match.hotspotKey)
    : -1;
  const nowIdx = matchIdx >= 0 ? matchIdx : Math.max(0, spots.length - 1);
  const nowSpot = spots[nowIdx] ?? null;

  const trail: SchematicRatioPt[] = spots.map((s) => ({
    x: s.left,
    y: s.top,
    lx: s.lx ?? s.left,
    ly: s.ly ?? s.top,
    label: schematicHotspotLabelKo(s.key),
    price: last!,
    key: s.key,
  }));
  const path: SchematicRatioPt[] = trail.slice(0, nowIdx + 1);

  const pin = params.pin;
  const sellish =
    pin?.seatRole === 'rally-short' || (pin?.seatSide === 'short' && pin.seatRole !== 'run-down');
  const zLo = pin?.zoneLow;
  const zHi = pin?.zoneHigh;
  const pinBand = zLo != null && zHi != null && zHi > zLo ? { lo: zLo, hi: zHi } : null;

  const buyTight = tightenZoneBand({
    candles: params.candles,
    last: last!,
    side: 'buy',
    hot: params.buyBand,
    lo: !sellish ? pinBand?.lo : undefined,
    hi: !sellish ? pinBand?.hi : undefined,
  });
  const sellTight = tightenZoneBand({
    candles: params.candles,
    last: last!,
    side: 'sell',
    hot: params.sellBand,
    lo: sellish ? pinBand?.lo : undefined,
    hi: sellish ? pinBand?.hi : undefined,
  });

  const prices = [last!];
  if (buyTight) {
    prices.push(buyTight.lo, buyTight.hi);
  }
  if (sellTight) {
    prices.push(sellTight.lo, sellTight.hi);
  }
  if (pin?.bounceTo != null) prices.push(pin.bounceTo);
  if (pin?.dumpTo != null) prices.push(pin.dumpTo);
  const loP = Math.min(...prices);
  const hiP = Math.max(...prices);
  const pad = (hiP - loP) * 0.06 || Math.abs(last!) * 0.008;
  const yLo = loP - pad;
  const yHi = hiP + pad;
  const tbTops = spots.length ? spots.map((s) => s.top) : [78, 14];
  const loTop = Math.max(...tbTops);
  const hiTop = Math.min(...tbTops);
  const topOf = (price: number) => mapPriceToTop(price, yLo, yHi, loTop, hiTop);

  const now: SchematicRatioPt = {
    x: nowSpot?.left ?? match?.left ?? 88,
    y: nowSpot?.top ?? match?.top ?? 50,
    lx: nowSpot?.lx ?? nowSpot?.left ?? match?.left ?? 88,
    ly: nowSpot?.ly ?? nowSpot?.top ?? match?.top ?? 50,
    label: match ? schematicSeatPhrase(match.hotspotKey, match.score) : '지금',
    price: last!,
    key: match?.hotspotKey ?? nowSpot?.key,
  };

  const native = textbookNativeFaces(school, figureId);
  const buyZone = buyTight ? { ...native.buy, lo: buyTight.lo, hi: buyTight.hi } : undefined;
  const sellZone = sellTight ? { ...native.sell, lo: sellTight.lo, hi: sellTight.hi } : undefined;
  const baseRoom = buildSchematicSpotRoom({
    last: last!,
    pin,
    wyckoff: params.wyckoff,
    elliott: params.elliott,
    hotspotKey: match?.hotspotKey ?? nowSpot?.key,
  });
  const room = baseRoom
    ? {
        ...baseRoom,
        upYNative: native.sell.top + native.sell.height / 2,
        downYNative: native.buy.top + native.buy.height / 2,
        upYMap: baseRoom.up ? topOf(baseRoom.up.price) : undefined,
        downYMap: baseRoom.down ? topOf(baseRoom.down.price) : undefined,
      }
    : undefined;

  const verdict = resolveSchematicVerdict(pin, params.elliott, params.wyckoff, last);
  return {
    plot: PLOT,
    trail,
    path,
    now,
    match,
    buyZone,
    sellZone,
    bounceY: pin?.bounceTo != null ? topOf(pin.bounceTo) : undefined,
    dumpY: pin?.dumpTo != null ? topOf(pin.dumpTo) : undefined,
    bounceTo: pin?.bounceTo,
    dumpTo: pin?.dumpTo,
    room,
    verdictKo: match
      ? `${verdict} · ${match.similarKo} · ${formatSchematicPrice(last!)}`
      : `${verdict} · 지금 ${formatSchematicPrice(last!)}`,
  };
}
