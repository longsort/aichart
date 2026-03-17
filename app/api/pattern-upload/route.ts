import { NextRequest, NextResponse } from 'next/server';
import { loadPatterns, savePatterns, addPattern, ensureUniqueId } from '@/lib/recall/patternStore';
import type { PatternReference, PatternFeatures } from '@/types/pattern';

export const dynamic = 'force-dynamic';

const defaultFeatures: PatternFeatures = {
  bosCount: 0,
  chochCount: 0,
  fvgCount: 0,
  obCount: 0,
  sweepCount: 0,
  eqhCount: 0,
  eqlCount: 0,
  patternType: '',
  premiumDiscountState: 'unknown',
  trendBias: 'neutral',
  engineScore: 0,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id: givenId,
      title,
      sourceType = 'text',
      description,
      tags = [],
      timeframe,
      symbol,
      patternType,
      bias,
      features: rawFeatures,
      outcome,
      briefing,
      imagePath,
      imageMeta,
    } = body;

    if (!title || !outcome || !briefing) {
      return NextResponse.json(
        { error: 'title, outcome, briefing 필수' },
        { status: 400 }
      );
    }

    const patterns = loadPatterns();
    const features: PatternFeatures = {
      ...defaultFeatures,
      ...(rawFeatures && typeof rawFeatures === 'object' ? rawFeatures : {}),
    };

    const base = {
      title: String(title).slice(0, 200),
      sourceType: ['image', 'text', 'briefing', 'auto'].includes(sourceType) ? sourceType : 'text',
      description: description != null ? String(description).slice(0, 500) : undefined,
      tags: Array.isArray(tags) ? tags.slice(0, 20) : [],
      timeframe: timeframe != null ? String(timeframe) : undefined,
      symbol: symbol != null ? String(symbol) : undefined,
      patternType: patternType != null ? String(patternType) : undefined,
      bias: bias === 'bullish' || bias === 'bearish' || bias === 'neutral' ? bias : undefined,
      features,
      outcome: String(outcome).slice(0, 300),
      briefing: String(briefing).slice(0, 1000),
      imagePath: imagePath != null ? String(imagePath) : undefined,
      imageMeta: imageMeta && typeof imageMeta === 'object' ? imageMeta : undefined,
    };

    let item: PatternReference;
    if (givenId) {
      const id = ensureUniqueId(String(givenId), patterns);
      item = { ...base, id, createdAt: new Date().toISOString() } as PatternReference;
      patterns.push(item);
      savePatterns(patterns);
    } else {
      item = addPattern(base as Omit<PatternReference, 'id' | 'createdAt'>);
    }

    return NextResponse.json({ ok: true, id: item.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'pattern-upload failed' }, { status: 500 });
  }
}
