import { NextRequest, NextResponse } from 'next/server';
import { MTF_SIGNAL_BOARD_TFS } from '@/lib/mtfSignalBoardDigest';

export const dynamic = 'force-dynamic';

const BOARD_TTL_MS = 12_000;
/** TF당 analyze 최대 대기 — undici HeadersTimeout(기본 ~300s) 방지 */
const PER_TF_TIMEOUT_MS = 18_000;
const boardMemo = new Map<string, { at: number; rows: Array<{ tf: string; analyze: unknown }> }>();
const boardInflight = new Map<string, Promise<Array<{ tf: string; analyze: unknown }>>>();

/**
 * MTF 카드용: 동일 쿼리로 `MTF_SIGNAL_BOARD_TFS`(1m→1M) 각각 `/api/analyze` 호출 결과를 한 번에 반환.
 * 클라이언트가 타 TF를 여러 번 두드리지 않게 해 부하·레이스를 줄임.
 *
 * 쿼리는 `/api/analyze`와 동일하게 두고 `excludeTf`(현재 차트 TF)만 제외해 호출 수를 줄일 수 있음.
 */
export async function GET(req: NextRequest) {
  const excludeTf = req.nextUrl.searchParams.get('excludeTf')?.trim() || '';
  const template = req.nextUrl.clone();
  template.searchParams.delete('excludeTf');
  template.pathname = '/api/analyze';
  const memoKey = `${template.search}|ex=${excludeTf}`;
  const hit = boardMemo.get(memoKey);
  if (hit && Date.now() - hit.at < BOARD_TTL_MS) {
    return NextResponse.json({ rows: hit.rows });
  }
  const inflight = boardInflight.get(memoKey);
  if (inflight) {
    const rows = await inflight;
    return NextResponse.json({ rows });
  }

  const cookie = req.headers.get('cookie') || '';
  const fwd = req.headers.get('x-forwarded-for');
  /** 브라우저가 쿠키 없이 시크릿만 쓰는 경우(스모크·내부) 하위 analyze 에도 전달 */
  const internalSecret = req.headers.get('x-internal-analyze-secret');
  const tfs = MTF_SIGNAL_BOARD_TFS.filter((t) => t !== excludeTf);

  const run = (async () => {
    const rows: Array<{ tf: string; analyze: unknown }> = [];
    const chunk = 4;

    for (let i = 0; i < tfs.length; i += chunk) {
      const part = tfs.slice(i, i + chunk);
      const batch = await Promise.all(
        part.map(async (tf) => {
          const u = template.clone();
          u.searchParams.set('timeframe', tf);
          try {
            const res = await fetch(u, {
              headers: {
                cookie,
                ...(fwd ? { 'x-forwarded-for': fwd } : {}),
                ...(internalSecret ? { 'x-internal-analyze-secret': internalSecret } : {}),
              },
              cache: 'no-store',
              signal: AbortSignal.timeout(PER_TF_TIMEOUT_MS),
            });
            const analyze = await res.json().catch(() => ({}));
            return { tf, analyze };
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'fetch failed';
            return {
              tf,
              analyze: {
                ok: false,
                error: msg.includes('Timeout') || msg.includes('abort') ? 'TF_TIMEOUT' : msg,
              },
            };
          }
        }),
      );
      rows.push(...batch);
    }

    boardMemo.set(memoKey, { at: Date.now(), rows });
    if (boardMemo.size > 40) {
      const oldest = boardMemo.keys().next().value;
      if (oldest) boardMemo.delete(oldest);
    }
    return rows;
  })();

  boardInflight.set(memoKey, run);
  try {
    const rows = await run;
    return NextResponse.json({ rows });
  } finally {
    boardInflight.delete(memoKey);
  }
}
