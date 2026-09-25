import { NextRequest, NextResponse } from 'next/server';
import {
  buildAssetsChartAiPack,
  buildLiveStructureFeatures,
  matchAssetsImagesToLive,
} from '@/lib/assetsChartAiDraw';
import { buildMergedDeskAssetsSuperAiPack } from '@/lib/mergedDeskAssetsSuperAi';
import { runAssets353CandleKnowledgeEngine } from '@/lib/assets353CandleKnowledgeEngine';
import { getAssetsImageCatalog } from '@/lib/assetsImageCatalog';
import type { Candle } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * POST — assets 353 참조 매칭 + 라이브 캔들 작도 템플릿.
 * GET — 카탈로그 요약.
 */
export async function GET() {
  const cat = getAssetsImageCatalog();
  return NextResponse.json({
    ok: true,
    total: cat.total,
    chartable: cat.chartable,
    generatedAt: cat.generatedAt,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      candles?: Candle[];
      analysis?: Record<string, unknown> | null;
      smcLeading?: Record<string, unknown> | null;
      tradePlan?: { direction?: string; entry?: number } | null;
      minMatchScore?: number;
    };

    const candles = Array.isArray(body.candles) ? body.candles : [];
    if (candles.length < 20) {
      return NextResponse.json({ ok: false, error: 'candles 부족' }, { status: 400 });
    }

    const live = buildLiveStructureFeatures({
      analysis: body.analysis as import('@/types').AnalyzeResponse | null,
      smcLeading: body.smcLeading as import('@/lib/mergedAnalysisSmcLeading').MergedSmcLeadingContext | null,
      dominantPatternType: String((body.analysis as { dominantPattern?: { type?: string } })?.dominantPattern?.type || ''),
      dominantPatternBias: String((body.analysis as { dominantPattern?: { bias?: string } })?.dominantPattern?.bias || ''),
    });

    const matches = matchAssetsImagesToLive(live, 8, body.minMatchScore ?? 0.28);
    const pack = runAssets353CandleKnowledgeEngine({
      candles,
      analysis: body.analysis as import('@/types').AnalyzeResponse | null,
      smcLeading: body.smcLeading as import('@/lib/mergedAnalysisSmcLeading').MergedSmcLeadingContext | null,
      tradePlan: body.tradePlan as import('@/lib/unifiedDeskTradePlan').UnifiedDeskTradePlan | null,
    });

    return NextResponse.json({
      ok: true,
      superAi: true,
      liveFeatures: live,
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
