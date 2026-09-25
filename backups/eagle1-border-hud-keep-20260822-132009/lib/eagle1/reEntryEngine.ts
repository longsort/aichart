/**
 * ReEntryEngine — 종료 후 새 셋업만. 기존 trade identity 재사용 금지.
 * 새 tradeId는 tradeManage가 발급. 여기는 허용/차단 상태만.
 */
import { isTradeTerminal, type FrozenTrade, type TradeManageState } from './tradeManage';
import type { Eagle1MainPlan } from './signalEngine';

export type ReEntryState = 'NONE' | 'COOLDOWN' | 'WATCH' | 'READY' | 'BLOCKED';

export type ReEntryReport = {
  state: ReEntryState;
  labelEn: string;
  labelKo: string;
  note: string;
  allowNewSetup: boolean;
  requiresNewTradeId: true;
  previousTradeId: string | null;
  previousState: TradeManageState | null;
  previousIdentity: string | null;
};

function empty(note = '데이터 없음'): ReEntryReport {
  return {
    state: 'NONE',
    labelEn: 'NONE',
    labelKo: '데이터 없음',
    note,
    allowNewSetup: true,
    requiresNewTradeId: true,
    previousTradeId: null,
    previousState: null,
    previousIdentity: null,
  };
}

export function runReEntryEngine(params: {
  prevTrade?: FrozenTrade | null;
  trade?: FrozenTrade | null;
  planStatus?: Eagle1MainPlan['status'] | null;
  combinationPromote?: boolean;
  lastClose?: number | null;
}): ReEntryReport {
  const live = params.trade ?? null;
  const prev = params.prevTrade ?? null;

  if (live && !isTradeTerminal(live.state)) {
    return {
      state: 'BLOCKED',
      labelEn: 'BLOCKED',
      labelKo: '재진입 차단',
      note: '포지션 진행 중 · 종료 후 새 tradeId만',
      allowNewSetup: false,
      requiresNewTradeId: true,
      previousTradeId: live.tradeId,
      previousState: live.state,
      previousIdentity: live.identity,
    };
  }

  const closed = live && isTradeTerminal(live.state) ? live : prev && isTradeTerminal(prev.state) ? prev : null;
  if (!closed) {
    return empty('종료된 트레이드 없음 · 신규 셋업 가능');
  }

  const lossLike =
    closed.state === 'STOPPED_LOSS' || closed.state === 'INVALIDATED' || closed.state === 'EARLY_EXIT';
  const winLike =
    closed.state === 'TP3_HIT' ||
    closed.state === 'STOPPED_PROFIT' ||
    closed.state === 'CLOSED' ||
    closed.state === 'TP2_HIT' ||
    closed.state === 'TP1_HIT';

  const plan = params.planStatus ?? 'WAIT';
  const confirmed = plan === 'CONFIRMED_LONG' || plan === 'CONFIRMED_SHORT';
  const watchPlan = plan === 'LONG_WATCH' || plan === 'SHORT_WATCH';
  const promote = params.combinationPromote === true;
  const close = params.lastClose;
  const nearEntry =
    close != null &&
    Number.isFinite(close) &&
    Math.abs(close - closed.entry) <= Math.max(Math.abs(closed.entry - closed.sl) * 0.55, Math.abs(closed.entry) * 0.0015);

  if (lossLike) {
    if (confirmed && promote) {
      return {
        state: 'READY',
        labelEn: 'RE-ENTRY',
        labelKo: '재진입 준비',
        note: '손절·무효 후 새 합의 · 옛 trade 재사용 금지',
        allowNewSetup: true,
        requiresNewTradeId: true,
        previousTradeId: closed.tradeId,
        previousState: closed.state,
        previousIdentity: closed.identity,
      };
    }
    return {
      state: 'COOLDOWN',
      labelEn: 'COOLDOWN',
      labelKo: '재진입 쿨다운',
      note: '손실·무효 직후 · 추격 금지',
      allowNewSetup: false,
      requiresNewTradeId: true,
      previousTradeId: closed.tradeId,
      previousState: closed.state,
      previousIdentity: closed.identity,
    };
  }

  if (winLike || closed.state === 'CLOSED') {
    if (confirmed && promote) {
      return {
        state: 'READY',
        labelEn: 'RE-ENTRY',
        labelKo: '재진입 준비',
        note: '종료 후 새 확정 합의 · 새 tradeId',
        allowNewSetup: true,
        requiresNewTradeId: true,
        previousTradeId: closed.tradeId,
        previousState: closed.state,
        previousIdentity: closed.identity,
      };
    }
    if ((watchPlan || nearEntry) && !confirmed) {
      return {
        state: 'WATCH',
        labelEn: 'WATCH',
        labelKo: '재진입 감시',
        note: '종료 후 눌림·감시 · 옛 포지션 이어가기 금지',
        allowNewSetup: false,
        requiresNewTradeId: true,
        previousTradeId: closed.tradeId,
        previousState: closed.state,
        previousIdentity: closed.identity,
      };
    }
    return {
      state: 'WATCH',
      labelEn: 'WATCH',
      labelKo: '재진입 감시',
      note: '종료됨 · 새 셋업 대기',
      allowNewSetup: false,
      requiresNewTradeId: true,
      previousTradeId: closed.tradeId,
      previousState: closed.state,
      previousIdentity: closed.identity,
    };
  }

  return empty('재진입 조건 없음');
}
