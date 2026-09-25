/**
 * Phase 6 — Candle Evidence 파사드.
 * ↑ Absorption / ⚡ Impulse / ◇ Sweep / × Fake / 🔥 Expansion
 * 봉당 1~2개. 영문 라벨 병기.
 */
import { runCandleEventEngine, type CandleEventKind, type CandleEventMark } from './candleEventEngine';
import type { Eagle1Bar, StructureEvent } from './structureEngine';
import type { Eagle1MoneyPressure } from './moneyPressureBand';

export type CandleEvidenceMark = CandleEventMark & {
  labelEn: string;
  chartIcon: string;
};

export type CandleEvidenceReport = {
  marks: CandleEvidenceMark[];
  maxPerBar: 2;
  iconLegend: Array<{ chartIcon: string; labelEn: string; labelKo: string }>;
  summaryKo: string;
};

const LABEL_EN: Record<CandleEventKind, string> = {
  SWEEP: 'Sweep',
  ABSORB: 'Absorption',
  IMPULSE: 'Impulse',
  FAKE_BREAK: 'Fake',
  EXPANSION: 'Expansion',
  STACK_BUY: 'Stack Buy',
  STACK_SELL: 'Stack Sell',
  BOS: 'BOS',
  CHOCH: 'CHoCH',
  MSS: 'MSS',
};

const CHART_ICON: Partial<Record<CandleEventKind, string>> = {
  ABSORB: '↑',
  IMPULSE: '⚡',
  SWEEP: '◇',
  FAKE_BREAK: '×',
  EXPANSION: '🔥',
};

function enrich(m: CandleEventMark): CandleEvidenceMark {
  return {
    ...m,
    labelEn: LABEL_EN[m.kind] ?? m.kind,
    chartIcon: CHART_ICON[m.kind] ?? m.icon,
    icon: CHART_ICON[m.kind] ?? m.icon,
  };
}

export function runCandleEvidenceEngine(params: {
  candles: Eagle1Bar[];
  events?: StructureEvent[] | null;
  money?: Eagle1MoneyPressure | null;
  endExclusive?: number;
}): CandleEvidenceReport {
  const raw = runCandleEventEngine(params);
  const byIndex = new Map<number, CandleEventMark[]>();
  for (const m of raw) {
    const arr = byIndex.get(m.index) ?? [];
    arr.push(m);
    byIndex.set(m.index, arr);
  }
  /** engine이 이미 1개면 그대로; 여유 시 2개까지 */
  const marks: CandleEvidenceMark[] = [];
  for (const [, arr] of byIndex) {
    for (const m of arr.slice(0, 2)) marks.push(enrich(m));
  }
  marks.sort((a, b) => a.index - b.index);

  return {
    marks: marks.slice(-48),
    maxPerBar: 2,
    iconLegend: [
      { chartIcon: '↑', labelEn: 'Absorption', labelKo: '흡수' },
      { chartIcon: '⚡', labelEn: 'Impulse', labelKo: '충격' },
      { chartIcon: '◇', labelEn: 'Sweep', labelKo: '스윕' },
      { chartIcon: '×', labelEn: 'Fake', labelKo: '가짜' },
      { chartIcon: '🔥', labelEn: 'Expansion', labelKo: '확장' },
    ],
    summaryKo: marks.length ? `봉 증거 ${marks.length}개 · 봉당≤2` : '데이터 없음',
  };
}
