/**
 * SqueezeRadarEngine — OI/청산/흐름 기반 스퀴즈 상태.
 * 확률 아님. 데이터 없으면 NONE + 데이터 없음.
 * Telegram/레거시 squeeze 로직과 공통화할 파사드.
 */
import type { Eagle1Bar } from './structureEngine';
import type { Eagle1MoneyPressure, Eagle1MoneyPressureLive } from './moneyPressureBand';
import type { BigMoveReport } from './bigMoveEngine';
import { runBigMoveEngine } from './bigMoveEngine';
import type { FalseBreakReport } from './falseBreakEngine';

export type SqueezeSide = 'LONG' | 'SHORT';

export type SqueezeState =
  | 'NONE'
  | 'WATCH'
  | 'BUILDUP'
  | 'TRIGGER_READY'
  | 'SQUEEZE_ACTIVE'
  | 'CASCADE'
  | 'EXHAUSTED'
  | 'FAILED';

export type SqueezeLane = {
  side: SqueezeSide;
  state: SqueezeState;
  labelEn: string;
  labelKo: string;
  note: string;
  /** 0~100 readiness — not win probability */
  score: number | null;
};

export type SqueezeRadarReport = {
  long: SqueezeLane;
  short: SqueezeLane;
  activeSide: SqueezeSide | null;
  chartTag: 'SQUEEZE' | 'CASCADE' | 'BUILDUP' | '×' | null;
  summaryKo: string;
  bigMove: BigMoveReport;
};

function emptyLane(side: SqueezeSide, note = '데이터 없음'): SqueezeLane {
  return {
    side,
    state: 'NONE',
    labelEn: 'NONE',
    labelKo: '데이터 없음',
    note,
    score: null,
  };
}

function laneLabels(state: SqueezeState, side: SqueezeSide): { labelEn: string; labelKo: string } {
  const dir = side === 'LONG' ? '롱스퀴즈' : '숏스퀴즈';
  switch (state) {
    case 'WATCH':
      return { labelEn: 'WATCH', labelKo: `${dir} 감시` };
    case 'BUILDUP':
      return { labelEn: 'BUILDUP', labelKo: `${dir} 축적` };
    case 'TRIGGER_READY':
      return { labelEn: 'TRIGGER', labelKo: `${dir} 트리거 대기` };
    case 'SQUEEZE_ACTIVE':
      return { labelEn: 'SQUEEZE', labelKo: `${dir} 진행` };
    case 'CASCADE':
      return { labelEn: 'CASCADE', labelKo: `${dir} 연쇄` };
    case 'EXHAUSTED':
      return { labelEn: 'EXHAUSTED', labelKo: `${dir} 소진` };
    case 'FAILED':
      return { labelEn: 'FAILED', labelKo: `${dir} 실패` };
    default:
      return { labelEn: 'NONE', labelKo: '데이터 없음' };
  }
}

function scoreLane(parts: Array<number | null>): number | null {
  const xs = parts.filter((x): x is number => x != null && Number.isFinite(x));
  if (!xs.length) return null;
  return Math.max(0, Math.min(100, Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)));
}

function buildLane(params: {
  side: SqueezeSide;
  live: Eagle1MoneyPressureLive | null | undefined;
  money: Eagle1MoneyPressure | null | undefined;
  big: BigMoveReport;
  falseBreak: FalseBreakReport | null | undefined;
}): SqueezeLane {
  const live = params.live;
  const hasLive =
    Boolean(live?.has_trades) ||
    Boolean(live?.has_orderbook) ||
    live?.oiState != null ||
    (live?.liqSeriesPoints ?? 0) > 0 ||
    live?.ofi != null;
  if (!live || !hasLive) {
    return emptyLane(params.side);
  }

  const flow = params.money?.score ?? 0;
  const ofi = live.ofi;
  const liqOn = live.liqAccel === true;
  const oi = live.oiState;
  /** liqAccel은 boolean — 방향은 흐름/OFI로 나눔. 수치 확률 아님. */
  const longSqueezePressure =
    (liqOn && flow >= 0 ? 32 : null) ?? (flow > 12 ? Math.min(28, flow) : null);
  const shortSqueezePressure =
    (liqOn && flow <= 0 ? 32 : null) ?? (flow < -12 ? Math.min(28, Math.abs(flow)) : null);

  const alignLong =
    (ofi == null || ofi >= 0) &&
    (flow >= -5) &&
    (params.side === 'LONG');
  const alignShort =
    (ofi == null || ofi <= 0) &&
    (flow <= 5) &&
    (params.side === 'SHORT');

  let state: SqueezeState = 'NONE';
  const pressure = params.side === 'LONG' ? longSqueezePressure : shortSqueezePressure;
  const align = params.side === 'LONG' ? alignLong : alignShort;

  if (params.falseBreak?.kind === 'FAKE_BREAKOUT' && params.side === 'LONG') state = 'FAILED';
  else if (params.falseBreak?.kind === 'FAKE_BREAKDOWN' && params.side === 'SHORT') state = 'FAILED';
  else if (params.big.state === 'CASCADE' && align) state = 'CASCADE';
  else if (params.big.state === 'EXPANSION' && (pressure ?? 0) >= 18 && align) state = 'SQUEEZE_ACTIVE';
  else if (params.big.state === 'READY' && oi === 'increasing') state = 'TRIGGER_READY';
  else if (params.big.state === 'COMPRESSION' && oi === 'increasing') state = 'BUILDUP';
  else if ((pressure ?? 0) >= 10 || oi === 'increasing') state = 'WATCH';
  else if (params.big.state === 'CASCADE' && !align) state = 'EXHAUSTED';

  if (state === 'NONE') return emptyLane(params.side, '스퀴즈 조건 약함');

  const labs = laneLabels(state, params.side);
  const score = scoreLane([
    pressure,
    params.big.expansionReady,
    oi === 'increasing' ? 62 : oi === 'decreasing' ? 40 : 50,
    live.replenishScore,
  ]);

  return {
    side: params.side,
    state,
    labelEn: labs.labelEn,
    labelKo: labs.labelKo,
    note:
      state === 'FAILED'
        ? '가짜 돌파·이탈 · 추격 금지'
        : '청산·OI·흐름 합산 · 확률 아님',
    score,
  };
}

export function runSqueezeRadarEngine(params: {
  candles: Eagle1Bar[];
  endExclusive?: number;
  money?: Eagle1MoneyPressure | null;
  live?: Eagle1MoneyPressureLive | null;
  falseBreak?: FalseBreakReport | null;
  regime?: string | null;
}): SqueezeRadarReport {
  const bigMove = runBigMoveEngine({
    candles: params.candles,
    endExclusive: params.endExclusive,
    money: params.money,
    live: params.live,
    regime: params.regime,
  });
  const long = buildLane({
    side: 'LONG',
    live: params.live,
    money: params.money,
    big: bigMove,
    falseBreak: params.falseBreak,
  });
  const short = buildLane({
    side: 'SHORT',
    live: params.live,
    money: params.money,
    big: bigMove,
    falseBreak: params.falseBreak,
  });

  const rank: Record<SqueezeState, number> = {
    NONE: 0,
    WATCH: 1,
    BUILDUP: 2,
    TRIGGER_READY: 3,
    SQUEEZE_ACTIVE: 4,
    CASCADE: 5,
    EXHAUSTED: 2,
    FAILED: 1,
  };
  let activeSide: SqueezeSide | null = null;
  if (rank[long.state] > rank[short.state] && long.state !== 'NONE') activeSide = 'LONG';
  else if (rank[short.state] > rank[long.state] && short.state !== 'NONE') activeSide = 'SHORT';
  else if (long.state !== 'NONE' && short.state !== 'NONE' && long.state === short.state) {
    activeSide = (long.score ?? 0) >= (short.score ?? 0) ? 'LONG' : 'SHORT';
  }

  const top = activeSide === 'LONG' ? long : activeSide === 'SHORT' ? short : null;
  let chartTag: SqueezeRadarReport['chartTag'] = null;
  if (top?.state === 'FAILED') chartTag = '×';
  else if (top?.state === 'CASCADE') chartTag = 'CASCADE';
  else if (top?.state === 'SQUEEZE_ACTIVE') chartTag = 'SQUEEZE';
  else if (top?.state === 'BUILDUP' || top?.state === 'TRIGGER_READY') chartTag = 'BUILDUP';

  const summaryKo = top
    ? `${top.labelKo} · ${top.note}`
    : '스퀴즈 신호 없음 · 데이터 없으면 데이터 없음';

  return { long, short, activeSide, chartTag, summaryKo, bigMove };
}
