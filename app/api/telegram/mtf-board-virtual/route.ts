import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { readUserSettings } from '@/lib/serverUserSettings';
import { mergeUserSettingsFromServerJson } from '@/lib/mergeUserSettingsFromServerJson';
import { fetchMtfBoardDigestRowsForSymbol } from '@/lib/mtfBoardTelegramFetch';
import { mtfBoardHasCurrentOrPrevHot } from '@/lib/mtfBoardTelegramAlert';
import { buildMtfBoardSvg, mtfBoardSvgToPngBuffer } from '@/lib/mtfBoardTelegramImage';

export const dynamic = 'force-dynamic';

function internalApiBaseUrl(): string {
  const b = (process.env.INTERNAL_API_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  if (b) return b.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const p = process.env.PORT || '3000';
  return `http://127.0.0.1:${p}`;
}

/**
 * MTF 카드 PNG를 크론과 동일하게 생성만 하고 **텔레그램으로는 보내지 않음** (가상 1회 미리보기).
 * 로그인 쿠키 필요. 본문 `{ "symbol": "BTCUSDT" }` 생략 시 `telegramMultiTfSymbols` 전부 검사.
 */
export async function POST(req: NextRequest) {
  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { symbol?: string };
  const symbolFilter = String(body?.symbol || '').trim().toUpperCase();

  const raw = await readUserSettings(auth.user);
  const st = mergeUserSettingsFromServerJson(raw);

  const base = internalApiBaseUrl();
  const analyzeSecret = (process.env.INTERNAL_ANALYZE_SECRET || process.env.TELEGRAM_MULTITF_CRON_SECRET || '').trim();

  let syms = Array.isArray(st.telegramMultiTfSymbols) ? st.telegramMultiTfSymbols : [];
  syms = syms.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean);
  if (symbolFilter) {
    syms = syms.length ? syms.filter((s) => s === symbolFilter) : [symbolFilter];
  }
  if (!syms.length) {
    return NextResponse.json(
      {
        ok: false,
        error: '심볼 없음: 차트 심볼을 지정하거나 설정의 MTF 텔레 심볼 목록을 채워 주세요.',
      },
      { status: 400 },
    );
  }

  const items: Array<{
    symbol: string;
    hot: boolean;
    caption?: string;
    imageDataUrl?: string;
    pngBytes?: number;
    error?: string;
  }> = [];

  for (const symbol of syms) {
    try {
      const rows = await fetchMtfBoardDigestRowsForSymbol({
        settings: st,
        symbol,
        baseUrl: base,
        analyzeSecret: analyzeSecret || undefined,
      });
      const hot = mtfBoardHasCurrentOrPrevHot(rows);
      if (!hot) {
        items.push({ symbol, hot: false });
        continue;
      }
      const svg = buildMtfBoardSvg({ symbol, rows });
      const png = await mtfBoardSvgToPngBuffer(svg);
      const caption = `${symbol} MTF 신호 (15m→1M) — 가상미리보기(텔레 미전송)`;
      if (png && png.length > 0) {
        const b64 = png.toString('base64');
        items.push({
          symbol,
          hot: true,
          caption,
          pngBytes: png.length,
          imageDataUrl: `data:image/png;base64,${b64}`,
        });
      } else {
        items.push({ symbol, hot: true, caption, pngBytes: 0, error: 'png_empty' });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      items.push({ symbol, hot: false, error: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    virtual: true,
    user: auth.user,
    items,
    note: '텔레그램 API는 호출하지 않았습니다. 실제 전송은 /api/cron/mtf-board-telegram 입니다.',
  });
}
