/**
 * PHASE 2 — Live와 Replay는 같은 pipeline. 미래 봉 접근 금지.
 * 속도(1x/5x/20x/100x)는 커서 증가폭일 뿐 Decision를 바꾸지 않는다.
 * PHASE 13 — snapshotKey includes fusion / execution / continuation fingerprints.
 */
import { runEagle1Pipeline, type Eagle1PipelineInput, type Eagle1PipelineResult } from './pipeline';
import type { Eagle1Zone } from './zoneEngine';
import type { Eagle1Bar } from './structureEngine';
import { EAGLE1_REPLAY_SPEEDS, type Eagle1ReplaySpeed } from './replaySpeeds';

export { EAGLE1_REPLAY_SPEEDS, type Eagle1ReplaySpeed } from './replaySpeeds';

export type Eagle1ReplayCursor = {
  /** pipeline endExclusive = 이 인덱스까지(미포함) 봉만 사용 */
  index: number;
  playing: boolean;
  speed: Eagle1ReplaySpeed;
};

export function clampReplayIndex(index: number, barCount: number): number {
  const n = Math.max(0, Math.floor(barCount));
  if (n < 8) return n;
  return Math.max(8, Math.min(n, Math.floor(index)));
}

export function replayAdvance(index: number, barCount: number, speed: Eagle1ReplaySpeed): number {
  return clampReplayIndex(index + speed, barCount);
}

export function replayRewind(index: number, barCount: number, speed: Eagle1ReplaySpeed): number {
  return clampReplayIndex(index - speed, barCount);
}

export function runEagle1AtCursor(
  input: Omit<Eagle1PipelineInput, 'endExclusive'>,
  cursor: number
): Eagle1PipelineResult {
  return runEagle1Pipeline({
    ...input,
    endExclusive: clampReplayIndex(cursor, input.candles.length),
  });
}

function frozenBounds(zones: Eagle1Zone[]): string {
  return zones
    .filter((z) => z.frozen && z.status !== 'DELETED')
    .map((z) => `${z.zone_id}:${z.lower}:${z.upper}`)
    .sort()
    .join('|');
}

/** Stable price token — no Date.now / random; rounds float noise out of hash. */
function px(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return 'null';
  return (Math.round(n * 1e6) / 1e6).toString();
}

function coreFp(r: Eagle1PipelineResult): string {
  const c = r.coreZoneFusion;
  if (!c) return 'core:null';
  const s = c.support;
  const res = c.resistance;
  return [
    'core',
    s ? `${px(s.midpoint)}@${s.score ?? 'null'}` : 'null',
    res ? `${px(res.midpoint)}@${res.score ?? 'null'}` : 'null',
  ].join(':');
}

function strategyFp(r: Eagle1PipelineResult): string {
  const f = r.strategyFusion;
  if (!f) return 'strat:null';
  return [
    'strat',
    f.aPlusLong ? px(f.aPlusLong.midpoint) : 'null',
    f.aPlusShort ? px(f.aPlusShort.midpoint) : 'null',
  ].join(':');
}

/** Discrete flow key — bias / counts / usable (avoid jittery continuous floats). */
function flowFp(r: Eagle1PipelineResult): string {
  const f = r.flowConfirmation;
  if (!f) return 'flow:null';
  return ['flow', f.bias, f.availableCount, f.staleCount, f.usableForConfirm ? '1' : '0'].join(':');
}

function confluenceFp(r: Eagle1PipelineResult): string {
  const c = r.confluence;
  if (!c) return 'conf:null';
  return ['conf', c.aPlusLongOk ? '1' : '0', c.aPlusShortOk ? '1' : '0', c.setupScore ?? 'null'].join(':');
}

function execPracticalFp(r: Eagle1PipelineResult): string {
  const lines = r.executionLevels?.practicalPriceLines ?? [];
  const byRole = (role: string) => {
    const hit = lines.find((l) => l.role === role);
    return hit ? px(hit.price) : 'null';
  };
  return ['execP', lines.length, byRole('ENTRY'), byRole('STOP'), byRole('TP1')].join(':');
}

function continuationFp(r: Eagle1PipelineResult): string {
  return `cont:${r.continuation?.action ?? 'null'}`;
}

function snapshotKey(r: Eagle1PipelineResult): string {
  return [
    r.mainPlan.status,
    r.mainPlan.entryLow ?? 'null',
    r.mainPlan.entryHigh ?? 'null',
    r.mainPlan.sl ?? 'null',
    r.mainPlan.tp1 ?? 'null',
    r.structure.regime,
    r.structure.wyckoff.label,
    r.zones.profile.poc ?? 'null',
    r.zones.recommended?.cluster_id ?? 'none',
    r.zones.recommended?.lower ?? 'null',
    r.zones.recommended?.upper ?? 'null',
    r.zones.reaction?.kind ?? 'none',
    r.snapshot.signal_id,
    r.snapshot.price,
    r.moneyPressure.state,
    r.smartPath?.main?.uiState ?? 'none',
    r.smartPath?.frozen ? '1' : '0',
    r.executionLevels?.entry?.zone
      ? `${r.executionLevels.entry.zone.low}:${r.executionLevels.entry.zone.high}`
      : 'null',
    r.executionLevels?.stop?.executableSl ?? 'null',
    frozenBounds(r.zones.zones),
    // PHASE 13 fusion / practical / continuation
    coreFp(r),
    strategyFp(r),
    flowFp(r),
    confluenceFp(r),
    execPracticalFp(r),
    continuationFp(r),
  ].join('::');
}

/** 패리티 비교용 고정 해시 (미래 봉 없이 커서만) */
export function liveReplayParityHash(r: Eagle1PipelineResult): string {
  return snapshotKey(r);
}

export type LiveReplayParityReport = {
  ok: boolean;
  fails: string[];
  checkpoints: number[];
  note: string;
};

/**
 * 같은 입력·같은 커서는 항상 동일. 워킹 freeze 후 과거 존 가격이 바뀌면 FAIL.
 */
export function liveReplayParity(
  candles: Eagle1Bar[],
  checkpoints: number[],
  timeframe = '1H'
): string[] {
  return liveReplayParityDetailed(candles, checkpoints, timeframe).fails;
}

export function liveReplayParityDetailed(
  candles: Eagle1Bar[],
  checkpoints: number[],
  timeframe = '1H'
): LiveReplayParityReport {
  const fails: string[] = [];
  const base: Omit<Eagle1PipelineInput, 'endExclusive'> = { candles, timeframe };

  for (const t of checkpoints) {
    const a = runEagle1AtCursor(base, t);
    const b = runEagle1AtCursor(base, t);
    if (liveReplayParityHash(a) !== liveReplayParityHash(b)) fails.push(`nondeterministic t=${t}`);
  }

  let prevFrozen: Eagle1Zone[] | undefined;
  const seen = new Map<string, { lower: number; upper: number; at: number }>();
  const start = Math.min(...checkpoints, 24);
  const end = Math.max(...checkpoints, candles.length);
  for (let t = Math.max(8, start); t <= end; t += 1) {
    const r = runEagle1Pipeline({ ...base, endExclusive: t, prevFrozenZones: prevFrozen });
    prevFrozen = r.zones.zones.filter((z) => z.frozen || z.status === 'INVALID' || z.status === 'BROKEN');
    for (const z of r.zones.zones) {
      if (!z.frozen) continue;
      const prev = seen.get(z.zone_id);
      if (prev && (prev.lower !== z.lower || prev.upper !== z.upper)) {
        fails.push(`repaint zone ${z.zone_id} t=${prev.at}->${t}`);
      }
      if (!prev) seen.set(z.zone_id, { lower: z.lower, upper: z.upper, at: t });
    }
  }

  const jump = runEagle1AtCursor(base, end);
  const live = runEagle1Pipeline({ ...base, endExclusive: end });
  if (jump.zones.profile.poc !== live.zones.profile.poc) fails.push(`poc live/replay mismatch at ${end}`);
  if (liveReplayParityHash(jump) !== liveReplayParityHash(live)) {
    fails.push(`parity hash live/replay mismatch at ${end}`);
  }

  return {
    ok: fails.length === 0,
    fails,
    checkpoints: [...checkpoints],
    note: fails.length === 0 ? 'live=replay · 미래봉 없음' : fails[0]!,
  };
}

/** Synthetic grind used by Acceptance D (deterministic; no Date.now / random). */
function parityGrind(n: number): Eagle1Bar[] {
  const out: Eagle1Bar[] = [];
  let px0 = 100;
  for (let i = 0; i < n; i++) {
    const cycle = i % 6;
    const open = px0;
    let close = px0;
    if (cycle === 0) close = px0 + 1.35;
    else if (cycle === 3) close = px0 - 0.45;
    else close = px0 + 0.18;
    const high = Math.max(open, close) + (cycle === 0 ? 0.45 : 0.12);
    const low = Math.min(open, close) - (cycle === 3 ? 0.4 : 0.1);
    out.push({
      time: 1_700_000_000 + i * 3600,
      open,
      high,
      low,
      close,
      volume: 10 + (i % 5),
    });
    px0 = close;
  }
  return out;
}

/**
 * Acceptance D — Live/Replay same engine + fusion hash parity + no future leak at endExclusive=T.
 */
export function replayFusionParityAcceptanceD(): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  const candles = parityGrind(80);
  const checkpoints = [32, 48, 64];
  const detail = liveReplayParityDetailed(candles, checkpoints, '1H');
  if (!detail.ok) notes.push(`parityDetailed: ${detail.fails.join('; ')}`);

  for (const t of checkpoints) {
    const atT = runEagle1AtCursor({ candles, timeframe: '1H' }, t);
    const longer = runEagle1Pipeline({ candles, timeframe: '1H', endExclusive: t });
    if (liveReplayParityHash(atT) !== liveReplayParityHash(longer)) {
      notes.push(`cursor vs endExclusive mismatch t=${t}`);
    }
    const prefix = candles.slice(0, t);
    const shortOnly = runEagle1Pipeline({ candles: prefix, timeframe: '1H' });
    if (liveReplayParityHash(shortOnly) !== liveReplayParityHash(longer)) {
      notes.push(`future-leak: prefix≠endExclusive t=${t}`);
    }
    // Fusion fields must be present on the hash path (non-empty fingerprints)
    const h = liveReplayParityHash(atT);
    if (!h.includes('core:')) notes.push(`missing core fp t=${t}`);
    if (!h.includes('strat:')) notes.push(`missing strat fp t=${t}`);
    if (!h.includes('flow:')) notes.push(`missing flow fp t=${t}`);
    if (!h.includes('conf:')) notes.push(`missing conf fp t=${t}`);
    if (!h.includes('execP:')) notes.push(`missing execP fp t=${t}`);
    if (!h.includes('cont:')) notes.push(`missing cont fp t=${t}`);
  }

  return { ok: notes.length === 0, notes };
}
