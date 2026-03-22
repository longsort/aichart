import { NextRequest, NextResponse } from 'next/server';
import {
  readConfirmedSignals,
  appendConfirmedSignal,
  type ConfirmedSignalRecord,
} from '@/lib/serverVirtualStore';

export const dynamic = 'force-dynamic';

function getClientId(req: NextRequest): string {
  const header = req.headers.get('x-client-id');
  if (header && header.length >= 8) return header;
  const url = new URL(req.url);
  const q = url.searchParams.get('clientId');
  if (q && q.length >= 8) return q;
  return 'default';
}

/** GET: 확정신호 목록 조회 */
export async function GET(req: NextRequest) {
  try {
    const clientId = getClientId(req);
    const signals = readConfirmedSignals(clientId);
    return NextResponse.json({
      ok: true,
      signals,
      clientId,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}

/** POST: 확정신호 추가 (각 분·시·일·주·달 봉 신호 저장) */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const clientId =
      (body.clientId as string) || getClientId(req) || 'default';

    const signal = body.signal as Partial<ConfirmedSignalRecord>;
    if (
      !signal?.symbol ||
      !signal?.timeframe ||
      (signal.direction !== 'LONG' && signal.direction !== 'SHORT')
    ) {
      return NextResponse.json(
        { ok: false, error: 'signal { symbol, timeframe, direction } 필수' },
        { status: 400 }
      );
    }

    const record: ConfirmedSignalRecord = {
      symbol: String(signal.symbol),
      timeframe: String(signal.timeframe),
      direction: signal.direction,
      entry: Number(signal.entry) || 0,
      stop: Number(signal.stop) || 0,
      targets: Array.isArray(signal.targets)
        ? signal.targets.map(Number).filter((n: number) => !isNaN(n))
        : [],
      entryTime: Number(signal.entryTime) || Math.floor(Date.now() / 1000),
      at: Number(signal.at) || Date.now(),
    };

    const ok = appendConfirmedSignal(clientId, record);
    return NextResponse.json({
      ok,
      clientId,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
