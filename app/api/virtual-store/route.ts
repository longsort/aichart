import { NextRequest, NextResponse } from 'next/server';
import { readVirtualStore, writeVirtualStore } from '@/lib/serverVirtualStore';

export const dynamic = 'force-dynamic';

function getClientId(req: NextRequest): string {
  const header = req.headers.get('x-client-id');
  if (header && header.length >= 8) return header;
  const url = new URL(req.url);
  const q = url.searchParams.get('clientId');
  if (q && q.length >= 8) return q;
  return 'default';
}

/** GET: 가상매매·실패신호 조회 */
export async function GET(req: NextRequest) {
  try {
    const clientId = getClientId(req);
    const data = readVirtualStore(clientId);
    return NextResponse.json({
      ok: true,
      trades: data.trades,
      failedSignals: data.failedSignals,
      updatedAt: data.updatedAt,
      clientId,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}

/** POST: 가상매매·실패신호 저장 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const clientId =
      (body.clientId as string) || getClientId(req) || 'default';
    const trades = Array.isArray(body.trades) ? body.trades : [];
    const failedSignals = Array.isArray(body.failedSignals)
      ? body.failedSignals
      : [];

    const ok = writeVirtualStore(clientId, trades, failedSignals);
    return NextResponse.json({
      ok,
      clientId,
      updatedAt: Date.now(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
