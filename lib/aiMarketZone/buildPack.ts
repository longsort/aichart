/**
 * AMZ build pack — Live / Replay 공통 코어 (순환 import 방지).
 */
import type { Candle } from '@/types';
import { assessAmzCandleQuality } from './dataQuality';
import { collectAmzEvidence } from './evidenceCollector';
import { clusterAmzEvidence } from './clusterEngine';
import { amzZonesToOverlays, amzZonesToPriceLines } from './overlays';
import {
  enrichZonesWithOrderflow,
  summarizeTapeOrderflow,
  type AmzOrderflowInput,
} from './orderflowEngine';
import { enrichZonesWithLifecycle } from './lifecycleEngine';
import { calibrateAmzProbabilities } from './calibrationEngine';
import { buildAmzFeatureExplainKo } from './explainEngine';
import { validateAmzLivePack } from './liveValidation';
import { amzPackCacheGet, amzPackCacheKey, amzPackCacheSet } from './packCache';
import type { AmzStatsFile } from './statsTypes';
import type { AmzEnginePack } from './types';

export type BuildAmzPackParams = {
  candles: Candle[];
  timeframe: string;
  symbol?: string;
  orderflow?: AmzOrderflowInput | null;
  /** STEP16 — Replay 통계로 경험률 보정 (표본 부족 시 null 유지) */
  stats?: AmzStatsFile | null;
  /** Replay 중 캐시 끄기 */
  skipCache?: boolean;
  /** VWAP 공유 레벨 → evidence 연동 */
  vwapLevels?: Array<{ price: number; labelKo: string; strength?: number }> | null;
};

function atrFromCandles(candles: Candle[]): number | null {
  const n = candles.length;
  if (n < 16) return null;
  const end = n - 1;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, end - 14); i < end; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    const tr = Math.max(
      Number(a.high) - Number(a.low),
      Math.abs(Number(a.high) - Number(b.close)),
      Math.abs(Number(a.low) - Number(b.close))
    );
    if (Number.isFinite(tr)) {
      s += tr;
      c += 1;
    }
  }
  return c > 0 ? s / c : null;
}

export function buildAiMarketZonePack(params: BuildAmzPackParams): AmzEnginePack {
  const symbol = String(params.symbol || 'BTCUSDT').toUpperCase();
  const timeframe = params.timeframe || '4h';
  const candles = params.candles ?? [];
  const quality = assessAmzCandleQuality(candles);

  const disclaimerKo =
    'AI Market Zone · 참고용 · 확정 수익/승률 아님 · 표본·L2 부족 시 WAIT · 기존 zone과 독립';

  const closed = candles.length >= 2 ? candles[candles.length - 2]! : candles[candles.length - 1];
  const closedTime = Number(closed?.time) || 0;
  const ofFlag = params.orderflow
    ? `${params.orderflow.trades?.length ?? 0}:${params.orderflow.orderbook ? 1 : 0}`
    : '0';
  const cacheKey = amzPackCacheKey({
    symbol,
    timeframe,
    closedTime,
    len: candles.length,
    statsAt: params.stats?.builtAt ?? 'nostats',
    ofFlag,
  });
  if (!params.skipCache) {
    const hit = amzPackCacheGet(cacheKey);
    if (hit) return hit;
  }

  if (quality.quality === 'BAD') {
    const bad: AmzEnginePack = {
      version: 1,
      symbol,
      timeframe,
      dataQuality: 'BAD',
      qualityNotesKo: quality.notesKo,
      zones: [],
      overlays: [],
      priceLines: [],
      statusKo: 'DATA INSUFFICIENT',
      disclaimerKo,
      orderflow: {
        available: false,
        tradeCount: 0,
        buyPressure: null,
        ofi: null,
        replenishmentScore: null,
        noteKo: '캔들 품질 BAD · orderflow 생략',
      },
    };
    return bad;
  }

  const evidence = collectAmzEvidence({
    candles,
    timeframe,
    vwapLevels: params.vwapLevels ?? null,
  });
  let zones = clusterAmzEvidence({
    evidence,
    candles,
    timeframe,
    symbol,
    dataQuality: quality.quality,
  });

  const atr = atrFromCandles(candles);
  const ofIn = params.orderflow
    ? {
        ...params.orderflow,
        atr: params.orderflow.atr ?? atr,
        currentPrice:
          params.orderflow.currentPrice ??
          Number(candles[Math.max(0, candles.length - 2)]?.close) ??
          null,
      }
    : null;

  zones = enrichZonesWithOrderflow(zones, ofIn);
  zones = enrichZonesWithLifecycle(zones, candles);

  /** STEP16–18 — 경험률 ⊕ ML kNN → 캘리브레이션. Score→확률 금지 */
  if (params.stats) {
    zones = zones.map((z) => {
      const cal = calibrateAmzProbabilities({
        zone: z,
        stats: params.stats!,
        atr,
      });
      const explainExtra: string[] = [];
      if (cal.ml?.ready) {
        explainExtra.push(
          `ML kNN n=${cal.ml.neighborCount} dist=${cal.ml.avgDistance?.toFixed(2) ?? 'null'}`
        );
      } else if (cal.ml?.abstainReasonKo) {
        explainExtra.push(cal.ml.abstainReasonKo);
      }
      const next = {
        ...z,
        probabilities: cal.probabilities,
        confidence: cal.confidence,
        explainKo: [...z.explainKo, ...explainExtra].slice(0, 12),
      };
      return {
        ...next,
        explainKo: [...next.explainKo, buildAmzFeatureExplainKo(next)].slice(0, 14),
      };
    });
  } else {
    zones = zones.map((z) => ({
      ...z,
      explainKo: [...z.explainKo, buildAmzFeatureExplainKo(z)].slice(0, 14),
    }));
  }

  const tape = ofIn
    ? summarizeTapeOrderflow(ofIn)
    : {
        buyPressure: null,
        tradeCount: 0,
        ofi: null,
        replenishmentScore: null,
        noteKo: 'orderflow 미입력 · 전부 null',
      };

  const ofAvail = tape.tradeCount > 0 || (ofIn?.orderbook?.bids.length ?? 0) > 0;
  const anyCalibrated = zones.some((z) => z.probabilities.calibrated);
  const statusKo =
    zones.length === 0
      ? 'WAIT · Zone 후보 없음'
      : `AI Zone ${zones.length} · ${quality.quality} · OF ${ofAvail ? '부분' : '없음'} · 확률 ${anyCalibrated ? '보정' : 'WAIT'}`;

  const pack: AmzEnginePack = {
    version: 1,
    symbol,
    timeframe,
    dataQuality: quality.quality,
    qualityNotesKo: quality.notesKo,
    zones,
    overlays: amzZonesToOverlays(zones, candles),
    priceLines: amzZonesToPriceLines(zones),
    statusKo,
    disclaimerKo,
    orderflow: {
      available: ofAvail,
      tradeCount: tape.tradeCount,
      buyPressure: tape.buyPressure,
      ofi: tape.ofi,
      replenishmentScore: tape.replenishmentScore,
      noteKo: tape.noteKo,
    },
  };
  pack.liveValidation = validateAmzLivePack({ pack, candles });
  if (!params.skipCache) amzPackCacheSet(cacheKey, pack);
  return pack;
}
