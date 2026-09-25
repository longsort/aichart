/**
 * Doksuri-1 — 학습표본 통계 단위 분리 (7390%류 금지).
 * TP1도달률% · SL도달률% · PF(배수) · 표본 n
 */
import type { AnalyzeResponse } from '@/types';

export type Doksuri1LearningStats = {
  sampleN: number | null;
  tp1ReachPct: number | null;
  slReachPct: number | null;
  /** TP1건/SL건 배수 — % 아님 */
  profitFactor: number | null;
  lineKo: string | null;
};

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}

export function buildDoksuri1LearningStats(
  analysis: AnalyzeResponse | null | undefined
): Doksuri1LearningStats {
  const L = analysis?.signalLearning;
  if (!L) {
    return { sampleN: null, tp1ReachPct: null, slReachPct: null, profitFactor: null, lineKo: null };
  }
  const n = Math.round((Number(L.longCount) || 0) + (Number(L.shortCount) || 0));
  const tp1 = Number(L.tp1Count) || 0;
  const sl = Number(L.slCount) || 0;
  const closed = tp1 + sl;
  if (n < 1 && closed < 1) {
    return { sampleN: null, tp1ReachPct: null, slReachPct: null, profitFactor: null, lineKo: null };
  }

  const sampleN = n > 0 ? n : Math.round(closed);
  let tp1ReachPct: number | null = null;
  let slReachPct: number | null = null;
  if (closed > 0) {
    tp1ReachPct = clampPct((tp1 / closed) * 100);
    slReachPct = clampPct((sl / closed) * 100);
  }

  /** PF = TP1가중 / SL가중 — 배수. SL=0이면 null (무한대 표기 금지) */
  let profitFactor: number | null = null;
  if (sl > 0 && tp1 > 0) {
    profitFactor = Math.round((tp1 / sl) * 100) / 100;
    if (profitFactor > 50) profitFactor = 50; // 표기 가드
  }

  const bits = [`표본 n=${sampleN}`];
  if (tp1ReachPct != null) bits.push(`TP1도달률 ${tp1ReachPct}%`);
  if (slReachPct != null) bits.push(`SL도달률 ${slReachPct}%`);
  if (profitFactor != null) bits.push(`PF ${profitFactor}배`);
  else if (tp1 > 0 && sl <= 0) bits.push('PF — (SL표본0)');

  return {
    sampleN,
    tp1ReachPct,
    slReachPct,
    profitFactor,
    lineKo: bits.join(' · '),
  };
}
