import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketCandles } from '@/lib/market';
import {
  buildMtfZoneBattlePack,
  ZONE_BATTLE_MTF_TFS,
} from '@/lib/assets353SmcZoneBattleMtf';

export const dynamic = 'force-dynamic';

/** MTF Zone Battle — 1m~1M 각 봉 캔들로 겹침 zone L/S% 합산 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const zoneBot = Number(searchParams.get('zoneBot'));
  const zoneTop = Number(searchParams.get('zoneTop'));
  if (!Number.isFinite(zoneBot) || !Number.isFinite(zoneTop) || !(zoneTop > zoneBot)) {
    return NextResponse.json({ ok: false, error: 'zoneBot/zoneTop required' }, { status: 400 });
  }

  const tfCandles: Array<{ tf: string; candles: Awaited<ReturnType<typeof fetchMarketCandles>> }> = [];
  const chunk = 3;

  for (let i = 0; i < ZONE_BATTLE_MTF_TFS.length; i += chunk) {
    const part = ZONE_BATTLE_MTF_TFS.slice(i, i + chunk);
    const batch = await Promise.all(
      part.map(async (tf) => {
        try {
          const candles = await fetchMarketCandles(symbol, tf, 'analyze');
          return { tf, candles: candles ?? [] };
        } catch {
          return { tf, candles: [] as Awaited<ReturnType<typeof fetchMarketCandles>> };
        }
      })
    );
    tfCandles.push(...batch);
    if (i + chunk < ZONE_BATTLE_MTF_TFS.length) {
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  const pack = buildMtfZoneBattlePack({
    zoneBot,
    zoneTop,
    tfCandles,
    chartTf: searchParams.get('chartTf') ?? undefined,
  });

  return NextResponse.json({ ok: true, pack });
}
