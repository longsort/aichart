/**
 * 타점 decide — 봉 품질 + 리페인트 감사 → qualityOk.
 * 기존 qualityGate / repaintAudit 재사용 · 봉개수만으로 확정 금지.
 */
import type { Candle } from '@/types';
import { chartCandlesToEagle1Raw } from '@/lib/eagle1/canonicalCandle';
import { validateRawCandles } from '@/lib/eagle1/dataQualityValidator';
import { evaluateQualityGate } from '@/lib/eagle1/qualityGate';
import { runRepaintAudit } from '@/lib/eagle1/repaintAudit';
import { evaluateRepaintGate } from '@/lib/eagle1/repaintGate';

export type TapointQualityRepaintSnap = {
  qualityOk: boolean;
  barCountOk: boolean;
  qualityBlocked: boolean;
  repaintBlocked: boolean;
  noteKo: string;
  sampleCount: number;
};

export function evaluateTapointCandleQuality(params: {
  symbol: string;
  timeframe: string;
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>;
  minBars?: number;
}): TapointQualityRepaintSnap {
  const minBars = Math.max(32, params.minBars ?? 64);
  const candles = (params.candles || []) as Candle[];
  const barCountOk = candles.length >= minBars;
  const notes: string[] = [];

  if (!barCountOk) {
    notes.push(`봉부족 ${candles.length}/${minBars}`);
  }

  let qualityBlocked = false;
  let sampleCount = candles.length;
  try {
    const raw = chartCandlesToEagle1Raw(candles, {
      symbol: params.symbol,
      timeframe: params.timeframe,
      source: 'bitget-api',
      exchange: 'bitget',
    });
    const report = validateRawCandles(raw, {
      symbol: params.symbol,
      timeframe: params.timeframe,
    });
    sampleCount = report.sample_count || raw.length;
    const qGate = evaluateQualityGate(report);
    if (qGate.confirmedSignalBlocked) {
      qualityBlocked = true;
      notes.push(`품질차단:${qGate.reason}`);
    } else if (qGate.code !== 'ok') {
      notes.push(`품질경고:${qGate.reason}`);
    }
  } catch (e) {
    notes.push(`품질검사실패:${e instanceof Error ? e.message : 'err'}`);
    /** 검사 실패 시 봉수만으로 통과시키지 않음 — 확정 차단 */
    qualityBlocked = true;
  }

  let repaintBlocked = false;
  try {
    const audit = runRepaintAudit(
      candles.map((c) => ({ high: Number(c.high), low: Number(c.low) }))
    );
    const rGate = evaluateRepaintGate(audit);
    if (rGate.confirmedSignalBlocked) {
      repaintBlocked = true;
      notes.push(`리페인트:${rGate.reason.slice(0, 80)}`);
    }
  } catch (e) {
    notes.push(`리페인트검사실패:${e instanceof Error ? e.message : 'err'}`);
    repaintBlocked = true;
  }

  const qualityOk = barCountOk && !qualityBlocked && !repaintBlocked;
  return {
    qualityOk,
    barCountOk,
    qualityBlocked,
    repaintBlocked,
    noteKo: notes.length ? notes.join(' · ') : '품질·리페인트 OK',
    sampleCount,
  };
}
