import type { AnalyzeResponse } from '@/types';
import { structureRocketDirectionOnLastCandle } from '@/lib/mtfStructureRocket';

type CandleLike = { time?: number };

function candleOpenContainingTime(candles: CandleLike[], entrySec: number): number | null {
  const n = candles.length;
  if (!n || !Number.isFinite(entrySec)) return null;
  const firstT = candles[0].time as number;
  if (entrySec < firstT) return null;
  let lo = 0;
  let hi = n - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const ct = candles[mid].time as number;
    if (ct <= entrySec) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (ans < 0) return null;
  return candles[ans].time as number;
}

function chartSlFailureKeySet(
  failures: Array<{ time: number; verdict: 'LONG' | 'SHORT' }> | undefined,
  candles: CandleLike[]
): Set<string> {
  const s = new Set<string>();
  if (!failures?.length || !candles.length) return s;
  for (const f of failures) {
    if (f.verdict !== 'LONG' && f.verdict !== 'SHORT') continue;
    const t = Number(f.time);
    if (!Number.isFinite(t)) continue;
    const open = candleOpenContainingTime(candles, t);
    s.add(`${open ?? t}|${f.verdict}`);
  }
  return s;
}

function filterRocketsBySl<T extends { time: number; direction: 'LONG' | 'SHORT' }>(
  rows: T[] | undefined,
  slSet: Set<string>,
  candles: CandleLike[]
): T[] {
  if (!slSet.size || !rows?.length) return rows ?? [];
  return rows.filter((r) => {
    const open = candleOpenContainingTime(candles, r.time) ?? r.time;
    return !slSet.has(`${open}|${r.direction}`);
  });
}

function tfPeriodSeconds(tf: string): number {
  const m: Record<string, number> = {
    '1m': 60,
    '3m': 180,
    '5m': 300,
    '15m': 900,
    '1h': 3600,
    '4h': 14400,
    '1d': 86400,
    '1w': 604800,
    '1M': 2592000,
    '1Y': 31536000,
  };
  return m[tf] ?? 60;
}

/** ChartView와 동일 출처 — 배치 MTF에서도 확정 히스토리 백필 */
export type ConfirmedHistoryForLastBar = ReadonlyArray<{
  symbol: string;
  timeframe?: string;
  direction: 'LONG' | 'SHORT';
  entryTime?: number;
}>;

export type InferLastBarLsOptions = {
  symbol?: string;
  confirmedHistory?: ConfirmedHistoryForLastBar;
};

/**
 * /api/analyze 한 건(JSON)으로 locked / rsiOnly 채운 뒤 마지막 캔들 L/S.
 * `confirmedHistory` 넘기면 ChartView와 같이 `/api/confirmed-signals` 백필·3연속 정리 적용.
 * 로컬 스토리지(봉별 누적)만 제외.
 */
export function inferLastBarLsFromAnalyzePayload(
  d: Record<string, unknown>,
  tf: string,
  opts?: InferLastBarLsOptions
): 'LONG' | 'SHORT' | null {
  const candles = (d.candles as CandleLike[] | undefined) ?? [];
  if (!Array.isArray(candles) || candles.length === 0) {
    const v = d.verdict as string | undefined;
    return v === 'LONG' || v === 'SHORT' ? v : null;
  }
  const lastIdx = candles.length - 1;
  const lastT = candles[lastIdx]?.time as number;
  if (!Number.isFinite(lastT)) {
    const v = d.verdict as string | undefined;
    return v === 'LONG' || v === 'SHORT' ? v : null;
  }
  const effSignalLast = lastT;
  const rsi = d.rsiDivergenceSignal as
    | {
        verdict?: string;
        signalBarTime?: number;
        divergenceLines?: Array<{ type: string; index2: number }>;
        signalHistory?: Array<{ time: number; verdict: 'LONG' | 'SHORT' }>;
      }
    | undefined;
  const learningPassed = (d.learningFilter as { passed?: boolean } | undefined)?.passed !== false;
  const confirmed = d.confirmedSignal as
    | { confirmed?: boolean; direction?: 'LONG' | 'SHORT' | null }
    | undefined;
  const topVerdict = d.verdict as string | undefined;

  const locked = new Map<number, 'LONG' | 'SHORT'>();
  const rsiOnly = new Map<number, 'LONG' | 'SHORT'>();

  const direction = confirmed?.direction;
  const isConfirmed = Boolean(confirmed?.confirmed && direction && (direction === 'LONG' || direction === 'SHORT'));
  const sigBt = rsi?.signalBarTime;
  const barTime =
    sigBt != null && candles.some((c) => (c.time as number) === sigBt) ? sigBt : effSignalLast;

  if (learningPassed && isConfirmed && direction && candles.some((c) => (c.time as number) === barTime)) {
    locked.set(barTime, direction);
  } else if (learningPassed && rsi && (rsi.verdict === 'LONG' || rsi.verdict === 'SHORT')) {
    const rsiBarTime = rsi.signalBarTime ?? effSignalLast;
    if (candles.some((c) => (c.time as number) === rsiBarTime)) {
      rsiOnly.set(rsiBarTime, rsi.verdict as 'LONG' | 'SHORT');
    }
  }

  if (rsi?.divergenceLines?.length) {
    for (const ln of rsi.divergenceLines) {
      const idx2 = ln.index2;
      if (idx2 < 0 || idx2 >= candles.length) continue;
      const t = candles[idx2].time as number;
      if (!Number.isFinite(t)) continue;
      if (!candles.some((x) => (x.time as number) === t)) continue;
      if (ln.type === 'bullish') rsiOnly.set(t, 'LONG');
      if (ln.type === 'bearish') rsiOnly.set(t, 'SHORT');
    }
  }
  if (rsi?.signalHistory?.length) {
    for (const h of rsi.signalHistory) {
      if (h.verdict !== 'LONG' && h.verdict !== 'SHORT') continue;
      if (!candles.some((x) => (x.time as number) === h.time)) continue;
      rsiOnly.set(h.time, h.verdict);
    }
  }
  if ((topVerdict === 'LONG' || topVerdict === 'SHORT') && candles.some((c) => (c.time as number) === effSignalLast)) {
    rsiOnly.set(effSignalLast, topVerdict);
  }

  const sym = (opts?.symbol ?? (d.symbol as string | undefined)) || '';
  const confirmedHistory = opts?.confirmedHistory;
  if (confirmedHistory?.length && sym) {
    for (const h of confirmedHistory) {
      if (h.symbol !== sym) continue;
      if (h.direction !== 'LONG' && h.direction !== 'SHORT') continue;
      const te = Number(h.entryTime ?? 0);
      if (!Number.isFinite(te) || te <= 0) continue;
      const barOpen = candleOpenContainingTime(candles, te);
      if (barOpen == null) continue;
      locked.set(barOpen, h.direction);
    }
    const rows = confirmedHistory
      .filter(
        (h) =>
          h.symbol === sym &&
          h.timeframe === tf &&
          (h.direction === 'LONG' || h.direction === 'SHORT')
      )
      .sort((a, b) => Number(b.entryTime ?? 0) - Number(a.entryTime ?? 0))
      .slice(0, 3);
    const allShort3 = rows.length >= 3 && rows.every((x) => x.direction === 'SHORT');
    const allLong3 = rows.length >= 3 && rows.every((x) => x.direction === 'LONG');
    if (allShort3 || allLong3) {
      const keepDir: 'LONG' | 'SHORT' = allShort3 ? 'SHORT' : 'LONG';
      for (const [tk, dv] of [...locked.entries()]) {
        if (dv !== keepDir) locked.delete(tk);
      }
      for (const [tk, dv] of [...rsiOnly.entries()]) {
        if (dv !== keepDir) rsiOnly.delete(tk);
      }
    }
  }

  const period = tfPeriodSeconds(tf);
  const t = lastT;
  const rangeEnd = t + period;

  /** 마지막 봉 구간 [t, t+period) 안에서 가장 늦은 시각의 신호 — Map 순서 의존 제거 */
  let v: 'LONG' | 'SHORT' | undefined;
  let signalSrcTime: number | undefined;
  let bestLockedT = -Infinity;
  for (const [lockedTime, dir] of locked) {
    if (t <= lockedTime && lockedTime < rangeEnd && lockedTime >= bestLockedT) {
      bestLockedT = lockedTime;
      v = dir;
      signalSrcTime = lockedTime;
    }
  }
  if (v == null) {
    let bestRsiT = -Infinity;
    for (const [rsiTime, dir] of rsiOnly) {
      if (t <= rsiTime && rsiTime < rangeEnd && rsiTime >= bestRsiT) {
        bestRsiT = rsiTime;
        v = dir;
        signalSrcTime = rsiTime;
      }
    }
  }

  const slFail = d.signalLearning as { slFailures?: Array<{ time: number; verdict: 'LONG' | 'SHORT' }> } | undefined;
  const slSet = chartSlFailureKeySet(slFail?.slFailures, candles);
  const lsSlFailed =
    v != null &&
    signalSrcTime != null &&
    slSet.has(`${candleOpenContainingTime(candles, signalSrcTime) ?? signalSrcTime}|${v}`);

  if (v && !lsSlFailed) return v;

  const slKeyForBar = (barOpen: number, dir: 'LONG' | 'SHORT') =>
    `${candleOpenContainingTime(candles, barOpen) ?? barOpen}|${dir}`;

  /** API가 이미 정리한 L/S 플랜 — 신호 봉이 마지막 캔들이면 칩에 반영 */
  const plan = d.lsSignalPlan as { direction?: string; signalTime?: number } | undefined;
  if (plan && (plan.direction === 'LONG' || plan.direction === 'SHORT') && Number.isFinite(plan.signalTime as number)) {
    const open = candleOpenContainingTime(candles, plan.signalTime as number);
    if (open === lastT) {
      const dir = plan.direction as 'LONG' | 'SHORT';
      if (!slSet.has(slKeyForBar(plan.signalTime as number, dir))) return dir;
    }
  }

  const zs = d.zoneSignal as { zone?: string } | undefined;
  if (zs?.zone === 'long_confirm') return 'LONG';
  if (zs?.zone === 'short_confirm') return 'SHORT';

  const panel = d.analysisPanel as { zoneState?: string } | undefined;
  if (panel?.zoneState === 'long_confirm') return 'LONG';
  if (panel?.zoneState === 'short_confirm') return 'SHORT';

  const sz = d.settlementZone as {
    state?: string;
    direction?: string;
    breakIndex?: number;
    retestIndex?: number;
  } | undefined;
  if (
    sz &&
    (sz.state === 'confirmed' || sz.state === 'candidate') &&
    (sz.direction === 'LONG' || sz.direction === 'SHORT')
  ) {
    if (typeof sz.retestIndex === 'number' && sz.retestIndex === lastIdx) {
      return sz.direction as 'LONG' | 'SHORT';
    }
    if (typeof sz.breakIndex === 'number' && sz.breakIndex === lastIdx) {
      return sz.direction as 'LONG' | 'SHORT';
    }
  }

  return null;
}

/** SL 실패로 차트에서 숨긴 구조 로켓 제외 후 마지막 봉 로켓 방향 */
export function structureRocketDirOnLastCandleFiltered(
  d: Record<string, unknown>,
  tf: string
): 'LONG' | 'SHORT' | null {
  const candles = (d.candles as CandleLike[] | undefined) ?? [];
  const rockets = d.structureRocketSignals as AnalyzeResponse['structureRocketSignals'];
  const slFail = d.signalLearning as { slFailures?: Array<{ time: number; verdict: 'LONG' | 'SHORT' }> } | undefined;
  const slSet = chartSlFailureKeySet(slFail?.slFailures, candles);
  const filtered = filterRocketsBySl(rockets, slSet, candles);
  return structureRocketDirectionOnLastCandle(filtered, candles, tf);
}
