/**
 * §23 TP ENGINE — 반대 유동성·존 우선 · 고정 ROE만 금지.
 */
import { runTargetEngine, type TargetEngineReport } from '@/lib/eagle1/targetEngine';
import type { Eagle1RiskPlan } from '@/lib/eagle1/riskEngine';
import type { TapLiqNode } from './liquidityMap';
import type { TapBattleZone } from './types';

export type TapTpPack = {
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  reasons: string[];
  usedStructureAnchors: boolean;
  noteKo: string;
};

function opposingNodes(
  direction: 'LONG' | 'SHORT',
  nodes: TapLiqNode[] | null | undefined,
  entry: number
): { near: number | null; mid: number | null; far: number | null } {
  const pool =
    direction === 'LONG'
      ? (nodes || []).filter((n) => n.price > entry).sort((a, b) => a.price - b.price)
      : (nodes || []).filter((n) => n.price < entry).sort((a, b) => b.price - a.price);
  return {
    near: pool[0]?.price ?? null,
    mid: pool[1]?.price ?? pool[0]?.price ?? null,
    far: pool[2]?.price ?? pool[1]?.price ?? pool[0]?.price ?? null,
  };
}

export function buildTapTpPack(params: {
  direction: 'LONG' | 'SHORT' | null;
  entry: number | null;
  atr: number;
  planTp1?: number | null;
  planTp2?: number | null;
  planTp3?: number | null;
  riskPlan?: Eagle1RiskPlan | null;
  liqNodes?: TapLiqNode[] | null;
  battleZone?: TapBattleZone | null;
}): TapTpPack {
  const dir = params.direction;
  const entry = params.entry;
  const atr = params.atr > 0 ? params.atr : entry != null ? entry * 0.003 : 0;
  if (!dir || entry == null || !(entry > 0)) {
    return {
      tp1: null,
      tp2: null,
      tp3: null,
      reasons: [],
      usedStructureAnchors: false,
      noteKo: 'TP 미산정',
    };
  }

  const opp = opposingNodes(dir, params.liqNodes, entry);
  const z = params.battleZone;

  /** risk plan이 있으면 targetEngine으로 앵커 보강 */
  let te: TargetEngineReport | null = null;
  if (params.riskPlan) {
    try {
      te = runTargetEngine({
        risk: {
          ...params.riskPlan,
          tp1: params.planTp1 ?? params.riskPlan.tp1,
          tp2: params.planTp2 ?? params.riskPlan.tp2,
          tp3: params.planTp3 ?? params.riskPlan.tp3,
        },
        anchors: {
          direction: dir,
          entryMid: entry,
          liqHigh: dir === 'LONG' ? opp.far : null,
          liqLow: dir === 'SHORT' ? opp.far : null,
          coreSupportMid: z && dir === 'SHORT' ? z.mid : null,
          coreResistMid: z && dir === 'LONG' ? z.mid : null,
        },
      });
    } catch {
      te = null;
    }
  }

  let tp1 = te?.levels.find((l) => l.id === 'TP1')?.price ?? params.planTp1 ?? null;
  let tp2 = te?.levels.find((l) => l.id === 'TP2')?.price ?? params.planTp2 ?? null;
  let tp3 = te?.levels.find((l) => l.id === 'TP3')?.price ?? params.planTp3 ?? null;
  const reasons: string[] = [];

  if (tp1 == null && opp.near != null) {
    tp1 = opp.near;
    reasons.push('반대유동성 TP1');
  }
  if (tp2 == null && opp.mid != null) {
    tp2 = opp.mid;
    reasons.push('반대유동성 TP2');
  }
  if (tp3 == null && opp.far != null) {
    tp3 = opp.far;
    reasons.push('반대유동성 TP3');
  }

  /** ATR ladder fill */
  if (dir === 'LONG') {
    if (tp1 == null || !(tp1 > entry)) tp1 = entry + atr * 1.2;
    if (tp2 == null || !(tp2 > tp1)) tp2 = tp1 + atr * 1.2;
    if (tp3 == null || !(tp3 > tp2)) tp3 = tp2 + atr * 0.9;
  } else {
    if (tp1 == null || !(tp1 < entry)) tp1 = entry - atr * 1.2;
    if (tp2 == null || !(tp2 < tp1)) tp2 = tp1 - atr * 1.2;
    if (tp3 == null || !(tp3 < tp2)) tp3 = tp2 - atr * 0.9;
  }

  if (te?.usedStructureAnchors) reasons.push('구조앵커');
  if (opp.near != null) reasons.push(`근거리유동 ${opp.near.toFixed(2)}`);

  return {
    tp1,
    tp2,
    tp3,
    reasons,
    usedStructureAnchors: Boolean(te?.usedStructureAnchors) || opp.near != null,
    noteKo: reasons.slice(0, 3).join(' · ') || (te?.note || 'TP ATR보강'),
  };
}
