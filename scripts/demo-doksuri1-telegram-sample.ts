/**
 * 독수리전황 텔레그램 메시지 예시 출력
 * npx tsx scripts/demo-doksuri1-telegram-sample.ts
 */
import { buildDoksuri1Pack } from '../lib/doksuri1/buildDoksuri1Pack';
import type { Candle } from '../types';

const base = 97500;
const candles: Candle[] = [];
for (let i = 0; i < 48; i++) {
  const c = base + Math.sin(i / 5) * 180 + i * 3;
  candles.push({
    time: 1700000000 + i * 900,
    open: c - 20,
    high: c + 40,
    low: c - 50,
    close: c,
    volume: 100 + (i % 7) * 30,
  });
}
const price = candles[candles.length - 1]!.close;

const pack = buildDoksuri1Pack({
  symbol: 'BTCUSDT',
  timeframe: '15m',
  price,
  candles,
  dumpZones: [
    {
      sourceTf: '4h',
      sourceTfKo: '4시간',
      bandRole: 'floor',
      mid: price - 900,
      top: price - 600,
      bot: price - 1200,
      lifeState: 'BOUNCE_WATCH',
      evidenceScore: 7,
      formedTime: 1700000000,
      labelKo: '4h 지지',
      detailKo: '',
      analysisSource: 'dump',
    } as never,
    {
      sourceTf: '1h',
      sourceTfKo: '1시간',
      bandRole: 'ceiling',
      mid: price + 700,
      top: price + 900,
      bot: price + 500,
      lifeState: 'RESIST_WATCH',
      evidenceScore: 5,
      formedTime: 1700000100,
      labelKo: '1h 저항',
      detailKo: '',
      analysisSource: 'dump',
    } as never,
  ],
  srPath: {
    support: null,
    resist: null,
    bounceCap: null,
    supportPrice: price - 900,
    bounceLimitPrice: price + 350,
    resistPrice: price + 700,
    supportFirm: true,
    resistFirm: false,
    invalidationPrice: price - 1300,
    scenario: 'BOUNCE_WATCH',
    scenarioKo: '지지 테스트·반등 관찰',
    pathKo: '지지→반등한도→저항',
    tipKo: '지지 이탈 시 경로 재검토',
  } as never,
  structure: {
    verdict: 'BOUNCE',
    labelKo: '반등 관찰',
    summaryKo: '4h 지지 인근 · 하락 확정 전 관찰',
    detailKo: '',
    confidence: 58,
    overlays: [],
  },
  swing: {
    side: 'LONG',
    stance: 'WAIT_PULLBACK',
    entryLow: price - 220,
    entryHigh: price - 80,
    entryMid: price - 150,
    stopLoss: price - 1100,
    tp1: price + 400,
    tp2: price + 700,
    tp3: price + 1100,
    grade: 'B',
    confluence: 62,
  },
  whale: {
    live: {
      beamKo: '롱빔',
      tierBtc: 50,
      strength: 68,
      sampleCount: 24,
      forecastPct: 1.2,
      phase: 'accumulation',
      verdictKo: '상승',
      entryPrice: price - 150,
      targetPrice: price + 500,
    },
    oracle: {
      whaleDnaKo: '50BTC · 롱빔',
      forceFlowKo: '매수 우세 참고',
    },
  } as never,
  analysis: {
    signalLearning: {
      longCount: 14,
      shortCount: 11,
      tp1Count: 16,
      slCount: 9,
      successRate: 64,
    },
    oiState: 'increasing',
    fundingState: 'negative',
    unifiedMarketMetrics: {
      aggregatedCvdUsd: 1200000,
      buyVolumeUsd: 8e6,
      sellVolumeUsd: 5.5e6,
      oiDeltaPct: 0.35,
      liquidationLongUsd: 2e5,
      liquidationShortUsd: 4e5,
      futuresCumulativeCvdUsd: 1e6,
      spotCumulativeCvdUsd: 0,
      oiLatest: 1,
      oiPrevious: 0.9,
      oiDeltaAbs: 0.1,
      cmf20: null,
      exchangeLegs: [],
      collectedAtMs: Date.now(),
    },
  } as never,
  derivEnabled: true,
  orderflowEnabled: true,
  enabled: true,
  accountUsdt: 1000,
  riskPct: 5,
});

if (!pack) {
  console.error('pack null');
  process.exit(1);
}

console.log('========== 텔레그램에 오는 메시지 예시 (평문) ==========');
console.log(pack.storyPlain);
console.log('');
console.log('========== 텔레그램 HTML (실제 전송) ==========');
console.log(pack.storyHtml);
console.log('');
console.log('HTML length:', pack.storyHtml.length);
