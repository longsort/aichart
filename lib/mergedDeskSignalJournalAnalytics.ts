/**
 * 신호 기록부 — 조건부 정확도·holdPct·합류·세션 집계 (보강·가중치용).
 * 확정 승률·수익 보장 아님.
 */
import {
  readTradeEventJournal,
  TRADE_JOURNAL_OUTCOME_KINDS,
  TRADE_JOURNAL_OUTCOME_SOURCE_KINDS,
  type TradeJournalEvent,
} from '@/lib/mergedDeskTradeEventJournal';

export type SignalAccuracyBucket = {
  n: number;
  hit: number;
  hitPct: number | null;
};

export type SignalJournalAnalytics = {
  totalSignals: number;
  withOutcome12: number;
  directionHitPct12: number | null;
  byFeature: Record<string, SignalAccuracyBucket>;
  byHoldPct: Record<string, SignalAccuracyBucket>;
  byConfluenceScore: Record<string, SignalAccuracyBucket>;
  bySession: Record<string, SignalAccuracyBucket>;
  byConfluenceAligned: { aligned: SignalAccuracyBucket; notAligned: SignalAccuracyBucket };
};

function bucket(acc: Record<string, SignalAccuracyBucket>, key: string, hit: boolean) {
  if (!acc[key]) acc[key] = { n: 0, hit: 0, hitPct: null };
  acc[key].n += 1;
  if (hit) acc[key].hit += 1;
  acc[key].hitPct = Math.round((acc[key].hit / acc[key].n) * 100);
}

function finalizeBuckets(map: Record<string, SignalAccuracyBucket>): Record<string, SignalAccuracyBucket> {
  for (const k of Object.keys(map)) {
    const b = map[k]!;
    b.hitPct = b.n > 0 ? Math.round((b.hit / b.n) * 100) : null;
  }
  return map;
}

function sourceForOutcome(outcome: TradeJournalEvent, sources: TradeJournalEvent[]): TradeJournalEvent | null {
  if (!outcome.signalId) return null;
  return sources.find((s) => s.signalId === outcome.signalId) ?? null;
}

/** OUTCOME_12 + signalId 연결 집계 */
export function buildSignalJournalAnalytics(
  symbol: string,
  chartTf?: string
): SignalJournalAnalytics {
  const rows = readTradeEventJournal().filter(
    (e) =>
      e.symbol.toUpperCase() === symbol.toUpperCase() &&
      (!chartTf || e.chartTf === chartTf)
  );
  const sources = rows.filter((e) => TRADE_JOURNAL_OUTCOME_SOURCE_KINDS.includes(e.kind));
  const outcomes12 = rows.filter((e) => e.kind === 'OUTCOME_12' && e.meta?.directionHit != null);

  const byFeature: Record<string, SignalAccuracyBucket> = {};
  const byHoldPct: Record<string, SignalAccuracyBucket> = {};
  const byConfluenceScore: Record<string, SignalAccuracyBucket> = {};
  const bySession: Record<string, SignalAccuracyBucket> = {};
  const aligned: SignalAccuracyBucket = { n: 0, hit: 0, hitPct: null };
  const notAligned: SignalAccuracyBucket = { n: 0, hit: 0, hitPct: null };

  let hitTotal = 0;
  for (const o of outcomes12) {
    const hit = o.meta?.directionHit === true;
    if (hit) hitTotal += 1;
    const src = sourceForOutcome(o, sources);
    const feature = String(o.meta?.feature ?? src?.meta?.feature ?? 'unknown');
    bucket(byFeature, feature, hit);

    const hold = src?.meta?.holdPct ?? o.meta?.holdPct;
    if (hold != null && Number.isFinite(Number(hold))) {
      const band = Math.floor(Number(hold) / 10) * 10;
      bucket(byHoldPct, `${band}-${band + 9}%`, hit);
    }

    const conf = src?.meta?.confluenceScore ?? o.meta?.confluenceScore;
    if (conf != null && Number.isFinite(Number(conf))) {
      bucket(byConfluenceScore, String(conf), hit);
    }

    const session = String(src?.meta?.sessionKo ?? o.meta?.sessionKo ?? 'unknown');
    bucket(bySession, session, hit);

    const isAligned = src?.meta?.confluenceAligned === true || o.meta?.confluenceAligned === true;
    const tgt = isAligned ? aligned : notAligned;
    tgt.n += 1;
    if (hit) tgt.hit += 1;
  }

  aligned.hitPct = aligned.n > 0 ? Math.round((aligned.hit / aligned.n) * 100) : null;
  notAligned.hitPct = notAligned.n > 0 ? Math.round((notAligned.hit / notAligned.n) * 100) : null;

  return {
    totalSignals: sources.length,
    withOutcome12: outcomes12.length,
    directionHitPct12:
      outcomes12.length > 0 ? Math.round((hitTotal / outcomes12.length) * 100) : null,
    byFeature: finalizeBuckets(byFeature),
    byHoldPct: finalizeBuckets(byHoldPct),
    byConfluenceScore: finalizeBuckets(byConfluenceScore),
    bySession: finalizeBuckets(bySession),
    byConfluenceAligned: { aligned, notAligned },
  };
}

export function exportSignalJournalWithAnalytics(symbol: string, chartTf?: string): string {
  const events = readTradeEventJournal().filter((e) =>
    chartTf
      ? e.symbol.toUpperCase() === symbol.toUpperCase() && e.chartTf === chartTf
      : e.symbol.toUpperCase() === symbol.toUpperCase()
  );
  const analytics = buildSignalJournalAnalytics(symbol, chartTf);
  return JSON.stringify(
    {
      schema: 'ailongshort.tradeEventJournal.v4',
      learningSchema: 'desk-learning.v1',
      purposeKo:
        '통합분석 기능합류·폭락보드·N봉도달 학습용. 과거 유사 스냅샷 매칭 후 가능 움직임 표시용 원본.',
      disclaimerKo: '조건부 표본 · 확정 승률·수익 보장 아님',
      exportedAt: new Date().toISOString(),
      symbol,
      chartTf: chartTf ?? null,
      count: events.length,
      outcomeSourceKinds: TRADE_JOURNAL_OUTCOME_SOURCE_KINDS,
      outcomeKinds: TRADE_JOURNAL_OUTCOME_KINDS,
      analytics,
      events,
    },
    null,
    2
  );
}
