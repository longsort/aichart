import type { AnalyzeResponse, Candle, OverlayItem, Verdict } from '@/types';
import type { SignalGrade, UnifiedSignalDirection } from '@/lib/unifiedSignalTypes';

/** 통합 트레이드 그래프 스냅샷 — 게이트·축 점수·판정 */
export type UnifiedGraphSnapshotInput = {
  verdict: Verdict;
  gatePassed: boolean;
  longOverall: number;
  shortOverall: number;
  edge: number;
  reason: string;
};

export type ZoneColorTier = 'red' | 'blue' | 'yellow';

export type TieredZone = {
  tier: ZoneColorTier;
  labelKo: string;
  overlayId: string;
  low: number;
  high: number;
  confidence: number;
};

export type SwingShortZonePlanResult = {
  active: boolean;
  currentPrice: number;
  /** 차트 박스와 동일 의미: 빨강(고래매도) · 파랑(반응 진입) · 노랑(반응 저항) */
  tiers: { red?: TieredZone; blue?: TieredZone; yellow?: TieredZone };
  missingTiers: ZoneColorTier[];
  zonesOrdered: TieredZone[];
  entry: number;
  stopLoss: number;
  takeProfits: Array<{ price: number; label: string }>;
  risk: number;
  rewardToTp1: number;
  rrTp1: number;
  /** 퓨전 L/S */
  fusionShortAligned: boolean;
  /** API 원판정 */
  snapshotVerdictShort: boolean;
  /** 통합 그래프가 숏 쪽인지 (게이트·축 점수) */
  unifiedGraphFavorsShort: boolean;
  /** 통합 게이트 통과 + 숏 우세 */
  unifiedGraphSwingOk: boolean;
  notes: string[];
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

/** 차트 세로비율 y → 가격 (analyze toRatio 와 역변환) */
function pricesFromYPair(y1: number, y2: number, minP: number, maxP: number): { low: number; high: number } | null {
  const range = maxP - minP;
  if (range <= 0) return null;
  const pAt = (y: number) => maxP - y * range;
  const p1 = pAt(y1);
  const p2 = pAt(y2);
  const low = Math.min(p1, p2);
  const high = Math.max(p1, p2);
  if (high <= 0 || low <= 0) return null;
  return { low, high };
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

/** 차트에서 쓰는 빨강/파랑/노랑 숏 박스와 id·색을 맞춤 */
function tierFromOverlay(o: OverlayItem): ZoneColorTier | null {
  const id = String(o.id || '');
  if (id.startsWith('strong-sell')) return 'red';
  if (id === 'reaction-zone-entry') return 'blue';
  if (id === 'reaction-zone-resistance') return 'yellow';
  const c = (o.color || '').toLowerCase();
  if (c.includes('234,179,8') || c.includes('234,179') || c.includes('eab308')) return 'yellow';
  if (c.includes('59,130,246') || c.includes('3b82f6')) return 'blue';
  if (c.includes('239,68,68') || c.includes('ef4444') || (o.kind === 'supplyZone' && o.category === 'strongZone')) return 'red';
  return null;
}

const TIER_META: Record<ZoneColorTier, { labelKo: string }> = {
  red: { labelKo: '빨강 ZONE · 고래·기관 매도(supply)' },
  blue: { labelKo: '파랑 ZONE · 반응구간(진입대)' },
  yellow: { labelKo: '노랑 ZONE · 반응구간(저항대)' },
};

function pickStronger(a: TieredZone | undefined, b: TieredZone): TieredZone {
  if (!a) return b;
  if (b.high > a.high) return b;
  if (b.high === a.high && b.confidence > a.confidence) return b;
  return a;
}

/**
 * 통합 트레이드 그래프(게이트·축 점수·판정)를 기준으로 유효성을 두고,
 * 차트 **빨강 / 파랑 / 노랑** 박스(고래매도·반응 진입·반응 저항)와 **동일 id**로 좌표를 맞춥니다.
 * 스윙 숏: 손절은 3개 ZONE 중 최고가 상단, 익절은 가격대 아래로 단계 배분.
 */
export function buildSwingShortZonePlan(
  analysis: AnalyzeResponse,
  fusion: { direction: UnifiedSignalDirection; grade: SignalGrade },
  graph: UnifiedGraphSnapshotInput,
): SwingShortZonePlanResult | null {
  const candles = (analysis as AnalyzeResponse & { candles?: Candle[] }).candles;
  const range = candlePriceRange(candles);
  const lastClose = candles?.length ? candles[candles.length - 1].close : null;
  const px = n(analysis.currentPrice) ?? lastClose;
  if (px == null || px <= 0) return null;
  if (!range) return null;

  const { minP, maxP } = range;
  const overlays = (analysis.overlays ?? []) as OverlayItem[];

  let red: TieredZone | undefined;
  let blue: TieredZone | undefined;
  let yellow: TieredZone | undefined;

  for (const o of overlays) {
    const tier = tierFromOverlay(o);
    if (!tier) continue;
    const pr = pricesFromOverlay(o, minP, maxP);
    if (!pr) continue;
    const tz: TieredZone = {
      tier,
      labelKo: TIER_META[tier].labelKo,
      overlayId: String(o.id),
      low: pr.low,
      high: pr.high,
      confidence: Number.isFinite(o.confidence) ? o.confidence : 50,
    };
    if (tier === 'red') red = pickStronger(red, tz);
    else if (tier === 'blue') blue = pickStronger(blue, tz);
    else yellow = pickStronger(yellow, tz);
  }

  const missingTiers = (['red', 'blue', 'yellow'] as const).filter((t) => !(t === 'red' ? red : t === 'blue' ? blue : yellow));

  const zonesOrdered = [red, blue, yellow].filter(Boolean) as TieredZone[];
  if (zonesOrdered.length === 0) return null;

  /** 스윙 단계(저항 위→아래)는 가격 기준 정렬 — 색 라벨은 유지 */
  const geomOrder = [...zonesOrdered].sort((a, b) => b.high - a.high);
  const topZ = geomOrder[0];
  const midZ = geomOrder[1];
  const botZ = geomOrder[2];

  const atrArr = analysis.indicators?.atr;
  const atrLast = atrArr?.length ? atrArr[atrArr.length - 1] : null;
  const buf = Math.max(px * 0.0015, (n(atrLast) ?? px * 0.004) * 1.8);

  const notes: string[] = [];
  if (missingTiers.length) {
    notes.push(
      `차트에 없는 색 박스: ${missingTiers.map((m) => (m === 'red' ? '빨강(고래매도)' : m === 'blue' ? '파랑(반응진입)' : '노랑(반응저항)')).join(', ')} — 해당 오버레이가 켜져 있는지 확인하세요.`,
    );
  }

  const overlap = zonesOrdered.find((z) => z.low <= px && z.high >= px);
  const nearestAbove = zonesOrdered.filter((z) => z.low > px).sort((a, b) => a.low - b.low)[0];

  let entry: number;
  if (overlap) {
    entry = (overlap.low + overlap.high) / 2;
    notes.push('현재가가 색 ZONE 안 → 진입 참고는 그 구간 중심(실제 체결은 리테스트 기준으로 조정).');
  } else if (nearestAbove) {
    entry = (nearestAbove.low + nearestAbove.high) / 2;
    notes.push('가장 가까운 상방 색 ZONE 중심을 스윙 숏 진입 참고가로 사용.');
  } else {
    entry = (topZ.low + topZ.high) / 2;
    notes.push('현재가가 모든 연동 ZONE보다 위 — 최상단 ZONE 중심 되돌림 숏(공격적).');
  }

  let stopLoss = topZ.high + buf;
  if (stopLoss <= entry) {
    stopLoss = entry + buf;
    notes.push('손절을 진입가 + 버퍼로 조정했습니다.');
  }

  const takeProfits: Array<{ price: number; label: string }> = [];
  const pushTp = (price: number, label: string) => {
    if (!Number.isFinite(price) || price >= entry) return;
    if (takeProfits.some((t) => Math.abs(t.price - price) / Math.max(px, 1) < 0.00005)) return;
    takeProfits.push({ price, label });
  };

  if (midZ && midZ !== topZ && midZ.low < entry) {
    pushTp(midZ.low, `TP1 · 중간대(${tierLabel(midZ.tier)}) 하단`);
  }
  if (botZ && botZ !== topZ && botZ.low < entry) {
    pushTp(botZ.low, `TP2 · 하단대(${tierLabel(botZ.tier)}) 하단`);
  }
  if (!takeProfits.length && midZ) {
    const ext = midZ.low - buf * 2.2;
    if (ext < entry) pushTp(ext, 'TP1 · 스윙 확장');
  }
  if (!takeProfits.length) {
    pushTp(entry - buf * 4, 'TP1 · 버퍼 기준 스윙 목표');
  }

  const buyHi = n(analysis.nearestBuyZone?.high);
  if (buyHi != null && buyHi < entry) pushTp(buyHi, 'TPn · 매수·지지 ZONE 상단');
  const sup = n(analysis.supportLevel?.price);
  if (sup != null && sup < entry) pushTp(sup, 'TPn · 핵심 지지');

  takeProfits.sort((a, b) => b.price - a.price);

  const risk = stopLoss - entry;
  const tp1p = takeProfits[0]?.price ?? entry - buf * 3;
  const rewardToTp1 = entry - tp1p;
  const rrTp1 = risk > 0 && rewardToTp1 > 0 ? rewardToTp1 / risk : 0;

  const fusionShortAligned = fusion.direction === 'SHORT' && fusion.grade !== 'NONE' && fusion.grade !== 'CONFLICT';
  const snapshotVerdictShort = analysis.verdict === 'SHORT';
  const unifiedGraphFavorsShort = graph.verdict === 'SHORT' || graph.shortOverall > graph.longOverall + 2;
  const unifiedGraphSwingOk = graph.gatePassed && graph.verdict === 'SHORT';

  notes.push(
    `통합 그래프: ${graph.verdict} (롱${graph.longOverall} / 숏${graph.shortOverall}, 격차${graph.edge})${graph.gatePassed ? '' : ' · 게이트 미통과'}`,
  );
  if (!unifiedGraphFavorsShort) {
    notes.push('통합 그래프가 숏 우세가 아님 — 이 플랜은 ZONE 기준 역추세·참고용에 가깝습니다.');
  } else if (!graph.gatePassed) {
    notes.push('통합 게이트 미통과 — 스윙 진입은 보수적으로(추가 확인 권장).');
  }

  if (risk <= 0) notes.push('리스크 거리가 비정상입니다. ZONE·가격을 확인하세요.');

  return {
    active: true,
    currentPrice: px,
    tiers: { red, blue, yellow },
    missingTiers,
    zonesOrdered: geomOrder,
    entry,
    stopLoss,
    takeProfits,
    risk,
    rewardToTp1,
    rrTp1,
    fusionShortAligned,
    snapshotVerdictShort,
    unifiedGraphFavorsShort,
    unifiedGraphSwingOk,
    notes,
  };
}

function tierLabel(t: ZoneColorTier): string {
  return t === 'red' ? '빨강' : t === 'blue' ? '파랑' : '노랑';
}
