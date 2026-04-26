export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** 바이낸스 kline[9] 테이커 매수 기준 체결량 — 있으면 매수/매도 체결 우세·고래 급증 히스토그램에 사용 */
  takerBuyBaseVolume?: number;
};

export type Verdict = 'LONG' | 'SHORT' | 'WATCH';

export type OverlayKind =
  | 'supportLine'
  | 'resistanceLine'
  | 'trendLine'
  /** 두 기울기 선(시간·가격 4점) 사이 면 — ChartPrime 채널 linefill */
  | 'channelBand'
  | 'zone'
  | 'supplyZone'
  | 'demandZone'
  | 'poi'
  | 'swingLabel'
  | 'equilibrium'
  | 'strongHigh'
  | 'strongLow'
  | 'liquiditySweep'
  | 'bos'
  | 'choch'
  | 'entry'
  | 'stop'
  | 'target'
  | 'fvg'
  | 'ob'
  | 'wave'
  | 'label'
  | 'eqh'
  | 'eql'
  | 'scenario'
  | 'fibLine'
  | 'harmonic'
  /** 하모닉 XABCD 점선 다리 (한 변) */
  | 'harmonicLeg'
  | 'rsiSignal'
  | 'rsiDivergenceLine'
  | 'slHunt'
  | 'falseBreakout'
  | 'po3Phase'
  | 'candlePattern'
  | 'symTriangleTarget'
  | 'bprZone'
  | 'keyLevel'
  | 'reactionZone';

export type OverlayCategory =
  | 'structure'
  | 'zones'
  | 'labels'
  | 'scenario'
  | 'fib'
  | 'rsi'
  | 'harmonic'
  | 'po3'
  | 'candle'
  | 'bpr'
  | 'patternVision'
  | 'keyLevel'
  | 'autoTrendline'
  | 'reactionZone'
  | 'trendlineEngine'
  | 'strongZone'
  | 'lvrb'
  | 'volatilityTrendScore'
  | 'aiAuto'
  | 'boswaves'
  | 'vifvg'
  | 'breakerBlocks'
  | 'smBreakoutChannels'
  | 'chartPrimeTrendChannels'
  | 'candleAnalysisCoreSd'
  | 'smcDesk'
  /** Smart Adaptive Signal (VWAP+AMA·일봉 MA 근사) — 롱/숏 마커·목표선 */
  | 'smartAdaptive'
  | 'bibleMode'
  /** 고래 모드 툴킷: Dynamic R/S PRO, Liquidity Bias 등 Pine 요약 레이어 */
  | 'whaleToolkit'
  /** 기관식 S/R 밴드 존(지지·저항 띠) */
  | 'institutionalSrBand';

/** 강한 매수/매도 구간 — 호가·대량체결 물량 기준 (캔들 무관). 확률은 매수/매도 데이터 기반. */
export type StrongZoneOutput = {
  low: number;
  high: number;
  probability: number;
  wallState?: string;
  /** 안착확률: 매수존에서 이 구간 지지받아 안착할 확률 (체결·호가 비율 기반) */
  holdProbability?: number;
  /** 돌파확률: 매도존에서 이 구간이 돌파될 확률 (체결·호가 비율 기반) */
  breakProbability?: number;
  /** 저항확률: 매도존에서 이 구간이 저항으로 작용할 확률 */
  resistanceProbability?: number;
  /** 종가마감확률: 당봉 종가가 이 구간 근처에서 마감될 가능성 (현재가 대비 거리 기반) */
  closeSettleProbability?: number;
  trapRisk?: number;
  /** 해당 구간 고래·기관 매수/매도 물량 (USDT) */
  volumeUsdt?: number;
  /** 매수 체결량(USDT) — 데이터 기반 표시용 */
  executedBuyUsdt?: number;
  /** 매도 체결량(USDT) — 데이터 기반 표시용 */
  executedSellUsdt?: number;
  /** 호가 매수(비드) 유동성 USDT */
  bidLiquidityUsdt?: number;
  /** 호가 매도(애스크) 유동성 USDT */
  askLiquidityUsdt?: number;
};

export type OverlayItem = {
  id: string;
  kind: OverlayKind;
  label: string;
  x1: number;
  y1: number;
  x2?: number;
  y2?: number;
  /** API에서 제공 시 사용 — 1M 등 다른 TF 오버레이를 현재 캔들에 정확히 붙이기 위함 */
  time1?: number;
  price1?: number;
  time2?: number;
  price2?: number;
  confidence: number;
  color?: string;
  /** 추세선 등: 선은 rgba, 라벨·가격띠는 이 색(보통 불투명 #RRGGBB)으로 표시 — 다크 배경 가독성 */
  lineLabelColor?: string;
  /** 선·핀 라벨 배경 (TradingView 스타일 콜아웃) */
  labelBackgroundColor?: string;
  /** 선·핀 라벨 글자색 */
  labelTextColor?: string;
  category?: OverlayCategory;
  /** OB: 이후 캔들이 구간 터치 시 완화(Mitigated) — 차트에서 흐리게 표시 */
  obMitigated?: boolean;
  /** 존(특히 고래 MSB-OB): 윅만 관통·종가는 안쪽 — 점선 테두리 등 */
  zonePartialMitigation?: boolean;
  /** SVG stroke-dasharray (예: '6 4') — 평행채널 중앙선 등 */
  lineDash?: string;
  /** 선 굵기(px) — ParkF LinReg·추세선 등. 없으면 전역 overlayLineThickness 규칙 사용 */
  lineStrokeWidth?: number;
  /** true면 ChartView의 우측 투영(선 연장 보정)을 적용하지 않음 */
  noProject?: boolean;
  /** true면 존(time1~time2) 가로폭만 표시 — 바이블 패턴 점선 프레임 등 우측 끝까지 늘리지 않음 */
  zoneSpanOnly?: boolean;
  /**
   * 존을 차트 우측까지 늘리기 **전**, time2에 대응하는 화면 X(px).
   * 라벨·가격띠를 가격축(뷰포트) 고정이 아니라 해당 봉(time2)에 붙이기 위해 screenOverlays에서만 채움.
   */
  zoneTimeEndScreenX?: number;
  /** kind === 'channelBand': 상단·하단 경계(각각 time1→time2 직선) */
  channelBand?: {
    time1: number;
    time2: number;
    priceHigh1: number;
    priceHigh2: number;
    priceLow1: number;
    priceLow2: number;
  };
  /** 핵심 존(진입·돌파·필수 지지 등) — 차트에서 은은한 펄스 강조 */
  zonePulse?: boolean;
  /**
   * 캔들 뒤 존 fill: `softenZoneFill`에 레이아웃별 높은 배율·`minAlpha` 적용(알파 이중 감쇠 완화).
   * 생성 측에서만 설정 — ChartView는 id 패턴으로 추측하지 않음.
   */
  zoneFillPreserve?: boolean;
  /** 존 div `className`에 추가(공백 구분 복수 가능). 예: HotZone 가시성 `overlay-zone--hotzone-radar` */
  overlayZoneExtraClass?: string;
  /** 짧은 라벨일 때 차트 툴팁용 풀 텍스트(캔들분석 자동 OB 등) */
  labelTooltip?: string;
  /**
   * BOS/CHOCH/MSB 구조 마크 — 롱(매수) 방향 돌파 vs 숏(매도) 방향 돌파.
   * 차트 압축 라벨의 「상승/하락/중립」은 색(hex) 추정 대신 이 값을 우선한다.
   */
  structureBias?: 'bullish' | 'bearish';
  /** AI 분석 S/R 사다리: 현재가에 가장 가까운 지지·저항 밴드(굵은 테두리·고채도) */
  aiZoneNearestSr?: boolean;
};

/** 통합 그래프·시장 미세 — 다거래소 CVD 합산·OI·청산·CMF */
export type UnifiedMarketExchangeLeg = {
  venue: string;
  cumulativeCvdUsd: number;
  volumeDeltaUsd: number;
  tradeCount: number;
};

export type UnifiedMarketMetrics = {
  spotCumulativeCvdUsd: number;
  futuresCumulativeCvdUsd: number;
  /** Binance Spot+USDM + Bybit Linear + OKX Swap (가능한 구간만 합산) */
  aggregatedCvdUsd: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  oiLatest: number | null;
  oiPrevious: number | null;
  oiDeltaAbs: number | null;
  oiDeltaPct: number | null;
  /** 강제청산 명목(바이낸스 USDM 최근 N건) */
  liquidationLongUsd: number;
  liquidationShortUsd: number;
  cmf20: number | null;
  exchangeLegs: UnifiedMarketExchangeLeg[];
  collectedAtMs: number;
};

export type AnalyzeResponse = {
  schemaVersion?: string;
  symbol: string;
  timeframe: string;
  /** /api/analyze가 내려줄 때: 차트 visible 구간 캔들(통합 시그널 합성 등) */
  candles?: Candle[];
  verdict: Verdict;
  confidence: number;
  summary: string;
  entry: string;
  stopLoss: string;
  targets: string[];
  overlays: OverlayItem[];
  engine: Record<string, any>;
  topReferences: Array<{ id: string; title?: string; score: number; tags: string[]; reason?: string; outcome?: string }>;
  futurePaths?: Array<{ path: string; direction: string; probability: number; targets: number[]; reason: string }>;
  beamPathForecast?: {
    dominant: 'LONG' | 'SHORT' | 'MIXED';
    confidence: number;
    points: Array<{
      horizon: 3 | 5 | 8;
      longProb: number;
      shortProb: number;
      expectedPriceLong: number;
      expectedPriceShort: number;
    }>;
  };
  probability?: { longProbability: number; shortProbability: number; score: number; reason: string[] };
  mtf?: { htfBias: string; mtfBias?: string; ltfBias?: string; mtfStructure: string; ltfEntryBias: string; alignmentScore: number; summary?: string };
  regime?: string;
  longScore?: number;
  shortScore?: number;
  confidenceGrade?: string;
  riskFlags?: string[];
  rr?: number;
  briefingContext?: import('@/lib/briefingContext').BriefingContext;
  indicators?: {
    rsi: number[]; rsiMa: number[]; stochK: number[]; stochD: number[];
    macdLine?: number[]; macdSignal?: number[]; macdHist?: number[];
    bbMid?: number[]; bbUpper?: number[]; bbLower?: number[];
    atr?: number[];
  };
  learnedPatternsTop5?: Array<{ id: string; title: string; score: number; patternType?: string; bias?: string; reason: string; outcome: string; briefing: string; description?: string }>;
  recallSummary?: string;
  detectedVisionPatterns?: Array<{ id: string; type: string; bias: string; confidence: number; startIndex: number; endIndex: number; label: string; reason: string; pivotPoints?: unknown[]; lines?: unknown[]; zones?: unknown[] }>;
  dominantPattern?: { type: string; confidence: number; bias: string; label?: string; reason?: string } | null;
  patternVisionSummary?: string;
  /** 거래소 수집 데이터 (collect=1 시) */
  currentPrice?: number;
  buyPressure?: number;
  sellPressure?: number;
  volumeDelta?: number;
  /** collect=1 시: CVD·OI델타·청산·CMF·거래소별 다리 */
  unifiedMarketMetrics?: UnifiedMarketMetrics;
  orderbookImbalance?: number;
  oiState?: 'increasing' | 'decreasing' | 'neutral';
  fundingState?: 'positive' | 'negative' | 'neutral';
  liquidityState?: 'above' | 'below' | 'neutral';
  /** 집계 유동성 델타(근사): 봉별 매수-매도 우세, 레짐·전환·함정 필터 */
  depthDeltaContext?: import('@/lib/depthDeltaContext').DepthDeltaContext | null;
  /** 핵심 가격 레벨 (levelEngine + scenarioEngine) */
  breakoutLevel?: { price: number; reason: string } | null;
  supportLevel?: { price: number; reason: string } | null;
  resistanceLevel?: { price: number; reason: string } | null;
  invalidationLevel?: { price: number; reason: string } | null;
  mustHold?: string;
  mustBreak?: string;
  invalidation?: string;
  /** 구조·RSI·SR·종가·FVG 등 다요소 확정 게이트 (`lib/confirmedSignalEngine`) */
  confirmedSignal?: {
    confirmed: boolean;
    direction: 'LONG' | 'SHORT' | null;
    structure: boolean;
    rsi: boolean;
    supportResistance: boolean;
    close: boolean;
    fvgZone: boolean;
    reasons: string[];
    /** 0~5: 구조·RSI·S/R·종가·FVG */
    gatesPassCount?: number;
    /** 확정 단계(5게이트 기반; full=5/5+MTF통과, mtf_veto=5/5+MTF반대) */
    readinessTier?: 'none' | 'building' | 'prepared' | 'strong' | 'full' | 'mtf_veto';
    mtfBlocked?: boolean;
  };
  /**
   * 세트 구조·반등: 밀림(조정) → (OB/지지·저항) 반응 → 이탈 시 다음 → TP1(참고).
   * 브리핑 3파·OB·무효가와 맞춤 — 투자 권유 아님.
   */
  structureBouncePath?: {
    bias: 'up' | 'down' | 'range';
    headline: string;
    summaryLine: string;
    steps: Array<{
      order: number;
      kind: 'press' | 'reaction' | 'break_next' | 'target' | 'range_low' | 'range_high';
      title: string;
      detail: string;
      low: number;
      high: number;
    }>;
  } | null;
  /** 가장 가까운 OB·무효가 기반 감시 구간 카드 (`lib/zoneBiasCard`) */
  zoneBiasCard?: {
    low: number;
    high: number;
    side: 'LONG' | 'SHORT' | null;
    confidence: number;
    invalidateAbove: number | null;
    invalidateBelow: number | null;
    summaryLines: string[];
  } | null;
  bullishScenario?: string;
  bearishScenario?: string;
  nextTargets?: string[];
  /** 지지 OB (상승 OB): 현재가 아래/포함 가장 가까운 구간 */
  nearestSupportOb?: { low: number; high: number; probability: number; pastTouches?: number; pastHits?: number } | null;
  /** 저항 OB (하락 OB): 현재가 위/포함 가장 가까운 구간 */
  nearestResistanceOb?: { low: number; high: number; probability: number; pastTouches?: number; pastHits?: number } | null;
  /**
   * SMC 데스크: LinReg 밴드 근접 + OB + 최근 BOS/CHOCH **2/3** 참고 방향(차트 합류·L/S와 동일 로직).
   * `verdict`는 별도 종합 시그널 — 방향이 다를 수 있음(`differsFromVerdict`).
   */
  smcDeskConfluenceLs?:
    | {
        side: 'LONG' | 'SHORT';
        longScore: number;
        shortScore: number;
        differsFromVerdict: boolean;
      }
    | null;
  /** 지지 OB 가격대 오더북 체결량: 많음/적음/보통 (collect=1 + 오더북 있을 때) */
  supportObOrderbookDepth?: 'many' | 'few' | 'medium';
  /** 저항 OB 가격대 오더북 체결량 */
  resistanceObOrderbookDepth?: 'many' | 'few' | 'medium';
  /** 선포착 OB 분석 문구 (BOS/FVG 확인 전 OB 후보 요약) */
  earlyObAnalysis?: string | null;
  /** 지금 구간: 상승/하락 OB와 과거 캔들 터치·반등 비교 요약 */
  currentZoneSummary?: string | null;
  /**
   * AI·고래 모드용 자동 요약: 구조 OB(과거 터치)·압축→장대·거래소 플로우·Pre3를 한 덩어리로 정리
   */
  aiModeAutoAnalysis?: {
    headline: string;
    bullets: string[];
    compression?: {
      boxLow: number;
      boxHigh: number;
      barsCompressed: number;
      impulseBias: 'bullish' | 'bearish';
      barsAgo: number;
    } | null;
    /** 최근 N봉이 좁은 레인지(압축)인지 — 장대 직전 셋업 후보 */
    liveCompression?: {
      score: number;
      barsN: number;
      boxLow: number;
      boxHigh: number;
      volumeDryUp: boolean;
      obConfluent: 'support' | 'resistance' | 'none';
      hint: string;
    } | null;
    flowLine?: string;
  } | null;
  /** 돌파 상승 확률 (오더북·매도체결 기반, collect=1 시) */
  breakoutUpsideProbability?: number;
  /** 돌파 상승 확률 근거 (매도체결 감소, 오더북 매수우위 등) */
  breakoutUpsideReasons?: string[];
  /** 돌파 구간(가격) 기준 상승 확률 — 차트 "돌파 시 ↑ 상승" 라벨에 표시 (거래소 오더북·체결 기반) */
  breakoutLevelProbability?: number;
  /** 이탈 구간(가격) 기준 하락 확률 — 차트 "돌파 시 ↓ 하락" 라벨에 표시 (거래소 오더북·체결 기반) */
  invalidationLevelProbability?: number;
  /** 지지 레벨 가격대 확률 (오더북·체결 기반) */
  supportLevelProbability?: number;
  /** 저항 레벨 가격대 확률 (오더북·체결 기반) */
  resistanceLevelProbability?: number;
  /** 엔트리 가격대 지지(유지) 확률 (오더북·체결 기반) */
  entryHoldProbability?: number;
  /** 타점 확정: LONG(breakout+support) / SHORT(invalidation+resistance) + entry hold + 실행확정 */
  tapPointConfirmed?: boolean;
  /** 나비D(하모닉) 가격대 확률 */
  harmonicDProbability?: number;
  /** 실행 상태: 엔트리 터치(TOUCHED) 후 확정봉 종가 유지 시 CONFIRMED */
  executionState?: 'TOUCHED' | 'CONFIRMED';
  /** 타이롱 엔진: OHLC 레벨, 지지/저항, 돌파가 */
  tailong?: {
    tailongLevels: Array<{ high: number; low: number; close: number; open: number; tf: string; verdict: string }>;
    tailongSupport: number;
    tailongResistance: number;
    tailongBreakPrice: number;
    tailongBreakDirection: 'bullish' | 'bearish';
    tailongTailLevels?: Record<string, { entryLow: number; entryHigh: number }>;
  };
  /** 종가 마감 보드: TF별 진행중/거의확정/확정, 남은시간, 좋음/나쁨 */
  closeSettlement?: Array<{
    tf: string;
    label: string;
    status: '진행중' | '거의확정' | '확정';
    remainingSec: number;
    goodBad: 'good' | 'bad' | 'neutral';
    lastCandleBullish: boolean;
    progress: number;
  }>;
  /** 강한 매수/매도 구간 (현재가 ±3%, zoneStrengthEngine) */
  nearestBuyZone?: StrongZoneOutput | null;
  nearestSellZone?: StrongZoneOutput | null;
  /** Focus/Execution 모드용 zone 박스 오버레이 (최대 2 buy + 2 sell) */
  strongZoneOverlays?: OverlayItem[];
  /** Zone별 매수/매도 데이터·확률 (실행 모드 상세 표시용) */
  buyZones?: StrongZoneOutput[];
  sellZones?: StrongZoneOutput[];
  /** 종가 마감 레벨 엔진 */
  dailyCloseLevel?: number | null;
  weeklyCloseLevel?: number | null;
  monthlyCloseLevel?: number | null;
  /** TF별 직전 확정봉 종가(오버레이 `price1` 보강·검증용, 서버 `computeCloseLevels`와 동일) */
  closeLevel1m?: number | null;
  closeLevel5m?: number | null;
  closeLevel15m?: number | null;
  closeLevel1h?: number | null;
  closeLevel4h?: number | null;
  dailyState?: string | null;
  weeklyState?: string | null;
  monthlyState?: string | null;
  closeBias?: 'bullish' | 'bearish' | 'neutral';
  mustHoldCloseLevel?: number | null;
  mustReclaimCloseLevel?: number | null;
  closeScenarios?: Array<{ tf: string; state: string; message: string }>;
  /** 스윙 90% 타점: 브리핑·차트·종가 종합 판정 */
  swingTapPoint?: {
    active: boolean;
    direction: 'LONG' | 'SHORT' | null;
    confidence: number;
    reasons: string[];
    missing: string[];
    swingTimeframe: boolean;
  };
  /** 최근 캔들 구간 WAD(고래) BUY/SELL 신호 횟수(통합 그래프·요약) */
  volumeFlowSummary?: {
    windowBars: number;
    spikeCount: number;
    whaleBuyCount: number;
    whaleSellCount: number;
    label: string;
  };
  /** WAD 급증(프록시) × 호가·체결 고래 존 겹침 — 신뢰도·확률·캡션 근거 */
  volumeWhaleZoneConfluence?: {
    zoneDataProvided: boolean;
    lastBarWhaleBuy: boolean;
    lastBarWhaleSell: boolean;
    lastBarInBuyZone: boolean;
    lastBarInSellZone: boolean;
    confluentLong: boolean;
    confluentShort: boolean;
    recentConfluentLong: number;
    recentConfluentShort: number;
    confidenceDelta: number;
    probabilityLongBonus: number;
    probabilityShortBonus: number;
    caption: string;
  };
  /** HTF Conviction Divergence Matrix (ChartPrime) — 리본·OHLC·PO3·고확신 다이버 */
  htfConvictionMatrix?: {
    htfLabel: string;
    developingHtf: { open: number; high: number; low: number; close: number };
    htfIsBullish: boolean;
    ribbon: boolean[];
    signals: Array<
      | { kind: 'bullDiv' | 'bearDiv'; barIndex: number }
      | {
          kind: 'bullPrime' | 'bearPrime';
          barIndex: number;
          lineFromIndex: number;
          lineToIndex: number;
          priceFrom: number;
          priceTo: number;
        }
    >;
  } | null;
  /** RSI 다이버전스 + 거래량 + 캔들 패턴 스윙 시그널 */
  rsiDivergenceSignal?: {
    verdict: 'LONG' | 'SHORT' | 'WATCH' | 'NONE';
    longScore: number;
    shortScore: number;
    reasons: string[];
    divergence: { bullish: boolean; bearish: boolean; label: string };
    volume: { spike: boolean; volMA20: number; lastVol: number; label: string };
    candle: { bullish: boolean; bearish: boolean; label: string };
    trend: { bullish: boolean; bearish: boolean; label: string };
    scoreBreakdown?: Array<{ label: string; value: string; points: number; ok: boolean }>;
    divergenceLines?: Array<{ type: 'bullish' | 'bearish'; index1: number; price1: number; index2: number; price2: number; rsi1?: number; rsi2?: number }>;
    signalHistory?: Array<{ time: number; verdict: 'LONG' | 'SHORT' }>;
  };
  /**
   * 구조·존 로켓: BOS+RSI/안착(확정) + CHOCH·리테스트·존(1m~1w). 월·연(1M·1Y)은 확정만.
   * TF별 merge 상한·소스 필터 후 dedupe.
   */
  structureRocketSignals?: Array<{
    time: number;
    direction: 'LONG' | 'SHORT';
    source:
      | 'bos_retest_rsi'
      | 'bos_retest_settlement'
      | 'bos_retest_both'
      | 'struct_choch_break'
      | 'struct_retest_only'
      | 'zone_support_bounce'
      | 'zone_support_break'
      | 'zone_resist_reject'
      | 'zone_resist_break';
    entryPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
    takeProfit2?: number;
    setupKind?: 'retrace_long' | 'breakdown_retest' | 'breakdown_breakout' | 'retrace_breakout';
  }>;
  /** Zone 시그널 민감도(0.7~1.3) */
  zoneSignalSensitivity?: number;
  /** MVP 분석 패널 데이터 */
  analysisPanel?: {
    direction: 'Bullish' | 'Bearish' | 'Neutral';
    structure: 'Trending' | 'Range' | 'Reversal';
    htfBias: string;
    zoneState: 'long_confirm' | 'short_confirm' | 'wait';
    longConfirmed: boolean;
    shortConfirmed: boolean;
    score: number;
    reasons: string[];
  };
  /** 롱/숏/관망 zone 시그널 JSON */
  zoneSignal?: {
    zone: 'long_confirm' | 'short_confirm' | 'wait';
    score: number;
    bucket: 'strong' | 'valid' | 'normal' | 'invalid';
    reasons: string[];
    entryZone: [number, number] | null;
    stopZone: [number, number] | null;
    targets: number[];
    riskReward: number | null;
    labels: string[];
  };
  /** 구조 스냅샷 */
  structureState?: {
    state: 'trend_up' | 'trend_down' | 'range' | 'reversal';
    hhhl: boolean;
    lhll: boolean;
    bosUp: number;
    bosDown: number;
    chochUp: number;
    chochDown: number;
    premiumDiscount: 'premium' | 'discount' | 'equilibrium';
  };
  /** 최근 캔들 상세 점수 */
  candleScores?: Array<{
    index: number;
    bullish: boolean;
    bodyPct: number;
    upperWickPct: number;
    lowerWickPct: number;
    closeNearHigh: boolean;
    closeNearLow: boolean;
    longBody: boolean;
    hammer: boolean;
    invertedHammer: boolean;
    engulfing: boolean;
    breakoutCandle: boolean;
    failedBreakCandle: boolean;
    sweepSuspect: boolean;
    volumeZ?: number;
    volumeTrend3?: number;
    volumeConfirmed?: boolean;
    strength: 'weak' | 'normal' | 'strong';
    score: number;
  }>;
  /** L/S 신호 자율학습 누적 통계 (TP/SL 결과 기반) */
  signalLearning?: {
    total: number;
    longCount: number;
    shortCount: number;
    tp1Count: number;
    tp2Count: number;
    tp3Count: number;
    slCount: number;
    openCount: number;
    successRate: number;
    failRate: number;
    walkForward: {
      trainWinRate: number;
      oosWinRate: number;
      oosPassed: boolean;
      oosSamples: number;
    };
    suggestedThreshold: number;
    recent: Array<{
      time: number;
      verdict: 'LONG' | 'SHORT';
      entry: number;
      stopLoss: number;
      targets: [number, number, number];
      outcome: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'OPEN';
      barsToOutcome: number | null;
    }>;
    /** 최근 실패 컨텍스트 상위 (역필터에서 회피하는 조합) */
    failedContextsTop5?: Array<{
      context: string;
      count: number;
      lastAt: number;
    }>;
    sampleSources?: {
      confirmed: number;
      rsi: number;
      triggered: number;
      ready: number;
      merged: number;
      structureRockets?: number;
    };
    /** 선행 봉에서 SL 먼저 도달한 신호 — 차트 L/S·🚀📉 숨김에 사용 */
    slFailures?: Array<{ time: number; verdict: 'LONG' | 'SHORT' }>;
  };
  /** 구조+과거 승률 기반 학습 신호 요약 */
  adaptiveLearningSignal?: {
    direction: 'LONG' | 'SHORT' | 'WATCH';
    confidence: number;
    pastWinRate: number;
    pastFailRate: number;
    avgUpMovePct: number;
    avgDownMovePct: number;
    briefing: string;
  };
  /** 과거 성과 기반 학습 필터 게이트 */
  learningFilter?: {
    enabled: boolean;
    passed: boolean;
    score: number;
    threshold: number;
    reasons: string[];
  };
  featureProbabilities?: Array<{
    key: string;
    label: string;
    riseProb: number;
    fallProb: number;
    supportProb: number;
    resistanceProb: number;
    samples: number;
    directionBias: 'LONG' | 'SHORT' | 'NEUTRAL';
  }>;
  similarBriefing?: {
    similarity: number;
    at: number;
    summary: string;
    direction: 'LONG' | 'SHORT' | 'WATCH';
    entry: number;
    stop: number;
    target1: number;
    wavePath?: { preAnchor: number; w1: number; w2: number; w3: number; useShort: boolean; tag: string; confidence: number };
  } | null;
  /** 사전 분석(기록 파일) 기반: 장대봉 직전 3캔들 유사도 스파클 신호 */
  pre3Sparkle?: {
    enabled: boolean;
    matched: boolean;
    similarity: number;
    threshold: number;
    direction: 'LONG' | 'SHORT' | 'NONE';
    sourceSamples: number;
    /** 유사도·존 통과, 마감만 남음 */
    waitingBarClose?: boolean;
    /** 1=비율, 2=직전3봉 ATR, 3=2+장대(OB)형태·직전합거래량 대비 */
    featureSchemaUsed?: 1 | 2 | 3 | 4;
  };
  /** 장대봉 직전 3캔 유사도 충족 — 과거 봉별 반짝 (최대 개수는 서버에서 제한) */
  pre3SparkleHistory?: Array<{ time: number; direction: 'LONG' | 'SHORT'; similarity: number }>;
  /** 학습에 사용한 캔들 범위(전체 fetch vs 표시 구간) */
  learningCandleStats?: {
    fetched: number;
    visible: number;
  };
  /** L/S 신호 전용 트레이드 플랜 (신호 캔들 기준 TP/SL) */
  lsSignalPlan?: {
    direction: 'LONG' | 'SHORT';
    signalTime: number;
    entry: number;
    stopLoss: number;
    targets: [number, number, number];
    rr: number;
    structureNote?: string;
    maxTarget?: number;
  };
  /** AI형 지지/저항 기반 롱·숏 구조 요약 (확정 수익/승률 아님) */
  aiSupportResistancePlan?: {
    direction: 'LONG' | 'SHORT';
    support: number | null;
    resistance: number | null;
    breakout: number | null;
    invalidation: number | null;
    expectedMoveTo: number | null;
    structureNote: string;
  };
  /** 세력/고래/CVD/상승시작 MVP 점수 요약 */
  smartMoneyMvpSignal?: {
    forceScore: number;
    whaleScore: number;
    riseStartScore: number;
    totalScore: number;
    state: 'LONG_READY' | 'WATCH' | 'CAUTION';
    entryStyle: 'PULLBACK' | 'BREAKOUT' | 'WAIT';
    probabilityEdge: number;
    venueCvdBias: 'BUY' | 'SELL' | 'MIXED';
    mtfAlignmentScore: number;
    workflowState: 'IDLE' | 'SETUP' | 'ARMED' | 'TRIGGERED' | 'INVALID';
    conditionsMet: number;
    conditionsTotal: number;
    reasons: string[];
    alertText?: string;
    matchedRuleId?: string | null;
    invalidReason?: string | null;
  };
  smartMoneyWorkflowHistory?: Array<{
    symbol: string;
    timeframe: string;
    state: 'IDLE' | 'SETUP' | 'ARMED' | 'TRIGGERED' | 'INVALID';
    at: number;
    score: number;
    probabilityEdge: number;
    signalTime?: number;
  }>;
  /** 안착 확정 ZONE 3단계 (후보/확인/실패) + 점수 */
  settlementZone?: {
    state: 'none' | 'candidate' | 'confirmed' | 'failed';
    score: number;
    grade: 'A' | 'B' | 'C';
    direction: 'LONG' | 'SHORT' | 'NONE';
    level: number | null;
    breakIndex?: number;
    retestIndex?: number;
    reasons: string[];
  };
  frontRunSignal?: {
    state: 'WATCH' | 'READY' | 'TRIGGERED' | 'INVALID' | 'NO_SIGNAL';
    direction: 'LONG' | 'SHORT' | 'NONE';
    confidence: number;
    signalTime?: number;
    entry?: number;
    stop?: number;
    tp1?: number;
    tp2?: number;
    tp3?: number;
    rr?: number;
    leverage?: number;
    positionSize?: number;
    riskAmount?: number;
    spotProfitPct?: number[];
    spotLossPct?: number;
    futuresProfitPct?: number[];
    futuresLossPct?: number;
    reasons: Array<{ code: string; label: string; score: number; detail?: string }>;
    contextScore: number;
    setupScore: number;
    triggerScore: number;
    totalScore: number;
    thresholds?: {
      triggered: { setup: number; trigger: number; total: number };
      ready: { setup: number; trigger: number };
      watch: { setup: number; triggerUpper: number };
      timeframe: string;
      regime: 'trend' | 'range';
    };
    timestamp: number;
  };
  /**
   * 전역 분석 피처 합성(비LLM): 롱/숏/관망 + 확정·유력·관망 등급, 차트 한글 마커·요약용.
   * @see lib/aiFusionSignal.ts
   */
  aiFusionSignal?: import('@/lib/aiFusionSignal').AiFusionSignal;
  /** 전 기능 통계 합성 기반 핵심 롱/숏 존 (근거·무효·목표 힌트) */
  aiZoneSignal?: import('@/lib/aiZoneSignal').AiZoneSignal;
  /** AI 분석 모드: 엔진·S/R·OB·감시구간·돌파를 한 덩어리로 묶은 통합 롱/숏 뷰 */
  aiUnifiedLongShort?: import('@/lib/aiUnifiedLongShort').AiUnifiedLongShort;
  /** AI_ZONE 전용 통계 요약(오버레이 밀도·신호 건강도) */
  aiZoneStats?: {
    enabled: boolean;
    confidence: number;
    signalHealth: number;
    overlays: number;
    zones: number;
    lines: number;
    trends: number;
  };
  /** 룰엔진 출력을 차트 레이어용 숫자 JSON으로 정규화 (smart-overlay-v1) */
  smartOverlay?: import('./smartOverlay').SmartOverlayPayload;
}

export type {
  SmartOverlayPayload,
  SmartOverlayZone,
  SmartOverlayZoneKind,
  SmartOverlayScoreBreakdown,
} from './smartOverlay';
