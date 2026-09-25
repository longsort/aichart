/**
 * Inherit confirmed zone bounds. New evidence may change status, never slide prices.
 */

import { atrAt, type Eagle1Bar } from './structureEngine';
import type { Eagle1Zone, ZoneSource } from './zoneEngine';

const LEVEL_SOURCES: ZoneSource[] = ['poc', 'vah', 'val'];

function relocReason(src: ZoneSource): string {
  if (src === 'poc') return 'POC 유의미 이동 — 기존 존 무효, 신규 존 생성';
  if (src === 'vah') return '거래량상단 유의미 이동 — 기존 존 무효, 신규 존 생성';
  return '거래량하단 유의미 이동 — 기존 존 무효, 신규 존 생성';
}

export function inheritFrozenZones(params: {
  fresh: Eagle1Zone[];
  prev: Eagle1Zone[] | undefined;
  candles: Eagle1Bar[];
  endExclusive: number;
}): Eagle1Zone[] {
  const prev = params.prev ?? [];
  const atr = atrAt(params.candles, params.endExclusive) || 0;
  const byId = new Map(prev.filter((z) => z.frozen).map((z) => [z.zone_id, z]));
  const usedPrev = new Set<string>();
  const out: Eagle1Zone[] = [];

  for (const z of params.fresh) {
    if (LEVEL_SOURCES.includes(z.source_type)) {
      const oldLvl = prev.find(
        (p) =>
          p.source_type === z.source_type &&
          p.frozen &&
          p.status !== 'BROKEN' &&
          p.status !== 'INVALID' &&
          p.status !== 'DELETED'
      );
      if (oldLvl && atr > 0 && Math.abs(z.midpoint - oldLvl.midpoint) <= atr * 0.5) {
        usedPrev.add(oldLvl.zone_id);
        out.push({
          ...z,
          zone_id: oldLvl.zone_id,
          lower: oldLvl.lower,
          upper: oldLvl.upper,
          midpoint: oldLvl.midpoint,
          frozen: true,
          created_at: oldLvl.created_at,
          reason: `${z.reason} (확정 가격 고정)`,
        });
        continue;
      }
      if (oldLvl && atr > 0 && Math.abs(z.midpoint - oldLvl.midpoint) > atr * 0.5) {
        out.push({
          ...oldLvl,
          status: 'INVALID',
          reason: relocReason(z.source_type),
        });
        out.push({
          ...z,
          zone_id: `${z.source_type}:reloc:${z.created_at}`,
          frozen: true,
          reason: `${z.source_type === 'poc' ? 'POC' : z.source_type === 'vah' ? '거래량상단' : '거래량하단'} 재배치(신규 존)`,
        });
        continue;
      }
    }
    const old = byId.get(z.zone_id);
    if (old) {
      usedPrev.add(old.zone_id);
      out.push({
        ...z,
        lower: old.lower,
        upper: old.upper,
        midpoint: old.midpoint,
        frozen: true,
        created_at: old.created_at,
      });
      continue;
    }
    out.push(z);
  }

  for (const old of prev) {
    if (usedPrev.has(old.zone_id)) continue;
    if (old.status === 'DELETED') continue;
    if (old.status === 'BROKEN' || old.status === 'INVALID') {
      out.push(old);
    }
  }
  return out;
}

export function confirmedZoneBoundsMoved(before: Eagle1Zone, after: Eagle1Zone): boolean {
  if (!before.frozen) return false;
  return before.lower !== after.lower || before.upper !== after.upper;
}
