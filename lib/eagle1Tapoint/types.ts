/**
 * 독수리1호 타점엔진 — 타입·결정 상태.
 * 기존 Dual/A·B·C/S급/Zone 삭제 없음 · 새 모드 전용.
 * 확정 승률·수익 아님.
 */

export type TapDecision =
  | 'CONFIRMED_LONG'
  | 'CONFIRMED_SHORT'
  | 'ARMED_LONG'
  | 'ARMED_SHORT'
  | 'WAIT';

export type TapEntryState =
  | 'WAIT'
  | 'SETUP'
  | 'ARMED'
  | 'TRIGGERED'
  | 'EXECUTION_READY'
  | 'EXECUTED'
  | 'MANAGE'
  | 'EXIT'
  | 'OUTCOME';

export type TapExecKind = 'MARKET_SCALP' | 'ZONE_SNIPER' | 'WAIT';

export type TapOrderType = 'MARKET' | 'LIMIT_CONFIRMED' | 'LIMIT_PRE' | 'WAIT';

export type TapScorePack = {
  macro: number;
  regime: number;
  direction: number;
  location: number;
  setup: number;
  entry: number;
  flow: number;
  liquidity: number;
  event: number;
  historical: number;
  failureRisk: number;
  ev: number;
};

export type TapGateResult = {
  ok: boolean;
  failReasons: string[];
  passTags: string[];
};

export type TapMacroFrame = {
  tf: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  location: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM' | 'UNKNOWN';
  structure: string;
  momentum: string;
  flow: string;
  risk: string;
  noteKo: string;
};

export type TapBattleZone = {
  lo: number;
  hi: number;
  mid: number;
  labelKo: string;
  sources: string[];
  strength: number;
};

export type TapHistoricalSnap = {
  n: number;
  similarity: number | null;
  /** 유사 구간 이후 · 조회방향(롱/숏) 기준 익절쪽 비율 */
  up3: number | null;
  up5: number | null;
  up10: number | null;
  mfe: number | null;
  mae: number | null;
  netEv: number | null;
  noteKo: string;
  /**
   * 유사표본 · 10배 기준 ROE 도달률 (가격변동 = ROE/레버).
   * 5%→가격 0.5% · 7%→0.7% · MFE가 그 이상이면 도달 · 확정 수익 아님.
   */
  roeHit5at10x?: number | null;
  roeHit7at10x?: number | null;
  roeStatHorizon?: number | null;
  /** 통계를 돌린 방향 — UI에 롱/숏 명시 */
  queryDirection?: 'LONG' | 'SHORT' | null;
  /** 한글: 롱유사 / 숏유사 */
  biasKo?: string | null;
  /** 같은 심볼 다른 TF에서 추가로 찾은 표본 — 본 TF 통계와 섞지 않음 */
  extraByTf?: Array<{
    tf: string;
    n: number;
    similarity: number | null;
    up5: number | null;
    noteKo: string;
  }>;
  windowsUsed?: number[];
};

export type TapExtremeSnap = {
  kind: string;
  score: number;
  noteKo: string;
  allowsEventPath: boolean;
  evidence: string[];
};

export type TapointDecisionReport = {
  symbol: string;
  timeframe: string;
  decidedAt: number;
  decision: TapDecision;
  entryState: TapEntryState;
  execKind: TapExecKind;
  /** §16·17 주문형태 */
  orderType?: TapOrderType;
  execNoteKo?: string | null;
  direction: 'LONG' | 'SHORT' | null;
  /** 팩터 RSI — 그 코인 실행봉 종가 */
  chartRsi?: number | null;
  scores: TapScorePack;
  gate: TapGateResult;
  macro: TapMacroFrame[];
  regimeKo: string;
  /** §7 유동성 맵 요약 */
  liquidityMap?: {
    summaryKo: string;
    above: Array<{ kind: string; price: number; labelKo: string }>;
    below: Array<{ kind: string; price: number; labelKo: string }>;
  } | null;
  /** §4 HTF 마감 상태(1D/1W/1M) */
  htfClose?: Array<{
    tf: string;
    developing: boolean;
    statusKo: string;
    remainSec: number;
  }> | null;
  battleZone: TapBattleZone | null;
  historical: TapHistoricalSnap;
  extreme: TapExtremeSnap;
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  reasonOneLineKo: string;
  briefingKo: string;
  setupSources: string[];
  signalId: string | null;
  rejectReasonKo: string | null;
  qualityOk: boolean;
  /** 품질·리페인트 게이트 메모 */
  qualityNoteKo?: string | null;
  /** §24 NET EV */
  netEv?: {
    ok: boolean;
    netRrTp1: number | null;
    netRoePct: number | null;
    expectedMovePct: number | null;
    roundTripCostPct: number;
    noteKo: string;
  } | null;
  /** §19 오더플로 */
  flowSnap?: {
    bias: string;
    score: number | null;
    usableForConfirm: boolean;
    alignsWithDir: boolean | null;
    summaryKo: string;
  } | null;
  /** §22 구조 SL 메모 */
  structuralSlNoteKo?: string | null;
  /** §20 RSI/다이버전스 */
  rsiDiv?: {
    rsi: number | null;
    divergence: string;
    chaseWarn: boolean;
    slopeKo?: string;
    noteKo: string;
  } | null;
  backtestSummaryKo?: string | null;
  metricsNoteKo?: string | null;
  /** §14 SFP */
  sfpQuality?: {
    kind: string;
    score: number;
    active: boolean;
    noteKo: string;
  } | null;
  /** §18 BREAKOUT */
  breakout?: {
    active: boolean;
    direction: 'LONG' | 'SHORT' | null;
    score: number;
    phaseKo: string;
    noteKo: string;
  } | null;
  /** §25 상관 */
  corrCluster?: {
    sameDirCount: number;
    symbols: string[];
    riskHigh: boolean;
    allowNew: boolean;
    noteKo: string;
  } | null;
  /** §35 PAPER/LIVE */
  paperLive?: {
    stage: string;
    tradingMode: string;
    liveAllowed: boolean;
    paperOnly: boolean;
    noteKo: string;
  } | null;
  /** §9 NORMAL SETUP */
  normalSetup?: {
    ok: boolean;
    score: number;
    noteKo: string;
    tags: string[];
  } | null;
  strategyFamily?: string | null;
  rejectLedgerId?: string | null;
  /** 통합모드 공동: 선진거래량·일봉면 */
  sharedMerged?: {
    advVolume: {
      kind: string;
      action: string;
      actionKo: string;
      tagKo: string;
      buyPct: number;
      rvol: number | null;
      notable: boolean;
      time: number;
    } | null;
    dailyFace: {
      bias: 'up' | 'down' | 'flat';
      labelKo: string;
      noteKo: string;
    } | null;
  };
  /** 분봉 볼륨폭발 롱/숏 신호 (5m·15m · RVOL≥3+봉색 · ROE7@20x) */
  volRoeBurst?: {
    fired: boolean;
    direction: 'LONG' | 'SHORT' | null;
    rvol: number;
    candle: 'green' | 'red' | 'doji';
    rsi: number | null;
    barTime: number;
    detectTf?: string;
    noteKo: string;
    targetRoePct: number;
    leverage: number;
    priceMovePct: number;
  };
  /** 스윕합류 — 최근 SWEEP+연속2봉+방향정렬(+회수) · 자동진입 필수 · 단독주문 금지 */
  sweepLive?: {
    fired: boolean;
    direction: 'LONG' | 'SHORT' | null;
    alignsWithDir: boolean;
    bias: 'bullish' | 'bearish' | null;
    level: number | null;
    ageBars: number | null;
    reclaimed: boolean;
    consecutive2?: boolean;
    /** 1회기록 · 2회진입 */
    phase?: 'NONE' | 'RECORD_1' | 'ENTRY_2';
    sweepCount?: number;
    score: number;
    noteKo: string;
    briefKo: string;
  };
  /** BTC 3m 초단타 · TP1 전량 · 기존 타점과 병행(1순위 진입) */
  quickScalp?: {
    engine: string;
    ok: boolean;
    autoReady: boolean;
    direction: 'LONG' | 'SHORT' | null;
    entry: number | null;
    sl: number | null;
    tp: number | null;
    tpPct: number;
    slPct: number;
    quickProfitScore: number;
    immediateAdverseRisk: number;
    profitFirstProbability: number | null;
    sampleN: number;
    sampleLabel: string;
    grade: string;
    expectedTpMinLo: number;
    expectedTpMinHi: number;
    waitReason: string;
    stateKo: string;
    reasonKo: string;
    whyKo?: string;
    machineState?: string;
    eventId?: string | null;
    qualities?: {
      liquidity: number;
      sweep: number;
      reclaim: number;
      structure: number;
      displacement: number;
      retest: number;
      absorption: number;
      targetSpace: number;
      historical: number;
    };
    structureShift?: string;
    atrPercentile?: number;
    retestTouches?: number;
  } | null;
  /** BTC 독립 스나이퍼 · TP1 전량 · 기존 초단타/밴드와 병행(1순위 우선) */
  sniperScalp?: {
    engine: string;
    ok: boolean;
    autoReady: boolean;
    fire: boolean;
    direction: 'LONG' | 'SHORT' | null;
    setupId: string | null;
    setupKo: string;
    macro: string;
    thesis: string;
    battleZone: string;
    entry: number | null;
    executionSl: number | null;
    thesisInvalidation: number | null;
    tp: number | null;
    tpPct: number;
    slPct: number;
    netRr: number | null;
    sniperScore: number;
    oppositeFailure: number;
    leverage: number | null;
    grade: string;
    machineState: string;
    waitReason: string;
    eventId: string | null;
    setupIdKey: string | null;
    sampleN: number;
    sampleLabel: string;
    tpFirstProbability: number | null;
    fastGreen3m: number | null;
    reasonKo: string;
    whyKo: string;
  } | null;
  /** TF별 스윕 1/2회 (분·시·일·주·월) */
  sweepTfBoard?: Array<{
    tf: string;
    phase: 'NONE' | 'RECORD_1' | 'ENTRY_2';
    direction: 'LONG' | 'SHORT' | null;
    sweepCount: number;
    noteKo: string;
  }>;
  /** 상위 TF 스윕 필터 — 실행 TF보다 위 스윕 정렬/역행 */
  htfSweep?: {
    conflict: boolean;
    aligned: boolean;
    conflictTfs: string[];
    alignTfs: string[];
    softConflictTfs: string[];
    noteKo: string;
    briefKo: string;
    scoreBoost: number;
  };
  /** 기관밴드 중심 타점 스킬 — E/SL/T1 · 캔들반응 (확정수익 아님) */
  instBandPlan?: {
    status: string;
    direction: 'LONG' | 'SHORT' | null;
    actionable: boolean;
    entry: number | null;
    sl: number | null;
    tp1: number | null;
    rr: number | null;
    grade: string | null;
    candleKo: string;
    reasonKo: string;
    bandDir: 'long' | 'short' | null;
    band1Dir?: 'long' | 'short' | null;
    band2Dir?: 'long' | 'short' | null;
    upper?: number | null;
    mid?: number | null;
    lower?: number | null;
    atr?: number | null;
    huntExtreme?: number | null;
  } | null;
  /** 차트 전폭 작도용 — 존밴드 + 실행/구조선 + 캔들마크 */
  chartSignals?: {
    lines: Array<{
      id: string;
      price: number;
      title: string;
      color: string;
      lineWidth: 1 | 2 | 3;
      lineStyle: 'solid' | 'dashed' | 'dotted' | 'sparse';
      group: 'exec' | 'structure' | 'liquidity' | 'profile' | 'invalid';
    }>;
    zones: Array<{
      id: string;
      lo: number;
      hi: number;
      labelKo: string;
      fill: string;
      stroke: string;
      kind: string;
      priority: number;
    }>;
    markers: Array<{
      time: number;
      price: number;
      label: string;
      color: string;
      position: 'aboveBar' | 'belowBar';
      shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
    }>;
    legendKo: string[];
  };
};

export const TAPOINT_SOURCE = 'eagle1-tap-engine' as const;

export const TAPOINT_MACRO_TFS = ['1M', '1W', '1D', '4H', '1H'] as const;
export const TAPOINT_SETUP_TFS = ['15m', '5m'] as const;
export const TAPOINT_ENTRY_TFS = ['3m', '1m'] as const;
export const TAPOINT_CHART_TFS = [
  '1m',
  '3m',
  '5m',
  '15m',
  '1H',
  '4H',
  '1D',
  '1W',
  '1M',
] as const;

export const TAPOINT_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'SOLUSDT',
] as const;
