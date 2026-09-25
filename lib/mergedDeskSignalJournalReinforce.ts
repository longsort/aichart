/**
 * 신호 기록부 보강 — 스냅샷·실전AI 확정·마스터·REALIZED TP/SL.
 * 조건부 검증·가중치 보강용.
 */
import type { Candle } from '@/types';
import type { PracticeAiPlanPack } from '@/lib/mergedDeskPracticeAiPlan';
import type { MergedDeskActiveTradePlan } from '@/lib/mergedDeskActiveTradePlan';
import {
  appendTradeJournalEvent,
  candleTouchesPriceLevel,
  readTradeEventJournal,
  type TradeJournalEvent,
  type TradeJournalEventKind,
} from '@/lib/mergedDeskTradeEventJournal';
import { createSignalId } from '@/lib/mergedDeskSignalOutcomeEngine';
import {
  mergeSignalJournalMeta,
  type DeskSignalContextInput,
} from '@/lib/mergedDeskSignalJournalContext';

const practiceStateMem = new Map<string, string>();
const masterKeyMem = new Map<string, string>();

function appendCtx(
  row: Omit<TradeJournalEvent, 'id' | 'at'> & { id?: string; at?: number },
  ctx: DeskSignalContextInput
): TradeJournalEvent {
  return appendTradeJournalEvent({
    ...row,
    meta: mergeSignalJournalMeta(row.meta, ctx, row.direction),
  });
}

/** 봉마다 전 기능 스냅샷 1회 */
export function scanSignalSnapshotJournal(ctx: DeskSignalContextInput): TradeJournalEvent | null {
  const last = ctx.candles[ctx.candles.length - 1];
  if (!last || !(ctx.price > 0)) return null;
  const candleTime = Number(last.time);
  if (!(candleTime > 0)) return null;

  const m = mergeSignalJournalMeta({ feature: 'snapshot' }, ctx, 'NEUTRAL');
  return appendTradeJournalEvent({
    symbol: ctx.symbol,
    chartTf: ctx.chartTf,
    kind: 'SIGNAL_SNAPSHOT',
    direction:
      m.confluenceMajority === 'LONG'
        ? 'LONG'
        : m.confluenceMajority === 'SHORT'
          ? 'SHORT'
          : 'NEUTRAL',
    price: ctx.price,
    levelPrice: ctx.price,
    levelLabel: '데스크 스냅샷',
    noteKo: `스냅샷 · 합류${m.confluenceScore ?? 0} · L${m.confluenceLong ?? 0}/S${m.confluenceShort ?? 0}`,
    meta: m,
  });
}

/** 실전AI 확정롱/숏 전환 */
export function scanPracticeAiConfirmJournal(ctx: DeskSignalContextInput): TradeJournalEvent | null {
  const practice = ctx.practiceAi;
  if (!practice) return null;
  const st = practice.state;
  if (st !== 'CONFIRMED_LONG' && st !== 'CONFIRMED_SHORT') return null;
  const key = `${ctx.symbol}|${ctx.chartTf}`;
  const prev = practiceStateMem.get(key);
  if (prev === st) return null;
  practiceStateMem.set(key, st);

  const direction = st === 'CONFIRMED_LONG' ? 'LONG' : 'SHORT';
  return appendCtx(
    {
      symbol: ctx.symbol,
      chartTf: ctx.chartTf,
      kind: 'PRACTICE_AI_CONFIRM',
      direction,
      price: ctx.price,
      levelPrice: practice.entry > 0 ? practice.entry : ctx.price,
      levelLabel: practice.titleKo || '실전AI',
      noteKo: `실전AI·${practice.stateKo} · ${practice.settleKo}`,
      signalId: createSignalId(),
      meta: {
        feature: 'practice_ai',
        practiceState: st,
        settleKo: practice.settleKo,
        rr: practice.rr,
        stopLoss: practice.stopLoss,
        tp1: practice.tp1,
        entry: practice.entry,
      },
    },
    ctx
  );
}

/** 마스터 선물 verdict 변경 */
export function scanMasterVerdictJournal(ctx: DeskSignalContextInput): TradeJournalEvent | null {
  const master = ctx.masterFutures;
  if (!master) return null;
  const masterKey = `${master.side}|${master.grade}|${master.entryAllowed}|${Math.round(master.strength)}`;
  const memKey = `${ctx.symbol}|${ctx.chartTf}`;
  const prev = masterKeyMem.get(memKey);
  if (prev === masterKey) return null;
  masterKeyMem.set(memKey, masterKey);

  const direction =
    master.side === 'LONG' ? 'LONG' : master.side === 'SHORT' ? 'SHORT' : 'NEUTRAL';

  return appendCtx(
    {
      symbol: ctx.symbol,
      chartTf: ctx.chartTf,
      kind: 'MASTER_VERDICT',
      direction,
      price: ctx.price,
      levelPrice: master.entryPrice > 0 ? master.entryPrice : ctx.price,
      levelLabel: `마스터·${master.grade}`,
      noteKo: `마스터·${master.verdictKo} · ${master.strength}`,
      meta: {
        feature: 'master',
        masterKey,
        masterGrade: master.grade,
        masterStrength: master.strength,
        masterEntryAllowed: master.entryAllowed,
        stopLoss: master.stopPrice,
        tp1: master.tp1,
        entry: master.entryPrice,
      },
    },
    ctx
  );
}

function priceCrossedLevel(
  last: Candle,
  level: number,
  direction: 'LONG' | 'SHORT',
  kind: 'tp' | 'sl' | 'inv'
): boolean {
  if (!(level > 0)) return false;
  const lo = Number(last.low);
  const hi = Number(last.high);
  if (![lo, hi].every(Number.isFinite)) return false;
  if (kind === 'tp') {
    return direction === 'LONG' ? hi >= level : lo <= level;
  }
  if (kind === 'sl' || kind === 'inv') {
    return direction === 'LONG' ? lo <= level : hi >= level;
  }
  return candleTouchesPriceLevel(last, level);
}

/** TOUCH_ENTRY 후 TP1/SL/무효 도달 → REALIZED */
export function scanRealizedPlanJournal(params: {
  ctx: DeskSignalContextInput;
  plan?: MergedDeskActiveTradePlan | null;
  practiceAi?: PracticeAiPlanPack | null;
  lastCandle?: Candle | null;
}): TradeJournalEvent[] {
  const last = params.lastCandle ?? params.ctx.candles[params.ctx.candles.length - 1] ?? null;
  if (!last) return [];

  const plan = params.plan;
  const practice = params.practiceAi;
  const dir =
    plan?.direction && plan.direction !== 'NEUTRAL'
      ? plan.direction
      : practice?.direction && practice.direction !== 'NEUTRAL'
        ? practice.direction
        : null;
  if (!dir) return [];

  const sl = plan?.stopLoss || practice?.stopLoss || 0;
  const tp1 = plan?.tp1 || practice?.tp1 || 0;
  const inv = plan?.invalidationPrice || practice?.invalidationPrice || sl;

  const touches = readTradeEventJournal().filter(
    (e) =>
      e.symbol.toUpperCase() === params.ctx.symbol.toUpperCase() &&
      e.chartTf === params.ctx.chartTf &&
      e.kind === 'TOUCH_ENTRY' &&
      e.direction === dir &&
      e.signalId
  );
  if (!touches.length) return [];

  const realizedKinds = new Set(
    readTradeEventJournal()
      .filter((e) => e.kind.startsWith('REALIZED_') && e.signalId)
      .map((e) => `${e.signalId}|${e.kind}`)
  );

  const out: TradeJournalEvent[] = [];
  const src = touches[0]!;

  const checks: Array<{ kind: TradeJournalEventKind; level: number; rk: 'tp' | 'sl' | 'inv' }> = [
    { kind: 'REALIZED_TP1', level: tp1, rk: 'tp' },
    { kind: 'REALIZED_SL', level: sl, rk: 'sl' },
    { kind: 'REALIZED_INV', level: inv, rk: 'inv' },
  ];

  for (const c of checks) {
    if (!(c.level > 0)) continue;
    const key = `${src.signalId}|${c.kind}`;
    if (realizedKinds.has(key)) continue;
    if (!priceCrossedLevel(last, c.level, dir, c.rk)) continue;

    const label =
      c.kind === 'REALIZED_TP1' ? 'TP1 도달' : c.kind === 'REALIZED_SL' ? 'SL 도달' : '무효 도달';
    out.push(
      appendCtx(
        {
          symbol: params.ctx.symbol,
          chartTf: params.ctx.chartTf,
          kind: c.kind,
          direction: dir,
          price: params.ctx.price,
          levelPrice: c.level,
          levelLabel: label,
          noteKo: `실전AI·${label}`,
          signalId: src.signalId,
          meta: {
            feature: 'active_trade',
            realizedFrom: 'TOUCH_ENTRY',
            anchorPrice: params.ctx.price,
            candleTime: Number(last.time),
          },
        },
        params.ctx
      )
    );
    realizedKinds.add(key);
  }
  return out;
}

/** 보강 스캔 묶음 */
export function scanSignalJournalReinforce(ctx: DeskSignalContextInput): TradeJournalEvent[] {
  const out: TradeJournalEvent[] = [];
  const snap = scanSignalSnapshotJournal(ctx);
  if (snap) out.push(snap);
  const pr = scanPracticeAiConfirmJournal(ctx);
  if (pr) out.push(pr);
  const master = scanMasterVerdictJournal(ctx);
  if (master) out.push(master);
  out.push(
    ...scanRealizedPlanJournal({
      ctx,
      plan: ctx.activeTradePlan,
      practiceAi: ctx.practiceAi,
    })
  );
  return out;
}
