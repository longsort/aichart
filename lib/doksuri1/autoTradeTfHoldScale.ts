/**
 * TF별 자동매매 보유·TP 스케일.
 * 1·3·5m=초단 · 15m↑ 점점 길게 · 일·주·월 장기.
 * 확정 승률·수익 아님.
 */
import { normalizeChartTimeframe } from '@/lib/constants';

export type AutoTradeTfHoldProfile = {
  tf: string;
  labelKo: string;
  /** 마감봉 기준 최대 보유 */
  maxBars: number;
  /** TP1 목표 ROE% (증거금) */
  tp1RoePct: number;
  /** TP2 목표 ROE% */
  tp2RoePct: number;
  /** TP3 목표 ROE% */
  tp3RoePct: number;
  /** 참고 보유시간(시간) — 비용게이트용 */
  holdHoursHint: number;
};

const TABLE: Record<string, Omit<AutoTradeTfHoldProfile, 'tf'>> = {
  '1m': {
    labelKo: '1분·초단',
    maxBars: 20,
    tp1RoePct: 5,
    tp2RoePct: 8,
    tp3RoePct: 10,
    holdHoursHint: 0.25,
  },
  '3m': {
    labelKo: '3분·초단',
    maxBars: 16,
    tp1RoePct: 5,
    tp2RoePct: 9,
    tp3RoePct: 11,
    holdHoursHint: 0.4,
  },
  '5m': {
    labelKo: '5분·초단',
    maxBars: 14,
    tp1RoePct: 5,
    tp2RoePct: 10,
    tp3RoePct: 12,
    holdHoursHint: 0.5,
  },
  '15m': {
    labelKo: '15분·단타',
    maxBars: 18,
    tp1RoePct: 6,
    tp2RoePct: 12,
    tp3RoePct: 15,
    holdHoursHint: 2,
  },
  '1h': {
    labelKo: '1시간·스윙단',
    maxBars: 24,
    tp1RoePct: 7,
    tp2RoePct: 14,
    tp3RoePct: 18,
    holdHoursHint: 8,
  },
  '4h': {
    labelKo: '4시간·스윙',
    maxBars: 28,
    tp1RoePct: 8,
    tp2RoePct: 16,
    tp3RoePct: 22,
    holdHoursHint: 24,
  },
  '1d': {
    labelKo: '일봉·포지션',
    maxBars: 20,
    tp1RoePct: 10,
    tp2RoePct: 20,
    tp3RoePct: 28,
    holdHoursHint: 72,
  },
  '1w': {
    labelKo: '주봉·장기',
    maxBars: 14,
    tp1RoePct: 12,
    tp2RoePct: 24,
    tp3RoePct: 36,
    holdHoursHint: 240,
  },
  '1M': {
    labelKo: '월봉·초장기',
    maxBars: 10,
    tp1RoePct: 15,
    tp2RoePct: 30,
    tp3RoePct: 45,
    holdHoursHint: 720,
  },
};

export const AUTO_TRADE_SCAN_TFS = [
  '1m',
  '3m',
  '5m',
  '15m',
  '1h',
  '4h',
  '1d',
  '1w',
  '1M',
] as const;

export function resolveAutoTradeTfHold(tf: string): AutoTradeTfHoldProfile {
  const n = normalizeChartTimeframe(tf);
  const row = TABLE[n] || TABLE['15m']!;
  return { tf: n, ...row };
}

/** ultraScalpMaxBars 대체 — HTF 포함 */
export function autoTradeMaxBarsForTf(tf: string): number {
  return resolveAutoTradeTfHold(tf).maxBars;
}
