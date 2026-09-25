/**
 * §22 STRUCTURAL SL — 구조가 SL을 결정 · ROE는 상한 클램프만.
 * 잘못된 순서(ROE→가격) 금지.
 */
import { lastSweepLiquidity, type StructureSnapshot } from '@/lib/eagle1/structureEngine';
import { resolveTapointSlRoePct } from './slRoeByTf';
import { roeTargetPrice } from '@/lib/mergedDeskAutoScalpEngine';
import type { TapBattleZone } from './types';

export type TapStructuralSlResult = {
  sl: number | null;
  structuralRaw: number | null;
  sourceKo: string;
  roeCapPct: number;
  cappedByRoe: boolean;
  noteKo: string;
};

export function buildTapStructuralSl(params: {
  direction: 'LONG' | 'SHORT' | null;
  entry: number | null;
  price: number;
  atr: number;
  timeframe: string;
  structure: StructureSnapshot | null;
  battleZone: TapBattleZone | null;
  planSl?: number | null;
  leverage?: number;
}): TapStructuralSlResult {
  const dir = params.direction;
  const entry = params.entry ?? (params.price > 0 ? params.price : null);
  const atr = params.atr > 0 ? params.atr : entry != null ? entry * 0.003 : 0;
  const lev = Math.max(1, Number(params.leverage) || 20);
  const roeCapPct = resolveTapointSlRoePct(params.timeframe);
  const empty: TapStructuralSlResult = {
    sl: null,
    structuralRaw: null,
    sourceKo: '없음',
    roeCapPct,
    cappedByRoe: false,
    noteKo: '방향·진입 없음',
  };
  if (!dir || entry == null || !(entry > 0)) return empty;

  let structural: number | null = null;
  let sourceKo = 'ATR';

  /** 1) plan structural (파이프 이미 구조 기반일 때) */
  const planSl = Number(params.planSl);
  if (Number.isFinite(planSl) && planSl > 0) {
    if (dir === 'LONG' && planSl < entry) {
      structural = planSl;
      sourceKo = 'plan구조SL';
    }
    if (dir === 'SHORT' && planSl > entry) {
      structural = planSl;
      sourceKo = 'plan구조SL';
    }
  }

  /** 2) Sweep extreme + swing invalidation */
  if (structural == null && params.structure) {
    const sweep = lastSweepLiquidity(params.structure.events);
    const swingLo = params.structure.lastSwingLow?.price;
    const swingHi = params.structure.lastSwingHigh?.price;
    if (dir === 'LONG') {
      const cands = [sweep.ssl, swingLo].filter(
        (x): x is number => x != null && x > 0 && x < entry
      );
      if (cands.length) {
        structural = Math.min(...cands) - atr * 0.08;
        sourceKo = sweep.ssl != null ? '스윕SSL·구조' : '스윙저·구조';
      }
    } else {
      const cands = [sweep.bsl, swingHi].filter(
        (x): x is number => x != null && x > 0 && x > entry
      );
      if (cands.length) {
        structural = Math.max(...cands) + atr * 0.08;
        sourceKo = sweep.bsl != null ? '스윕BSL·구조' : '스윙고·구조';
      }
    }
  }

  /** 3) Battle zone outer */
  if (structural == null && params.battleZone) {
    const z = params.battleZone;
    if (dir === 'LONG') {
      structural = z.lo - atr * 0.1;
      sourceKo = '전투구간 외측';
    } else {
      structural = z.hi + atr * 0.1;
      sourceKo = '전투구간 외측';
    }
  }

  /** 4) ATR buffer fallback */
  if (structural == null) {
    structural = dir === 'LONG' ? entry - atr * 1.2 : entry + atr * 1.2;
    sourceKo = 'ATR버퍼';
  }

  /** min distance noise */
  const minDist = atr * 0.35;
  if (dir === 'LONG' && entry - structural < minDist) structural = entry - minDist;
  if (dir === 'SHORT' && structural - entry < minDist) structural = entry + minDist;

  /** ROE cap = 최대 손절폭 상한 (구조가 더 타이트하면 유지) */
  const roeSl = roeTargetPrice(entry, dir, lev, roeCapPct);
  let cappedByRoe = false;
  let final = structural;
  if (dir === 'LONG' && structural < roeSl) {
    final = roeSl;
    cappedByRoe = true;
  }
  if (dir === 'SHORT' && structural > roeSl) {
    final = roeSl;
    cappedByRoe = true;
  }

  return {
    sl: final,
    structuralRaw: structural,
    sourceKo,
    roeCapPct,
    cappedByRoe,
    noteKo: cappedByRoe
      ? `${sourceKo} → ROE상한 ${roeCapPct}%@${lev}x 클램프`
      : `${sourceKo} · ROE상한 ${roeCapPct}% 미도달`,
  };
}
