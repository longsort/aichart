/**
 * Lane Fast — 파랑빨강 자리(placeRefOk) + SFP + 수수료 ROE8% 초단.
 * HTF는 역행만 차단(정렬0 허용). 장바구니/로켓/스윙은 가산만.
 * 확정 승률·수익 아님.
 */
import type { Candle } from '@/types';
import { buildMergedDeskBlueRedChannels } from '@/lib/mergedDeskBlueRedChannels';
import {
  computeMergedDeskRbEdgeConfluenceGate,
  detectRbRailSfp,
} from '@/lib/mergedDeskRbEdgeConfluenceGate';
import { aiZoneFeeRrGate } from '@/lib/mergedDeskAiZoneFeeGate';
import { aiZoneEvidenceGate } from '@/lib/mergedDeskAiZoneEvidenceGate';
import {
  readAiZoneEntrySnapshot,
  type AiZoneEntrySnapshot,
} from '@/lib/mergedDeskAiZoneSnapshot';
import { FAST_TP1_ROE_PCT } from '@/lib/mergedDeskAutoTradeConfig';
import { roeTargetPrice } from '@/lib/mergedDeskAutoScalpEngine';
import { isUltraScalpCoreTf } from '@/lib/doksuri1/ultraScalpEngine';
import {
  BPR_DUAL_EVIDENCE_KO,
  evaluateBprDualEvidence,
  peekBprCandles15m,
} from '@/lib/mergedDeskBprDualEvidence';
import { assertRailSideForDirection } from '@/lib/mergedDeskDirectionSlGuard';

export const RB_SCALP_SOURCE = 'rb-scalp' as const;

export type RbScalpDriveCandidate = {
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number;
  score: number;
  signalKo: string;
  evidenceKo: string;
  source: typeof RB_SCALP_SOURCE;
  netRoePct: number;
  rr: number;
  signalId: string;
  analysisTags: string[];
  closedBarTime: number;
};

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  if (n < 5) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    s += Math.max(a.high - a.low, Math.abs(a.high - b.close), Math.abs(a.low - b.close));
    c += 1;
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
}

/** Fast 허용 심볼 — Dual Lane · BTC/ETH/SOL/XRP */
export function rbScalpSymbolAllowed(symbol: string): boolean {
  const u = String(symbol || '').toUpperCase();
  return (
    u.startsWith('BTC') ||
    u.startsWith('ETH') ||
    u.startsWith('SOL') ||
    u.startsWith('XRP')
  );
}

/**
 * Fast 자리 완화 — 엄격 placeRefOk 또는
 * 핵심1+ · 또는 SFP+**방향별** 레일근접(롱=하단·숏=상단만).
 * 상단에서 롱 / 하단에서 숏 허용 금지 (역행 손절 주원인).
 */
export function rbScalpPlaceFastOk(params: {
  placeRefOk: boolean;
  coreHitCount: number;
  entry: number;
  atr: number;
  tipUpper: number;
  tipLower: number;
  hasSfp: boolean;
  direction: 'LONG' | 'SHORT';
}): boolean {
  if (params.placeRefOk) {
    /** placeRefOk여도 방향 반대 레일이면 컷 */
    const atr = Math.max(params.atr, Math.abs(params.entry) * 0.0004);
    const hi = Math.max(params.tipUpper, params.tipLower);
    const dn = Math.min(params.tipUpper, params.tipLower);
    const mid = (hi + dn) / 2;
    if (params.direction === 'LONG' && params.entry > mid + atr * 0.55) return false;
    if (params.direction === 'SHORT' && params.entry < mid - atr * 0.55) return false;
    return true;
  }
  if (params.coreHitCount >= 1) {
    const atr = Math.max(params.atr, Math.abs(params.entry) * 0.0004);
    const hi = Math.max(params.tipUpper, params.tipLower);
    const dn = Math.min(params.tipUpper, params.tipLower);
    const mid = (hi + dn) / 2;
    if (params.direction === 'LONG' && params.entry > mid + atr * 0.55) return false;
    if (params.direction === 'SHORT' && params.entry < mid - atr * 0.55) return false;
    return true;
  }
  if (!params.hasSfp) return false;
  const atr = Math.max(params.atr, Math.abs(params.entry) * 0.0004);
  const nearU = Math.abs(params.entry - params.tipUpper) <= atr * 0.9;
  const nearL = Math.abs(params.entry - params.tipLower) <= atr * 0.9;
  if (params.direction === 'LONG') return nearL;
  return nearU;
}

/**
 * Lane Fast 후보.
 * Fast자리(완화) + SFP 동방 + fee(ROE8) · HTF 하드역행만 차단.
 */
export function buildRbScalpDriveCandidate(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  leverage: number;
  minRr?: number;
  tp1RoePct?: number;
  snap?: AiZoneEntrySnapshot | null;
  price?: number | null;
  /** 가산 라벨 (단독 사유 아님) */
  bonusKo?: string[] | null;
  /** 15m ICT BPR — 태그/점수 가산만 (evidenceGate 대체 금지) */
  candles15m?: Candle[] | null;
}): RbScalpDriveCandidate | null {
  const symbol = String(params.symbol || '').toUpperCase();
  if (!rbScalpSymbolAllowed(symbol)) return null;
  const tf = String(params.timeframe || '');
  if (!isUltraScalpCoreTf(tf)) return null;

  const candles = params.candles;
  if (!Array.isArray(candles) || candles.length < 36) return null;

  const n = candles.length;
  const closed = candles[n - 2]!;
  const entry =
    Number(params.price) > 0 ? Number(params.price) : Number(closed.close);
  if (!(entry > 0)) return null;
  const closedT = Number(closed.time) || 0;
  if (!(closedT > 0)) return null;

  const atr = atrApprox(candles);
  const ch = buildMergedDeskBlueRedChannels(candles, tf);
  const geom = ch.geoms.find((g) => g.primary) ?? ch.geoms[0] ?? null;
  if (!geom) return null;

  const gate = computeMergedDeskRbEdgeConfluenceGate({
    candles: candles.slice(0, n - 1),
    geom,
    masterSide: null,
  });

  const sfp =
    gate.sfp ??
    detectRbRailSfp(candles.slice(0, n - 1), geom, atr);
  if (!sfp) return null;

  let direction: 'LONG' | 'SHORT' | null =
    gate.side === 'LONG' || gate.side === 'SHORT' ? gate.side : null;
  const sfpDir = sfp.side === 'bull' ? 'LONG' : 'SHORT';
  if (!direction) direction = sfpDir;
  if (sfpDir !== direction) return null;

  const placeOk = rbScalpPlaceFastOk({
    placeRefOk: gate.placeRefOk === true,
    coreHitCount: gate.coreHitCount,
    entry,
    atr,
    tipUpper: geom.tipUpper,
    tipLower: geom.tipLower,
    hasSfp: true,
    direction,
  });
  if (!placeOk) return null;

  const railSide = assertRailSideForDirection({
    direction,
    mark: entry,
    tipUpper: geom.tipUpper,
    tipLower: geom.tipLower,
    atr,
  });
  if (!railSide.ok) return null;

  /** HTF soft: 역행만 차단 · BPR은 통과 대체 금지 */
  const snap = params.snap ?? readAiZoneEntrySnapshot(symbol);
  let baseAlignedN = 0;
  if (snap) {
    const ev = aiZoneEvidenceGate({ direction, price: entry, snap });
    baseAlignedN = ev.alignedN;
    if (!ev.ok && ev.conflictN > 0) return null;
  }

  const c15 = params.candles15m ?? peekBprCandles15m(symbol) ?? null;
  const bpr = evaluateBprDualEvidence({
    candles15m: c15,
    direction,
    baseAlignedN,
  });

  const lev = Math.max(1, Math.min(125, Number(params.leverage) || 40));
  const tpRoe = Math.max(5, Number(params.tp1RoePct) || FAST_TP1_ROE_PCT) / 100;
  const tp = roeTargetPrice(entry, direction, lev, tpRoe);

  /** SL: 레일 바깥 + RR용 거리 */
  const buf = Math.max(atr * 0.12, entry * 0.00035);
  let sl =
    direction === 'LONG'
      ? Math.min(geom.tipLower - buf, entry - atr * 0.35)
      : Math.max(geom.tipUpper + buf, entry + atr * 0.35);
  const reward = Math.abs(tp - entry);
  const minRr = Math.max(1.2, Number(params.minRr) || 1.2);
  const maxRisk = reward / minRr;
  if (direction === 'LONG') {
    sl = Math.max(sl, entry - maxRisk);
    if (!(sl > 0) || !(sl < entry)) return null;
  } else {
    sl = Math.min(sl, entry + maxRisk);
    if (!(sl > entry)) return null;
  }

  const fee = aiZoneFeeRrGate({
    entry,
    sl,
    tp,
    direction,
    leverage: lev,
    minRr,
  });
  if (!fee.ok) return null;

  const triggerKo = sfp.side === 'bull' ? '스윕회수↑' : '스윕회수↓';
  const placeTag = gate.placeRefOk ? gate.shortKo : '자리완화·레일/핵심1';
  const bprTags =
    bpr.boostOk
      ? [BPR_DUAL_EVIDENCE_KO, `BPR터치${bpr.touchCount}`]
      : bpr.alignOk
        ? [BPR_DUAL_EVIDENCE_KO]
        : [];
  const tags = [
    'RB-SCALP',
    'LaneFast',
    placeTag,
    triggerKo,
    ...bprTags,
    ...(params.bonusKo || []),
  ].filter(Boolean);

  const signalId = `rb-scalp-${symbol}-${tf}-${direction}-${closedT}`;
  const bprScore = bpr.boostOk ? 5 : bpr.alignOk ? 2 : 0;

  return {
    symbol,
    timeframe: tf,
    direction,
    entry,
    sl,
    tp,
    score: Math.min(
      99,
      40 +
        gate.coreHitCount * 8 +
        gate.hitCount * 2 +
        (gate.placeRefOk ? 6 : 0) +
        bprScore
    ),
    signalKo: `초단Fast · ${direction} · ${placeTag} · ${triggerKo}${
      bpr.alignOk ? ` · ${BPR_DUAL_EVIDENCE_KO}` : ''
    } · ROE${(tpRoe * 100).toFixed(0)}%`,
    evidenceKo: `${fee.reasonKo} · SL${sl.toFixed(0)} TP${tp.toFixed(0)}${
      bpr.boostOk ? ` · ${bpr.reasonKo}` : ''
    }`,
    source: RB_SCALP_SOURCE,
    netRoePct: fee.netRoePct,
    rr: fee.rr,
    signalId,
    analysisTags: tags,
    closedBarTime: closedT,
  };
}
