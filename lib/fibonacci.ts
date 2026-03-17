export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

export function fibLevels(high: number, low: number): Record<number, number> {
  const range = high - low;
  const out: Record<number, number> = {};
  for (const r of FIB_RATIOS) {
    out[r] = high - range * r;
  }
  return out;
}

export function inGoldenPocket(price: number, high: number, low: number): boolean {
  const levels = fibLevels(high, low);
  const gpLow = levels[0.618];
  const gpHigh = levels[0.382];
  return price >= Math.min(gpLow, gpHigh) && price <= Math.max(gpLow, gpHigh);
}
