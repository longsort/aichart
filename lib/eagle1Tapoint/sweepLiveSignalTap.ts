/**
 * 스윕합류 신호 — 1회=기록 · 2회(3봉내 동방향)=진입합류.
 * 실행 TF뿐 아니라 상위 TF 스윕도 1/2회 단계로 표시.
 * 확정 승률 아님 · SWEEP 단독 주문 금지.
 */
import type { StructureEvent, StructureSnapshot } from '@/lib/eagle1/structureEngine';

export const SWEEP_LIVE_SIGNAL_ID = 'sweep-live-align' as const;
/** 합류 허용 나이(마감봉 기준) · 차트는 더 오래 보일 수 있음 */
export const SWEEP_LIVE_MAX_AGE_BARS = 24;
/**
 * 연속 스윕 인정 창 — 최신·직전 스윕 봉 간격 ≤ 이 값.
 * 2 = 3캔들 이내(예: i와 i-1 또는 i-2).
 */
export const SWEEP_CONSEC_MAX_GAP = 2;

export const SWEEP_CONSEC_SKILL_KO = '3봉내연속스윕진입';
export const SWEEP_CONSEC_SKILL_TAG = 'skill:sweep-consec-3bar';

/** 1회기록 · 2회진입 */
export type SweepPhase = 'NONE' | 'RECORD_1' | 'ENTRY_2';

export type SweepLiveSignal = {
  id: typeof SWEEP_LIVE_SIGNAL_ID;
  /** 2회 스윕일 때만 true — 자동진입 합류용 */
  fired: boolean;
  /** 스윕→롱/숏 정렬 */
  direction: 'LONG' | 'SHORT' | null;
  /** 확정 방향과 같으면 true */
  alignsWithDir: boolean;
  bias: 'bullish' | 'bearish' | null;
  level: number | null;
  ageBars: number | null;
  reclaimed: boolean;
  /** 3봉 이내 연속 스윕(=2회) */
  consecutive2: boolean;
  /** 1=기록 · 2=진입합류 */
  phase: SweepPhase;
  sweepCount: number;
  score: number;
  noteKo: string;
  briefKo: string;
};

function empty(noteKo: string): SweepLiveSignal {
  return {
    id: SWEEP_LIVE_SIGNAL_ID,
    fired: false,
    direction: null,
    alignsWithDir: false,
    bias: null,
    level: null,
    ageBars: null,
    reclaimed: false,
    consecutive2: false,
    phase: 'NONE',
    sweepCount: 0,
    score: 12,
    noteKo,
    briefKo: `스윕합류 대기 · ${noteKo}`,
  };
}

type SweepEv = {
  index: number;
  bias: 'bullish' | 'bearish';
  level: number | null;
};

function sweepBarIndex(e: StructureEvent): number {
  const at = Number(e.known_at);
  if (Number.isFinite(at) && at >= 0) return Math.floor(at);
  return Math.floor(Number(e.index) || 0);
}

function sweepWickDev(e: StructureEvent): number {
  const px = Number(e.price);
  const lv = Number(e.level);
  if (Number.isFinite(px) && Number.isFinite(lv)) return Math.abs(px - lv);
  return 0;
}

/**
 * 한 봉에 위·아래 스윕이 같이 잡히면(시·일·주·월) 하나만.
 * 연속 두 봉은 그대로 둔다.
 */
function uniqueSweepPerBar(list: StructureEvent[]): StructureEvent[] {
  const byBar = new Map<number, StructureEvent>();
  for (const e of list) {
    const i = sweepBarIndex(e);
    const prev = byBar.get(i);
    if (!prev || sweepWickDev(e) >= sweepWickDev(prev)) byBar.set(i, e);
  }
  return [...byBar.values()].sort((a, b) => sweepBarIndex(a) - sweepBarIndex(b) || a.index - b.index);
}

/**
 * 차트 표시용 SWEEP. 최근 동방향 연속(3봉내) 쌍을 우선하고,
 * 그 외 최근 스윕도 남긴다. 마지막 1개만 고르면 연속 두 점이 사라진다.
 * 같은 캔들 이중 표시는 제거.
 */
export function pickVisibleSweepEvents(
  events: StructureEvent[] | null | undefined,
  lookbackBars = 80,
  maxKeep = 2
): StructureEvent[] {
  const list = uniqueSweepPerBar(
    [...(events || [])]
      .filter((e) => String(e.kind || '').toUpperCase() === 'SWEEP')
      .sort((a, b) => sweepBarIndex(a) - sweepBarIndex(b) || a.index - b.index)
  );
  if (!list.length) return [];
  const lastI = sweepBarIndex(list[list.length - 1]!);
  const recent = list.filter((e) => lastI - sweepBarIndex(e) <= lookbackBars);
  const newest = recent[recent.length - 1]!;
  const ni = sweepBarIndex(newest);
  const prevConsec = [...recent].reverse().find((s) => {
    if (s === newest || s.bias !== newest.bias) return false;
    const gi = sweepBarIndex(s);
    return ni - gi >= 1 && ni - gi <= SWEEP_CONSEC_MAX_GAP;
  });
  const prefer = prevConsec ? [prevConsec, newest] : [newest];
  const preferIdx = new Set(prefer.map((s) => sweepBarIndex(s)));
  const extra = recent
    .filter((s) => !prefer.includes(s) && !preferIdx.has(sweepBarIndex(s)))
    .slice(-(Math.max(0, maxKeep - prefer.length)));
  return uniqueSweepPerBar([...extra, ...prefer]);
}

function listRecentSweeps(
  structure: StructureSnapshot,
  closedIdx: number,
  maxAge: number
): SweepEv[] {
  return [...structure.events]
    .filter((e) => String(e.kind || '').toUpperCase() === 'SWEEP')
    .map((e) => ({
      index: Number(e.index) || 0,
      bias: (e.bias === 'bearish' ? 'bearish' : 'bullish') as 'bullish' | 'bearish',
      level: e.level != null && Number(e.level) > 0 ? Number(e.level) : null,
    }))
    .filter((e) => closedIdx - e.index >= 0 && closedIdx - e.index <= maxAge)
    .sort((a, b) => b.index - a.index);
}

/**
 * 최근 SWEEP → 롱/숏 합류.
 * - 1회: 기록만 (fired=false) · 2회(3봉내 동방향): 진입합류 발화
 * - bullish(아래털기)→LONG · bearish(위털기)→SHORT
 */
export function buildSweepLiveSignal(params: {
  structure: StructureSnapshot | null | undefined;
  price: number;
  /** 마감봉 인덱스 (기본 마지막-1) */
  asOfIndex?: number;
  /** 확정/선호 방향 — 정렬 검사용 */
  direction?: 'LONG' | 'SHORT' | null;
}): SweepLiveSignal {
  const structure = params.structure;
  const px = Number(params.price);
  if (!structure?.events?.length || !(px > 0)) {
    return empty('스윕없음');
  }

  const events = structure.events;
  const closedIdx = Number.isFinite(params.asOfIndex)
    ? Math.max(0, Number(params.asOfIndex))
    : Math.max(0, ...events.map((e) => Number(e.index) || 0), 0);

  const sweeps = listRecentSweeps(structure, closedIdx, SWEEP_LIVE_MAX_AGE_BARS);

  if (!sweeps.length) {
    const anySweep = [...events]
      .filter((e) => String(e.kind || '').toUpperCase() === 'SWEEP')
      .map((e) => Number(e.index) || 0)
      .sort((a, b) => b - a)[0];
    if (anySweep != null && closedIdx - anySweep > SWEEP_LIVE_MAX_AGE_BARS) {
      return empty(
        `최근${SWEEP_LIVE_MAX_AGE_BARS}봉 내 스윕없음 · 차트구스윕 ${closedIdx - anySweep}봉전`
      );
    }
    return empty(`최근${SWEEP_LIVE_MAX_AGE_BARS}봉 내 스윕없음`);
  }

  const newest = sweeps[0]!;
  /** 3봉 이내 연속: 최신과 직전 동방향 스윕 간격 ≤ SWEEP_CONSEC_MAX_GAP */
  const prev = sweeps.find(
    (s) =>
      s.bias === newest.bias &&
      s.index < newest.index &&
      newest.index - s.index >= 1 &&
      newest.index - s.index <= SWEEP_CONSEC_MAX_GAP
  );
  const consecutive2 = Boolean(prev);
  const sameBiasCount = sweeps.filter((s) => s.bias === newest.bias).length;
  const sweepCount = consecutive2 ? Math.min(2, sameBiasCount) : 1;
  const phase: SweepPhase = consecutive2 ? 'ENTRY_2' : 'RECORD_1';

  const direction: 'LONG' | 'SHORT' =
    newest.bias === 'bullish' ? 'LONG' : 'SHORT';
  const ageBars = Math.max(0, closedIdx - newest.index);
  const lvl = newest.level;

  let reclaimed = false;
  if (lvl != null && lvl > 0) {
    reclaimed = direction === 'LONG' ? px > lvl : px < lvl;
  }

  const alignsWithDir =
    params.direction === 'LONG' || params.direction === 'SHORT'
      ? params.direction === direction
      : true;

  /**
   * 발화(진입합류): 2회 스윕 + 방향정렬만.
   * 1회는 기록·표시만 · 회수여도 단독 진입합류 금지.
   */
  const fired = Boolean(alignsWithDir && consecutive2);

  const score = Math.max(
    18,
    Math.min(
      98,
      40 +
        (consecutive2 ? 32 : 8) +
        (reclaimed ? 12 : 4) +
        (alignsWithDir ? 14 : -22) +
        Math.max(0, 10 - ageBars)
    )
  );

  const dirKo = direction === 'LONG' ? '롱' : '숏';
  const biasKo = newest.bias === 'bullish' ? '아래털기(SSL)' : '위털기(BSL)';
  const phaseKo =
    phase === 'ENTRY_2' ? '2회스윕·진입합류' : phase === 'RECORD_1' ? '1회스윕·기록' : '스윕없음';

  const noteKo = !alignsWithDir
    ? `스윕방향불일치 · 스윕${dirKo} vs 신호${
        params.direction === 'LONG' ? '롱' : params.direction === 'SHORT' ? '숏' : '—'
      }`
    : fired
      ? `${phaseKo} ${dirKo} · ${biasKo} · ${ageBars}봉전${reclaimed ? ' · 회수' : ''} · ${SWEEP_CONSEC_SKILL_KO}`
      : `${phaseKo} ${dirKo} · ${biasKo} · 2회 뜨면 진입합류 · 단독주문금지`;

  const briefKo = fired
    ? `${dirKo} · 2회스윕 진입합류 · ${biasKo} · 라이브 ${dirKo}이면 자동진입 · TG연동 · 단독주문금지`
    : phase === 'RECORD_1'
      ? `${dirKo} 1회기록 · 같은방향 스윕 한 번 더(3봉내)면 진입합류 · 지금은 주문없음`
      : `스윕합류 미발화 · ${noteKo}`;

  return {
    id: SWEEP_LIVE_SIGNAL_ID,
    fired,
    direction,
    alignsWithDir,
    bias: newest.bias,
    level: lvl,
    ageBars,
    reclaimed,
    consecutive2,
    phase,
    sweepCount,
    score,
    noteKo,
    briefKo,
  };
}

/** TF별 스윕 1/2회 단계 (분·시·일·주·월) */
export type TfSweepPhaseRow = {
  tf: string;
  phase: SweepPhase;
  direction: 'LONG' | 'SHORT' | null;
  sweepCount: number;
  noteKo: string;
};

export function buildTfSweepPhaseBoard(params: {
  structures: Partial<Record<string, StructureSnapshot | null | undefined>>;
  tfs: string[];
  preferDir?: 'LONG' | 'SHORT' | null;
}): TfSweepPhaseRow[] {
  const rows: TfSweepPhaseRow[] = [];
  for (const tf of params.tfs) {
    const st = params.structures[tf];
    if (!st?.events?.length) {
      rows.push({
        tf,
        phase: 'NONE',
        direction: null,
        sweepCount: 0,
        noteKo: `${tf} · 스윕없음`,
      });
      continue;
    }
    const closedIdx = Math.max(
      0,
      ...st.events.map((e) => Math.max(Number(e.index) || 0, Number(e.known_at) || 0)),
      0
    );
    const sweeps = listRecentSweeps(st, closedIdx, SWEEP_LIVE_MAX_AGE_BARS);
    if (!sweeps.length) {
      rows.push({
        tf,
        phase: 'NONE',
        direction: null,
        sweepCount: 0,
        noteKo: `${tf} · 최근스윕없음`,
      });
      continue;
    }
    const newest = sweeps[0]!;
    const prev = sweeps.find(
      (s) =>
        s.bias === newest.bias &&
        s.index < newest.index &&
        newest.index - s.index >= 1 &&
        newest.index - s.index <= SWEEP_CONSEC_MAX_GAP
    );
    const consecutive2 = Boolean(prev);
    const direction: 'LONG' | 'SHORT' =
      newest.bias === 'bullish' ? 'LONG' : 'SHORT';
    const phase: SweepPhase = consecutive2 ? 'ENTRY_2' : 'RECORD_1';
    const dirKo = direction === 'LONG' ? '롱' : '숏';
    rows.push({
      tf,
      phase,
      direction,
      sweepCount: consecutive2 ? 2 : 1,
      noteKo:
        phase === 'ENTRY_2'
          ? `${tf} · 2회${dirKo} · 진입합류가능`
          : `${tf} · 1회${dirKo}기록 · 2회대기`,
    });
  }
  return rows;
}
