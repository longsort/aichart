export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Verdict = 'LONG' | 'SHORT' | 'WATCH';

export type OverlayKind =
  | 'supportLine'
  | 'resistanceLine'
  | 'trendLine'
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
  | 'rsiSignal'
  | 'slHunt'
  | 'falseBreakout'
  | 'po3Phase'
  | 'candlePattern'
  | 'symTriangleTarget'
  | 'bprZone'
  | 'keyLevel'
  | 'reactionZone';

export type OverlayCategory = 'structure' | 'zones' | 'labels' | 'scenario' | 'fib' | 'rsi' | 'harmonic' | 'po3' | 'candle' | 'bpr' | 'patternVision' | 'keyLevel' | 'autoTrendline' | 'reactionZone' | 'trendlineEngine' | 'strongZone';

/** 강한 매수/매도 구간 — 호가·대량체결 물량 기준 (캔들 무관) */
export type StrongZoneOutput = {
  low: number;
  high: number;
  probability: number;
  wallState?: string;
  holdProbability?: number;
  breakProbability?: number;
  trapRisk?: number;
  /** 해당 구간 고래·기관 매수/매도 물량 (USDT) */
  volumeUsdt?: number;
};

export type OverlayItem = {
  id: string;
  kind: OverlayKind;
  label: string;
  x1: number;
  y1: number;
  x2?: number;
  y2?: number;
  confidence: number;
  color?: string;
  category?: OverlayCategory;
};

export type AnalyzeResponse = {
  symbol: string;
  timeframe: string;
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
  orderbookImbalance?: number;
  oiState?: 'increasing' | 'decreasing' | 'neutral';
  fundingState?: 'positive' | 'negative' | 'neutral';
  liquidityState?: 'above' | 'below' | 'neutral';
  /** 핵심 가격 레벨 (levelEngine + scenarioEngine) */
  breakoutLevel?: { price: number; reason: string } | null;
  supportLevel?: { price: number; reason: string } | null;
  resistanceLevel?: { price: number; reason: string } | null;
  invalidationLevel?: { price: number; reason: string } | null;
  mustHold?: string;
  mustBreak?: string;
  invalidation?: string;
  bullishScenario?: string;
  bearishScenario?: string;
  nextTargets?: string[];
  /** 지지 OB (상승 OB): 현재가 아래/포함 가장 가까운 구간 */
  nearestSupportOb?: { low: number; high: number; probability: number } | null;
  /** 저항 OB (하락 OB): 현재가 위/포함 가장 가까운 구간 */
  nearestResistanceOb?: { low: number; high: number; probability: number } | null;
  /** 지지 OB 가격대 오더북 체결량: 많음/적음/보통 (collect=1 + 오더북 있을 때) */
  supportObOrderbookDepth?: 'many' | 'few' | 'medium';
  /** 저항 OB 가격대 오더북 체결량 */
  resistanceObOrderbookDepth?: 'many' | 'few' | 'medium';
  /** 선포착 OB 분석 문구 (BOS/FVG 확인 전 OB 후보 요약) */
  earlyObAnalysis?: string | null;
  /** 지금 구간: 상승/하락 OB와 과거 캔들 터치·반등 비교 요약 */
  currentZoneSummary?: string | null;
  /** 돌파 상승 확률 (오더북·매도체결 기반, collect=1 시) */
  breakoutUpsideProbability?: number;
  /** 돌파 상승 확률 근거 (매도체결 감소, 오더북 매수우위 등) */
  breakoutUpsideReasons?: string[];
  /** 돌파 구간(가격) 기준 상승 확률 — 차트 "돌파 시 ↑ 상승" 라벨에 표시 (거래소 오더북·체결 기반) */
  breakoutLevelProbability?: number;
  /** 이탈 구간(가격) 기준 하락 확률 — 차트 "돌파 시 ↓ 하락" 라벨에 표시 (거래소 오더북·체결 기반) */
  invalidationLevelProbability?: number;
  /** 롱/숏 진입 확정 시에만 실행 화면 상태 뱃지 표시 (현재가가 진입가 도달 시 CONFIRMED) */
  executionState?: 'CONFIRMED';
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
  /** 종가 마감 레벨 엔진 */
  dailyCloseLevel?: number | null;
  weeklyCloseLevel?: number | null;
  monthlyCloseLevel?: number | null;
  dailyState?: string | null;
  weeklyState?: string | null;
  monthlyState?: string | null;
  closeBias?: 'bullish' | 'bearish' | 'neutral';
  mustHoldCloseLevel?: number | null;
  mustReclaimCloseLevel?: number | null;
  closeScenarios?: Array<{ tf: string; state: string; message: string }>;
}
