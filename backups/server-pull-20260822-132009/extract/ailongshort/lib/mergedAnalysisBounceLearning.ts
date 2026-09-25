/**
 * 통합·분석 — 반등/하락 목표 hit·miss 타임라인 + 로컬 학습 로그.
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import type { MergedAnalysisTimelineEvent, MergedAnalysisTimelineTrack } from '@/lib/mergedAnalysisDeskEngine';
import type { MergedBounceScenario } from '@/lib/mergedAnalysisBounceTargets';
import { lastBarTime } from '@/lib/monthDeskLastCandleFocus';
import type { Candle } from '@/types';

const BOUNCE_LEARN_KEY = 'ailongshort-merged-bounce-learn-v1';

export type MergedBounceLearnEntry = {
  at: number;
  scenarioId: string;
  targetLabel: string;
  hit: boolean;
  price: number;
  timeframe: string;
};

function loadBounceLearnLog(): MergedBounceLearnEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(BOUNCE_LEARN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MergedBounceLearnEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, 120) : [];
  } catch {
    return [];
  }
}

function saveBounceLearnLog(entries: MergedBounceLearnEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BOUNCE_LEARN_KEY, JSON.stringify(entries.slice(0, 120)));
  } catch {}
}

/** bounce target hit/miss → 타임라인 이벤트 + 로컬 로그 */
export function appendMergedBounceLearningTimeline(
  tracks: MergedAnalysisTimelineTrack[],
  bounceScenarios: MergedBounceScenario[],
  candles: Candle[],
  timeframe: string
): void {
  const trackPullback = tracks.find((t) => t.key === 'pullback');
  if (!trackPullback || !bounceScenarios.length) return;

  const lastT = lastBarTime(candles) ?? Number(candles[candles.length - 1]?.time);
  if (!Number.isFinite(lastT)) return;

  const active = bounceScenarios.filter((s) => s.active).slice(0, 2);
  const log = loadBounceLearnLog();
  let logChanged = false;

  for (const sc of active) {
    for (const tgt of sc.targets) {
      const labelKo = tgt.hit
        ? `${tgt.label} 적중 ${Math.round(tgt.price)}`
        : `${tgt.label} 미달 ${Math.round(tgt.price)}`;
      const exists = trackPullback.events.some((e) => e.labelKo === labelKo && e.time === lastT);
      if (!exists) {
        trackPullback.events.push({
          time: lastT,
          color: tgt.hit ? '#22C55E' : '#94A3B8',
          hot: !tgt.hit && tgt.label === 'T1',
          labelKo,
        });
      }

      const logKey = `${sc.id}-${tgt.label}-${tgt.hit ? 'hit' : 'miss'}`;
      if (!log.some((e) => e.scenarioId === logKey && Math.abs(e.at - Date.now()) < 60_000)) {
        log.unshift({
          at: Date.now(),
          scenarioId: logKey,
          targetLabel: tgt.label,
          hit: tgt.hit,
          price: tgt.price,
          timeframe,
        });
        logChanged = true;
      }
    }
  }

  if (logChanged) saveBounceLearnLog(log);
}

export function summarizeMergedBounceLearnKo(): string {
  const log = loadBounceLearnLog();
  if (!log.length) return '반등학습 — 로그 없음';
  const hits = log.filter((e) => e.hit).length;
  const recent = log.slice(0, 12);
  return `반등학습 ${hits}/${recent.length} 적중(최근) — 검증 필요`;
}
