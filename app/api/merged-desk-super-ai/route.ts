import { NextRequest, NextResponse } from 'next/server';
import { runAssets353CandleKnowledgeEngine } from '@/lib/assets353CandleKnowledgeEngine';
import { getAssetsImageCatalog } from '@/lib/assetsImageCatalog';
import type { Candle } from '@/types';

export const dynamic = 'force-dynamic';

/** GET — Super AI 카탈로그 요약 */
export async function GET() {
  const cat = getAssetsImageCatalog();
  return NextResponse.json({
    ok: true,
    superAi: true,
    total: cat.total,
    chartable: cat.chartable,
    generatedAt: cat.generatedAt,
  });
}

/** POST — assets 353 Super AI 매칭 + 실시간 작도 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      candles?: Candle[];
      analysis?: Record<string, unknown> | null;
      smcLeading?: Record<string, unknown> | null;
      tradePlan?: { direction?: string; entry?: number } | null;
    };

    const candles = Array.isArray(body.candles) ? body.candles : [];
    if (candles.length < 24) {
      return NextResponse.json({ ok: false, error: 'candles 부족 (24+)' }, { status: 400 });
    }

    const pack = runAssets353CandleKnowledgeEngine({
      candles,
      analysis: body.analysis as import('@/types').AnalyzeResponse | null,
      smcLeading: body.smcLeading as import('@/lib/mergedAnalysisSmcLeading').MergedSmcLeadingContext | null,
      tradePlan: body.tradePlan as import('@/lib/unifiedDeskTradePlan').UnifiedDeskTradePlan | null,
    });

    return NextResponse.json({
      ok: true,
      superAi: true,
      verdict: pack.verdict,
      brief: pack.verdict.headlineKo,
      overlayCount: pack.overlayCount,
      overlays: pack.overlays,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
