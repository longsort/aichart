/**
 * STEP14 — AMZ Replay.
 * Live와 동일 buildAiMarketZonePack 코어 사용.
 * 각 시점 t에서는 candles[0..t] (닫힌 봉만) — 미래 참조 금지.
 */
import type { Candle } from '@/types';
import { buildAiMarketZonePack } from './buildPack';
import type { AmzMarketZone, AmzEnginePack } from './types';
import {
  measureZoneOutcome,
  type AmzOutcomeKind,
  type AmzOutcomeRecord,
} from './outcomeEngine';
import { mergeAmzOutcomeConfig, type AmzOutcomeConfig } from './outcomeConfig';
import { extractAmzFeatures } from './featureVector';
import type { AmzMlCase } from './mlPredict';

export type AmzReplayStepSnapshot = {
  barIdx: number;
  time: number;
  zoneCount: number;
  zoneIds: string[];
};

export type AmzReplayResult = {
  symbol: string;
  timeframe: string;
  steps: number;
  snapshots: AmzReplayStepSnapshot[];
  outcomes: AmzOutcomeRecord[];
  /** STEP17 — 시점 Feature (미래 봉 미사용) */
  mlCases: AmzMlCase[];
  /** Live 코어와 동일 엔진 여부 */
  sameCoreAsLive: true;
  noteKo: string;
};

function atrLike(candles: Candle[], endExclusive: number): number {
  const from = Math.max(1, endExclusive - 14);
  let s = 0;
  let c = 0;
  for (let i = from; i < endExclusive; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    s += Math.max(
      Number(a.high) - Number(a.low),
      Math.abs(Number(a.high) - Number(b.close)),
      Math.abs(Number(a.low) - Number(b.close))
    );
    c += 1;
  }
  return c > 0 ? s / c : Number(candles[endExclusive - 1]?.close) * 0.004;
}

function nearZones(zones: AmzMarketZone[], close: number, atr: number): AmzMarketZone[] {
  return zones
    .filter((z) => {
      const mid = (z.outerLower + z.outerUpper) / 2;
      return Math.abs(close - mid) <= atr * 2.5;
    })
    .slice(0, 4);
}

/**
 * stride: 매 N봉마다 스냅 (성능).
 * maxSteps: 상한.
 */
export function runAmzReplay(params: {
  candles: Candle[];
  timeframe: string;
  symbol?: string;
  stride?: number;
  maxSteps?: number;
  minBars?: number;
  outcomeConfig?: Partial<AmzOutcomeConfig> | null;
}): AmzReplayResult {
  const rows = params.candles;
  const n = rows.length;
  const symbol = String(params.symbol || 'BTCUSDT').toUpperCase();
  const tf = params.timeframe || '4h';
  const stride = Math.max(1, Math.floor(params.stride ?? 3));
  const maxSteps = Math.max(10, Math.floor(params.maxSteps ?? 80));
  const minBars = Math.max(40, Math.floor(params.minBars ?? 60));
  const cfg = mergeAmzOutcomeConfig(params.outcomeConfig);
  const primaryH = cfg.outcomeHorizons[0] ?? 5;

  const snapshots: AmzReplayStepSnapshot[] = [];
  const outcomes: AmzOutcomeRecord[] = [];
  const mlCases: AmzMlCase[] = [];
  const seenEvent = new Set<string>();

  if (n < minBars + primaryH + 2) {
    return {
      symbol,
      timeframe: tf,
      steps: 0,
      snapshots: [],
      outcomes: [],
      mlCases: [],
      sameCoreAsLive: true,
      noteKo: 'DATA INSUFFICIENT · replay 봉 부족',
    };
  }

  /** 마지막 형성봉 제외: endExclusive = i means slice length i, last closed = i-1 */
  for (let endExclusive = minBars; endExclusive <= n - 1 - primaryH; endExclusive += stride) {
    if (snapshots.length >= maxSteps) break;

    /** 형성봉 없이 닫힌 구간만 */
    const slice = rows.slice(0, endExclusive);
    const pack: AmzEnginePack = buildAiMarketZonePack({
      candles: slice,
      timeframe: tf,
      symbol,
      orderflow: null,
      skipCache: true,
    });

    const barIdx = endExclusive - 1;
    const close = Number(rows[barIdx]!.close);
    const atr = atrLike(rows, endExclusive);
    const near = nearZones(pack.zones, close, atr);

    snapshots.push({
      barIdx,
      time: Number(rows[barIdx]!.time),
      zoneCount: pack.zones.length,
      zoneIds: near.map((z) => z.id),
    });

    for (const z of near) {
      /** 접근/테스트 중인 zone만 이벤트 */
      if (!['APPROACHING', 'TESTING', 'DEFENDING', 'WEAKENING', 'CRITICAL', 'HOLD', 'FRESH'].includes(z.state)) {
        continue;
      }
      const mid = (z.outerLower + z.outerUpper) / 2;
      if (Math.abs(close - mid) > atr * 1.8) continue;

      for (const h of cfg.outcomeHorizons) {
        if (barIdx + h >= n - 1) continue;
        const key = `${z.id}|${barIdx}|h${h}`;
        if (seenEvent.has(key)) continue;
        const rec = measureZoneOutcome({
          candles: rows,
          zone: z,
          eventBarIdx: barIdx,
          horizon: h,
          config: cfg,
        });
        if (!rec) continue;
        seenEvent.add(key);
        outcomes.push(rec);
        /** primary horizon만 ML 케이스 (중복 축소) */
        if (h === primaryH && rec.outcome !== 'PENDING') {
          const feat = extractAmzFeatures(z, atr);
          mlCases.push({
            role: z.role,
            values: feat.values,
            outcome: rec.outcome,
          });
        }
      }
    }
  }

  return {
    symbol,
    timeframe: tf,
    steps: snapshots.length,
    snapshots,
    outcomes,
    mlCases,
    sameCoreAsLive: true,
    noteKo: `Replay ${snapshots.length}스텝 · outcome ${outcomes.length} · mlCases ${mlCases.length} · Live 동일 코어 · 미래참조 없음`,
  };
}

export type AmzOutcomeAgg = {
  kind: AmzOutcomeKind;
  count: number;
  rate: number | null;
  medianMfePct: number | null;
  medianMaePct: number | null;
};

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

export function aggregateAmzOutcomes(
  outcomes: AmzOutcomeRecord[],
  sampleTrustMin: number
): {
  total: number;
  sampleLowTrust: boolean;
  byKind: AmzOutcomeAgg[];
  byRole: Record<string, AmzOutcomeAgg[]>;
} {
  const total = outcomes.length;
  const kinds: AmzOutcomeKind[] = [
    'HOLD',
    'BREAK',
    'FAKE_BREAK',
    'SWEEP_REVERSAL',
    'FLIP',
    'RANGE',
    'INVALID',
  ];

  const build = (list: AmzOutcomeRecord[]): AmzOutcomeAgg[] =>
    kinds.map((kind) => {
      const sub = list.filter((o) => o.outcome === kind);
      const mfe = sub.map((o) => o.mfePct).sort((a, b) => a - b);
      const mae = sub.map((o) => o.maePct).sort((a, b) => a - b);
      const n = sub.length;
      return {
        kind,
        count: n,
        rate: total > 0 && list.length > 0 ? n / list.length : null,
        medianMfePct: percentile(mfe, 0.5),
        medianMaePct: percentile(mae, 0.5),
      };
    });

  const byRole: Record<string, AmzOutcomeAgg[]> = {};
  for (const o of outcomes) {
    const k = o.role;
    if (!byRole[k]) {
      /* fill later */
    }
  }
  const roles = [...new Set(outcomes.map((o) => o.role))];
  for (const role of roles) {
    byRole[role] = build(outcomes.filter((o) => o.role === role));
  }

  return {
    total,
    sampleLowTrust: total < sampleTrustMin,
    byKind: build(outcomes),
    byRole,
  };
}
