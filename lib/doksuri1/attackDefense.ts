/**
 * Doksuri-1 — Zone Attack vs Defense (덤프존 + 흡수 점수).
 */
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';
import type { Doksuri1ZoneScore, ZoneBattleState } from '@/lib/doksuri1/types';
import { dumpZoneStableId } from '@/lib/mergedDeskLearningSnapshot';

function lifeToState(z: MtfDumpZoneSpec, price: number): ZoneBattleState {
  const lo = Math.min(z.top, z.bot);
  const hi = Math.max(z.top, z.bot);
  const ls = z.lifeState;
  if (ls === 'CONFIRM_DOWN' || (ls === 'CONFIRM_RESIST' && price > hi)) return 'BROKEN';
  if (ls === 'CONFIRM_UP') return 'DEFENDING';
  if (ls === 'BOUNCE_WATCH' || ls === 'RESIST_WATCH') return 'TESTING';
  if (price >= lo * 0.998 && price <= hi * 1.002) return 'TESTING';
  if (price > hi && price < hi * 1.008) return 'APPROACHING';
  if (price < lo && price > lo * 0.992) return 'APPROACHING';
  return 'APPROACHING';
}

export function scoreDumpZonesAttackDefense(params: {
  symbol: string;
  price: number;
  zones: MtfDumpZoneSpec[];
  absorptionByZoneId?: Record<string, number | null>;
}): Doksuri1ZoneScore[] {
  const out: Doksuri1ZoneScore[] = [];
  for (const z of params.zones.slice(0, 8)) {
    const id = dumpZoneStableId({
      symbol: params.symbol,
      sourceTf: z.sourceTf,
      bandRole: z.bandRole,
      top: z.top,
      bot: z.bot,
    });
    const evidence = Number(z.evidenceScore) || 0;
    const sr = z.viewModel?.sr?.score0to100 ?? null;
    let defense = Math.round(Math.min(100, evidence * 8 + (sr != null ? sr * 0.35 : 20)));
    let attack = Math.round(Math.min(100, 100 - defense * 0.55 + (z.bandRole === 'ceiling' ? 15 : 0)));
    const abs = params.absorptionByZoneId?.[id];
    if (abs != null && Number.isFinite(abs)) {
      if (z.bandRole === 'floor') defense = Math.min(100, Math.round(defense * 0.5 + abs * 0.5));
      else attack = Math.min(100, Math.round(attack * 0.5 + abs * 0.5));
    }
    const state = lifeToState(z, params.price);
    if (state === 'BROKEN') defense = Math.max(0, defense - 25);
    if (state === 'DEFENDING') defense = Math.min(100, defense + 10);
    const role = z.bandRole === 'ceiling' ? '매도감시' : '지지방어';
    out.push({
      zoneId: id,
      top: Math.max(z.top, z.bot),
      bot: Math.min(z.top, z.bot),
      attackScore: attack,
      defenseScore: defense,
      state,
      labelKo: `${z.sourceTfKo || z.sourceTf} ${role}`,
    });
  }
  return out;
}
