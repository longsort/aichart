import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** 단일 프로세스 메모리 — 멀티 인스턴스 시 Redis 등으로 교체 */
const activeVisitors = new Map<string, { at: number; user: string }>();
const VISITOR_TTL_MS = 35_000;

function pruneStale() {
  const now = Date.now();
  for (const [id, rec] of activeVisitors.entries()) {
    if (now - rec.at > VISITOR_TTL_MS) activeVisitors.delete(id);
  }
}

function snapshot() {
  pruneStale();
  const users = [...new Set(
    [...activeVisitors.values()]
      .map(v => v.user?.trim())
      .filter(Boolean)
  )].sort();
  return { count: activeVisitors.size, users };
}

/** GET: 현재 접속자 수 */
export async function GET() {
  return NextResponse.json(snapshot());
}

/** POST: 접속 등록/하트비트/종료 — body: { visitorId, action: 'join'|'ping'|'leave', user? } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { visitorId, action, user } = body as { visitorId?: string; action?: string; user?: string };
    const id = typeof visitorId === 'string' ? visitorId.trim() : '';
    const safeUser = typeof user === 'string' && user.trim() ? user.trim() : '게스트';
    if (!id) return NextResponse.json(snapshot());

    const now = Date.now();
    if (action === 'leave') {
      activeVisitors.delete(id);
    } else if (action === 'join' || action === 'ping' || !action) {
      const prev = activeVisitors.get(id);
      activeVisitors.set(id, { at: now, user: safeUser || prev?.user || '게스트' });
    }
    return NextResponse.json(snapshot());
  } catch {
    return NextResponse.json(snapshot());
  }
}
