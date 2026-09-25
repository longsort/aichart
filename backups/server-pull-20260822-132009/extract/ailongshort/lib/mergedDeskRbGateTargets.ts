/**
 * 채널게이트 TP — 파랑빨강띠 레일·중착·기관·Hot·분석 레벨에 스냅.
 * 전폭 가격선용 숫자. 확정 수익·승률 아님.
 */
import type { AnalyzeResponse } from '@/types';
import type {
  MergedDeskChannelConfluence,
  MergedDeskChannelGeom,
} from '@/lib/mergedDeskBlueRedChannels';
import type { MergedDeskHotZoneEntry } from '@/lib/mergedDeskHotZoneEntry';
import { getLastInstitutionalBandEdges } from '@/lib/institutionalSuperBand';
import type { Candle } from '@/types';

export type RbGateMagnet = {
  price: number;
  sourceKo: string;
  rank: number;
};

export type RbGateSnappedTargets = {
  tp1: number;
  tp2: number;
  tp3: number;
  tp1Ko: string;
  tp2Ko: string;
  tp3Ko: string;
  summaryKo: string;
};

function pushMagnet(out: RbGateMagnet[], price: number, sourceKo: string, rank: number) {
  if (!Number.isFinite(price) || !(price > 0)) return;
  out.push({ price, sourceKo, rank });
}

export function collectRbGateTargetMagnets(params: {
  candles: Candle[];
  geoms: MergedDeskChannelGeom[];
  confluence?: MergedDeskChannelConfluence | null;
  hotZones?: MergedDeskHotZoneEntry[] | null;
  analysis?: AnalyzeResponse | null;
}): RbGateMagnet[] {
  const out: RbGateMagnet[] = [];
  for (const g of params.geoms) {
    const pri = g.primary ? 2 : 0;
    pushMagnet(out, g.tipMid, `${g.horizonKo}중선`, 10 + pri);
    pushMagnet(out, g.tipUpper, `${g.horizonKo}상단`, 12 + pri);
    pushMagnet(out, g.tipLower, `${g.horizonKo}하단`, 12 + pri);
  }
  const conf = params.confluence;
  if (conf) {
    pushMagnet(out, conf.tipUpper, '중착상단', 13);
    pushMagnet(out, conf.tipLower, '중착하단', 13);
    pushMagnet(out, conf.tipMid, '중착중앙', 11);
  }
  const st = getLastInstitutionalBandEdges(params.candles);
  if (st) {
    pushMagnet(out, st.upper, '기관상단', 11);
    pushMagnet(out, st.lower, '기관하단', 11);
  }
  for (const z of params.hotZones ?? []) {
    const tag = z.side === 'LONG' ? '지지' : '저항';
    const money =
      String(z.labelKo || '').includes('$$$$') ||
      (z.sources ?? []).some((s) => String(s).includes('$$$$'));
    const prefix = money ? '$$$$' : 'Hot';
    pushMagnet(out, z.mid, `${prefix}${tag}`, money ? 11 : 10);
    pushMagnet(out, z.top, `${prefix}${tag}상`, 8);
    pushMagnet(out, z.bot, `${prefix}${tag}하`, 8);
  }
  const a = params.analysis;
  if (a?.resistanceLevel?.price) pushMagnet(out, a.resistanceLevel.price, '분석저항', 9);
  if (a?.supportLevel?.price) pushMagnet(out, a.supportLevel.price, '분석지지', 9);
  if (a?.breakoutLevel?.price) pushMagnet(out, a.breakoutLevel.price, '분석돌파', 9);
  if (a?.invalidationLevel?.price) pushMagnet(out, a.invalidationLevel.price, '분석무효', 6);
  const sob = a?.nearestSupportOb;
  if (sob && sob.low > 0 && sob.high > 0) {
    pushMagnet(out, (sob.low + sob.high) / 2, 'OB지지', 9);
    pushMagnet(out, sob.high, 'OB지지상', 8);
  }
  const rob = a?.nearestResistanceOb;
  if (rob && rob.low > 0 && rob.high > 0) {
    pushMagnet(out, (rob.low + rob.high) / 2, 'OB저항', 9);
    pushMagnet(out, rob.low, 'OB저항하', 8);
  }
  const zb = a?.zoneBiasCard;
  if (zb && zb.low > 0 && zb.high > 0) {
    pushMagnet(out, (zb.low + zb.high) / 2, '편향존', 8);
  }
  return out;
}

function dedupeMagnets(magnets: RbGateMagnet[], minGap: number): RbGateMagnet[] {
  const sorted = [...magnets].sort((a, b) => a.price - b.price);
  const out: RbGateMagnet[] = [];
  for (const m of sorted) {
    const prev = out[out.length - 1];
    if (!prev || Math.abs(m.price - prev.price) >= minGap) {
      out.push(m);
      continue;
    }
    if (m.rank > prev.rank) out[out.length - 1] = m;
  }
  return out;
}

function pickMagnetNear(
  magnets: RbGateMagnet[],
  target: number,
  entry: number,
  sign: number,
  minDist: number,
  used: Set<string>
): { price: number; sourceKo: string } {
  let best: RbGateMagnet | null = null;
  let bestScore = Infinity;
  for (const m of magnets) {
    const key = `${m.sourceKo}:${m.price.toFixed(2)}`;
    if (used.has(key)) continue;
    const d = (m.price - entry) * sign;
    if (d < minDist) continue;
    const err = Math.abs(m.price - target) / Math.max(Math.abs(target), 1);
    const rankPenalty = (16 - m.rank) * 0.012;
    const score = err + rankPenalty;
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  if (!best) return { price: target, sourceKo: '채널폭측정' };
  used.add(`${best.sourceKo}:${best.price.toFixed(2)}`);
  return { price: best.price, sourceKo: best.sourceKo };
}

/** 기하 TP를 띠·합류 자석에 붙인다. 순서·최소거리 유지. */
export function snapRbGateTargets(params: {
  direction: 'LONG' | 'SHORT';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  magnets: RbGateMagnet[];
  atr: number;
}): RbGateSnappedTargets {
  const sign = params.direction === 'LONG' ? 1 : -1;
  const risk = Math.abs(params.entry - params.stopLoss);
  const atr = Math.max(params.atr, Math.abs(params.entry) * 0.0008, 1e-9);
  const minGap = Math.max(atr * 0.18, risk * 0.12);
  const ahead = params.magnets.filter((m) => (m.price - params.entry) * sign > atr * 0.12);
  const uniq = dedupeMagnets(ahead, minGap);
  const used = new Set<string>();

  const p1 = pickMagnetNear(uniq, params.tp1, params.entry, sign, Math.max(risk * 0.55, atr * 0.28), used);
  const p2 = pickMagnetNear(uniq, params.tp2, params.entry, sign, Math.max(risk * 0.95, atr * 0.45), used);
  const p3 = pickMagnetNear(uniq, params.tp3, params.entry, sign, Math.max(risk * 1.35, atr * 0.7), used);

  let tp1 = p1.price;
  let tp2 = p2.price;
  let tp3 = p3.price;
  if (params.direction === 'LONG') {
    if (!(tp2 > tp1)) tp2 = Math.max(tp1 + minGap, params.tp2);
    if (!(tp3 > tp2)) tp3 = Math.max(tp2 + minGap, params.tp3);
  } else {
    if (!(tp2 < tp1)) tp2 = Math.min(tp1 - minGap, params.tp2);
    if (!(tp3 < tp2)) tp3 = Math.min(tp2 - minGap, params.tp3);
  }

  return {
    tp1,
    tp2,
    tp3,
    tp1Ko: p1.sourceKo,
    tp2Ko: p2.sourceKo,
    tp3Ko: p3.sourceKo,
    summaryKo: `TP1 ${p1.sourceKo} · TP2 ${p2.sourceKo} · TP3 ${p3.sourceKo} · 띠·합류 스냅(참고)`,
  };
}
