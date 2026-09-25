/**
 * 서버에 고정된 E/SL/TP 조회 (무접속 진입 후 클라이언트가 따라감)
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const LOCKS = path.join(
  process.cwd(),
  'data',
  'eagle1',
  'profit_pattern_server_locks.json'
);

export async function GET(req: NextRequest) {
  const symbol = String(req.nextUrl.searchParams.get('symbol') || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  try {
    const raw = fs.existsSync(LOCKS)
      ? (JSON.parse(fs.readFileSync(LOCKS, 'utf8')) as Record<string, unknown>)
      : {};
    if (symbol) {
      return NextResponse.json({ ok: true, lock: raw[symbol] || null, symbol });
    }
    return NextResponse.json({ ok: true, locks: raw });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'fail' },
      { status: 500 }
    );
  }
}
