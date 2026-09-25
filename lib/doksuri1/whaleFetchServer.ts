/**
 * Doksuri-1 고래빔 — 서버 전용 (fs 카탈로그 폴백).
 * 클라이언트/번들에서 import 금지.
 */
import type { Candle } from '@/types';
import type { WhaleBeamIntelPack } from '@/lib/whaleVolumeBeamIntel';
import { buildWhaleBeamIntelPack } from '@/lib/whaleVolumeBeamIntel';
import { readBitgetWhaleVolumeCatalog } from '@/lib/bitgetWhaleVolumeCatalogStore';
import { fetchDoksuri1WhaleBeamPack as fetchWhaleHttp } from '@/lib/doksuri1/buildDoksuri1Pack';

export async function fetchDoksuri1WhaleBeamPackServer(params: {
  apiBase: string;
  symbol: string;
  timeframe: string;
  candles?: Candle[];
}): Promise<WhaleBeamIntelPack | null> {
  const viaHttp = await fetchWhaleHttp({
    apiBase: params.apiBase,
    symbol: params.symbol,
    timeframe: params.timeframe,
    candles: params.candles,
  });
  if (viaHttp?.live) return viaHttp;

  const symbol = String(params.symbol || '').toUpperCase();
  const tf = String(params.timeframe || '15m');
  const candles = params.candles;
  if (!candles || candles.length < 25) return viaHttp;

  const tfs = Array.from(new Set([tf, '15m', '1h', '4h']));
  for (const tryTf of tfs) {
    try {
      const catalog = await readBitgetWhaleVolumeCatalog(symbol, tryTf);
      if (!catalog || catalog.totalBars < 80) continue;
      const intel = buildWhaleBeamIntelPack({
        symbol,
        timeframe: tryTf,
        candles,
        catalog,
      });
      if (intel?.live) return intel;
    } catch {
      /* next tf */
    }
  }
  return viaHttp;
}
