import { NextRequest, NextResponse } from 'next/server';
import { SYMBOLS } from '@/lib/constants';
import { fetchMarketCandles } from '@/lib/market';
import { summarizeTopsBottomsForSymbol } from '@/lib/topsAndBottomsIndicator';

export const dynamic = 'force-dynamic';

/** 전종목 TOP/BOT 스캔 — 공개 캔들 API · 조건부 참고 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const timeframe = sp.get('timeframe')?.trim() || '1w';
  const limit = Math.min(80, Math.max(5, Number(sp.get('limit') || SYMBOLS.length)));
  const symbolsParam = sp.get('symbols')?.trim();
  const symbols = symbolsParam
    ? symbolsParam
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, limit)
    : SYMBOLS.slice(0, limit);

  const rows: ReturnType<typeof summarizeTopsBottomsForSymbol>[] = [];
  const chunk = 4;

  for (let i = 0; i < symbols.length; i += chunk) {
    const part = symbols.slice(i, i + chunk);
    const batch = await Promise.all(
      part.map(async (symbol) => {
        try {
          const candles = await fetchMarketCandles(symbol, timeframe, 'analyze');
          if (!candles.length) {
            return {
              symbol,
              price: 0,
              signal: 'NEUTRAL' as const,
              lastPrecisionTop: null,
              lastPrecisionBottom: null,
              distanceToTopPct: null,
              distanceToBottomPct: null,
              summaryKo: '캔들 없음',
            };
          }
          return summarizeTopsBottomsForSymbol(symbol, candles, timeframe);
        } catch {
          return {
            symbol,
            price: 0,
            signal: 'NEUTRAL' as const,
            lastPrecisionTop: null,
            lastPrecisionBottom: null,
            distanceToTopPct: null,
            distanceToBottomPct: null,
            summaryKo: '조회 실패',
          };
        }
      })
    );
    rows.push(...batch);
    if (i + chunk < symbols.length) {
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  const signals = rows.filter((r) => r.signal === 'TOP' || r.signal === 'BOT');
  const near = rows.filter((r) => r.signal === 'NEAR_TOP' || r.signal === 'NEAR_BOT');

  return NextResponse.json({
    ok: true,
    timeframe,
    scanned: rows.length,
    rows,
    highlights: {
      freshTop: rows.filter((r) => r.signal === 'TOP').map((r) => r.symbol),
      freshBot: rows.filter((r) => r.signal === 'BOT').map((r) => r.symbol),
      nearTop: rows.filter((r) => r.signal === 'NEAR_TOP').map((r) => r.symbol),
      nearBot: rows.filter((r) => r.signal === 'NEAR_BOT').map((r) => r.symbol),
    },
    summaryKo: `스캔 ${rows.length}종 · 신규 TOP ${signals.filter((s) => s.signal === 'TOP').length} · BOT ${signals.filter((s) => s.signal === 'BOT').length} · 근접 ${near.length}`,
  });
}
