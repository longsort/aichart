import { NextRequest, NextResponse } from 'next/server';
import {
  appendMtfStatisticsSnapshot,
  buildMtfStatisticsHistoryDashboard,
  evaluateMtfStatisticsHistory,
  persistEvaluatedRecords,
  readMtfStatisticsHistory,
} from '@/lib/mtfStatisticsHistoryStore';
import type { UnifiedMtfAnalysisStatistics } from '@/lib/unifiedMtfAnalysisStatistics';

export const dynamic = 'force-dynamic';

function getClientId(req: NextRequest): string {
  const header = req.headers.get('x-client-id');
  if (header && header.length >= 8) return header;
  const url = new URL(req.url);
  const q = url.searchParams.get('clientId');
  if (q && q.length >= 8) return q;
  return 'default';
}

export async function GET(req: NextRequest) {
  try {
    const clientId = getClientId(req);
    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol')?.trim() || undefined;
    const chartTf = url.searchParams.get('chartTf')?.trim() || undefined;
    const currentPrice = Number(url.searchParams.get('currentPrice'));

    let records = readMtfStatisticsHistory(clientId);
    const evaluated = evaluateMtfStatisticsHistory(
      records,
      Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : null,
      symbol,
      chartTf
    );

    const changed = evaluated.some((r, i) => r.outcome.status !== records[i]?.outcome.status);
    if (changed) {
      persistEvaluatedRecords(clientId, evaluated);
      records = evaluated;
    }

    const dashboard = buildMtfStatisticsHistoryDashboard(records, symbol, chartTf);

    return NextResponse.json({
      ok: true,
      clientId,
      records: dashboard.recent,
      dashboard,
      totalStored: records.length,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message || 'history failed' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const clientId = getClientId(req);
    const body = await req.json().catch(() => ({}));
    const stats = body.stats as UnifiedMtfAnalysisStatistics | undefined;
    const currentPrice = Number(body.currentPrice);

    if (!stats || typeof stats !== 'object') {
      return NextResponse.json({ ok: false, error: 'stats 필수' }, { status: 400 });
    }
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      return NextResponse.json({ ok: false, error: 'currentPrice 필수' }, { status: 400 });
    }

    const { appended, record } = appendMtfStatisticsSnapshot(clientId, stats, currentPrice);

    let records = readMtfStatisticsHistory(clientId);
    records = evaluateMtfStatisticsHistory(records, currentPrice, stats.symbol, stats.chartTf);
    persistEvaluatedRecords(clientId, records);

    const dashboard = buildMtfStatisticsHistoryDashboard(
      records,
      stats.symbol,
      stats.chartTf
    );

    return NextResponse.json({
      ok: true,
      appended,
      record,
      dashboard,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message || 'append failed' },
      { status: 500 }
    );
  }
}
