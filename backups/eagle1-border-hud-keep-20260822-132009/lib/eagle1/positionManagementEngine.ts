/**
 * Phase 17 — Position Management 뷰.
 * OPEN→TP1→PROTECT→…→EXIT. TP1 후 무조건 BE 금지.
 * 종료 후 TP2/3 보유 표시 = FAIL.
 */
import { isTradeTerminal, type FrozenTrade, type TradeManageState } from './tradeManage';

export type PositionManageUiState =
  | 'NONE'
  | 'OPEN'
  | 'TP1_HIT'
  | 'PROTECT_PROFIT'
  | 'BE'
  | 'TP2'
  | 'TRAIL'
  | 'TP3'
  | 'EARLY_EXIT'
  | 'STOPPED_PROFIT'
  | 'STOPPED_LOSS'
  | 'CLOSED';

export type PositionManagementReport = {
  state: PositionManageUiState;
  tradeId: string | null;
  direction: 'LONG' | 'SHORT' | null;
  rail: PositionManageUiState[];
  currentIndex: number;
  autoBeForbidden: true;
  beAllowed: boolean;
  failClosedHoldingTargets: boolean;
  showTp2: boolean;
  showTp3: boolean;
  note: string;
  summaryKo: string;
};

const RAIL: PositionManageUiState[] = [
  'OPEN',
  'TP1_HIT',
  'PROTECT_PROFIT',
  'BE',
  'TP2',
  'TRAIL',
  'TP3',
  'CLOSED',
];

function mapState(s: TradeManageState | undefined | null): PositionManageUiState {
  if (!s || s === 'NONE') return 'NONE';
  if (s === 'OPEN') return 'OPEN';
  if (s === 'TP1_HIT') return 'TP1_HIT';
  if (s === 'PROTECT_PROFIT') return 'PROTECT_PROFIT';
  if (s === 'BREAKEVEN') return 'BE';
  if (s === 'TP2_HIT') return 'TP2';
  if (s === 'TRAILING') return 'TRAIL';
  if (s === 'TP3_HIT') return 'TP3';
  if (s === 'EARLY_EXIT') return 'EARLY_EXIT';
  if (s === 'STOPPED_PROFIT') return 'STOPPED_PROFIT';
  if (s === 'STOPPED_LOSS') return 'STOPPED_LOSS';
  if (s === 'INVALIDATED' || s === 'CLOSED') return 'CLOSED';
  return 'NONE';
}

/**
 * BE는 구조·표본 게이트가 있을 때만. 기본 false (무조건 BE 금지).
 */
export function runPositionManagementEngine(params: {
  trade?: FrozenTrade | null;
  /** 역사/구조가 BE를 허용할 때만 true */
  allowBreakeven?: boolean;
}): PositionManagementReport {
  const trade = params.trade ?? null;
  const state = mapState(trade?.state);
  const terminal = trade ? isTradeTerminal(trade.state) : false;
  const beAllowed = Boolean(params.allowBreakeven);
  const failClosedHoldingTargets =
    terminal && (state === 'CLOSED' || state === 'STOPPED_LOSS' || state === 'STOPPED_PROFIT' || state === 'EARLY_EXIT')
      ? false
      : terminal && (state === 'TP2' || state === 'TRAIL' || state === 'TP3');

  const showTp2 = !terminal && (state === 'TP1_HIT' || state === 'PROTECT_PROFIT' || state === 'BE' || state === 'TP2' || state === 'TRAIL');
  const showTp3 = !terminal && (state === 'TP2' || state === 'TRAIL' || state === 'TP3');

  let idx = RAIL.indexOf(state);
  if (state === 'STOPPED_PROFIT' || state === 'STOPPED_LOSS' || state === 'EARLY_EXIT') idx = RAIL.indexOf('CLOSED');
  if (state === 'NONE') idx = -1;

  const note = !trade
    ? '데이터 없음'
    : failClosedHoldingTargets
      ? 'FAIL · 종료 후 TP2/3 보유 표시 금지'
      : state === 'TP1_HIT'
        ? 'TP1 도달 · 무조건 BE 금지 · 수익보호만'
        : state === 'BE' && !beAllowed
          ? 'BE 미허용 · PROTECT만'
          : `${state} · tradeId ${trade.tradeId}`;

  return {
    state,
    tradeId: trade?.tradeId ?? null,
    direction: trade?.direction ?? null,
    rail: RAIL,
    currentIndex: idx,
    autoBeForbidden: true,
    beAllowed,
    failClosedHoldingTargets: Boolean(failClosedHoldingTargets),
    showTp2,
    showTp3,
    note,
    summaryKo: trade ? `포지션 ${state}` : '데이터 없음',
  };
}
