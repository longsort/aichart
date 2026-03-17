import type { RawZone } from './zoneClusterEngine';
import type { StrongZoneOutput } from '@/types';

const CURRENT_PRICE_BAND_PCT = 0.03;
const MAX_BUY_ZONES = 2;
const MAX_SELL_ZONES = 2;

function distanceScore(zone: RawZone, currentPrice: number): number {
  const mid = (zone.low + zone.high) / 2;
  const distPct = Math.abs(mid - currentPrice) / currentPrice;
  if (distPct <= 0.005) return 1;
  if (distPct <= 0.01) return 0.9;
  if (distPct <= 0.02) return 0.7;
  if (distPct <= CURRENT_PRICE_BAND_PCT) return 0.5;
  return 0;
}

function absorptionScore(zone: RawZone, type: 'buy' | 'sell'): number {
  const totalExec = zone.executedBuy + zone.executedSell;
  if (totalExec <= 0) return 0.5;
  if (type === 'buy') {
    const buyRatio = zone.executedBuy / totalExec;
    return 0.3 + buyRatio * 0.7;
  }
  const sellRatio = zone.executedSell / totalExec;
  return 0.3 + sellRatio * 0.7;
}

function wallPersistenceScore(zone: RawZone, type: 'buy' | 'sell'): number {
  const liq = type === 'buy' ? zone.bidLiquidity : zone.askLiquidity;
  const other = type === 'buy' ? zone.askLiquidity : zone.bidLiquidity;
  const total = liq + other;
  if (total <= 0) return 0.5;
  return 0.2 + (liq / total) * 0.8;
}

function spoofRisk(zone: RawZone): number {
  const total = zone.bidLiquidity + zone.askLiquidity;
  if (total <= 0) return 0;
  const imbalance = Math.abs(zone.bidLiquidity - zone.askLiquidity) / total;
  return Math.min(1, imbalance * 1.2);
}

export function computeZoneStrength(
  zones: RawZone[],
  currentPrice: number
): { buyZones: StrongZoneOutput[]; sellZones: StrongZoneOutput[] } {
  const band = currentPrice * CURRENT_PRICE_BAND_PCT;
  const inRange = zones.filter(z => {
    const mid = (z.low + z.high) / 2;
    return Math.abs(mid - currentPrice) <= band;
  });

  const buyRaw = inRange.filter(z => z.type === 'buy' || z.executedBuy >= z.executedSell);
  const sellRaw = inRange.filter(z => z.type === 'sell' || z.executedSell >= z.executedBuy);

  const score = (z: RawZone, type: 'buy' | 'sell') => {
    const dist = distanceScore(z, currentPrice);
    const absorb = absorptionScore(z, type);
    const wall = wallPersistenceScore(z, type);
    const react = Math.min(1, z.reactionCount / 20);
    const spoof = 1 - spoofRisk(z);
    return dist * (0.35 * absorb + 0.25 * wall + 0.2 * react + 0.2 * spoof);
  };

  const toOutput = (z: RawZone, type: 'buy' | 'sell'): StrongZoneOutput => {
    const prob = Math.round(
      Math.min(95, Math.max(25, score(z, type) * 100))
    );
    const holdProb = type === 'buy' ? Math.round(prob * 0.92) : undefined;
    const breakProb = type === 'sell' ? Math.round(prob * 0.88) : undefined;
    const trap = Math.round((1 - spoofRisk(z)) * 100);
    const volumeUsdt = z.executedBuy + z.executedSell + z.bidLiquidity + z.askLiquidity;
    return {
      low: z.low,
      high: z.high,
      probability: prob,
      wallState: (z.bidLiquidity + z.askLiquidity) > 0 ? 'active' : 'weak',
      holdProbability: holdProb,
      breakProbability: breakProb,
      trapRisk: 100 - trap,
      volumeUsdt: volumeUsdt > 0 ? volumeUsdt : undefined,
    };
  };

  const buyZones = buyRaw
    .map(z => ({ z, s: score(z, 'buy') }))
    .sort((a, b) => b.s - a.s)
    .slice(0, MAX_BUY_ZONES)
    .map(({ z }) => toOutput(z, 'buy'));

  const sellZones = sellRaw
    .map(z => ({ z, s: score(z, 'sell') }))
    .sort((a, b) => b.s - a.s)
    .slice(0, MAX_SELL_ZONES)
    .map(({ z }) => toOutput(z, 'sell'));

  return { buyZones, sellZones };
}
