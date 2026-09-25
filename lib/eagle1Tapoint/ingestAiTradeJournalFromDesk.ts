/**
 * 타점 리포트 → AI기록부 ingest.
 * 자동주문 호칭 「15분밴드자동」만 FIRE. 구 QS/SNIPER/오토는 기록 안 함(엔진·카드 유지).
 */
import type { TapointDecisionReport } from '@/lib/eagle1Tapoint/types';
import { ingestAiTradeJournal, resolveAiTradeJournalOutcomes } from '@/lib/eagle1Tapoint/aiTradeJournal';
import { INST_BAND_15M_ENGINE_ID } from '@/lib/eagle1Tapoint/instBand15mEventBacktester';
import { recordInstBand15mPaper } from '@/lib/eagle1Tapoint/instBand15mPaperLog';
import { normalizeTapointTf } from '@/lib/eagle1Tapoint/symbolEntryTf';
import {
  BAND15_AUTO_CALLSIGN,
  BAND15_AUTO_HOCHUNG,
  band15AutoWhyKo,
} from '@/lib/eagle1Tapoint/band15AutoSkill';

function closedBarTime(candles: Array<{ time: number }> | null | undefined): number {
  const n = candles?.length || 0;
  if (n < 2) return 0;
  return Number(candles![n - 2]?.time) || 0;
}

export function ingestAiTradeJournalFromDesk(params: {
  report: TapointDecisionReport | null | undefined;
  candles: Array<{ time: number; high: number; low: number; close: number }>;
  liveArmed?: boolean;
}): void {
  const report = params.report;
  if (!report) return;
  const barTime = closedBarTime(params.candles);
  if (!(barTime > 0)) return;
  ingestBand15mPaper({ report, barTime });
  resolveAiTradeJournalOutcomes({
    symbol: String(report.symbol || '').toUpperCase(),
    timeframe: String(report.timeframe || ''),
    candles: params.candles,
  });
}

function ingestBand15mPaper(params: {
  report: NonNullable<TapointDecisionReport>;
  barTime: number;
}): void {
  const report = params.report;
  if (normalizeTapointTf(report.timeframe) !== '15m') return;
  const ib = report.instBandPlan;
  const b1 = ib?.band1Dir;
  const b2 = ib?.band2Dir ?? ib?.bandDir;
  const aligned = Boolean(b1 && b2 && b1 === b2);
  const fire = Boolean(
    aligned &&
      ib?.actionable &&
      (ib.direction === 'LONG' || ib.direction === 'SHORT') &&
      ib.entry != null &&
      ib.sl != null &&
      ib.tp1 != null
  );
  ingestAiTradeJournal({
    symbol: String(report.symbol || '').toUpperCase(),
    timeframe: '15m',
    barTime: params.barTime,
    mode: 'PAPER',
    lane: 'INST_BAND_15M',
    engineId: INST_BAND_15M_ENGINE_ID,
    fire,
    eventId: fire ? `ib15-${params.barTime}-${ib?.direction}` : `ib15-wait-${params.barTime}`,
    setupId: 'BAND12',
    direction: ib?.direction ?? null,
    grade: String(ib?.grade || ib?.status || 'WAIT'),
    score: ib?.confluenceTotal || 0,
    waitReason: fire ? 'OK' : aligned ? String(ib?.status || 'WATCH') : 'BAND_MISALIGN',
    machineState: String(ib?.status || 'WAIT'),
    entry: ib?.entry ?? null,
    sl: ib?.sl ?? null,
    tp: ib?.tp1 ?? null,
    reasonKo: ib?.reasonKo || BAND15_AUTO_HOCHUNG,
    whyKo: fire ? band15AutoWhyKo(true) : ib?.reasonKo || `${BAND15_AUTO_HOCHUNG} 대기`,
  });
  if (fire && ib?.direction && ib.entry != null && ib.sl != null && ib.tp1 != null) {
    recordInstBand15mPaper({
      signalId: `ib15-paper-${report.symbol}-15m-${params.barTime}-${ib.direction}`,
      ts: Date.now(),
      symbol: String(report.symbol || '').toUpperCase(),
      timeframe: '15m',
      side: ib.direction,
      entry: ib.entry,
      tp: ib.tp1,
      sl: ib.sl,
      band1: String(b1),
      band2: String(b2),
      whyKo: `${BAND15_AUTO_HOCHUNG}(${BAND15_AUTO_CALLSIGN}) Paper`,
      live: false,
    });
  }
}
