import { NextRequest, NextResponse } from 'next/server';
import { saveCurrentAnalysisAsPattern } from '@/lib/recall/patternAutoSave';
import type { AnalyzeResponse } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const analysis = body.analysis ?? body.engine ? { ...body, engine: body.engine } : null;
    if (!analysis?.symbol || !analysis?.engine) {
      return NextResponse.json({ error: 'analysis 또는 engine 필수' }, { status: 400 });
    }
    const result = saveCurrentAnalysisAsPattern(analysis as AnalyzeResponse, {
      title: body.title,
      outcome: body.outcome,
    });
    if (!result) return NextResponse.json({ error: '저장 실패' }, { status: 500 });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'pattern-save failed' }, { status: 500 });
  }
}
