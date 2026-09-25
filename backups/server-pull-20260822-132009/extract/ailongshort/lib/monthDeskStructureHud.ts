import type { ClosingEnvelopeFuturesScenario } from '@/lib/institutionalSuperBand';
import {
  collectStructureMarkCandleHighlights,
  type StructureCandleHighlight,
} from '@/lib/smcDeskOverlay';
import type { Candle } from '@/types';

export type MonthDeskStructurePick = {
  highlight: StructureCandleHighlight;
  barTime: number;
  pickedOnLastBar: boolean;
};

/**
 * 마지막 봉 우선, 없으면 최근 lookback 안의 가장 최근 구조 하이라이트 봉.
 */
export function pickMonthDeskStructureHighlight(
  candles: Candle[],
  swingPivot: number,
  traceBars: number,
  lookbackBars = 56
): MonthDeskStructurePick | null {
  const n = candles.length;
  if (n < 8) return null;
  const map = collectStructureMarkCandleHighlights(candles, swingPivot, 14, traceBars);
  if (!map.size) return null;
  const lastT = Number(candles[n - 1]?.time);
  if (!Number.isFinite(lastT)) return null;
  const lastH = map.get(lastT);
  if (lastH) return { highlight: lastH, barTime: lastT, pickedOnLastBar: true };
  const lo = Math.max(0, n - lookbackBars);
  for (let i = n - 2; i >= lo; i--) {
    const t = Number(candles[i]?.time);
    if (!Number.isFinite(t)) continue;
    const h = map.get(t);
    if (h) return { highlight: h, barTime: t, pickedOnLastBar: false };
  }
  return null;
}

export function describeMonthDeskStructureKo(pick: MonthDeskStructurePick): string[] {
  const h = pick.highlight;
  const dir = h.bias === 'bullish' ? '상방' : '하방';
  const tag = h.tag;
  const phaseKo =
    h.phase === 'breakout'
      ? '구조 돌파(방금 형성 · 다음 봉 종가 확인)'
      : h.phase === 'settling'
        ? '마감 검증 중(연속 종가 유지 단계)'
        : h.phase === 'confirmed'
          ? '구조 마감 안착 확정'
          : h.phase === 'failed'
            ? '구조 마감 실패 · 레벨 무효'
            : '구조 추적(trace)';
  const lines = [
    `${tag} · ${dir} · ${phaseKo}`,
    '돌파 레벨 대비 종가 유지 규칙 — SMC 구조 마커와 동일',
  ];
  if (!pick.pickedOnLastBar) {
    lines.push('※ ⌖ 마커 봉 = 구조 평가 봉(마지막 봉과 다를 수 있음)');
  }
  return lines;
}

/** 차트 마커 짧은 텍스트 */
export function monthDeskStructureMarkerLabel(h: StructureCandleHighlight): string {
  if (h.phase === 'confirmed') return '⌖✓';
  if (h.phase === 'failed') return '⌖✗';
  if (h.phase === 'breakout') return '⌖Δ';
  if (h.phase === 'settling') return '⌖◇';
  return '⌖···';
}

/** 마감존 시나리오 vs 구조 단계 한 줄 정합성(참고) */
export function monthDeskEnvelopeStructureAlignmentKo(
  scenario: ClosingEnvelopeFuturesScenario | null,
  pick: MonthDeskStructurePick | null
): string | null {
  if (!scenario || !pick) return null;
  const ph = pick.highlight.phase;
  if (ph === 'failed') {
    return '구조 무효 구간 — 마감존 시나리오와 별도로 되돌림·재시험 가능';
  }
  const envLong = scenario.bias === 'LONG';
  const envShort = scenario.bias === 'SHORT';
  const strBull = pick.highlight.bias === 'bullish';
  const strOk = ph === 'confirmed' || ph === 'settling' || ph === 'breakout' || ph === 'trace';
  if (!strOk) return null;
  if (envLong && strBull) {
    return '마감존 롱 편향 ↔ 구조 상방 단계 — 방향 스택(참고)';
  }
  if (envShort && !strBull) {
    return '마감존 숏 편향 ↔ 구조 하방 단계 — 방향 스택(참고)';
  }
  if (scenario.bias === 'NEUTRAL') {
    return '마감존 중립 — 구조 단계로 방향 가름';
  }
  return '마감존 편향과 구조 방향 상이 — 상위 TF·체결 확인 권장';
}
