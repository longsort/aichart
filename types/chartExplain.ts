/** 차트 클릭 시 AI 설명 요청용 페이로드 */
export type ChartExplainCandleData = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  candleIndex: number;
};

export type ChartExplainEngineData = {
  bos: Array<{ bias: string; index: number; price: number }>;
  choch: Array<{ bias: string; index: number; price: number }>;
  fvgNearby: Array<{ bias: string; index: number; low: number; high: number }>;
  obNearby: Array<{ index: number }>;
  sweep: Array<{ side: string; index: number; price: number }>;
  eqh: Array<{ index: number; price: number }>;
  eql: Array<{ index: number; price: number }>;
};

export type ChartExplainRequest = {
  symbol: string;
  timeframe: string;
  candleData: ChartExplainCandleData;
  engineData: ChartExplainEngineData;
  /** 패턴 라벨 클릭 시 해당 패턴만 설명하도록 전달 */
  patternId?: string;
};
