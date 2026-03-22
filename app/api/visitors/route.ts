import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** 단일 프로세스 메모리 — 멀티 인스턴스 시 Redis 등으로 교체 */
const activeVisitors = new Map<string, number>();
const VISITOR_TTL_MS = 35_000;

function pruneStale() {
  const now = Date.now();
  for (const [id, t] of activeVisitors.entries()) {
    if (now - t > VISITOR_TTL_MS) activeVisitors.delete(id);
  }
}

/** GET: 현재 접속자 수 */
export async function GET() {
  pruneStale();
  return NextResponse.json({ count: activeVisitors.size });
}

/** POST: 접속 등록/하트비트/종료 — body: { visitorId, action: 'join'|'ping'|'leave' } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { visitorId, action } = body as { visitorId?: string; action?: string };
    const id = typeof visitorId === 'string' ? visitorId.trim() : '';
    if (!id) return NextResponse.json({ count: activeVisitors.size });

    const now = Date.now();
    if (action === 'leave') {
      activeVisitors.delete(id);
    } else if (action === 'join' || action === 'ping' || !action) {
      activeVisitors.set(id, now);
    }
    pruneStale();
    return NextResponse.json({ count: activeVisitors.size });
  } catch {
    return NextResponse.json({ count: activeVisitors.size });
  }
}
