export type SentimentResult = {
  fundingRate: number;
  liquidationClusters: number;
  sentiment: 'long' | 'short' | 'neutral';
  label: string;
};

export function analyzeFundingRate(_symbol: string): number {
  return 0;
}

export function detectLiquidationClusters(_symbol: string): number {
  return 0;
}

export function getMarketSentiment(_symbol: string): SentimentResult {
  return {
    fundingRate: 0,
    liquidationClusters: 0,
    sentiment: 'neutral',
    label: '데이터 없음 (연동 대기)',
  };
}
