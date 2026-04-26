import { NextRequest, NextResponse } from 'next/server';
import { loadWhaleMemory } from '@/lib/whaleMemory';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const timeframe = searchParams.get('timeframe') || '1h';
  const mem = loadWhaleMemory(symbol, timeframe);
  if (!mem) {
    return NextResponse.json({ ok: false, zones: [], reason: 'not_found' });
  }
  return NextResponse.json({ ok: true, symbol, timeframe, zones: mem.zones, generatedAt: mem.generatedAt });
}

