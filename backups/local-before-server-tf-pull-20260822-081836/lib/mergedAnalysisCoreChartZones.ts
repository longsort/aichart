/**
 * 통합·분석 차트 — 핵심 ZONE (번호 0~4 · 최근 확정 · E/SL/TP).
 * 캔들 근처만이 아니라 **하방 지지 / 상방 저항**을 방향별로 확보.
 * 패널/엔진은 전량 유지, 차트 작도만 압축.
 */
import type { Candle } from '@/types';
import type { MergedDirectionConfirm } from '@/lib/mergedAnalysisDirectionConfirm';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import type { MergedCriticalZone } from '@/lib/mergedAnalysisCriticalZones';

/** 차트 번호 zone 상한 — 지지·저항 합 (TF 공통) */
export const MERGED_DESK_CHART_NUMBERED_ZONE_CAP = 4;
/** 롱/숏확정 zone 상한 */
export const MERGED_DESK_CHART_CONFIRM_ZONE_CAP = 2;
/** 방향별(아래 지지 / 위 저항) 최소·최대 */
const MAX_PER_SIDE = 2;

function minPriceGap(close: number): number {
  return Math.max(Math.abs(close) * 0.012, 10);
}

function isDemandRow(row: {
  key?: MergedKeyZone;
  critical?: MergedCriticalZone;
}): boolean {
  return row.key?.kind === 'demand' || row.critical?.scenario === 'if_decline';
}

function isSupplyRow(row: {
  key?: MergedKeyZone;
  critical?: MergedCriticalZone;
}): boolean {
  return row.key?.kind === 'supply' || row.critical?.scenario === 'if_rally';
}

/**
 * 거리 감점 완화 — 멀리 있어도 하방 지지·상방 저항은 남긴다.
 * 잘못된 쪽(가격 위 수요 / 아래 공급)은 강하게 감점.
 */
function scoreKeyZone(z: MergedKeyZone, close: number): number {
  const distPct = (Math.abs(z.price - close) / Math.max(Math.abs(close), 1e-9)) * 100;
  const patternBoost =
    z.pattern === 'decline_bounce' || z.pattern === 'rally_reject'
      ? 16
      : z.pattern.includes('double')
        ? 8
        : 0;
  let score = z.score * 12 + patternBoost - distPct * 0.55;
  if (z.kind === 'demand' && z.price > close) score -= 28;
  if (z.kind === 'supply' && z.price < close) score -= 28;
  if (z.kind === 'demand' && z.price < close) score += Math.min(10, distPct * 0.25);
  if (z.kind === 'supply' && z.price > close) score += Math.min(10, distPct * 0.25);
  return score;
}

function scoreCriticalZone(z: MergedCriticalZone, close: number): number {
  const distPct = (Math.abs(z.price - close) / Math.max(Math.abs(close), 1e-9)) * 100;
  const tierBoost = z.tier === 'S' ? 36 : z.tier === 'A' ? 22 : 10;
  let score =
    z.score + tierBoost + (z.isPrimary ? 14 : 0) + z.confluenceCount * 3 - distPct * 0.45;
  if (z.scenario === 'if_decline' && z.price > close) score -= 26;
  if (z.scenario === 'if_rally' && z.price < close) score -= 26;
  if (z.scenario === 'if_decline' && z.price < close) score += Math.min(12, distPct * 0.3);
  if (z.scenario === 'if_rally' && z.price > close) score += Math.min(12, distPct * 0.3);
  return score;
}

function pickSide(
  pool: Array<{ price: number; score: number; key?: MergedKeyZone; critical?: MergedCriticalZone }>,
  side: 'demand' | 'supply',
  close: number,
  gap: number,
  maxN: number
): Array<{ price: number; score: number; key?: MergedKeyZone; critical?: MergedCriticalZone }> {
  const filtered = pool
    .filter((r) => (side === 'demand' ? isDemandRow(r) : isSupplyRow(r)))
    .filter((r) =>
      side === 'demand' ? r.price <= close * 1.002 : r.price >= close * 0.998
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        (side === 'demand'
          ? Math.abs(a.price - close) - Math.abs(b.price - close)
          : Math.abs(a.price - close) - Math.abs(b.price - close))
    );
  const out: typeof pool = [];
  for (const row of filtered) {
    if (out.some((p) => Math.abs(p.price - row.price) < gap)) continue;
    out.push(row);
    if (out.length >= maxN) break;
  }
  return out;
}

export function pickMergedDeskCoreChartZones(
  keyZones: MergedKeyZone[],
  criticalZones: MergedCriticalZone[],
  candles: Candle[]
): { keyZones: MergedKeyZone[]; criticalZones: MergedCriticalZone[] } {
  const close = Number(candles[candles.length - 1]?.close);
  if (!Number.isFinite(close) || close <= 0) {
    return {
      keyZones: keyZones.slice(0, 2),
      criticalZones: criticalZones.slice(0, 2),
    };
  }

  type Row = { price: number; score: number; key?: MergedKeyZone; critical?: MergedCriticalZone };
  const pool: Row[] = [];
  for (const z of keyZones) pool.push({ price: z.price, score: scoreKeyZone(z, close), key: z });
  for (const z of criticalZones) {
    pool.push({ price: z.price, score: scoreCriticalZone(z, close), critical: z });
  }

  const gap = minPriceGap(close);
  const demand = pickSide(pool, 'demand', close, gap, MAX_PER_SIDE);
  const supply = pickSide(pool, 'supply', close, gap, MAX_PER_SIDE);

  let picked = [...demand, ...supply].sort((a, b) => b.score - a.score);
  if (picked.length > MERGED_DESK_CHART_NUMBERED_ZONE_CAP) {
    // 방향 균형 유지: 지지·저항 각 최소 1개 남기고 초과분 컷
    const keepDemand = demand.slice(0, Math.max(1, Math.min(MAX_PER_SIDE, demand.length)));
    const keepSupply = supply.slice(0, Math.max(1, Math.min(MAX_PER_SIDE, supply.length)));
    picked = [...keepDemand, ...keepSupply]
      .sort((a, b) => b.score - a.score)
      .slice(0, MERGED_DESK_CHART_NUMBERED_ZONE_CAP);
  }

  /** 한쪽이 비면 반대쪽 여유분으로 채우지 말고, 잘못된 방향이라도 후보가 있으면 1개 보강 */
  if (!picked.some(isDemandRow)) {
    const alt = pool
      .filter(isDemandRow)
      .sort((a, b) => b.score - a.score)[0];
    if (alt && !picked.some((p) => Math.abs(p.price - alt.price) < gap)) {
      if (picked.length >= MERGED_DESK_CHART_NUMBERED_ZONE_CAP) picked.pop();
      picked.push(alt);
    }
  }
  if (!picked.some(isSupplyRow)) {
    const alt = pool
      .filter(isSupplyRow)
      .sort((a, b) => b.score - a.score)[0];
    if (alt && !picked.some((p) => Math.abs(p.price - alt.price) < gap)) {
      if (picked.length >= MERGED_DESK_CHART_NUMBERED_ZONE_CAP) picked.pop();
      picked.push(alt);
    }
  }

  return {
    keyZones: picked.filter((r) => r.key).map((r) => r.key!),
    criticalZones: picked.filter((r) => r.critical).map((r) => r.critical!),
  };
}

export function pickMergedDeskCoreConfirmConfirms(
  confirms: MergedDirectionConfirm[]
): MergedDirectionConfirm[] {
  /** 차트: 확정 + ST홀드 시나리오(strong) — 오르기 전 선행 표시 */
  const pool = confirms.filter((c) => c.tier === 'confirmed' || c.tier === 'strong');
  if (pool.length <= MERGED_DESK_CHART_CONFIRM_ZONE_CAP) return pool;

  const asc = [...pool].sort((a, b) => a.time - b.time);
  const lastLong = [...asc].reverse().find((c) => c.direction === 'LONG');
  const lastShort = [...asc].reverse().find((c) => c.direction === 'SHORT');
  const out: MergedDirectionConfirm[] = [];
  if (lastLong) out.push(lastLong);
  if (lastShort && !out.some((c) => c.time === lastShort.time)) out.push(lastShort);
  if (out.length < MERGED_DESK_CHART_CONFIRM_ZONE_CAP) {
    const last = asc[asc.length - 1]!;
    if (!out.some((c) => c.time === last.time)) out.push(last);
  }
  return out.slice(0, MERGED_DESK_CHART_CONFIRM_ZONE_CAP);
}
