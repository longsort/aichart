/**
 * 상위 TF 스윕 필터 — 실행분봉 확정과 반대 스윕이면 진입 차단.
 * 동일·하위 TF는 보지 않음. 스윕 단독 주문 아님. 확정 수익 아님.
 */
import type { StructureSnapshot } from '@/lib/eagle1/structureEngine';
import { normalizeTapointTf } from '@/lib/eagle1Tapoint/symbolEntryTf';

const TF_RANK: Record<string, number> = {
  '1m': 1,
  '3m': 2,
  '5m': 3,
  '15m': 4,
  '1H': 5,
  '4H': 6,
  '1D': 7,
  '1W': 8,
  '1M': 9,
};

/** 하드 차단 후보 (상위만) */
const HARD_TFS = new Set(['15m', '1H', '4H', '1D']);
/** 소프트 — 점수만 깎음 */
const SOFT_TFS = new Set(['1W', '1M']);

export const HTF_SWEEP_CONFLICT_TAG = 'HTF_SWEEP_CONFLICT';
export const HTF_SWEEP_ALIGN_TAG = 'HTF_SWEEP_ALIGN';
export const HTF_SWEEP_FILTER_SKILL_KO = '상위스윕필터';
export const HTF_SWEEP_FILTER_SKILL_TAG = 'skill:htf-sweep-filter';

export type HtfSweepHit = {
  tf: string;
  bias: 'bullish' | 'bearish';
  direction: 'LONG' | 'SHORT';
  ageBars: number;
  level: number | null;
};

export type HtfSweepFilterResult = {
  conflict: boolean;
  aligned: boolean;
  conflictTfs: string[];
  alignTfs: string[];
  softConflictTfs: string[];
  hits: HtfSweepHit[];
  noteKo: string;
  briefKo: string;
  scoreBoost: number;
  failTag: string | null;
};

function empty(noteKo: string): HtfSweepFilterResult {
  return {
    conflict: false,
    aligned: false,
    conflictTfs: [],
    alignTfs: [],
    softConflictTfs: [],
    hits: [],
    noteKo,
    briefKo: `상위스윕필터 · ${noteKo}`,
    scoreBoost: 0,
    failTag: null,
  };
}

function rankOf(tf: string): number {
  return TF_RANK[normalizeTapointTf(tf)] ?? 0;
}

/** 진입 TF보다 상위만 */
export function listHtfSweepFilterTfs(entryTf: string): {
  hard: string[];
  soft: string[];
} {
  const er = rankOf(entryTf);
  const hard: string[] = [];
  const soft: string[] = [];
  for (const tf of Object.keys(TF_RANK)) {
    if (rankOf(tf) <= er) continue;
    if (HARD_TFS.has(tf)) hard.push(tf);
    if (SOFT_TFS.has(tf)) soft.push(tf);
  }
  return {
    hard: hard.sort((a, b) => rankOf(a) - rankOf(b)),
    soft: soft.sort((a, b) => rankOf(a) - rankOf(b)),
  };
}

function latestSweep(
  structure: StructureSnapshot | null | undefined,
  maxAgeBars: number
): Omit<HtfSweepHit, 'tf'> | null {
  if (!structure?.events?.length) return null;
  const events = structure.events;
  const closedIdx = Math.max(
    0,
    ...events.map((e) => Math.max(Number(e.index) || 0, Number(e.known_at) || 0)),
    0
  );
  const sweeps = [...events]
    .filter((e) => String(e.kind || '').toUpperCase() === 'SWEEP')
    .map((e) => {
      const idx = Number(e.index ?? e.known_at ?? 0);
      return {
        index: idx,
        bias: e.bias === 'bearish' ? ('bearish' as const) : ('bullish' as const),
        level: e.level != null && Number(e.level) > 0 ? Number(e.level) : null,
      };
    })
    .filter((s) => {
      const age = closedIdx - s.index;
      return age >= 0 && age <= maxAgeBars;
    })
    .sort((a, b) => b.index - a.index);
  const newest = sweeps[0];
  if (!newest) return null;
  return {
    bias: newest.bias,
    direction: newest.bias === 'bullish' ? 'LONG' : 'SHORT',
    ageBars: Math.max(0, closedIdx - newest.index),
    level: newest.level,
  };
}

/**
 * 상위 TF 구조 스냅에서 최근 스윕 vs 확정 방향.
 * conflict → 하드 차단 태그. soft → 점수만 감점.
 */
export function evaluateHtfSweepFilter(params: {
  direction: 'LONG' | 'SHORT';
  entryTf: string;
  structures: Partial<Record<string, StructureSnapshot | null | undefined>>;
  /** 최근 N봉 (TF별) */
  maxAgeBars?: number;
  /** false면 평가만(차단 안 함) — 스킬 OFF */
  enforce?: boolean;
}): HtfSweepFilterResult {
  const dir = params.direction;
  const maxAge = Math.max(4, Math.min(48, Number(params.maxAgeBars) || 12));
  const enforce = params.enforce !== false;
  const { hard, soft } = listHtfSweepFilterTfs(params.entryTf);
  const hits: HtfSweepHit[] = [];
  const conflictTfs: string[] = [];
  const alignTfs: string[] = [];
  const softConflictTfs: string[] = [];

  const scan = (tfs: string[], softOnly: boolean) => {
    for (const tf of tfs) {
      const st = params.structures[tf];
      const hit = latestSweep(st, maxAge);
      if (!hit) continue;
      const row = { ...hit, tf };
      hits.push(row);
      if (row.direction === dir) {
        alignTfs.push(tf);
      } else if (softOnly) {
        softConflictTfs.push(tf);
      } else {
        conflictTfs.push(tf);
      }
    }
  };

  scan(hard, false);
  scan(soft, true);

  if (!hits.length) {
    return empty('상위스윕없음 · 필터통과');
  }

  const conflict = conflictTfs.length > 0;
  const aligned = alignTfs.length > 0 && !conflict;
  let scoreBoost = 0;
  if (aligned) scoreBoost += Math.min(12, 4 + alignTfs.length * 3);
  if (softConflictTfs.length) scoreBoost -= Math.min(10, softConflictTfs.length * 4);

  const parts: string[] = [];
  if (conflictTfs.length) parts.push(`역행 ${conflictTfs.join(',')}`);
  if (alignTfs.length) parts.push(`정렬 ${alignTfs.join(',')}`);
  if (softConflictTfs.length) parts.push(`주월주의 ${softConflictTfs.join(',')}`);

  const noteKo = parts.join(' · ') || '상위스윕점검';
  const failTag =
    enforce && conflict
      ? `${HTF_SWEEP_CONFLICT_TAG}:${conflictTfs.slice(0, 3).join(',')}`
      : null;

  return {
    conflict: enforce && conflict,
    aligned,
    conflictTfs,
    alignTfs,
    softConflictTfs,
    hits,
    noteKo,
    briefKo: conflict
      ? `상위스윕필터 차단 · ${noteKo} · 확정과 반대`
      : aligned
        ? `상위스윕필터 합류 · ${noteKo}`
        : `상위스윕필터 · ${noteKo}`,
    scoreBoost,
    failTag,
  };
}
