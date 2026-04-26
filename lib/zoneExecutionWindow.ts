/**
 * 차트 TF에 맞춰 Binance aggTrade 누적 롤링 창(ms) — 존 체결 매수/매도 집계용.
 */

export function zoneExecutionWindowMsFromTimeframe(tf: string): number {
  const k = String(tf || '1h').trim();
  const table: Record<string, number> = {
    '1m': 60_000,
    '3m': 180_000,
    '5m': 300_000,
    '15m': 900_000,
    '30m': 1_800_000,
    '1h': 3_600_000,
    '2h': 7_200_000,
    '4h': 14_400_000,
    '6h': 21_600_000,
    '12h': 43_200_000,
    '1d': 86_400_000,
    '3d': 259_200_000,
    '1w': 604_800_000,
    '1M': 2_592_000_000,
    '1Y': 31_536_000_000,
  };
  return table[k] ?? 3_600_000;
}

/** 캡션·툴팁용 (예: 15분, 4시간, 3일) */
export function zoneExecutionWindowLabelKo(ms: number): string {
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))}분`;
  if (ms < 86_400_000) return `${Math.max(1, Math.round(ms / 3_600_000))}시간`;
  if (ms < 604_800_000) return `${Math.max(1, Math.round(ms / 86_400_000))}일`;
  if (ms < 2_592_000_000) return `${Math.max(1, Math.round(ms / 604_800_000))}주`;
  return `${Math.max(1, Math.round(ms / 2_592_000_000))}달`;
}
