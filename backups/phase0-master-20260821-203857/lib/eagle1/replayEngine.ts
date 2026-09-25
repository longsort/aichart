/**
 * PHASE 2 — Live와 Replay는 같은 pipeline. 미래 봉 접근 금지.
 * 속도(1x/5x/20x/100x)는 커서 증가폭일 뿐 Feature를 바꾸지 않는다.
 */
import { runEagle1Pipeline, type Eagle1PipelineInput, type Eagle1PipelineResult } from './pipeline';
import type { Eagle1Zone } from './zoneEngine';
import type { Eagle1Bar } from './structureEngine';

export const EAGLE1_REPLAY_SPEEDS = [1, 5, 20, 100] as const;
export type Eagle1ReplaySpeed = (typeof EAGLE1_REPLAY_SPEEDS)[number];

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

function snapshotKey(r: Eagle1PipelineResult): string {
  return [
    r.mainPlan.status,
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
    frozenBounds(r.zones.zones),
  ].join('::');
}

/**
 * 같은 입력·같은 커서는 항상 동일. 워킹 freeze 후 과거 존 가격이 바뀌면 FAIL.
 */
export function liveReplayParity(
  candles: Eagle1Bar[],
  checkpoints: number[],
  timeframe = '1H'
): string[] {
  const fails: string[] = [];
  const base: Omit<Eagle1PipelineInput, 'endExclusive'> = { candles, timeframe };

  for (const t of checkpoints) {
    const a = runEagle1AtCursor(base, t);
    const b = runEagle1AtCursor(base, t);
    if (snapshotKey(a) !== snapshotKey(b)) fails.push(`nondeterministic t=${t}`);
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

  const jumpPoc = runEagle1AtCursor(base, end).zones.profile.poc;
  const livePoc = runEagle1Pipeline({ ...base, endExclusive: end }).zones.profile.poc;
  if (jumpPoc !== livePoc) fails.push(`poc live/replay mismatch at ${end}`);

  return fails;
}
