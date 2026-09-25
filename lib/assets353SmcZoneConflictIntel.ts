/**
 * SMC zone 겹침 — 롱/숏 확률·매수/매도 강도·돌파 가능성 (로그·과거 반응 기반, 조건부 참고).
 */
import type { Candle, OverlayItem } from '@/types';
import type { Assets353Verdict } from '@/lib/assets353CandleKnowledgeEngine';
import type { MergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';
import { computeObStatIntel, computeSrHoldPct } from '@/lib/assets353SmcStatIntel';
import { detectSmcStructureOrderBlocks } from '@/lib/smcStructureOrderBlocks';
import { atrRecent } from '@/lib/smcDeskOverlay';

export type SmcZoneBattleVerdict = {
  longPct: number;
  shortPct: number;
  breakoutPct: number;
  buyStrength: 'strong' | 'medium' | 'weak';
  sellStrength: 'strong' | 'medium' | 'weak';
  dominant: 'LONG' | 'SHORT' | 'NEUTRAL';
  headlineKo: string;
  detailKo: string;
  reasonsKo: string[];
};

type ZoneSlice = {
  id: string;
  idx: number;
  top: number;
  bot: number;
  t1: number;
  t2: number;
  bull: boolean;
  bear: boolean;
  obPct: number;
  srPct: number;
  kind: 'ob' | 'sr' | 'liq' | 'fvg' | 'other';
};

function zoneOverlapRatio(aBot: number, aTop: number, bBot: number, bTop: number): number {
  const hA = Math.max(1e-12, aTop - aBot);
  const hB = Math.max(1e-12, bTop - bBot);
  const ov = Math.min(aTop, bTop) - Math.max(aBot, bBot);
  if (ov <= 0) return 0;
  return ov / Math.min(hA, hB);
}

function timeOverlapRatio(a1: number, a2: number, b1: number, b2: number): number {
  const wA = Math.max(1, a2 - a1);
  const wB = Math.max(1, b2 - b1);
  const ov = Math.min(a2, b2) - Math.max(a1, b1);
  if (ov <= 0) return 0;
  return ov / Math.min(wA, wB);
}

function strengthFromPct(pct: number, oppPct: number): 'strong' | 'medium' | 'weak' {
  const edge = pct - oppPct;
  if (pct >= 58 && edge >= 10) return 'strong';
  if (pct >= 48 && edge >= 0) return 'medium';
  return 'weak';
}

function strengthKo(s: 'strong' | 'medium' | 'weak', side: 'buy' | 'sell'): string {
  if (side === 'buy') {
    if (s === 'strong') return '매수강';
    if (s === 'medium') return '매수보통';
    return '매수약';
  }
  if (s === 'strong') return '매도강';
  if (s === 'medium') return '매도보통';
  return '매도약';
}

function parseZoneSlice(o: OverlayItem, idx: number, candles: Candle[]): ZoneSlice | null {
  const id = String(o.id || '');
  const kind = String(o.kind || '');
  if (kind !== 'zone' && kind !== 'demandZone' && kind !== 'supplyZone' && kind !== 'ob' && kind !== 'fvg') {
    return null;
  }
  const p1 = Number(o.price1);
  const p2 = Number(o.price2);
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return null;
  const top = Math.max(p1, p2);
  const bot = Math.min(p1, p2);
  if (!(top > bot)) return null;

  const t1 = Number(o.time1 ?? candles[0]?.time ?? 0);
  const t2 = Number(o.time2 ?? candles[candles.length - 1]?.time ?? t1);
  const bias = o.structureBias;
  const idL = id.toLowerCase();
  const bull =
    bias === 'bullish' ||
    idL.includes('bull') ||
    idL.includes('sup') ||
    idL.includes('demand') ||
    idL.includes('long');
  const bear =
    bias === 'bearish' ||
    idL.includes('bear') ||
    idL.includes('res') ||
    idL.includes('supply') ||
    idL.includes('short');

  let sliceKind: ZoneSlice['kind'] = 'other';
  if (id.includes('ob-') || id.includes('smc-ob')) sliceKind = 'ob';
  else if (id.includes('liq-band') || id.includes('$$$')) sliceKind = 'liq';
  else if (id.includes('fvg')) sliceKind = 'fvg';
  else if (id.includes('sr-') || id.includes('support') || id.includes('resist')) sliceKind = 'sr';

  let obPct = Math.round((Number(o.confidence) || 0.55) * 100);
  let srPct = obPct;
  if (sliceKind === 'ob') {
    const { validObs } = detectSmcStructureOrderBlocks(candles);
    const m = id.match(/-(\d+)(?:-\d+)?$/);
    const obIdx = m ? Number(m[1]) : -1;
    const ob = validObs.find((x) => x.index === obIdx || id.includes(`-${x.index}`));
    if (ob) obPct = computeObStatIntel(candles, ob).pct;
  } else if (sliceKind === 'sr' || sliceKind === 'liq') {
    const mid = (top + bot) / 2;
    srPct = computeSrHoldPct(candles, mid, bull && !bear ? 'support' : 'resistance');
    obPct = srPct;
  }

  return {
    id,
    idx,
    top,
    bot,
    t1,
    t2,
    bull,
    bear,
    obPct,
    srPct,
    kind: sliceKind,
  };
}

/** 겹친 zone 클러스터 — 롱/숏·돌파·강도 산출 */
export function computeSmcZoneBattleVerdict(
  candles: Candle[],
  cluster: ZoneSlice[],
  ctx: {
    verdict?: Assets353Verdict | null;
    smcLeading?: MergedSmcLeadingContext | null;
  }
): SmcZoneBattleVerdict {
  const n = candles.length;
  const last = candles[n - 1]!;
  const close = last.close;
  const top = Math.max(...cluster.map((z) => z.top));
  const bot = Math.min(...cluster.map((z) => z.bot));
  const mid = (top + bot) / 2;
  const height = Math.max(1e-12, top - bot);
  const posInZone = Math.max(0, Math.min(1, (close - bot) / height));

  let longW = 50;
  let shortW = 50;
  const reasons: string[] = [];

  for (const z of cluster) {
    if (z.bull) longW += z.obPct * 0.22 + z.srPct * 0.08;
    if (z.bear) shortW += z.obPct * 0.22 + z.srPct * 0.08;
  }

  if (posInZone <= 0.35) {
    longW += 14;
    reasons.push('가격 zone 하단 — 지지 반등 가중');
  } else if (posInZone >= 0.65) {
    shortW += 14;
    reasons.push('가격 zone 상단 — 저항 거부 가중');
  } else {
    longW += 4;
    shortW += 4;
    reasons.push('가격 zone 중앙 — 방향 혼조');
  }

  const v = ctx.verdict;
  if (v) {
    longW += v.longPct * 0.35;
    shortW += v.shortPct * 0.35;
    if (v.edgePct >= 8) reasons.push(`353 AI 롱${v.longPct}%·숏${v.shortPct}%`);
  }

  const ch = ctx.smcLeading?.lastChoch;
  if (ch) {
    if (ch.bias === 'bullish') longW += ch.phase === 'confirmed' ? 16 : 10;
    else shortW += ch.phase === 'confirmed' ? 16 : 10;
    reasons.push(`구조 ${ch.tag} ${ch.bias === 'bullish' ? '상방' : '하방'}`);
  }

  const atr = atrRecent(candles, 14) || close * 0.004;
  const compressed = height <= atr * 1.35;
  let breakoutPct = compressed ? 58 : 42;
  let touchTop = 0;
  let touchBot = 0;
  for (let i = Math.max(0, n - 24); i < n; i++) {
    const c = candles[i]!;
    if (c.high >= top - atr * 0.15) touchTop++;
    if (c.low <= bot + atr * 0.15) touchBot++;
  }
  if (touchTop >= 2 && touchBot >= 2) {
    breakoutPct += 14;
    reasons.push('상·하단 동시 터치 — 돌파 압력');
  }
  if (compressed) reasons.push('밴드 압축 — 돌파 구간');

  const recent = candles.slice(Math.max(0, n - 8));
  const bullVol = recent.filter((c) => c.close >= c.open).reduce((s, c) => s + (c.volume || 1), 0);
  const bearVol = recent.filter((c) => c.close < c.open).reduce((s, c) => s + (c.volume || 1), 0);
  const volSum = bullVol + bearVol || 1;
  longW += (bullVol / volSum) * 18;
  shortW += (bearVol / volSum) * 18;
  if (bullVol > bearVol * 1.25) reasons.push('최근 양봉 거래량 우세');
  else if (bearVol > bullVol * 1.25) reasons.push('최근 음봉 거래량 우세');

  const total = Math.max(1, longW + shortW);
  let longPct = Math.round((longW / total) * 100);
  let shortPct = 100 - longPct;
  longPct = Math.max(32, Math.min(68, longPct));
  shortPct = 100 - longPct;

  breakoutPct = Math.max(28, Math.min(88, Math.round(breakoutPct + Math.abs(longPct - shortPct) * 0.08)));

  const buyStrength = strengthFromPct(longPct, shortPct);
  const sellStrength = strengthFromPct(shortPct, longPct);
  const dominant: SmcZoneBattleVerdict['dominant'] =
    longPct >= 56 && longPct - shortPct >= 8
      ? 'LONG'
      : shortPct >= 56 && shortPct - longPct >= 8
        ? 'SHORT'
        : 'NEUTRAL';

  const brkKo = breakoutPct >= 55 ? '돌파+' : breakoutPct >= 45 ? '돌파?' : '박스';
  const headlineKo = `⚔ L${longPct}/S${shortPct}`;
  const detailKo = [
    `롱 ${longPct}% · 숏 ${shortPct}% · 돌파 ${breakoutPct}%`,
    `${strengthKo(buyStrength, 'buy')} · ${strengthKo(sellStrength, 'sell')} · ${brkKo}`,
    ...reasons.slice(0, 4),
  ].join(' · ');

  return {
    longPct,
    shortPct,
    breakoutPct,
    buyStrength,
    sellStrength,
    dominant,
    headlineKo,
    detailKo,
    reasonsKo: reasons.slice(0, 5),
  };
}

function clusterZones(zones: ZoneSlice[]): ZoneSlice[][] {
  const bulls = zones.filter((z) => z.bull && !z.bear);
  const bears = zones.filter((z) => z.bear && !z.bull);
  const clusters: ZoneSlice[][] = [];
  const usedBear = new Set<string>();

  for (const b of bulls) {
    const mates = bears.filter((bear) => {
      if (usedBear.has(bear.id)) return false;
      const priceOv = zoneOverlapRatio(b.bot, b.top, bear.bot, bear.top) >= 0.28;
      const timeOv = timeOverlapRatio(b.t1, b.t2, bear.t1, bear.t2) >= 0.15;
      return priceOv && timeOv;
    });
    if (!mates.length) continue;
    mates.forEach((m) => usedBear.add(m.id));
    clusters.push([b, ...mates]);
  }
  return clusters;
}

/** 겹친 롱/숏 zone 라벨에 실시간 전투 통계 부착 + 중앙 배틀 밴드 */
export function applySmcZoneConflictIntel(
  candles: Candle[],
  items: OverlayItem[],
  ctx: {
    verdict?: Assets353Verdict | null;
    smcLeading?: MergedSmcLeadingContext | null;
  }
): { items: OverlayItem[]; battles: SmcZoneBattleVerdict[] } {
  if (candles.length < 16) return { items, battles: [] };

  const slices: ZoneSlice[] = [];
  items.forEach((o, idx) => {
    const z = parseZoneSlice(o, idx, candles);
    if (z) slices.push(z);
  });
  if (slices.length < 2) return { items, battles: [] };

  const clusters = clusterZones(slices);
  if (!clusters.length) return { items, battles: [] };

  const battleById = new Map<string, SmcZoneBattleVerdict>();
  const extra: OverlayItem[] = [];
  const battles: SmcZoneBattleVerdict[] = [];

  clusters.forEach((cluster, ci) => {
    const battle = computeSmcZoneBattleVerdict(candles, cluster, ctx);
    battles.push(battle);
    for (const z of cluster) battleById.set(z.id, battle);

    const top = Math.max(...cluster.map((z) => z.top));
    const bot = Math.min(...cluster.map((z) => z.bot));
    const t1 = Math.min(...cluster.map((z) => z.t1));
    const t2 = Math.max(...cluster.map((z) => z.t2));
    const dom = battle.dominant;
    const color =
      dom === 'LONG'
        ? 'rgba(16,185,129,0.14)'
        : dom === 'SHORT'
          ? 'rgba(239,68,68,0.12)'
          : 'rgba(251,191,36,0.1)';

    extra.push({
      id: `merged-ares-mlsp-tv-conflict-${ci}-${Math.round(midPrice(top, bot))}`,
      kind: 'zone',
      label: battle.headlineKo,
      labelTooltip: battle.detailKo,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: top,
      price2: bot,
      confidence: Math.max(battle.longPct, battle.shortPct) / 100,
      color,
      category: 'mirageLSP',
      zoneFillPreserve: true,
      zoneSpanOnly: false,
      structureBias: dom === 'LONG' ? 'bullish' : dom === 'SHORT' ? 'bearish' : undefined,
      zoneFaceBase: battle.headlineKo,
      zoneFaceSignal: dom === 'NEUTRAL' ? '혼전' : dom === 'LONG' ? '롱' : '숏',
      zoneFaceDetailKo: battle.detailKo,
      zoneFaceLang: 'ko',
      overlayZoneExtraClass: `merged-ares-mlsp-tv-conflict-band merged-desk-smc-zone-battle ${dom === 'LONG' ? 'merged-desk-smc-dir-long' : dom === 'SHORT' ? 'merged-desk-smc-dir-short' : 'merged-desk-smc-dir-neutral'}`,
    });
  });

  const updated = items.map((o) => {
    const id = String(o.id || '');
    const battle = battleById.get(id);
    if (!battle) return o;
    const base = String(o.zoneFaceBase || o.label || '').trim();
    const statSig = `L${battle.longPct}/S${battle.shortPct}`;
    return {
      ...o,
      label: base,
      labelTooltip: `${battle.detailKo}\n${base}`,
      zoneFaceBase: base,
      zoneFaceDetailKo: battle.detailKo,
      zoneFaceSignal: battle.dominant === 'NEUTRAL' ? '혼전' : statSig,
      overlayZoneExtraClass: `${String(o.overlayZoneExtraClass || '')} merged-desk-smc-zone-battle-member`.trim(),
    };
  });

  return { items: [...updated, ...extra], battles };
}

function midPrice(top: number, bot: number): number {
  return (top + bot) / 2;
}

/** 현재가 근처 겹침 zone 전투 — HUD/브리프용 */
export function pickNearestSmcZoneBattle(
  candles: Candle[],
  battles: SmcZoneBattleVerdict[]
): SmcZoneBattleVerdict | null {
  if (!battles.length || candles.length < 2) return null;
  return battles[battles.length - 1] ?? null;
}
