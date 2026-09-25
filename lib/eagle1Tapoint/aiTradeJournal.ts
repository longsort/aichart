/**
 * AI기록부 (AI TRADE JOURNAL)
 * 동결 예측 + 이후 결과만 갱신. 미래봉으로 과거 신호 수정 금지.
 * WAIT도 남김(거래한 것만 보면 보완 불가). 확정 수익·가짜 승률 아님.
 */
import { markTapointAccumDirty } from '@/lib/tapointAccumDirty';
import { EAGLE1_MIN_STAT_SAMPLE } from '@/lib/eagle1/noFakeNumbers';

export const AI_TRADE_JOURNAL_NAME = 'AI기록부';
export const AI_TRADE_JOURNAL_NAME_EN = 'AI TRADE JOURNAL';
export const AI_TRADE_JOURNAL_VERSION = 'AI-JOURNAL-v1';
export const AI_TRADE_JOURNAL_KEY = 'ailongshort.aiTradeJournal.v1';
export const AI_TRADE_JOURNAL_EVT = 'ailongshort-ai-trade-journal';

export type AiJournalKind = 'WAIT' | 'FIRE';
export type AiJournalLane = 'QUICK_SCALP' | 'SNIPER' | 'AUTOPILOT' | 'INST_BAND_15M';
export type AiJournalMode = 'PAPER' | 'LIVE';
export type AiJournalPath = 'OPEN' | 'TP' | 'SL' | 'AMBIGUOUS' | 'TIMEOUT' | 'NA';

export type AiJournalFrozen = {
  engineId: string;
  engineVersion: string;
  lane: AiJournalLane;
  kind: AiJournalKind;
  eventId: string;
  setupId: string | null;
  direction: 'LONG' | 'SHORT' | null;
  grade: string;
  score: number;
  waitReason: string;
  machineState: string;
  entry: number | null;
  sl: number | null;
  tp: number | null;
  reasonKo: string;
  whyKo: string;
};

export type AiJournalOutcome = {
  path: AiJournalPath;
  resolvedAt: number;
  barsHeld: number | null;
  mfe: number | null;
  mae: number | null;
  netR: number | null;
  tpFirst: boolean;
  slFirst: boolean;
};

export type AiJournalRow = {
  id: string;
  at: number;
  resolvedAt?: number;
  symbol: string;
  timeframe: string;
  barTime: number;
  mode: AiJournalMode;
  frozen: AiJournalFrozen;
  outcome: AiJournalOutcome;
};

const MAX_FIRE = 400;
const MAX_WAIT = 800;
const FEE = 0.0008;
const HORIZON = 20;

function loadRaw(): AiJournalRow[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(AI_TRADE_JOURNAL_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw);
    return Array.isArray(j) ? (j as AiJournalRow[]) : [];
  } catch {
    return [];
  }
}

function saveRaw(list: AiJournalRow[]): void {
  if (typeof window === 'undefined') return;
  const fires = list.filter((r) => r.frozen.kind === 'FIRE').slice(-MAX_FIRE);
  const waits = list.filter((r) => r.frozen.kind === 'WAIT').slice(-MAX_WAIT);
  const next = [...waits, ...fires].sort((a, b) => a.at - b.at);
  try {
    window.localStorage.setItem(AI_TRADE_JOURNAL_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(AI_TRADE_JOURNAL_EVT));
  } catch {
    /* quota */
  }
  markTapointAccumDirty(1600);
}

export function listAiTradeJournal(limit = 80): AiJournalRow[] {
  const all = loadRaw();
  const n = Math.max(1, Math.floor(limit));
  return all.slice(-n).reverse();
}

export function replaceAiTradeJournal(rows: AiJournalRow[]): void {
  saveRaw(rows);
}

export function exportAiTradeJournalBlob(): string {
  const rows = loadRaw();
  return JSON.stringify(
    {
      name: AI_TRADE_JOURNAL_NAME,
      nameEn: AI_TRADE_JOURNAL_NAME_EN,
      version: AI_TRADE_JOURNAL_VERSION,
      exportedAt: Date.now(),
      noteKo: '동결필드 불변 · 결과는 outcome만 · 확정수익 아님 · n<30 승률없음',
      n: rows.length,
      rows,
    },
    null,
    2
  );
}

function simOutcome(params: {
  bars: Array<{ high: number; low: number; close: number }>;
  fromIndex: number;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number;
}): AiJournalOutcome {
  const { bars, direction, entry, sl, tp } = params;
  const from = Math.max(0, params.fromIndex);
  const last = Math.min(bars.length - 1, from + HORIZON - 1);
  const fee = entry * FEE;
  const risk = Math.abs(entry - sl);
  const denom = risk + fee || 1;
  let mfe = 0;
  let mae = 0;
  if (from >= bars.length || last < from) {
    return {
      path: 'OPEN',
      resolvedAt: Date.now(),
      barsHeld: 0,
      mfe: 0,
      mae: 0,
      netR: null,
      tpFirst: false,
      slFirst: false,
    };
  }
  for (let j = from; j <= last; j++) {
    const b = bars[j]!;
    const hitSl =
      direction === 'LONG' ? Number(b.low) <= sl : Number(b.high) >= sl;
    const hitTp =
      direction === 'LONG' ? Number(b.high) >= tp : Number(b.low) <= tp;
    if (direction === 'LONG') {
      mfe = Math.max(mfe, (Number(b.high) - entry) / entry);
      mae = Math.max(mae, (entry - Number(b.low)) / entry);
    } else {
      mfe = Math.max(mfe, (entry - Number(b.low)) / entry);
      mae = Math.max(mae, (Number(b.high) - entry) / entry);
    }
    if (hitSl && hitTp) {
      return {
        path: 'AMBIGUOUS',
        resolvedAt: Date.now(),
        barsHeld: j - from + 1,
        mfe,
        mae,
        netR: 0,
        tpFirst: false,
        slFirst: false,
      };
    }
    if (hitTp) {
      return {
        path: 'TP',
        resolvedAt: Date.now(),
        barsHeld: j - from + 1,
        mfe,
        mae,
        netR: (Math.abs(tp - entry) - fee) / denom,
        tpFirst: true,
        slFirst: false,
      };
    }
    if (hitSl) {
      return {
        path: 'SL',
        resolvedAt: Date.now(),
        barsHeld: j - from + 1,
        mfe,
        mae,
        netR: -(risk + fee) / denom,
        tpFirst: false,
        slFirst: true,
      };
    }
  }
  if (last >= bars.length - 1 && bars.length - 1 - from + 1 >= HORIZON) {
    const exit = Number(bars[last]!.close);
    const pnl = direction === 'LONG' ? exit - entry : entry - exit;
    return {
      path: 'TIMEOUT',
      resolvedAt: Date.now(),
      barsHeld: last - from + 1,
      mfe,
      mae,
      netR: (pnl - fee) / denom,
      tpFirst: false,
      slFirst: false,
    };
  }
  return {
    path: 'OPEN',
    resolvedAt: Date.now(),
    barsHeld: Math.max(0, last - from + 1),
    mfe,
    mae,
    netR: null,
    tpFirst: false,
    slFirst: false,
  };
}

export function resolveAiTradeJournalOutcomes(params: {
  symbol: string;
  timeframe: string;
  candles: Array<{ time: number; high: number; low: number; close: number }>;
}): number {
  const symbol = String(params.symbol || '').toUpperCase();
  const tf = String(params.timeframe || '');
  const bars = params.candles || [];
  if (bars.length < 4) return 0;
  const list = loadRaw();
  let n = 0;
  for (const row of list) {
    if (row.symbol !== symbol || row.timeframe !== tf) continue;
    if (row.frozen.kind !== 'FIRE') continue;
    if (row.outcome.path !== 'OPEN') continue;
    const dir = row.frozen.direction;
    const entry = row.frozen.entry;
    const sl = row.frozen.sl;
    const tp = row.frozen.tp;
    if (!dir || entry == null || sl == null || tp == null) continue;
    const i = bars.findIndex((b) => Number(b.time) === Number(row.barTime));
    if (i < 0) continue;
    const out = simOutcome({
      bars,
      fromIndex: i + 1,
      direction: dir,
      entry,
      sl,
      tp,
    });
    if (out.path === 'OPEN') {
      row.outcome = { ...row.outcome, mfe: out.mfe, mae: out.mae, barsHeld: out.barsHeld };
      continue;
    }
    row.outcome = out;
    row.resolvedAt = out.resolvedAt;
    n += 1;
  }
  if (n > 0) saveRaw(list);
  return n;
}

export type AiJournalIngestInput = {
  symbol: string;
  timeframe: string;
  barTime: number;
  mode: AiJournalMode;
  lane: AiJournalLane;
  engineId: string;
  fire: boolean;
  eventId: string | null;
  setupId?: string | null;
  direction: 'LONG' | 'SHORT' | null;
  grade: string;
  score: number;
  waitReason: string;
  machineState: string;
  entry: number | null;
  sl: number | null;
  tp: number | null;
  reasonKo: string;
  whyKo: string;
};

export function ingestAiTradeJournal(input: AiJournalIngestInput): boolean {
  if (typeof window === 'undefined') return false;
  const symbol = String(input.symbol || '').toUpperCase();
  const tf = String(input.timeframe || '');
  const barTime = Number(input.barTime) || 0;
  if (!symbol || !tf || !(barTime > 0)) return false;
  const kind: AiJournalKind = input.fire ? 'FIRE' : 'WAIT';
  const eventId = String(input.eventId || `${input.lane}-${barTime}`);
  const id =
    kind === 'FIRE'
      ? `ai-${input.lane}-FIRE-${symbol}-${tf}-${eventId}-${input.direction || 'NA'}`
      : `ai-${input.lane}-WAIT-${symbol}-${tf}-${barTime}-${input.waitReason}`;
  const list = loadRaw();
  if (list.some((x) => x.id === id)) return false;
  if (kind === 'WAIT') {
    const last = [...list]
      .reverse()
      .find((x) => x.frozen.lane === input.lane && x.symbol === symbol && x.timeframe === tf);
    if (
      last &&
      last.frozen.kind === 'WAIT' &&
      last.frozen.waitReason === input.waitReason &&
      last.barTime === barTime
    ) {
      return false;
    }
  }
  const row: AiJournalRow = {
    id,
    at: Date.now(),
    symbol,
    timeframe: tf,
    barTime,
    mode: input.mode,
    frozen: {
      engineId: input.engineId,
      engineVersion: AI_TRADE_JOURNAL_VERSION,
      lane: input.lane,
      kind,
      eventId,
      setupId: input.setupId ?? null,
      direction: input.direction,
      grade: input.grade,
      score: input.score,
      waitReason: input.waitReason,
      machineState: input.machineState,
      entry: input.entry,
      sl: input.sl,
      tp: input.tp,
      reasonKo: input.reasonKo,
      whyKo: input.whyKo,
    },
    outcome: {
      path: kind === 'FIRE' ? 'OPEN' : 'NA',
      resolvedAt: 0,
      barsHeld: null,
      mfe: null,
      mae: null,
      netR: null,
      tpFirst: false,
      slFirst: false,
    },
  };
  list.push(row);
  saveRaw(list);
  return true;
}

export type AiJournalSummary = {
  name: typeof AI_TRADE_JOURNAL_NAME;
  waitN: number;
  fireN: number;
  openN: number;
  tpN: number;
  slN: number;
  ambN: number;
  timeoutN: number;
  closedN: number;
  waitTop: { reason: string; n: number }[];
  sampleLabel: '통계 부족' | '검증';
  noteKo: string;
};

export function summarizeAiTradeJournal(rows?: AiJournalRow[]): AiJournalSummary {
  const list = rows || loadRaw();
  const waitN = list.filter((r) => r.frozen.kind === 'WAIT').length;
  const fires = list.filter((r) => r.frozen.kind === 'FIRE');
  const fireN = fires.length;
  const openN = fires.filter((r) => r.outcome.path === 'OPEN').length;
  const tpN = fires.filter((r) => r.outcome.path === 'TP').length;
  const slN = fires.filter((r) => r.outcome.path === 'SL').length;
  const ambN = fires.filter((r) => r.outcome.path === 'AMBIGUOUS').length;
  const timeoutN = fires.filter((r) => r.outcome.path === 'TIMEOUT').length;
  const closedN = tpN + slN;
  const waitMap = new Map<string, number>();
  for (const r of list) {
    if (r.frozen.kind !== 'WAIT') continue;
    const k = r.frozen.waitReason || '—';
    waitMap.set(k, (waitMap.get(k) || 0) + 1);
  }
  const waitTop = [...waitMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([reason, n]) => ({ reason, n }));
  const sampleLabel: AiJournalSummary['sampleLabel'] =
    closedN >= EAGLE1_MIN_STAT_SAMPLE ? '검증' : '통계 부족';
  const noteKo =
    closedN < EAGLE1_MIN_STAT_SAMPLE
      ? `AI기록부 · FIRE ${fireN} · 청산표본 ${closedN}/${EAGLE1_MIN_STAT_SAMPLE} · 승률 표시 안 함 · WAIT ${waitN}`
      : `AI기록부 · FIRE ${fireN} · 청산 ${closedN} · TP ${tpN} / SL ${slN} · 동일봉모호 ${ambN}`;
  return {
    name: AI_TRADE_JOURNAL_NAME,
    waitN,
    fireN,
    openN,
    tpN,
    slN,
    ambN,
    timeoutN,
    closedN,
    waitTop,
    sampleLabel,
    noteKo,
  };
}
