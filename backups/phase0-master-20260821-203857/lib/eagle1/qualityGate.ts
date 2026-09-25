import type { Eagle1QualityReport } from '@/lib/eagle1/rawTypes';

export type Eagle1QualityGate = {
  confirmedSignalBlocked: boolean;
  code: 'ok' | 'DATA_QUALITY_WARNING' | '데이터 없음';
  reason: string;
  sample_count: number;
  timeframe: string;
  engine_version: string;
};

export function evaluateQualityGate(report: Eagle1QualityReport | null | undefined): Eagle1QualityGate {
  if (!report) {
    return {
      confirmedSignalBlocked: false,
      code: '데이터 없음',
      reason: '품질 리포트 없음 — 확정 차단하지 않음(표본 창만 검사)',
      sample_count: 0,
      timeframe: '',
      engine_version: '',
    };
  }
  if (report.confirmed_signal_blocked) {
    return {
      confirmedSignalBlocked: true,
      code: 'DATA_QUALITY_WARNING',
      reason:
        report.sample_count === 0
          ? '데이터 없음'
          : report.invalid_ohlc_count > 0
            ? 'invalid OHLC'
            : report.duplicate_count > 0
              ? 'duplicate candle'
              : report.negative_volume_count > 0
                ? 'negative volume'
                : 'DATA_QUALITY_WARNING',
      sample_count: report.sample_count,
      timeframe: report.timeframe,
      engine_version: report.engine_version,
    };
  }
  return {
    confirmedSignalBlocked: false,
    code: 'ok',
    reason: report.severity === 'warning' ? '신뢰도 낮음(갭/영거래량) — 확정은 허용' : 'ok',
    sample_count: report.sample_count,
    timeframe: report.timeframe,
    engine_version: report.engine_version,
  };
}
