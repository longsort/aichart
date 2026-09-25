/**
 * Doksuri-1 — 소스별 데이터 품질.
 */
import type { DataQuality, Doksuri1DataQualityMap } from '@/lib/doksuri1/types';
import type { Candle } from '@/types';
import type { WhaleBeamIntelPack } from '@/lib/whaleVolumeBeamIntel';
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';

export function countBadSources(q: Doksuri1DataQualityMap): number {
  return (Object.values(q) as DataQuality[]).filter((x) => x === 'BAD').length;
}

export function assessDoksuri1DataQuality(params: {
  price: number;
  candles: Candle[];
  dumpZones: MtfDumpZoneSpec[] | null | undefined;
  whale: WhaleBeamIntelPack | null | undefined;
  hasStructure: boolean;
  hasDerivatives: boolean;
  hasOrderflow: boolean;
  hasPlanLevels: boolean;
  /** 칩 OFF면 해당 소스 BAD 카운트에서 제외(=GOOD 취급) */
  expectDerivatives?: boolean;
  expectOrderflow?: boolean;
}): Doksuri1DataQualityMap {
  const price: DataQuality =
    params.price > 0 && Number.isFinite(params.price) ? 'GOOD' : 'BAD';
  const volume: DataQuality =
    params.candles.length >= 20
      ? 'GOOD'
      : params.candles.length >= 8
        ? 'DEGRADED'
        : 'BAD';
  const dumpZones: DataQuality =
    params.dumpZones && params.dumpZones.length > 0 ? 'GOOD' : 'DEGRADED';
  const whale: DataQuality = params.whale?.live
    ? 'GOOD'
    : params.whale?.oracle
      ? 'DEGRADED'
      : 'BAD';
  const structure: DataQuality = params.hasStructure ? 'GOOD' : 'DEGRADED';
  const expectDeriv = params.expectDerivatives === true;
  const expectOf = params.expectOrderflow === true;
  const derivatives: DataQuality = !expectDeriv
    ? 'GOOD'
    : params.hasDerivatives
      ? 'GOOD'
      : 'BAD';
  const orderflow: DataQuality = !expectOf
    ? 'GOOD'
    : params.hasOrderflow
      ? 'GOOD'
      : 'BAD';
  const plans: DataQuality = params.hasPlanLevels ? 'GOOD' : 'DEGRADED';
  return { price, structure, dumpZones, whale, volume, derivatives, orderflow, plans };
}
