/**
 * 실전·플랜 이벤트 기록부 — E/SL/TP/무효·폭락구간·접근·터치.
 * 로컬 저장 + JSON 내보내기/가져오기 (향후 API·자동매매 연동용).
 * 확정 수익·승률 보장 아님.
 */
import type { Candle } from '@/types';
import type { MergedDeskActiveTradePlan } from '@/lib/mergedDeskActiveTradePlan';
import type { PracticeAiPlanPack } from '@/lib/mergedDeskPracticeAiPlan';
import { createSignalId } from '@/lib/mergedDeskSignalOutcomeEngine';
import { exportSignalJournalWithAnalytics } from '@/lib/mergedDeskSignalJournalAnalytics';
import { dumpZoneStableId } from '@/lib/mergedDeskLearningSnapshot';
import { markTapointAccumDirty } from '@/lib/tapointAccumDirty';

export type TradeJournalEventKind =
  | 'PLAN_LOCK'
  | 'APPROACH_ENTRY'
  | 'APPROACH_SL'
  | 'APPROACH_TP1'
  | 'APPROACH_TP2'
  | 'APPROACH_TP3'
  | 'APPROACH_INV'
  | 'TOUCH_ENTRY'
  | 'TOUCH_SL'
  | 'TOUCH_TP1'
  | 'TOUCH_TP2'
  | 'TOUCH_TP3'
  | 'TOUCH_INV'
  | 'REALIZED_TP1'
  | 'REALIZED_SL'
  | 'REALIZED_INV'
  | 'DUMP_ZONE_FORMED'
  | 'NOTE'
  | 'SCALP200_ARMED'
  | 'SCALP200_FIRE'
  | 'SCALP200_MISSED'
  | 'SCALP200_INVALID'
  | 'SIGNAL_SNAPSHOT'
  | 'CANDLE_TONE'
  | 'AI_ZONE_TOUCH'
  | 'AI_ZONE_APPROACH'
  | 'AI200_CONFIRM'
  | 'OUTCOME_1'
  | 'OUTCOME_3'
  | 'OUTCOME_5'
  | 'OUTCOME_12'
  | 'OUTCOME_24'
  | 'DUMP_ZONE_TOUCH'
  | 'DUMP_LIFE_CHANGE'
  | 'INST_BAND_TOUCH'
  | 'VOL_VERDICT'
  | 'RB_CORRIDOR'
  | 'RB_RAIL_TOUCH'
  | 'PRACTICE_AI_CONFIRM'
  | 'MASTER_VERDICT'
  | 'CONFLUENCE_SNAPSHOT'
  | 'AUTO_SCALP_ARM'
  | 'AUTO_SCALP_SFP'
  | 'AUTO_SCALP_ROCKET'
  | 'AUTO_SCALP_FIRE'
  | 'AUTO_SCALP_TP1'
  | 'AUTO_SCALP_BE'
  | 'AUTO_SCALP_TP2'
  | 'AUTO_SCALP_SL'
  | 'AUTO_SCALP_TIME'
  | 'AUTO_SCALP_CLOSE';

/** 200x 타점 상태 — 기록부·scanScalp200JournalEvents 공용 */
export type Scalp200JournalState = 'WAIT' | 'ARMED' | 'FIRE' | 'MISSED' | 'INVALID';

export type TradeJournalEvent = {
  id: string;
  at: number;
  symbol: string;
  chartTf: string;
  sourceTf?: string;
  kind: TradeJournalEventKind;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  price: number;
  levelPrice: number;
  levelLabel: string;
  noteKo: string;
  /** 신호 묶음 — 터치·결과 연결 */
  signalId?: string;
  /** API·자동매매·정확도 검증용 확장 필드 */
  meta?: Record<string, string | number | boolean | null>;
};

const STORAGE_KEY = 'ailongshort.mergedDesk.tradeEventJournal.v1';
/** 학습 스냅샷 늘리되 FORMED 스팸 억제가 전제 */
const MAX_ROWS = 2500;

/** N봉 결과를 붙일 수 있는 신호 kind */
export const TRADE_JOURNAL_OUTCOME_SOURCE_KINDS: TradeJournalEventKind[] = [
  'CANDLE_TONE',
  'AI_ZONE_TOUCH',
  'TOUCH_ENTRY',
  'AI200_CONFIRM',
  'SCALP200_FIRE',
  'DUMP_ZONE_TOUCH',
  'INST_BAND_TOUCH',
  'VOL_VERDICT',
  'RB_CORRIDOR',
  'RB_RAIL_TOUCH',
  'PRACTICE_AI_CONFIRM',
  'MASTER_VERDICT',
  'CONFLUENCE_SNAPSHOT',
  'AUTO_SCALP_FIRE',
  'AUTO_SCALP_TP1',
  'AUTO_SCALP_TP2',
];

export const TRADE_JOURNAL_OUTCOME_KINDS: TradeJournalEventKind[] = [
  'OUTCOME_1',
  'OUTCOME_3',
  'OUTCOME_5',
  'OUTCOME_12',
  'OUTCOME_24',
];

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function readTradeEventJournal(): TradeJournalEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw || '[]') as TradeJournalEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeTradeEventJournal(rows: TradeJournalEvent[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, MAX_ROWS)));
  } catch {
    /* ignore */
  }
  markTapointAccumDirty(2000);
}

export function appendTradeJournalEvent(
  row: Omit<TradeJournalEvent, 'id' | 'at'> & { id?: string; at?: number }
): TradeJournalEvent {
  const ev: TradeJournalEvent = {
    ...row,
    id: row.id ?? uid(),
    at: row.at ?? Date.now(),
  };
  const prev = readTradeEventJournal();

  if (ev.kind === 'AI200_CONFIRM') {
    const dupAi200 = prev.find(
      (p) =>
        p.kind === 'AI200_CONFIRM' &&
        p.symbol === ev.symbol &&
        p.chartTf === ev.chartTf &&
        Math.abs(p.levelPrice - ev.levelPrice) / Math.max(ev.levelPrice, 1) < 0.0003
    );
    if (dupAi200) return dupAi200;
  }

  if (TRADE_JOURNAL_OUTCOME_KINDS.includes(ev.kind) && ev.signalId) {
    const dupOutcome = prev.find((p) => p.kind === ev.kind && p.signalId === ev.signalId);
    if (dupOutcome) return dupOutcome;
  }

  if (
    (ev.kind === 'REALIZED_TP1' || ev.kind === 'REALIZED_SL' || ev.kind === 'REALIZED_INV') &&
    ev.signalId
  ) {
    const dupReal = prev.find((p) => p.kind === ev.kind && p.signalId === ev.signalId);
    if (dupReal) return dupReal;
  }

  if (ev.kind === 'SIGNAL_SNAPSHOT' && ev.meta?.candleTime != null) {
    const dupSnap = prev.find(
      (p) =>
        p.kind === 'SIGNAL_SNAPSHOT' &&
        p.symbol === ev.symbol &&
        p.chartTf === ev.chartTf &&
        p.meta?.candleTime === ev.meta?.candleTime
    );
    if (dupSnap) return dupSnap;
  }

  if (ev.kind === 'PRACTICE_AI_CONFIRM' && ev.meta?.practiceState != null) {
    const dupPr = prev.find(
      (p) =>
        p.kind === 'PRACTICE_AI_CONFIRM' &&
        p.symbol === ev.symbol &&
        p.meta?.practiceState === ev.meta?.practiceState &&
        ev.at - p.at < 60_000
    );
    if (dupPr) return dupPr;
  }

  if (ev.kind === 'MASTER_VERDICT' && ev.meta?.masterKey != null) {
    const dupM = prev.find(
      (p) =>
        p.kind === 'MASTER_VERDICT' &&
        p.symbol === ev.symbol &&
        p.meta?.masterKey === ev.meta?.masterKey
    );
    if (dupM) return dupM;
  }

  if (ev.kind === 'CANDLE_TONE' && ev.meta?.candleTime != null && ev.meta?.tone != null) {
    const dupTone = prev.find(
      (p) =>
        p.kind === 'CANDLE_TONE' &&
        p.symbol === ev.symbol &&
        p.chartTf === ev.chartTf &&
        p.meta?.candleTime === ev.meta?.candleTime &&
        p.meta?.tone === ev.meta?.tone
    );
    if (dupTone) return dupTone;
  }

  if (ev.kind === 'DUMP_LIFE_CHANGE' && ev.meta?.dumpKey != null) {
    const dupLife = prev.find(
      (p) =>
        p.kind === 'DUMP_LIFE_CHANGE' &&
        p.symbol === ev.symbol &&
        p.meta?.dumpKey === ev.meta?.dumpKey &&
        p.meta?.lifeState === ev.meta?.lifeState
    );
    if (dupLife) return dupLife;
  }

  /** 폭락존 형성 — zoneId당 1회만 (차트 TF 전환 스팸 차단) */
  if (ev.kind === 'DUMP_ZONE_FORMED' && ev.meta?.zoneId != null) {
    const dupBorn = prev.find(
      (p) =>
        p.kind === 'DUMP_ZONE_FORMED' &&
        p.symbol === ev.symbol &&
        p.meta?.zoneId === ev.meta?.zoneId
    );
    if (dupBorn) return dupBorn;
  }

  /** 폭락 터치 — 같은 존·같은 봉 1회 */
  if (ev.kind === 'DUMP_ZONE_TOUCH' && ev.meta?.zoneId != null && ev.meta?.candleTime != null) {
    const dupTouch = prev.find(
      (p) =>
        p.kind === 'DUMP_ZONE_TOUCH' &&
        p.symbol === ev.symbol &&
        p.meta?.zoneId === ev.meta?.zoneId &&
        p.meta?.candleTime === ev.meta?.candleTime
    );
    if (dupTouch) return dupTouch;
  }

  /** E/SL/TP 터치·접근 — 같은 봉·같은 레벨 1회만 (수초마다 스팸 방지) */
  if (
    (ev.kind.startsWith('TOUCH_') || ev.kind.startsWith('APPROACH_')) &&
    ev.meta?.candleTime != null
  ) {
    const dupLv = prev.find(
      (p) =>
        p.kind === ev.kind &&
        p.symbol === ev.symbol &&
        p.chartTf === ev.chartTf &&
        p.meta?.candleTime === ev.meta?.candleTime &&
        Math.abs(Number(p.levelPrice) - Number(ev.levelPrice)) /
          Math.max(Number(ev.levelPrice), 1) <
          0.0004
    );
    if (dupLv) return dupLv;
  }
  /** candleTime 없어도 같은 kind·레벨 90초 내 1회 */
  if (ev.kind.startsWith('TOUCH_') || ev.kind.startsWith('APPROACH_')) {
    const dupRecent = prev.find(
      (p) =>
        p.kind === ev.kind &&
        p.symbol === ev.symbol &&
        p.chartTf === ev.chartTf &&
        ev.at - p.at < 90_000 &&
        Math.abs(Number(p.levelPrice) - Number(ev.levelPrice)) /
          Math.max(Number(ev.levelPrice), 1) <
          0.0004
    );
    if (dupRecent) return dupRecent;
  }

  /** 학습 스냅샷 — 같은 봉·같은 fingerprint 1회 */
  if (ev.kind === 'CONFLUENCE_SNAPSHOT' && ev.meta?.candleTime != null && ev.meta?.fpHash != null) {
    const dupLearn = prev.find(
      (p) =>
        p.kind === 'CONFLUENCE_SNAPSHOT' &&
        p.symbol === ev.symbol &&
        p.chartTf === ev.chartTf &&
        p.meta?.candleTime === ev.meta?.candleTime &&
        p.meta?.fpHash === ev.meta?.fpHash
    );
    if (dupLearn) return dupLearn;
  }

  if (ev.kind === 'VOL_VERDICT' && ev.meta?.candleTime != null && ev.meta?.verdictSide != null) {
    const dupVol = prev.find(
      (p) =>
        p.kind === 'VOL_VERDICT' &&
        p.symbol === ev.symbol &&
        p.chartTf === ev.chartTf &&
        p.meta?.candleTime === ev.meta?.candleTime &&
        p.meta?.verdictSide === ev.meta?.verdictSide &&
        p.meta?.segNo === ev.meta?.segNo
    );
    if (dupVol) return dupVol;
  }

  if (ev.kind === 'RB_CORRIDOR' && ev.meta?.corridorKey != null) {
    const dupRb = prev.find(
      (p) =>
        p.kind === 'RB_CORRIDOR' &&
        p.symbol === ev.symbol &&
        p.meta?.corridorKey === ev.meta?.corridorKey
    );
    if (dupRb) return dupRb;
  }

  if (ev.kind === 'INST_BAND_TOUCH' && ev.meta?.candleTime != null && ev.meta?.bandVerdict != null) {
    const dupSt = prev.find(
      (p) =>
        p.kind === 'INST_BAND_TOUCH' &&
        p.symbol === ev.symbol &&
        p.chartTf === ev.chartTf &&
        p.meta?.candleTime === ev.meta?.candleTime &&
        p.meta?.bandVerdict === ev.meta?.bandVerdict &&
        p.meta?.tier === ev.meta?.tier
    );
    if (dupSt) return dupSt;
  }

  /** 동일 kind·level·5초 이내 중복 방지 */
  const dup = prev.find(
    (p) =>
      p.kind === ev.kind &&
      p.symbol === ev.symbol &&
      p.chartTf === ev.chartTf &&
      Math.abs(p.levelPrice - ev.levelPrice) / Math.max(ev.levelPrice, 1) < 0.0002 &&
      ev.at - p.at < 5000
  );
  if (dup) return dup;
  writeTradeEventJournal([ev, ...prev]);
  return ev;
}

export function exportTradeEventJournalJson(symbol?: string, chartTf?: string): string {
  if (symbol) return exportSignalJournalWithAnalytics(symbol, chartTf);
  const rows = readTradeEventJournal().filter((r) =>
    symbol ? r.symbol.toUpperCase() === symbol.toUpperCase() : true
  );
  return JSON.stringify(
    {
      schema: 'ailongshort.tradeEventJournal.v2',
      exportedAt: new Date().toISOString(),
      symbol: symbol ?? null,
      count: rows.length,
      outcomeSourceKinds: TRADE_JOURNAL_OUTCOME_SOURCE_KINDS,
      events: rows,
    },
    null,
    2
  );
}

/** 로컬 기록부 → 서버 merge (로그인 시) */
export async function syncTradeEventJournalToServer(): Promise<{
  ok: boolean;
  merged?: number;
  total?: number;
  error?: string;
}> {
  if (typeof window === 'undefined') return { ok: false, error: 'browser only' };
  try {
    const events = readTradeEventJournal();
    const res = await fetch('/api/merged-desk/trade-journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ events }),
    });
    const data = (await res.json()) as { ok?: boolean; merged?: number; total?: number; error?: string };
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    return { ok: true, merged: data.merged, total: data.total };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** 서버 → 로컬 merge */
export async function pullTradeEventJournalFromServer(): Promise<number> {
  if (typeof window === 'undefined') return 0;
  try {
    const res = await fetch('/api/merged-desk/trade-journal', { credentials: 'include' });
    const data = (await res.json()) as { ok?: boolean; events?: TradeJournalEvent[] };
    if (!res.ok || !data.ok || !Array.isArray(data.events)) return 0;
    return importTradeEventJournalJson(JSON.stringify({ events: data.events }), true);
  } catch {
    return 0;
  }
}

export function downloadTradeEventJournal(symbol: string, chartTf?: string): void {
  if (typeof window === 'undefined') return;
  const json = exportTradeEventJournalJson(symbol, chartTf);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trade-journal-${symbol}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importTradeEventJournalJson(json: string, merge = true): number {
  const parsed = JSON.parse(json) as { events?: TradeJournalEvent[] };
  const incoming = Array.isArray(parsed?.events) ? parsed.events : [];
  if (!incoming.length) return 0;
  const prev = merge ? readTradeEventJournal() : [];
  const ids = new Set(prev.map((p) => p.id));
  const fresh = incoming.filter((e) => e?.id && !ids.has(e.id));
  writeTradeEventJournal([...fresh, ...prev]);
  return fresh.length;
}

function nearLevel(price: number, level: number, tolRatio: number): boolean {
  if (!(price > 0) || !(level > 0)) return false;
  return Math.abs(price - level) / level <= tolRatio;
}

export function candleTouchesPriceLevel(last: Candle | null | undefined, level: number): boolean {
  if (!last || !(level > 0)) return false;
  const lo = Number(last.low);
  const hi = Number(last.high);
  if (![lo, hi].every((x) => Number.isFinite(x))) return false;
  return lo <= level && level <= hi;
}

/** symbol·TF·시간창으로 기록부 필터 */
export function filterRecentJournalEvents(params: {
  symbol: string;
  chartTf?: string;
  sinceMs?: number;
  kinds?: TradeJournalEventKind[];
}): TradeJournalEvent[] {
  const now = Date.now();
  const since = params.sinceMs ?? 15 * 60 * 1000;
  const sym = params.symbol.toUpperCase();
  return readTradeEventJournal().filter(
    (e) =>
      e.symbol.toUpperCase() === sym &&
      (!params.chartTf || e.chartTf === params.chartTf) &&
      now - e.at <= since &&
      (!params.kinds?.length || params.kinds.includes(e.kind))
  );
}

/** 기록부에 E 터치가 최근에 있었는지 (200x FIRE 확인용) */
export function hasRecentJournalTouchEntry(params: {
  symbol: string;
  chartTf: string;
  entry: number;
  direction: 'LONG' | 'SHORT';
  sinceMs?: number;
  tolRatio?: number;
}): { ok: boolean; touchPrice?: number; at?: number } {
  if (!(params.entry > 0)) return { ok: false };
  const tol = params.tolRatio ?? 0.0018;
  const events = filterRecentJournalEvents({
    symbol: params.symbol,
    chartTf: params.chartTf,
    sinceMs: params.sinceMs ?? 4 * 60 * 1000,
    kinds: ['TOUCH_ENTRY'],
  });
  const match = events.find(
    (e) =>
      e.direction === params.direction &&
      Math.abs(e.levelPrice - params.entry) / Math.max(params.entry, 1) <= tol
  );
  if (!match) return { ok: false };
  return { ok: true, touchPrice: match.price, at: match.at };
}

/** 폭락·무효·손절 터치 등 200x 진입 충돌 */
export function evalJournalScalp200Conflict(params: {
  symbol: string;
  chartTf: string;
  direction: 'LONG' | 'SHORT';
  sinceMs?: number;
}): { block: boolean; reasonKo: string | null } {
  const now = Date.now();
  const events = filterRecentJournalEvents({
    symbol: params.symbol,
    chartTf: params.chartTf,
    sinceMs: params.sinceMs ?? 8 * 60 * 1000,
  });

  const invTouch = events.find(
    (e) => e.kind === 'TOUCH_INV' && e.direction === params.direction
  );
  if (invTouch && now - invTouch.at < 3 * 60 * 1000) {
    return { block: true, reasonKo: '기록부·무효 터치 직후' };
  }

  const slTouch = events.find(
    (e) => e.kind === 'TOUCH_SL' && e.direction === params.direction
  );
  if (slTouch && now - slTouch.at < 2 * 60 * 1000) {
    return { block: true, reasonKo: '기록부·손절 터치 직후' };
  }

  if (params.direction === 'LONG') {
    const dumpFormed = events.find((e) => e.kind === 'DUMP_ZONE_FORMED');
    const floorTouch = events.find(
      (e) =>
        e.kind === 'DUMP_ZONE_TOUCH' &&
        e.direction === 'LONG' &&
        now - e.at <= 6 * 60 * 1000
    );
    if (dumpFormed && now - dumpFormed.at < 5 * 60 * 1000 && !floorTouch) {
      return { block: true, reasonKo: '기록부·폭락구간·롱 충돌' };
    }
  }

  return { block: false, reasonKo: null };
}

/** 기록부 E 터치가격으로 진입가 미세 보정 (조건부) */
export function refineEntryFromJournalTouch(params: {
  entry: number;
  direction: 'LONG' | 'SHORT';
  touchPrice?: number;
  maxShiftRatio?: number;
}): number {
  const { entry, direction, touchPrice } = params;
  if (!(touchPrice > 0) || !(entry > 0)) return entry;
  const maxShift = params.maxShiftRatio ?? 0.0008;
  const band = entry * maxShift;
  if (direction === 'LONG') {
    if (touchPrice <= entry && touchPrice >= entry - band) return touchPrice;
    if (Math.abs(touchPrice - entry) <= band) return entry + (touchPrice - entry) * 0.6;
  } else {
    if (touchPrice >= entry && touchPrice <= entry + band) return touchPrice;
    if (Math.abs(touchPrice - entry) <= band) return entry + (touchPrice - entry) * 0.6;
  }
  return entry;
}

const SCALP200_JOURNAL_KIND: Record<Scalp200JournalState, TradeJournalEventKind | null> = {
  WAIT: null,
  ARMED: 'SCALP200_ARMED',
  FIRE: 'SCALP200_FIRE',
  MISSED: 'SCALP200_MISSED',
  INVALID: 'SCALP200_INVALID',
};

/** 200x 상태 전환 → 기록부 (중복은 appendTradeJournalEvent가 방지) */
export function scanScalp200JournalEvents(params: {
  symbol: string;
  chartTf: string;
  prevState: Scalp200JournalState | null;
  state: Scalp200JournalState;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  entry: number;
  stopLoss: number;
  price: number;
  entryAllowed: boolean;
  gatesPassed: number;
  gatesTotal: number;
  rr: number;
  actualLeverage: number;
  journalTouchOk?: boolean;
}): TradeJournalEvent | null {
  if (params.direction === 'NEUTRAL' || !(params.entry > 0)) return null;
  if (params.state === params.prevState || params.state === 'WAIT') return null;
  const kind = SCALP200_JOURNAL_KIND[params.state];
  if (!kind) return null;

  const stateKo =
    params.state === 'ARMED'
      ? 'ARMED'
      : params.state === 'FIRE'
        ? 'FIRE'
        : params.state === 'MISSED'
          ? '놓침'
          : '무효';
  const dirKo = params.direction === 'LONG' ? '롱' : '숏';

  return appendTradeJournalEvent({
    symbol: params.symbol,
    chartTf: params.chartTf,
    kind,
    direction: params.direction,
    price: params.price,
    levelPrice: params.entry,
    levelLabel: `200x ${stateKo}`,
    noteKo: `200x · ${stateKo} · ${dirKo} · E${params.entry.toFixed(1)} · ${params.gatesPassed}/${params.gatesTotal}게이트${params.journalTouchOk ? ' · 기록부E터치' : ''}`,
    signalId: params.state === 'FIRE' ? createSignalId() : undefined,
    meta: {
      stopLoss: params.stopLoss,
      entryAllowed: params.entryAllowed,
      rr: params.rr,
      leverage: params.actualLeverage,
      scalp200: true,
      journalTouchOk: params.journalTouchOk ?? false,
      feature: 'scalp200',
      anchorPrice: params.price,
      candleTime: null,
      tp1: null,
    },
  });
}

/** 실시간 가격·봉으로 E/SL/TP/무효 접근·터치 감지 → 기록 */
export function scanTradePlanJournalTouches(params: {
  symbol: string;
  chartTf: string;
  price: number;
  lastCandle?: Candle | null;
  plan?: MergedDeskActiveTradePlan | null;
  practiceAi?: PracticeAiPlanPack | null;
  approachRatio?: number;
}): TradeJournalEvent[] {
  const price = Number(params.price);
  if (!(price > 0)) return [];
  const plan = params.plan;
  const practice = params.practiceAi;
  const dir =
    plan?.direction && plan.direction !== 'NEUTRAL'
      ? plan.direction
      : practice?.direction && practice.direction !== 'NEUTRAL'
        ? practice.direction
        : 'NEUTRAL';
  if (dir === 'NEUTRAL') return [];

  const entry = plan?.entry || practice?.entry || 0;
  const sl = plan?.stopLoss || practice?.stopLoss || 0;
  const tp1 = plan?.tp1 || practice?.tp1 || 0;
  const tp2 = plan?.tp2 || practice?.tp2 || 0;
  const tp3 = plan?.tp3 || practice?.tp3 || 0;
  const inv = plan?.invalidationPrice || practice?.invalidationPrice || sl;

  const tol = params.approachRatio ?? 0.0045;
  const last = params.lastCandle ?? null;
  const out: TradeJournalEvent[] = [];

  const levels: Array<{
    kind: TradeJournalEventKind;
    touch: TradeJournalEventKind;
    approach: TradeJournalEventKind;
    px: number;
    label: string;
  }> = [
    { kind: 'TOUCH_ENTRY', approach: 'APPROACH_ENTRY', touch: 'TOUCH_ENTRY', px: entry, label: '진입' },
    { kind: 'TOUCH_SL', approach: 'APPROACH_SL', touch: 'TOUCH_SL', px: sl, label: '손절' },
    { kind: 'TOUCH_TP1', approach: 'APPROACH_TP1', touch: 'TOUCH_TP1', px: tp1, label: 'TP1' },
    { kind: 'TOUCH_TP2', approach: 'APPROACH_TP2', touch: 'TOUCH_TP2', px: tp2, label: 'TP2' },
    { kind: 'TOUCH_TP3', approach: 'APPROACH_TP3', touch: 'TOUCH_TP3', px: tp3, label: 'TP3' },
    { kind: 'TOUCH_INV', approach: 'APPROACH_INV', touch: 'TOUCH_INV', px: inv, label: '무효' },
  ];

  const candleTime = last ? Number(last.time) || null : null;

  for (const lv of levels) {
    if (!(lv.px > 0)) continue;
    /** 진입가와 거의 같은 TP2는 스팸 — 무시 */
    if (
      (lv.label === 'TP2' || lv.label === 'TP3') &&
      entry > 0 &&
      Math.abs(lv.px - entry) / entry < 0.0015
    ) {
      continue;
    }
    const base = {
      symbol: params.symbol,
      chartTf: params.chartTf,
      direction: dir,
      price,
      levelPrice: lv.px,
      levelLabel: lv.label,
      noteKo: `분석터치·${lv.label} · ${dir === 'LONG' ? '롱' : '숏'} · 실주문아님`,
    };
    if (candleTouchesPriceLevel(last, lv.px)) {
      const signalId = `touch-${params.symbol}-${params.chartTf}-${lv.touch}-${Math.round(lv.px)}-${candleTime ?? 0}`;
      out.push(
        appendTradeJournalEvent({
          ...base,
          kind: lv.touch,
          noteKo: `${base.noteKo} · 터치`,
          signalId,
          meta: {
            feature: 'active_trade',
            live: false,
            analysisOnly: true,
            celebrate: lv.label.startsWith('TP'),
            candleTime,
            anchorPrice: price,
            stopLoss: sl > 0 ? sl : null,
            tp1: tp1 > 0 ? tp1 : null,
            tp2: tp2 > 0 ? tp2 : null,
            tp3: tp3 > 0 ? tp3 : null,
            invPrice: inv > 0 ? inv : null,
          },
        })
      );
    } else if (nearLevel(price, lv.px, tol)) {
      out.push(
        appendTradeJournalEvent({
          ...base,
          kind: lv.approach,
          noteKo: `${base.noteKo} · 접근`,
          meta: {
            live: false,
            analysisOnly: true,
            candleTime,
          },
        })
      );
    }
  }
  return out;
}

export function recordDumpZoneFormed(params: {
  symbol: string;
  chartTf: string;
  sourceTf: string;
  top: number;
  bot: number;
  noteKo?: string;
  bandRole?: 'floor' | 'ceiling' | null;
  lifeState?: string | null;
  mid?: number;
}): TradeJournalEvent {
  const mid = params.mid ?? (params.top + params.bot) / 2;
  const zoneId = dumpZoneStableId({
    symbol: params.symbol,
    sourceTf: params.sourceTf,
    bandRole: params.bandRole,
    top: params.top,
    bot: params.bot,
  });
  const direction =
    params.bandRole === 'floor' ? 'LONG' : params.bandRole === 'ceiling' ? 'SHORT' : 'SHORT';
  return appendTradeJournalEvent({
    symbol: params.symbol,
    chartTf: params.chartTf,
    sourceTf: params.sourceTf,
    kind: 'DUMP_ZONE_FORMED',
    direction,
    price: mid,
    levelPrice: params.bot,
    levelLabel: `${params.sourceTf} 폭락구간`,
    noteKo: params.noteKo ?? `${params.sourceTf} 폭락구간 형성 · 조건부`,
    meta: {
      feature: 'dump',
      zoneId,
      top: params.top,
      bot: params.bot,
      mid,
      bandRole: params.bandRole ?? null,
      lifeState: params.lifeState ?? null,
    },
  });
}
